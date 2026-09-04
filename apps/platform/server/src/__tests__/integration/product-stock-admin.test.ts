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

  it('opens each physical location independently, replays idempotently, and audits SALDO_APERTURA', async () => {
    const data = await fixture()
    const lot = await prisma.lote.create({ data: { numero: 'L-OPEN', productoId: data.producto.id } })
    const payload = { ubicacionId: data.deposito.id, cantidadFinal: 42, fechaEfectiva: '2026-08-24' }
    const first = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/apertura`).set('Authorization', auth('admin')).set('Idempotency-Key', 'opening-1').send(payload)
    const retry = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/apertura`).set('Authorization', auth('admin')).set('Idempotency-Key', 'opening-1').send(payload)
    const acondicionamiento = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/apertura`).set('Authorization', auth('admin')).set('Idempotency-Key', 'opening-aco').send({ ubicacionId: data.acondicionado.id, cantidadFinal: 8, fechaEfectiva: '2026-08-24' })
    const second = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/apertura`).set('Authorization', auth('admin')).set('Idempotency-Key', 'opening-2').send(payload)
    expect(first.status).toBe(201)
    expect(retry.status).toBe(201)
    expect(retry.body).toEqual(first.body)
    expect(acondicionamiento.status).toBe(201)
    expect(second.status).toBe(409)
    expect(await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: lot.id, ubicacionId: data.deposito.id } } })).toMatchObject({ cantidad: 42 })
    expect(await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: lot.id, ubicacionId: data.acondicionado.id } } })).toMatchObject({ cantidad: 8 })
    expect(await prisma.movimientoStock.count({ where: { loteId: lot.id, tipo: 'SALDO_APERTURA' } })).toBe(2)
    expect(await prisma.movimientoStock.findFirstOrThrow({ where: { loteId: lot.id, tipo: 'SALDO_APERTURA', origenUbicacionId: data.deposito.id } })).toMatchObject({ usuarioId: 'stock-admin-test', cantidad: 42 })
    expect(JSON.parse((await prisma.movimientoStock.findFirstOrThrow({ where: { loteId: lot.id, tipo: 'SALDO_APERTURA', origenUbicacionId: data.deposito.id } })).referencia ?? '{}')).toMatchObject({ operacion: 'SALDO_APERTURA', motivo: 'Saldo de apertura', fechaEfectiva: '2026-08-24' })

    const history = await request(app).get(`/api/ale-bet/productos/${data.producto.id}/lotes/historial`).set('Authorization', auth('admin'))
    expect(history.status).toBe(200)
    expect(history.body.find((item: { id: string }) => item.id === lot.id).movimientos).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tipo: 'SALDO_APERTURA',
        usuarioId: 'stock-admin-test',
        origenUbicacion: { codigo: 'DEPOSITO', nombre: 'Depósito' },
        motivo: 'Saldo de apertura',
        fechaEfectiva: '2026-08-24',
      }),
    ]))
  })

  it('rejects opening for inactive products and non-logistics locations', async () => {
    const data = await fixture()
    const inactive = await prisma.producto.create({ data: { nombre: 'Producto inactivo', sku: 'SKU-INACTIVE-OPEN', unidadesPorCaja: 1, activo: false } })
    const inactiveLot = await prisma.lote.create({ data: { numero: 'L-INACTIVE', productoId: inactive.id } })
    const otherLocation = await prisma.ubicacionStock.create({ data: { codigo: 'OTRA', nombre: 'Otra ubicación' } })

    const inactiveResponse = await request(app).patch(`/api/ale-bet/productos/${inactive.id}/stock/lotes/${inactiveLot.id}/apertura`).set('Authorization', auth('admin')).set('Idempotency-Key', 'opening-inactive').send({ ubicacionId: data.deposito.id, cantidadFinal: 1 })
    const otherLocationResponse = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${(await prisma.lote.create({ data: { numero: 'L-OTHER-LOCATION', productoId: data.producto.id } })).id}/apertura`).set('Authorization', auth('admin')).set('Idempotency-Key', 'opening-other-location').send({ ubicacionId: otherLocation.id, cantidadFinal: 1 })

    expect(inactiveResponse.status).toBe(409)
    expect(otherLocationResponse.status).toBe(409)
    expect(await prisma.saldoStock.count()).toBe(0)
    expect(await prisma.movimientoStock.count()).toBe(0)
  })

  it('rejects zero, negative, and already-created zero balances for opening', async () => {
    const data = await fixture()
    const lot = await prisma.lote.create({ data: { numero: 'L-OPEN-NEG', productoId: data.producto.id } })
    const negative = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/apertura`).set('Authorization', auth('admin')).set('Idempotency-Key', 'opening-negative').send({ ubicacionId: data.deposito.id, cantidadFinal: -1 })
    const zero = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/apertura`).set('Authorization', auth('admin')).set('Idempotency-Key', 'opening-zero').send({ ubicacionId: data.deposito.id, cantidadFinal: 0 })
    await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: lot.id, ubicacionId: data.deposito.id, cantidad: 0 } })
    const existingZero = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/apertura`).set('Authorization', auth('admin')).set('Idempotency-Key', 'opening-existing-zero').send({ ubicacionId: data.deposito.id, cantidadFinal: 5 })
    expect(negative.status).toBe(400)
    expect(zero.status).toBe(400)
    expect(existingZero.status).toBe(409)
    expect(await prisma.movimientoStock.count({ where: { loteId: lot.id, tipo: 'SALDO_APERTURA' } })).toBe(0)
  })

  it('preserves the existing adjustment contract after a rejected opening', async () => {
    const data = await fixture()
    const lot = await prisma.lote.create({ data: { numero: 'L-OPEN-ADJUST', productoId: data.producto.id } })
    const negative = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/apertura`).set('Authorization', auth('admin')).set('Idempotency-Key', 'opening-negative').send({ ubicacionId: data.deposito.id, cantidadFinal: -1 })
    const adjustment = await request(app).patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${lot.id}/ajuste`).set('Authorization', auth('admin')).set('Idempotency-Key', 'adjust-after-open').send({ ubicacionId: data.deposito.id, cantidadFinal: 5, motivo: 'corrección' })
    expect(negative.status).toBe(400)
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
})
