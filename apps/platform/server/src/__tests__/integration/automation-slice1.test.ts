import crypto from 'node:crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { platformDb as prisma } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { createAleBetRoutes } from '../../routes/ale-bet'
import { truncateDb } from '../utils/db-cleaner'

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (token) req.user = jwt.verify(token, process.env.PLATFORM_JWT_SECRET ?? 'test-secret') as JwtPayload
  next()
})
app.use('/api/ale-bet', createAleBetRoutes())

function adminToken(): string {
  return jwt.sign({ sub: 'automation-admin', apps: { 'ale-bet': { rol: 'admin', activo: true } } }, process.env.PLATFORM_JWT_SECRET ?? 'test-secret')
}

describe('AUTOMATION-01 Slice 1', () => {
  beforeAll(async () => { await prisma.$queryRaw`SELECT 1` })
  beforeEach(async () => { await truncateDb(prisma) })

  async function seed(quantity = 65) {
    const suffix = crypto.randomUUID()
    const customer = await prisma.cliente.create({ data: { nombre: `Veterinaria ${suffix}` } })
    const product = await prisma.producto.create({ data: { nombre: 'Olivitasan 500 ML', sku: `OLIVITASAN-500-${suffix}`, unidadesPorCaja: 20 } })
    const deposito = await prisma.ubicacionStock.create({ data: { codigo: 'DEPOSITO', nombre: 'Depósito' } })
    const expired = await prisma.lote.create({ data: { numero: `EXP-${suffix}`, productoId: product.id, cajas: 5, sueltos: 0, fechaVencimiento: new Date(Date.now() - 86_400_000) } })
    const valid = await prisma.lote.create({ data: { numero: `VALID-${suffix}`, productoId: product.id, cajas: Math.floor(quantity / 20), sueltos: quantity % 20, fechaVencimiento: new Date(Date.now() + 86_400_000) } })
    await prisma.saldoStock.createMany({ data: [
      { productoId: product.id, loteId: expired.id, ubicacionId: deposito.id, cantidad: 100 },
      { productoId: product.id, loteId: valid.id, ubicacionId: deposito.id, cantidad: quantity },
    ] })
    return { customer, product, valid, expired }
  }

  it('persists the draft and confirms once: APROBADO, active reservation, unchanged physical and PENDING outbox', async () => {
    const fixture = await seed()
    const auth = `Bearer ${adminToken()}`
    const created = await request(app).post('/api/ale-bet/automation/drafts').set('Authorization', auth)
      .send({ originalText: '20 Olivitasan 500\nagregá 15 más de Olivitasan 500' }).expect(201)
    expect(created.body.originalText).toContain('agregá 15')
    const edited = await request(app).put(`/api/ale-bet/automation/drafts/${created.body.id}`).set('Authorization', auth)
      .send({ expectedVersion: 1, clienteId: fixture.customer.id, lines: [
        { productId: fixture.product.id, unidades: 20 },
        { productId: fixture.product.id, unidades: 15 },
      ] }).expect(200)
    const key = crypto.randomUUID()
    const confirmed = await request(app).post(`/api/ale-bet/automation/drafts/${created.body.id}/confirm`).set('Authorization', auth).set('Idempotency-Key', key)
      .send({ expectedVersion: edited.body.version }).expect(200)
    const replay = await request(app).post(`/api/ale-bet/automation/drafts/${created.body.id}/confirm`).set('Authorization', auth).set('Idempotency-Key', key)
      .send({ expectedVersion: edited.body.version }).expect(200)
    expect(replay.headers['idempotency-replayed']).toBe('true')
    expect(replay.body.pedido.id).toBe(confirmed.body.pedido.id)
    await request(app).post(`/api/ale-bet/automation/drafts/${created.body.id}/confirm`).set('Authorization', auth).set('Idempotency-Key', key)
      .send({ expectedVersion: edited.body.version + 1 }).expect(409)
    const pedido = await prisma.pedido.findUniqueOrThrow({ where: { id: confirmed.body.pedido.id }, include: { items: true, reservas: true } })
    expect(pedido.estado).toBe('APROBADO')
    expect(pedido.items).toHaveLength(1)
    expect(pedido.items[0]?.cantidad).toBe(35)
    expect(pedido.reservas).toHaveLength(1)
    expect(pedido.reservas[0]).toMatchObject({ estado: 'ACTIVA', cantidad: 35, loteId: fixture.valid.id })
    expect((await prisma.saldoStock.findUniqueOrThrow({ where: { productoId_loteId_ubicacionId: { productoId: fixture.product.id, loteId: fixture.valid.id, ubicacionId: pedido.reservas[0]!.ubicacionId } } })).cantidad).toBe(65)
    expect(await prisma.pedidoAuditoria.count({ where: { pedidoId: pedido.id } })).toBe(2)
    expect(await prisma.stockProjectionOutbox.findMany({ where: { causeId: pedido.id } })).toEqual([expect.objectContaining({ productId: fixture.product.id, estado: 'PENDING' })])
    expect(await prisma.orderInterpretationDraft.findUniqueOrThrow({ where: { id: created.body.id } })).toMatchObject({ estado: 'CONFIRMED', pedidoId: pedido.id, confirmedBy: 'automation-admin' })
    await request(app).put(`/api/ale-bet/automation/drafts/${created.body.id}`).set('Authorization', auth)
      .send({ expectedVersion: edited.body.version, clienteId: fixture.customer.id, lines: [{ productId: fixture.product.id, unidades: 35 }] }).expect(409)
  })

  it('serializes concurrent drafts against the last availability', async () => {
    const fixture = await seed(20)
    const auth = `Bearer ${adminToken()}`
    const ids: Array<{ id: string; version: number }> = []
    for (const units of [20, 20]) {
      const draft = await request(app).post('/api/ale-bet/automation/drafts').set('Authorization', auth).send({ originalText: `${units} Olivitasan 500` })
      const edited = await request(app).put(`/api/ale-bet/automation/drafts/${draft.body.id}`).set('Authorization', auth).send({ expectedVersion: 1, clienteId: fixture.customer.id, lines: [{ productId: fixture.product.id, unidades: units }] })
      ids.push({ id: draft.body.id, version: edited.body.version })
    }
    const responses = await Promise.all(ids.map((draft) => request(app).post(`/api/ale-bet/automation/drafts/${draft.id}/confirm`).set('Authorization', auth).set('Idempotency-Key', crypto.randomUUID()).send({ expectedVersion: draft.version })))
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
    expect(await prisma.reservaStock.aggregate({ where: { estado: 'ACTIVA', loteId: fixture.valid.id }, _sum: { cantidad: true } })).toMatchObject({ _sum: { cantidad: 20 } })
  })
})
