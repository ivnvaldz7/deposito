import crypto from 'crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { platformDb as prisma } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { createAleBetRoutes } from '../../routes/ale-bet/index'
import { truncateDb } from '../utils/db-cleaner'

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
  beforeEach(async () => { await truncateDb(prisma) })
  afterAll(async () => { await prisma.$disconnect() })

  async function fixture() {
    const id = crypto.randomUUID()
    const deposito = await prisma.ubicacionStock.create({ data: { codigo: 'DEPOSITO', nombre: 'Depósito' } })
    const acondicionado = await prisma.ubicacionStock.create({ data: { codigo: 'ACONDICIONADO', nombre: 'Acondicionado' } })
    const producto = await prisma.producto.create({ data: { nombre: `Producto ${id}`, sku: `SKU-${id}`, unidadesPorCaja: 1 } })
    return { deposito, acondicionado, producto }
  }

  it('creates a lot with zero location stock and exposes the administrative DTO', async () => {
    const data = await fixture()
    const created = await request(app).post(`/api/ale-bet/productos/${data.producto.id}/stock/lotes`).set('Authorization', auth('admin')).send({ numero: 'L-ADMIN' })
    expect(created.status).toBe(201)
    const response = await request(app).get(`/api/ale-bet/productos/${data.producto.id}/stock`).set('Authorization', auth('vendedor'))
    expect(response.status).toBe(200)
    expect(response.body.lotes[0]).toMatchObject({ numero: 'L-ADMIN', stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0 })
    expect(response.body.ubicaciones).toHaveLength(2)
  })

  it('adjusts final quantity transactionally, is idempotent, and audits signed delta', async () => {
    const data = await fixture()
    const lot = await prisma.lote.create({ data: { numero: 'L-1', productoId: data.producto.id } })
    const first = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/ajuste`).set('Authorization', auth('admin')).set('Idempotency-Key', 'adjust-1').send({ ubicacionId: data.deposito.id, cantidadFinal: 100, motivo: 'conteo' })
    const retry = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/ajuste`).set('Authorization', auth('admin')).set('Idempotency-Key', 'adjust-1').send({ ubicacionId: data.deposito.id, cantidadFinal: 100, motivo: 'conteo' })
    expect(first.status).toBe(200)
    expect(retry.body).toEqual(first.body)
    expect((await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: lot.id, ubicacionId: data.deposito.id } } }))?.cantidad).toBe(100)
    expect(await prisma.movimientoStock.count({ where: { loteId: lot.id, tipo: 'AJUSTE' } })).toBe(1)
    expect((await prisma.movimientoStock.findFirstOrThrow({ where: { loteId: lot.id } })).cantidad).toBe(100)
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
  })
})
