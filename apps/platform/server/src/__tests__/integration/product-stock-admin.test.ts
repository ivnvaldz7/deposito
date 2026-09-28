import crypto from 'crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { platformDb as prisma, TipoReglaTransferenciaProducto } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { createAleBetRoutes } from '../../routes/ale-bet/index'
import { truncateDb } from '../utils/db-cleaner'

const { syncAfterCommit } = vi.hoisted(() => ({
  syncAfterCommit: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}))

vi.mock('../../routes/ale-bet/stock-projection/direct-sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../routes/ale-bet/stock-projection/direct-sync')>()
  return { ...actual, syncStockProjectionAfterCommit: syncAfterCommit }
})

declare module 'express-serve-static-core' {
  interface Request { user?: JwtPayload }
}

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (token) req.user = jwt.verify(token, process.env.PLATFORM_JWT_SECRET ?? 'test-secret') as JwtPayload
  next()
})
app.use('/api/ale-bet', createAleBetRoutes())

const auth = (role: 'admin' | 'vendedor') => `Bearer ${jwt.sign({ sub: 'stock-admin-test', email: 'stock@test.local', apps: { 'ale-bet': { rol: role, activo: true } } }, process.env.PLATFORM_JWT_SECRET ?? 'test-secret')}`

describe('PRODUCTOS stock administration', () => {
  beforeAll(async () => { await prisma.$queryRaw`SELECT 1` })
  beforeEach(async () => { await truncateDb(prisma); syncAfterCommit.mockReset(); syncAfterCommit.mockResolvedValue(undefined) })
  afterAll(async () => { await prisma.$disconnect() })

  async function fixture() {
    const id = crypto.randomUUID()
    const deposito = await prisma.ubicacionStock.create({ data: { codigo: 'DEPOSITO', nombre: 'Depósito' } })
    const acondicionado = await prisma.ubicacionStock.create({ data: { codigo: 'ACONDICIONADO', nombre: 'Acondicionado' } })
    const producto = await prisma.producto.create({ data: { nombre: `Producto ${id}`, sku: `SKU-${id}`, unidadesPorCaja: 1 } })
    return { deposito, acondicionado, producto }
  }

  it('keeps a zero-stock lot in the administrative archive without showing it operationally', async () => {
    const data = await fixture()
    const created = await request(app).post(`/api/ale-bet/productos/${data.producto.id}/stock/lotes`).set('Authorization', auth('admin')).send({ numero: 'L-ADMIN' })
    expect(created.status).toBe(201)
    const response = await request(app).get(`/api/ale-bet/productos/${data.producto.id}/stock?includeArchived=true`).set('Authorization', auth('admin'))
    expect(response.status).toBe(200)
    expect(response.body.lotes[0]).toMatchObject({ numero: 'L-ADMIN', stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0 })
    expect(response.body.ubicaciones).toHaveLength(2)
  })

  it('creates a lot with 600 opening units in ACONDICIONADO atomically', async () => {
    const data = await fixture()

    const created = await request(app)
      .post(`/api/ale-bet/productos/${data.producto.id}/stock/lotes`)
      .set('Authorization', auth('admin'))
      .set('Idempotency-Key', 'create-lot-opening-600')
      .send({ numero: 'L-OPEN-600', cantidadInicial: 600 })

    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      numero: 'L-OPEN-600',
      stockTotal: 600,
      stockDeposito: 0,
      stockAcondicionado: 600,
    })

    const retry = await request(app)
      .post(`/api/ale-bet/productos/${data.producto.id}/stock/lotes`)
      .set('Authorization', auth('admin'))
      .set('Idempotency-Key', 'create-lot-opening-600')
      .send({ numero: 'L-OPEN-600', cantidadInicial: 600 })

    expect(retry.status).toBe(201)
    expect(retry.body).toEqual(created.body)

    const lot = await prisma.lote.findUniqueOrThrow({
      where: { numero_productoId: { numero: 'L-OPEN-600', productoId: data.producto.id } },
    })
    expect(await prisma.saldoStock.findUnique({
      where: {
        productoId_loteId_ubicacionId: {
          productoId: data.producto.id,
          loteId: lot.id,
          ubicacionId: data.acondicionado.id,
        },
      },
    })).toMatchObject({ cantidad: 600 })
    expect(await prisma.saldoStock.findUnique({
      where: {
        productoId_loteId_ubicacionId: {
          productoId: data.producto.id,
          loteId: lot.id,
          ubicacionId: data.deposito.id,
        },
      },
    })).toBeNull()
    expect(await prisma.movimientoStock.findMany({ where: { loteId: lot.id } })).toEqual([
      expect.objectContaining({
        cantidad: 600,
        tipo: 'SALDO_APERTURA',
        origenUbicacionId: data.acondicionado.id,
        idempotencyKey: 'create-lot-opening-600',
      }),
    ])
    expect(await prisma.stockProjectionOutbox.findMany({
      where: { productId: data.producto.id, causeType: 'SALDO_APERTURA' },
    })).toEqual([
      expect.objectContaining({ causeId: 'create-lot-opening-600', estado: 'PENDING' }),
    ])
    expect(syncAfterCommit).toHaveBeenCalledTimes(2)
  })

  it('rolls back the new lot when its ACONDICIONADO opening cannot be recorded', async () => {
    const data = await fixture()
    await prisma.ubicacionStock.update({ where: { id: data.acondicionado.id }, data: { activo: false } })

    const response = await request(app)
      .post(`/api/ale-bet/productos/${data.producto.id}/stock/lotes`)
      .set('Authorization', auth('admin'))
      .set('Idempotency-Key', 'create-lot-opening-fail')
      .send({ numero: 'L-ROLLBACK', cantidadInicial: 600 })

    expect(response.status).toBe(409)
    expect(await prisma.lote.findFirst({ where: { productoId: data.producto.id, numero: 'L-ROLLBACK' } })).toBeNull()
    expect(await prisma.saldoStock.count({ where: { productoId: data.producto.id } })).toBe(0)
    expect(await prisma.movimientoStock.count({ where: { productoId: data.producto.id } })).toBe(0)
    expect(await prisma.stockProjectionOutbox.count({ where: { productId: data.producto.id } })).toBe(0)
  })

  it('adjusts final quantity transactionally, is idempotent, and audits signed delta', async () => {
    const data = await fixture()
    const lot = await prisma.lote.create({ data: { numero: 'L-1', productoId: data.producto.id } })
    const first = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/ajuste`).set('Authorization', auth('admin')).set('Idempotency-Key', 'adjust-1').send({ ubicacionId: data.deposito.id, cantidadFinal: 100, motivo: 'conteo' })
    const retry = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/ajuste`).set('Authorization', auth('admin')).set('Idempotency-Key', 'adjust-1').send({ ubicacionId: data.deposito.id, cantidadFinal: 100, motivo: 'conteo' })
    expect(first.status).toBe(200)
    expect(retry.body).toEqual(first.body)
    expect(syncAfterCommit).toHaveBeenCalledTimes(2)
    expect((await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: lot.id, ubicacionId: data.deposito.id } } }))?.cantidad).toBe(100)
    expect(await prisma.movimientoStock.count({ where: { loteId: lot.id, tipo: 'AJUSTE' } })).toBe(1)
    expect((await prisma.movimientoStock.findFirstOrThrow({ where: { loteId: lot.id } })).cantidad).toBe(100)
  })

  it('keeps historical opening records read-only and rejects operational edits', async () => {
    const data = await fixture()
    const lot = await prisma.lote.create({ data: { numero: 'L-OPEN', productoId: data.producto.id } })
    const payload = { ubicacionId: data.deposito.id, cantidadFinal: 42, fechaEfectiva: '2026-08-24' }
    const response = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/apertura`).set('Authorization', auth('admin')).set('Idempotency-Key', 'opening-closed').send(payload)
    const adjustment = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/ajuste`).set('Authorization', auth('admin')).set('Idempotency-Key', 'adjust-after-open').send({ ubicacionId: data.deposito.id, cantidadFinal: 5, motivo: 'corrección' })
    expect(response.status).toBe(410)
    expect(response.body.error).toMatch(/cerrada.*operación normal/i)
    expect(adjustment.status).toBe(200)
    expect(await prisma.movimientoStock.count({ where: { loteId: lot.id, tipo: 'AJUSTE' } })).toBe(1)
  })

  it('lists every active catalog product at stock zero without creating balances or movements', async () => {
    const data = await fixture()
    const second = await prisma.producto.create({ data: { nombre: 'Producto sin stock B', sku: 'SKU-STOCK-ZERO-B', unidadesPorCaja: 1 } })
    const third = await prisma.producto.create({ data: { nombre: 'Producto sin stock C', sku: 'SKU-STOCK-ZERO-C', unidadesPorCaja: 1 } })
    await prisma.producto.create({ data: { nombre: 'Producto inactivo', sku: 'SKU-STOCK-INACTIVO', unidadesPorCaja: 1, activo: false } })

    const response = await request(app).get('/api/ale-bet/stock').set('Authorization', auth('vendedor'))

    expect(response.status).toBe(200)
    expect(response.body.productos.map((product: { id: string }) => product.id)).toEqual(expect.arrayContaining([data.producto.id, second.id, third.id]))
    expect(response.body.productos).toHaveLength(3)
    expect(response.body.productos).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: data.producto.id, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0, lotes: [] }),
      expect.objectContaining({ id: second.id, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0, lotes: [] }),
      expect.objectContaining({ id: third.id, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0, lotes: [] }),
    ]))
    expect(await prisma.saldoStock.count()).toBe(0)
    expect(await prisma.movimientoStock.count()).toBe(0)
  })

  it('accepts the same physical lot number for different products but not twice for one product', async () => {
    const data = await fixture()
    const other = await prisma.producto.create({ data: { nombre: 'Otro producto', sku: 'SKU-OTHER-LOT', unidadesPorCaja: 1 } })
    const first = await request(app).post(`/api/ale-bet/productos/${data.producto.id}/stock/lotes`).set('Authorization', auth('admin')).send({ numero: 'LOTE-FISICO-1' })
    const duplicate = await request(app).post(`/api/ale-bet/productos/${data.producto.id}/stock/lotes`).set('Authorization', auth('admin')).send({ numero: 'LOTE-FISICO-1' })
    const otherProduct = await request(app).post(`/api/ale-bet/productos/${other.id}/stock/lotes`).set('Authorization', auth('admin')).send({ numero: 'LOTE-FISICO-1' })

    expect(first.status).toBe(201)
    expect(duplicate.status).toBe(409)
    expect(otherProduct.status).toBe(201)
  })

  it('rejects negative final quantity and non-admin mutations', async () => {
    const data = await fixture()
    const lot = await prisma.lote.create({ data: { numero: 'L-1', productoId: data.producto.id } })
    const negative = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/ajuste`).set('Authorization', auth('admin')).set('Idempotency-Key', 'adjust-negative').send({ ubicacionId: data.deposito.id, cantidadFinal: -1 })
    const forbidden = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/ajuste`).set('Authorization', auth('vendedor')).set('Idempotency-Key', 'adjust-forbidden').send({ ubicacionId: data.deposito.id, cantidadFinal: 1 })
    expect(negative.status).toBe(400)
    expect(forbidden.status).toBe(403)
  })

  it('reuses the verified transfer service without changing lot identity or total', async () => {
    const data = await fixture()
    const lot = await prisma.lote.create({ data: { numero: 'L-1', productoId: data.producto.id } })
    await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: lot.id, ubicacionId: data.deposito.id, cantidad: 100 } })
    await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: lot.id, ubicacionId: data.acondicionado.id, cantidad: 50 } })
    const moved = await request(app).post('/api/ale-bet/stock/transferencias').set('Authorization', auth('admin')).set('Idempotency-Key', 'transfer-1').send({ productoId: data.producto.id, loteId: lot.id, origen: 'DEPOSITO', destino: 'ACONDICIONADO', cantidad: 20 })
    expect(moved.status).toBe(201)
    const balances = await prisma.saldoStock.findMany({ where: { loteId: lot.id }, orderBy: { ubicacionId: 'asc' } })
    expect(balances.reduce((sum, row) => sum + row.cantidad, 0)).toBe(150)
    expect(await prisma.movimientoStock.count({ where: { loteId: lot.id, tipo: 'TRANSFERENCIA_INTERNA' } })).toBe(1)
    expect(syncAfterCommit).toHaveBeenCalledOnce()
  })

  it('transfers Normal from ACONDICIONADO to DEPOSITO on the same lot when the configured rule is SAME_PRODUCT', async () => {
    const data = await fixture()
    const lot = await prisma.lote.create({ data: { numero: 'EN0131', productoId: data.producto.id } })
    await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: lot.id, ubicacionId: data.acondicionado.id, cantidad: 100 } })
    const rule = await prisma.productoTransferRule.create({
      data: { sourceProductId: data.producto.id, targetProductId: data.producto.id, label: 'Normal', tipo: TipoReglaTransferenciaProducto.SAME_PRODUCT, orden: 10 },
    })

    const response = await request(app)
      .post('/api/ale-bet/stock/transferencias')
      .set('Authorization', auth('admin'))
      .set('Idempotency-Key', 'normal-30')
      .send({ productoId: data.producto.id, loteId: lot.id, origen: 'ACONDICIONADO', destino: 'DEPOSITO', cantidad: 30, transferRuleId: rule.id })

    expect(response.status).toBe(201)
    expect(await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: lot.id, ubicacionId: data.acondicionado.id } } })).toMatchObject({ cantidad: 70 })
    expect(await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: lot.id, ubicacionId: data.deposito.id } } })).toMatchObject({ cantidad: 30 })
    expect(await prisma.lote.count({ where: { productoId: data.producto.id, numero: 'EN0131' } })).toBe(1)
  })

  it('returns only the configured presentation choices for each operational family', async () => {
    const sourceProducts = await Promise.all([
      prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 1 L', sku: 'RULE-AMINO-1L', unidadesPorCaja: 12 } }),
      prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 50 ML', sku: 'RULE-AMINO-50', unidadesPorCaja: 40 } }),
      prisma.producto.create({ data: { nombre: 'ENERGIZANTE 250 ML', sku: 'RULE-ENERGIZANTE-250', unidadesPorCaja: 24 } }),
      prisma.producto.create({ data: { nombre: 'SUPERCOMPLEJO B 1 L', sku: 'RULE-SUPERCOMPLEJO-1L', unidadesPorCaja: 12 } }),
    ])
    const [amino1L, amino50, energizante, supercomplejo] = sourceProducts
    const targetProducts = await Promise.all([
      prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 1 L AVES', sku: 'RULE-AMINO-1L-AVES', unidadesPorCaja: 12 } }),
      prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 1 L EQUINO', sku: 'RULE-AMINO-1L-EQUINO', unidadesPorCaja: 12 } }),
      prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 1 L CERDOS', sku: 'RULE-AMINO-1L-CERDOS', unidadesPorCaja: 12 } }),
      prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 50 ML AVES', sku: 'RULE-AMINO-50-AVES', unidadesPorCaja: 40 } }),
      prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 50 ML MASCOTA', sku: 'RULE-AMINO-50-MASCOTA', unidadesPorCaja: 40 } }),
      prisma.producto.create({ data: { nombre: 'ENERGIZANTE 250 ML VACAS', sku: 'RULE-ENERGIZANTE-250-VACAS', unidadesPorCaja: 24 } }),
      prisma.producto.create({ data: { nombre: 'SUPERCOMPLEJO B 1 L EQUINO', sku: 'RULE-SUPERCOMPLEJO-1L-EQUINO', unidadesPorCaja: 12 } }),
      prisma.producto.create({ data: { nombre: 'SUPERCOMPLEJO B 1 L AVES', sku: 'RULE-SUPERCOMPLEJO-1L-AVES', unidadesPorCaja: 12 } }),
    ])
    const [amino1LAves, amino1LEquino, amino1LCerdos, amino50Aves, amino50Mascota, energizanteVacas, supercomplejoEquino, supercomplejoAves] = targetProducts
    await prisma.productoTransferRule.createMany({ data: [
      { sourceProductId: amino1L!.id, targetProductId: amino1LAves!.id, label: 'Aves', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 10 },
      { sourceProductId: amino1L!.id, targetProductId: amino1LEquino!.id, label: 'Equino', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 20 },
      { sourceProductId: amino1L!.id, targetProductId: amino1LCerdos!.id, label: 'Cerdos', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 30 },
      { sourceProductId: amino50!.id, targetProductId: amino50Aves!.id, label: 'Aves', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 10 },
      { sourceProductId: amino50!.id, targetProductId: amino50Mascota!.id, label: 'Mascota', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 20 },
      { sourceProductId: energizante!.id, targetProductId: energizante!.id, label: 'Normal', tipo: TipoReglaTransferenciaProducto.SAME_PRODUCT, orden: 10 },
      { sourceProductId: energizante!.id, targetProductId: energizanteVacas!.id, label: 'Vacas', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 20 },
      { sourceProductId: supercomplejo!.id, targetProductId: supercomplejo!.id, label: 'Normal', tipo: TipoReglaTransferenciaProducto.SAME_PRODUCT, orden: 10 },
      { sourceProductId: supercomplejo!.id, targetProductId: supercomplejoEquino!.id, label: 'Equino', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 20 },
      { sourceProductId: supercomplejo!.id, targetProductId: supercomplejoAves!.id, label: 'Aves', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 30 },
    ] })

    for (const [productId, labels] of [
      [amino1L!.id, ['Aves', 'Equino', 'Cerdos']],
      [amino50!.id, ['Aves', 'Mascota']],
      [energizante!.id, ['Normal', 'Vacas']],
      [supercomplejo!.id, ['Normal', 'Equino', 'Aves']],
    ] as const) {
      const response = await request(app).get(`/api/ale-bet/stock/transfer-rules?productoId=${productId}`).set('Authorization', auth('admin'))
      expect(response.status).toBe(200)
      expect(response.body.rules.map((rule: { label: string }) => rule.label)).toEqual(labels)
    }
  })

  it('converts a presentation atomically, preserves lot lineage, reuses it, and replays idempotently', async () => {
    const data = await fixture()
    const target = await prisma.producto.create({ data: { nombre: 'Producto EQUINO', sku: 'SKU-EQUINO', unidadesPorCaja: 1 } })
    const sourceLot = await prisma.lote.create({ data: { numero: 'CB0096', productoId: data.producto.id, fechaProduccion: new Date('2026-01-01'), fechaVencimiento: new Date('2027-10-31') } })
    const existingTargetLot = await prisma.lote.create({ data: { numero: 'CB0096', productoId: target.id, fechaProduccion: new Date('2026-01-01'), fechaVencimiento: new Date('2027-10-31') } })
    await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: sourceLot.id, ubicacionId: data.acondicionado.id, cantidad: 100 } })
    const rule = await prisma.productoTransferRule.create({
      data: { sourceProductId: data.producto.id, targetProductId: target.id, label: 'Equino', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 10 },
    })
    const payload = { productoId: data.producto.id, loteId: sourceLot.id, origen: 'ACONDICIONADO', destino: 'DEPOSITO', cantidad: 30, transferRuleId: rule.id }

    const first = await request(app).post('/api/ale-bet/stock/transferencias').set('Authorization', auth('admin')).set('Idempotency-Key', 'equino-30').send(payload)
    const replay = await request(app).post('/api/ale-bet/stock/transferencias').set('Authorization', auth('admin')).set('Idempotency-Key', 'equino-30').send(payload)
    expect(first.status).toBe(201)
    expect(replay.status).toBe(201)
    expect(replay.body).toEqual(first.body)

    const targetLot = await prisma.lote.findUniqueOrThrow({ where: { productoId_derivedFromLoteId: { productoId: target.id, derivedFromLoteId: sourceLot.id } } })
    expect(targetLot).toMatchObject({ id: existingTargetLot.id, numero: 'CB0096', derivedFromLoteId: sourceLot.id, fechaProduccion: sourceLot.fechaProduccion, fechaVencimiento: sourceLot.fechaVencimiento })
    expect(await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: sourceLot.id, ubicacionId: data.acondicionado.id } } })).toMatchObject({ cantidad: 70 })
    expect(await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: target.id, loteId: targetLot.id, ubicacionId: data.deposito.id } } })).toMatchObject({ cantidad: 30 })

    const second = await request(app).post('/api/ale-bet/stock/transferencias').set('Authorization', auth('admin')).set('Idempotency-Key', 'equino-20').send({ ...payload, cantidad: 20 })
    expect(second.status).toBe(201)
    expect(await prisma.lote.count({ where: { productoId: target.id, derivedFromLoteId: sourceLot.id } })).toBe(1)
    expect(await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: target.id, loteId: targetLot.id, ubicacionId: data.deposito.id } } })).toMatchObject({ cantidad: 50 })
    const movement = await prisma.movimientoStock.findUniqueOrThrow({ where: { id: first.body.movimientoId } })
    const reference: unknown = JSON.parse(movement.referencia ?? '{}')
    expect(reference).toMatchObject({ origen: { productoId: data.producto.id, loteId: sourceLot.id }, destino: { productoId: target.id, loteId: targetLot.id }, rule: { label: 'Equino' } })
  })

  it('transfers every configured AMINOÁCIDOS presentation and preserves derived-lot identity', async () => {
    const data = await fixture()
    const amino50 = await prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 50 ML', sku: 'AMINO-50-BASE', unidadesPorCaja: 40 } })
    const amino50Aves = await prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 50 ML AVES', sku: 'AMINO-50-AVES', unidadesPorCaja: 40 } })
    const amino50Mascota = await prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 50 ML MASCOTA', sku: 'AMINO-50-MASCOTA', unidadesPorCaja: 40 } })
    const amino1L = await prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 1 L', sku: 'AMINO-1L-BASE', unidadesPorCaja: 12 } })
    const amino1LAves = await prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 1 L AVES', sku: 'AMINO-1L-AVES', unidadesPorCaja: 12 } })
    const amino1LEquino = await prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 1 L EQUINO', sku: 'AMINO-1L-EQUINO', unidadesPorCaja: 12 } })
    const amino1LCerdos = await prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 1 L CERDOS', sku: 'AMINO-1L-CERDOS', unidadesPorCaja: 12 } })
    const fechaProduccion = new Date('2026-01-01')
    const fechaVencimiento = new Date('2027-10-31')
    const source50Lot = await prisma.lote.create({ data: { numero: 'AO0297', productoId: amino50.id, fechaProduccion, fechaVencimiento } })
    const source1LLot = await prisma.lote.create({ data: { numero: 'AO0298', productoId: amino1L.id, fechaProduccion, fechaVencimiento } })
    await prisma.saldoStock.createMany({ data: [
      { productoId: amino50.id, loteId: source50Lot.id, ubicacionId: data.acondicionado.id, cantidad: 100 },
      { productoId: amino1L.id, loteId: source1LLot.id, ubicacionId: data.acondicionado.id, cantidad: 100 },
    ] })
    const rules = await Promise.all([
      prisma.productoTransferRule.create({ data: { sourceProductId: amino50.id, targetProductId: amino50Aves.id, label: 'Aves', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 10 } }),
      prisma.productoTransferRule.create({ data: { sourceProductId: amino50.id, targetProductId: amino50Mascota.id, label: 'Mascota', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 20 } }),
      prisma.productoTransferRule.create({ data: { sourceProductId: amino1L.id, targetProductId: amino1LAves.id, label: 'Aves', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 10 } }),
      prisma.productoTransferRule.create({ data: { sourceProductId: amino1L.id, targetProductId: amino1LEquino.id, label: 'Equino', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 20 } }),
      prisma.productoTransferRule.create({ data: { sourceProductId: amino1L.id, targetProductId: amino1LCerdos.id, label: 'Cerdos', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 30 } }),
    ])
    const cases = [
      { source: amino50, sourceLot: source50Lot, target: amino50Aves, rule: rules[0]!, label: 'Aves', quantity: 30 },
      { source: amino50, sourceLot: source50Lot, target: amino50Mascota, rule: rules[1]!, label: 'Mascota', quantity: 20 },
      { source: amino1L, sourceLot: source1LLot, target: amino1LAves, rule: rules[2]!, label: 'Aves', quantity: 30 },
      { source: amino1L, sourceLot: source1LLot, target: amino1LEquino, rule: rules[3]!, label: 'Equino', quantity: 30 },
      { source: amino1L, sourceLot: source1LLot, target: amino1LCerdos, rule: rules[4]!, label: 'Cerdos', quantity: 20 },
    ]

    for (const transfer of cases) {
      const response = await request(app)
        .post('/api/ale-bet/stock/transferencias')
        .set('Authorization', auth('admin'))
        .set('Idempotency-Key', `amino-${transfer.label.toLowerCase()}-${transfer.target.id}`)
        .send({ productoId: transfer.source.id, loteId: transfer.sourceLot.id, origen: 'ACONDICIONADO', destino: 'DEPOSITO', cantidad: transfer.quantity, transferRuleId: transfer.rule.id })
      expect(response.status).toBe(201)
      const derived = await prisma.lote.findUniqueOrThrow({ where: { productoId_derivedFromLoteId: { productoId: transfer.target.id, derivedFromLoteId: transfer.sourceLot.id } } })
      expect(derived).toMatchObject({ numero: transfer.sourceLot.numero, fechaProduccion, fechaVencimiento, derivedFromLoteId: transfer.sourceLot.id })
      await expect(prisma.saldoStock.findUniqueOrThrow({ where: { productoId_loteId_ubicacionId: { productoId: transfer.target.id, loteId: derived.id, ubicacionId: data.deposito.id } } })).resolves.toMatchObject({ cantidad: transfer.quantity })
    }

    expect(await prisma.saldoStock.findUniqueOrThrow({ where: { productoId_loteId_ubicacionId: { productoId: amino50.id, loteId: source50Lot.id, ubicacionId: data.acondicionado.id } } })).toMatchObject({ cantidad: 50 })
    expect(await prisma.saldoStock.findUniqueOrThrow({ where: { productoId_loteId_ubicacionId: { productoId: amino1L.id, loteId: source1LLot.id, ubicacionId: data.acondicionado.id } } })).toMatchObject({ cantidad: 20 })

    const retryTargetLot = await prisma.lote.findUniqueOrThrow({ where: { productoId_derivedFromLoteId: { productoId: amino50Aves.id, derivedFromLoteId: source50Lot.id } } })
    const second = await request(app)
      .post('/api/ale-bet/stock/transferencias')
      .set('Authorization', auth('admin'))
      .set('Idempotency-Key', 'amino-50-aves-second')
      .send({ productoId: amino50.id, loteId: source50Lot.id, origen: 'ACONDICIONADO', destino: 'DEPOSITO', cantidad: 10, transferRuleId: rules[0]!.id })
    expect(second.status).toBe(201)
    expect(await prisma.lote.count({ where: { productoId: amino50Aves.id, derivedFromLoteId: source50Lot.id } })).toBe(1)
    await expect(prisma.saldoStock.findUniqueOrThrow({ where: { productoId_loteId_ubicacionId: { productoId: amino50Aves.id, loteId: retryTargetLot.id, ubicacionId: data.deposito.id } } })).resolves.toMatchObject({ cantidad: 40 })
  })

  it('rolls back source stock and derived-lot creation if destination accreditation fails', async () => {
    const data = await fixture()
    const target = await prisma.producto.create({ data: { nombre: 'Producto rollback', sku: 'SKU-ROLLBACK', unidadesPorCaja: 1 } })
    const sourceLot = await prisma.lote.create({ data: { numero: 'CB-ROLLBACK', productoId: data.producto.id } })
    await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: sourceLot.id, ubicacionId: data.acondicionado.id, cantidad: 100 } })
    const rule = await prisma.productoTransferRule.create({ data: { sourceProductId: data.producto.id, targetProductId: target.id, label: 'Equino', tipo: TipoReglaTransferenciaProducto.PRESENTATION } })
    const functionName = `force_destination_failure_${crypto.randomUUID().replaceAll('-', '')}`
    const triggerName = `force_destination_failure_trigger_${crypto.randomUUID().replaceAll('-', '')}`

    await prisma.$executeRawUnsafe(`CREATE FUNCTION ale_bet.${functionName}() RETURNS trigger AS $$ BEGIN IF NEW."productoId" = '${target.id}' THEN RAISE EXCEPTION 'forced destination failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON "ale_bet"."SaldoStock" FOR EACH ROW EXECUTE FUNCTION ale_bet.${functionName}()`)
    try {
      const response = await request(app)
        .post('/api/ale-bet/stock/transferencias')
        .set('Authorization', auth('admin'))
        .set('Idempotency-Key', 'presentation-rollback')
        .send({ productoId: data.producto.id, loteId: sourceLot.id, origen: 'ACONDICIONADO', destino: 'DEPOSITO', cantidad: 30, transferRuleId: rule.id })
      expect(response.status).toBe(500)
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON "ale_bet"."SaldoStock"`)
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ale_bet.${functionName}()`)
    }

    expect(await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: sourceLot.id, ubicacionId: data.acondicionado.id } } })).toMatchObject({ cantidad: 100 })
    expect(await prisma.lote.count({ where: { productoId: target.id } })).toBe(0)
    expect(await prisma.saldoStock.count({ where: { productoId: target.id } })).toBe(0)
    expect(await prisma.movimientoStock.count({ where: { loteId: sourceLot.id } })).toBe(0)
  })

  it('rejects unconfigured, invalid, oversized, and concurrent presentation transfers without overspending source stock', async () => {
    const data = await fixture()
    const target = await prisma.producto.create({ data: { nombre: 'Producto CERDOS', sku: 'SKU-CERDOS', unidadesPorCaja: 1 } })
    const sourceLot = await prisma.lote.create({ data: { numero: 'HB0029', productoId: data.producto.id } })
    await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: sourceLot.id, ubicacionId: data.acondicionado.id, cantidad: 100 } })
    const rule = await prisma.productoTransferRule.create({ data: { sourceProductId: data.producto.id, targetProductId: target.id, label: 'Cerdos', tipo: TipoReglaTransferenciaProducto.PRESENTATION } })
    const base = { productoId: data.producto.id, loteId: sourceLot.id, origen: 'ACONDICIONADO', destino: 'DEPOSITO', transferRuleId: rule.id }

    expect((await request(app).post('/api/ale-bet/stock/transferencias').set('Authorization', auth('admin')).set('Idempotency-Key', 'invalid-rule').send({ ...base, transferRuleId: 'missing', cantidad: 1 })).status).toBe(409)
    expect((await request(app).post('/api/ale-bet/stock/transferencias').set('Authorization', auth('admin')).set('Idempotency-Key', 'invalid-zero').send({ ...base, cantidad: 0 })).status).toBe(400)
    expect((await request(app).post('/api/ale-bet/stock/transferencias').set('Authorization', auth('admin')).set('Idempotency-Key', 'oversized').send({ ...base, cantidad: 101 })).status).toBe(409)

    const [first, second] = await Promise.all([
      request(app).post('/api/ale-bet/stock/transferencias').set('Authorization', auth('admin')).set('Idempotency-Key', 'race-1').send({ ...base, cantidad: 60 }),
      request(app).post('/api/ale-bet/stock/transferencias').set('Authorization', auth('admin')).set('Idempotency-Key', 'race-2').send({ ...base, cantidad: 60 }),
    ])
    expect([first.status, second.status].sort()).toEqual([201, 409])
    expect(await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: sourceLot.id, ubicacionId: data.acondicionado.id } } })).toMatchObject({ cantidad: 40 })
  })

  it('returns identical physical aggregates from GET /productos and GET /stock', async () => {
    const data = await fixture()
    const lot1 = await prisma.lote.create({ data: { numero: 'L-DEP', productoId: data.producto.id } })
    const lot2 = await prisma.lote.create({ data: { numero: 'L-ACO', productoId: data.producto.id } })
    await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: lot1.id, ubicacionId: data.deposito.id, cantidad: 40 } })
    await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: lot1.id, ubicacionId: data.acondicionado.id, cantidad: 0 } })
    await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: lot2.id, ubicacionId: data.deposito.id, cantidad: 0 } })
    await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: lot2.id, ubicacionId: data.acondicionado.id, cantidad: 40 } })

    const productos = await request(app).get('/api/ale-bet/productos').set('Authorization', auth('vendedor'))
    const stock = await request(app).get('/api/ale-bet/stock').set('Authorization', auth('vendedor'))

    expect(productos.status).toBe(200)
    expect(stock.status).toBe(200)

    const prod = productos.body.find((p: { id: string }) => p.id === data.producto.id)
    const stockProd = stock.body.productos.find((p: { id: string }) => p.id === data.producto.id)

    expect(prod).toMatchObject({ stockTotal: 80, stockDeposito: 40, stockAcondicionado: 40 })
    expect(stockProd).toMatchObject({ stockTotal: 80, stockDeposito: 40, stockAcondicionado: 40 })
    expect(prod.lotes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: lot1.id, numero: 'L-DEP', stockTotal: 40, stockDeposito: 40, stockAcondicionado: 0 }),
      expect.objectContaining({ id: lot2.id, numero: 'L-ACO', stockTotal: 40, stockDeposito: 0, stockAcondicionado: 40 }),
    ]))
      expect(stockProd.lotes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: lot1.id, numero: 'L-DEP', stockTotal: 40, stockDeposito: 40, stockAcondicionado: 0 }),
        expect.objectContaining({ id: lot2.id, numero: 'L-ACO', stockTotal: 40, stockDeposito: 0, stockAcondicionado: 40 }),
      ]))
  })

  it('ingresa delta into existing lot at ACONDICIONADO atomically and idempotently', async () => {
    const data = await fixture()
    const lot = await prisma.lote.create({ data: { numero: 'L-ING-1', productoId: data.producto.id } })
    await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: lot.id, ubicacionId: data.acondicionado.id, cantidad: 100 } })

    const first = await request(app)
      .patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/ingreso`)
      .set('Authorization', auth('admin'))
      .set('Idempotency-Key', 'ingreso-1')
      .send({ ubicacionId: data.acondicionado.id, cantidad: 600 })

    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ anterior: 100, nuevo: 700, delta: 600 })

    const retry = await request(app)
      .patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/ingreso`)
      .set('Authorization', auth('admin'))
      .set('Idempotency-Key', 'ingreso-1')
      .send({ ubicacionId: data.acondicionado.id, cantidad: 600 })

    expect(retry.status).toBe(200)
    expect(retry.body).toEqual(first.body)

    const saldo = await prisma.saldoStock.findUnique({
      where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: lot.id, ubicacionId: data.acondicionado.id } },
    })
    expect(saldo).toMatchObject({ cantidad: 700 })
    expect(await prisma.movimientoStock.count({ where: { loteId: lot.id, tipo: 'AJUSTE' } })).toBe(1)
    expect(await prisma.stockProjectionOutbox.findMany({
      where: { productId: data.producto.id, causeType: 'MANUAL_ADJUST' },
    })).toEqual([expect.objectContaining({ estado: 'PENDING' })])
    expect(syncAfterCommit).toHaveBeenCalledTimes(2)
  })

  it('ingresa delta into zero-stock lot and reactivates it if previously inactive', async () => {
    const data = await fixture()
    const lot = await prisma.lote.create({ data: { numero: 'L-ING-ZERO', productoId: data.producto.id, activo: false } })

    const response = await request(app)
      .patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/ingreso`)
      .set('Authorization', auth('admin'))
      .set('Idempotency-Key', 'ingreso-zero-reactivate')
      .send({ ubicacionId: data.acondicionado.id, cantidad: 600 })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ anterior: 0, nuevo: 600, delta: 600 })

    const reactivated = await prisma.lote.findUnique({ where: { id: lot.id } })
    expect(reactivated?.activo).toBe(true)

    const saldo = await prisma.saldoStock.findUnique({
      where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: lot.id, ubicacionId: data.acondicionado.id } },
    })
    expect(saldo).toMatchObject({ cantidad: 600 })
  })

  it('hides zero-stock lots operationally and includes them in the archived administrative view', async () => {
    const data = await fixture()
    await prisma.lote.create({ data: { numero: 'L-ACTIVE', productoId: data.producto.id, activo: true } })
    await prisma.lote.create({ data: { numero: 'L-INACTIVE', productoId: data.producto.id, activo: false } })

    const defaultResponse = await request(app).get(`/api/ale-bet/productos/${data.producto.id}/stock`).set('Authorization', auth('vendedor'))
    expect(defaultResponse.status).toBe(200)
    expect(defaultResponse.body.lotes).toHaveLength(0)

    const adminResponse = await request(app).get(`/api/ale-bet/productos/${data.producto.id}/stock?includeArchived=true`).set('Authorization', auth('admin'))
    expect(adminResponse.status).toBe(200)
    expect(adminResponse.body.lotes).toHaveLength(2)
    expect(adminResponse.body.lotes.map((l: { numero: string }) => l.numero)).toEqual(expect.arrayContaining(['L-ACTIVE', 'L-INACTIVE']))
  })

  it('rejects ingreso with negative or zero cantidad', async () => {
    const data = await fixture()
    const lot = await prisma.lote.create({ data: { numero: 'L-ING-NEG', productoId: data.producto.id } })

    const negative = await request(app)
      .patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/ingreso`)
      .set('Authorization', auth('admin'))
      .set('Idempotency-Key', 'ingreso-neg')
      .send({ ubicacionId: data.acondicionado.id, cantidad: -1 })

    const zero = await request(app)
      .patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/ingreso`)
      .set('Authorization', auth('admin'))
      .set('Idempotency-Key', 'ingreso-zero')
      .send({ ubicacionId: data.acondicionado.id, cantidad: 0 })

    expect(negative.status).toBe(400)
    expect(zero.status).toBe(400)
    expect(await prisma.movimientoStock.count({ where: { loteId: lot.id } })).toBe(0)
  })

  it('rejects ingreso without idempotency key', async () => {
    const data = await fixture()
    const lot = await prisma.lote.create({ data: { numero: 'L-ING-NOKEY', productoId: data.producto.id } })

    const response = await request(app)
      .patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/ingreso`)
      .set('Authorization', auth('admin'))
      .send({ ubicacionId: data.acondicionado.id, cantidad: 100 })

    expect(response.status).toBe(400)
  })

  it('concurrent ingresos serialize correctly without lost updates', async () => {
    const data = await fixture()
    const lot = await prisma.lote.create({ data: { numero: 'L-CONC', productoId: data.producto.id } })
    await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: lot.id, ubicacionId: data.acondicionado.id, cantidad: 100 } })

    const [resA, resB] = await Promise.all([
      request(app)
        .patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/ingreso`)
        .set('Authorization', auth('admin'))
        .set('Idempotency-Key', 'conc-a')
        .send({ ubicacionId: data.acondicionado.id, cantidad: 600 }),
      request(app)
        .patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/ingreso`)
        .set('Authorization', auth('admin'))
        .set('Idempotency-Key', 'conc-b')
        .send({ ubicacionId: data.acondicionado.id, cantidad: 50 }),
    ])

    expect(resA.status).toBe(200)
    expect(resB.status).toBe(200)

    const saldo = await prisma.saldoStock.findUnique({
      where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: lot.id, ubicacionId: data.acondicionado.id } },
    })
    expect(saldo?.cantidad).toBe(750)
  })
})
