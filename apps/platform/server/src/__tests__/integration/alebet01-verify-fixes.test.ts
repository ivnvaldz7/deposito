import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import crypto from 'crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
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
  const raw = req.headers.authorization?.split(' ')[1]
  if (raw) {
    try { req.user = jwt.verify(raw, process.env.PLATFORM_JWT_SECRET ?? 'test-secret') as JwtPayload } catch { /* requireApp rejects unauthenticated requests */ }
  }
  next()
})
app.use('/api/ale-bet', createAleBetRoutes())

function auth(userId: string, role: 'admin' | 'vendedor' | 'armador'): string {
  return `Bearer ${jwt.sign({ sub: userId, email: `${userId}@test.local`, apps: { 'ale-bet': { rol: role, activo: true } } }, process.env.PLATFORM_JWT_SECRET ?? 'test-secret')}`
}

async function fixture(state: 'APROBADO' | 'PREPARADO' = 'PREPARADO') {
  const id = crypto.randomUUID()
  const cliente = await prisma.cliente.create({ data: { nombre: `Cliente ${id}`, contacto: 'UAT' } })
  const producto = await prisma.producto.create({ data: { nombre: `Producto ${id}`, sku: `SKU-${id}` } })
  const lote = await prisma.lote.create({
    data: { numero: `L-${id}`, productoId: producto.id, cajas: 0, sueltos: 5, fechaProduccion: new Date(), fechaVencimiento: new Date(Date.now() + 86_400_000) },
  })
  const pedido = await prisma.pedido.create({
    data: {
      numero: `P-${id}`, clienteId: cliente.id, vendedorId: 'seller-1', armadorId: state === 'PREPARADO' ? 'picker-1' : null,
      estado: state, preparadoAt: state === 'PREPARADO' ? new Date() : null,
      items: { create: [{ productoId: producto.id, cantidad: 5, completado: state === 'PREPARADO' }] },
    },
    include: { items: true },
  })
  const reserva = await prisma.reservaStock.create({ data: { pedidoId: pedido.id, itemPedidoId: pedido.items[0]!.id, loteId: lote.id, cantidad: 5 } })
  if (state === 'PREPARADO') {
    await prisma.remito.create({
      data: {
        pedidoId: pedido.id, numero: `R-${id}`, transporteNombre: 'Transporte de prueba', transporteDireccion: 'Ruta 1',
        clienteSnapshot: { nombre: cliente.nombre }, transporteSnapshot: { nombre: 'Transporte de prueba', direccion: 'Ruta 1' },
        itemsSnapshot: [{ productoId: producto.id, cantidad: 5 }], createdBy: 'billing-1',
      },
    })
  }
  return { cliente, producto, lote, pedido, reserva }
}

describe('ALEBET-01 verify fixes - database integration', () => {
  beforeAll(async () => { await prisma.$queryRaw`SELECT 1` })
  beforeEach(async () => { await truncateDb(prisma) })
  afterAll(async () => { await prisma.$disconnect() })

  it('serializes a real double-dispatch endpoint race and consumes a reservation exactly once', async () => {
    const data = await fixture()
    const [left, right] = await Promise.all([
      request(app).post(`/api/ale-bet/pedidos/${data.pedido.id}/despachar`).set('Authorization', auth('picker-1', 'armador')).send({ expectedVersion: 1 }),
      request(app).post(`/api/ale-bet/pedidos/${data.pedido.id}/despachar`).set('Authorization', auth('picker-1', 'armador')).send({ expectedVersion: 1 }),
    ])

    expect([left.status, right.status].sort((a, b) => a - b)).toEqual([200, 409])
    expect(await prisma.pedido.findUnique({ where: { id: data.pedido.id }, select: { estado: true, version: true } })).toEqual({ estado: 'DESPACHADO', version: 2 })
    expect(await prisma.reservaStock.findMany({ where: { pedidoId: data.pedido.id }, select: { estado: true } })).toEqual([{ estado: 'CONSUMIDA' }])
    expect(await prisma.lote.findUnique({ where: { id: data.lote.id }, select: { cajas: true, sueltos: true, activo: true } })).toEqual({ cajas: 0, sueltos: 0, activo: false })
    expect(await prisma.movimientoStock.findMany({ where: { pedidoId: data.pedido.id }, select: { cantidad: true, loteId: true, reservaId: true } })).toEqual([{ cantidad: -5, loteId: data.lote.id, reservaId: data.reserva.id }])
  })

  it('retains the released lot assignment when an approved order replaces its items', async () => {
    const data = await fixture('APROBADO')
    const response = await request(app).patch(`/api/ale-bet/pedidos/${data.pedido.id}`)
      .set('Authorization', auth('seller-1', 'vendedor'))
      .send({ clienteId: data.cliente.id, items: [{ productoId: data.producto.id, cantidad: 4 }], expectedVersion: 1 })
      .expect(200)

    expect(response.body.version).toBe(2)
    const reservas = await prisma.reservaStock.findMany({ where: { pedidoId: data.pedido.id }, orderBy: { createdAt: 'asc' }, select: { estado: true, itemPedidoId: true, loteId: true, cantidad: true } })
    expect(reservas).toEqual([
      { estado: 'LIBERADA', itemPedidoId: null, loteId: data.lote.id, cantidad: 5 },
      { estado: 'ACTIVA', itemPedidoId: expect.any(String), loteId: data.lote.id, cantidad: 4 },
    ])
  })

  it('rejects disabling a lot with an active reservation instead of hiding reserved physical stock', async () => {
    const data = await fixture('APROBADO')
    await request(app).put(`/api/ale-bet/productos/${data.producto.id}/lotes/${data.lote.id}`)
      .set('Authorization', auth('admin-1', 'admin')).send({ activo: false }).expect(409)
    expect(await prisma.lote.findUnique({ where: { id: data.lote.id }, select: { activo: true } })).toEqual({ activo: true })
  })
})
