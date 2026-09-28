import crypto from 'node:crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { platformDb as prisma } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { createAleBetRoutes } from '../../routes/ale-bet'
import { STOCK_PROJECTION_SYNC_FAILURE_LOG, syncStockProjectionNow } from '../../routes/ale-bet/stock-projection/direct-sync'
import type { StockProjectionSnapshot } from '../../routes/ale-bet/stock-projection/snapshot'
import type { StockProjectionSheetAdapter } from '../../routes/ale-bet/stock-projection/sheet-adapter'
import { truncateDb } from '../utils/db-cleaner'

declare global {
  namespace Express {
    interface Request { user?: JwtPayload }
  }
}

let syncBehavior: () => Promise<void> = async () => undefined
const syncLogger = { error: vi.fn<(message: string) => void>() }

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (token) req.user = jwt.verify(token, process.env.PLATFORM_JWT_SECRET ?? 'test-secret') as JwtPayload
  next()
})
app.use('/api/ale-bet', createAleBetRoutes({
  automation: {
    syncStockProjectionNow: () => syncBehavior(),
    logger: syncLogger,
  },
}))

function token(role: 'admin' | 'facturacion'): string {
  return `Bearer ${jwt.sign({ sub: `${role}-direct-sync`, apps: { 'ale-bet': { rol: role, activo: true } } }, process.env.PLATFORM_JWT_SECRET ?? 'test-secret')}`
}

async function seed(quantity = 120) {
  const suffix = crypto.randomUUID()
  const customer = await prisma.cliente.create({
    data: { nombre: `Cliente Direct Sync ${suffix}`, cuit: '30-12345678-9', condicionIva: 'RI', direccion: 'Ruta 2 km 50' },
  })
  const product = await prisma.producto.create({
    data: { nombre: `Producto Direct Sync 500 ML ${suffix}`, sku: `DIRECT-SYNC-${suffix}`, unidadesPorCaja: 12 },
  })
  const deposito = await prisma.ubicacionStock.create({ data: { codigo: 'DEPOSITO', nombre: 'Depósito' } })
  const acondicionado = await prisma.ubicacionStock.create({ data: { codigo: 'ACONDICIONADO', nombre: 'Acondicionado' } })
  const lot = await prisma.lote.create({
    data: { numero: `LOT-${suffix}`, productoId: product.id, cajas: 10, sueltos: 0, fechaVencimiento: new Date(Date.now() + 86_400_000) },
  })
  await prisma.saldoStock.createMany({ data: [
    { productoId: product.id, loteId: lot.id, ubicacionId: deposito.id, cantidad: quantity },
    { productoId: product.id, loteId: lot.id, ubicacionId: acondicionado.id, cantidad: 0 },
  ] })
  return { customer, product, lot, deposito }
}

async function createReadyDraft(fixture: Awaited<ReturnType<typeof seed>>, units = 12) {
  const auth = token('admin')
  const draft = await request(app).post('/api/ale-bet/automation/drafts').set('Authorization', auth)
    .send({ originalText: `${units} ${fixture.product.nombre}` }).expect(201)
  const customerEdit = await request(app).put(`/api/ale-bet/automation/drafts/${draft.body.id}`).set('Authorization', auth)
    .send({ expectedVersion: draft.body.version, clienteId: fixture.customer.id }).expect(200)
  const productEdit = await request(app).put(`/api/ale-bet/automation/drafts/${draft.body.id}`).set('Authorization', auth)
    .send({
      expectedVersion: customerEdit.body.version,
      line: { lineId: draft.body.proposedSnapshot.lines[0].lineId, productId: fixture.product.id, unidades: units },
    }).expect(200)
  return { auth, draftId: draft.body.id, expectedVersion: productEdit.body.version }
}

function confirm(input: Awaited<ReturnType<typeof createReadyDraft>>, key = crypto.randomUUID()) {
  return request(app).post(`/api/ale-bet/automation/drafts/${input.draftId}/confirm`)
    .set('Authorization', input.auth)
    .set('Idempotency-Key', key)
    .send({ expectedVersion: input.expectedVersion })
}

describe('SDD-01 direct Automation sync', () => {
  beforeAll(async () => { await prisma.$queryRaw`SELECT 1` })
  beforeEach(async () => {
    await truncateDb(prisma)
    syncBehavior = async () => undefined
    syncLogger.error.mockReset()
  })

  it('writes exactly one authoritative post-commit snapshot after successful confirmation', async () => {
    const fixture = await seed()
    const ready = await createReadyDraft(fixture)
    const snapshots: StockProjectionSnapshot[] = []
    const adapter: StockProjectionSheetAdapter = {
      async writeSnapshot(snapshot) {
        const persisted = await prisma.saldoStock.findUniqueOrThrow({
          where: { productoId_loteId_ubicacionId: { productoId: fixture.product.id, loteId: fixture.lot.id, ubicacionId: fixture.deposito.id } },
        })
        expect(persisted.cantidad).toBe(108)
        snapshots.push(snapshot)
      },
    }
    syncBehavior = async () => {
      await syncStockProjectionNow({
        config: { enabled: true, spreadsheetId: 'fake', sheetName: 'STOCK APP', serviceAccountFile: '/external/fake.json' },
        adapter,
      })
    }

    const response = await confirm(ready).expect(200)

    expect(response.body.pedido).toMatchObject({ estado: 'APROBADO', origen: 'AUTOMATION' })
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.productoTerminado).toContainEqual(expect.objectContaining({
      producto: fixture.product.nombre,
      lote: fixture.lot.numero,
      total: 108,
    }))
    expect(await prisma.stockProjectionOutbox.count({ where: { causeId: response.body.pedido.id } })).toBe(1)
  })

  it('does not sync when the Automation confirmation does not commit', async () => {
    const fixture = await seed(10)
    const ready = await createReadyDraft(fixture, 12)
    const sync = vi.fn().mockResolvedValue(undefined)
    syncBehavior = sync

    await confirm(ready).expect(409)

    expect(sync).not.toHaveBeenCalled()
    expect((await prisma.saldoStock.findUniqueOrThrow({
      where: { productoId_loteId_ubicacionId: { productoId: fixture.product.id, loteId: fixture.lot.id, ubicacionId: fixture.deposito.id } },
    })).cantidad).toBe(10)
    expect(await prisma.movimientoStock.count()).toBe(0)
  })

  it('confirms and consumes stock without snapshot or Google calls when disabled', async () => {
    const fixture = await seed()
    const ready = await createReadyDraft(fixture)
    const buildSnapshot = vi.fn().mockRejectedValue(new Error('must not run'))
    const createAdapter = vi.fn()
    syncBehavior = async () => {
      await syncStockProjectionNow({ config: { enabled: false }, buildSnapshot, createAdapter })
    }

    await confirm(ready).expect(200)

    expect(buildSnapshot).not.toHaveBeenCalled()
    expect(createAdapter).not.toHaveBeenCalled()
    expect((await prisma.saldoStock.findUniqueOrThrow({
      where: { productoId_loteId_ubicacionId: { productoId: fixture.product.id, loteId: fixture.lot.id, ubicacionId: fixture.deposito.id } },
    })).cantidad).toBe(108)
  })

  it('keeps the committed confirmation successful and logs a sanitized constant when Google fails', async () => {
    const fixture = await seed()
    const ready = await createReadyDraft(fixture)
    syncBehavior = async () => { throw new Error('private_key=must-never-be-logged') }

    const response = await confirm(ready).expect(200)

    expect(response.body.pedido).toMatchObject({ estado: 'APROBADO', origen: 'AUTOMATION' })
    expect((await prisma.saldoStock.findUniqueOrThrow({
      where: { productoId_loteId_ubicacionId: { productoId: fixture.product.id, loteId: fixture.lot.id, ubicacionId: fixture.deposito.id } },
    })).cantidad).toBe(108)
    expect(await prisma.movimientoStock.count({ where: { pedidoId: response.body.pedido.id, tipo: 'SALIDA_PEDIDO' } })).toBe(1)
    expect(syncLogger.error).toHaveBeenCalledOnce()
    expect(syncLogger.error).toHaveBeenCalledWith(STOCK_PROJECTION_SYNC_FAILURE_LOG)
    expect(JSON.stringify(syncLogger.error.mock.calls)).not.toContain('private_key')
  })

  it('allows an idempotent replay sync, never discounts twice, and remitos do not trigger sync', async () => {
    const fixture = await seed()
    const ready = await createReadyDraft(fixture)
    const writeSnapshot = vi.fn().mockResolvedValue(undefined)
    syncBehavior = async () => {
      await syncStockProjectionNow({
        config: { enabled: true, spreadsheetId: 'fake', sheetName: 'STOCK APP', serviceAccountFile: '/external/fake.json' },
        adapter: { writeSnapshot },
      })
    }
    const key = crypto.randomUUID()

    const first = await confirm(ready, key).expect(200)
    const replay = await confirm(ready, key).expect(200)
    expect(replay.headers['idempotency-replayed']).toBe('true')
    expect(writeSnapshot).toHaveBeenCalledTimes(2)
    expect((await prisma.saldoStock.findUniqueOrThrow({
      where: { productoId_loteId_ubicacionId: { productoId: fixture.product.id, loteId: fixture.lot.id, ubicacionId: fixture.deposito.id } },
    })).cantidad).toBe(108)
    expect(await prisma.movimientoStock.count({ where: { pedidoId: first.body.pedido.id, tipo: 'SALIDA_PEDIDO' } })).toBe(1)

    const issued = await request(app).post(`/api/ale-bet/pedidos/${first.body.pedido.id}/remitos`)
      .set('Authorization', token('facturacion'))
      .send({ expectedVersion: first.body.pedido.version, transporteOcasional: { nombre: 'Flete UAT', direccion: 'Ruta 2 km 50' } })
      .expect(201)
    expect(writeSnapshot).toHaveBeenCalledTimes(2)
    await request(app).put(`/api/ale-bet/pedidos/${first.body.pedido.id}/remitos/${issued.body.id}/anular`)
      .set('Authorization', token('facturacion'))
      .send({ motivo: 'Documento emitido por error' })
      .expect(200)
    const afterVoid = await prisma.pedido.findUniqueOrThrow({ where: { id: first.body.pedido.id } })
    await request(app).post(`/api/ale-bet/pedidos/${first.body.pedido.id}/remitos`)
      .set('Authorization', token('facturacion'))
      .send({ expectedVersion: afterVoid.version, transporteOcasional: { nombre: 'Flete UAT', direccion: 'Ruta 2 km 50' } })
      .expect(201)
    expect(writeSnapshot).toHaveBeenCalledTimes(2)
  })
})
