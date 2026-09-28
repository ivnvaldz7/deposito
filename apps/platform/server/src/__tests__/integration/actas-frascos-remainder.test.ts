import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { platformDb as prisma, Role } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { createDepositoRoutes } from '../../deposito/routes/index'
import { truncateDb } from '../utils/db-cleaner'

const app = express()
app.use(express.json())

declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtPayload
    depositoUser?: { id: string; email: string; name: string; role: string }
  }
}

app.use((req, _res, next) => {
  const value = req.headers.authorization?.split(' ')[1]
  if (value) {
    try {
      const payload = jwt.verify(value, process.env.PLATFORM_JWT_SECRET || 'test-secret') as JwtPayload
      req.user = payload
      req.depositoUser = { id: payload.sub, email: payload.email ?? '', name: payload.name ?? '', role: payload.apps?.deposito?.rol ?? 'encargado' }
    } catch { /* invalid token remains unauthenticated */ }
  }
  next()
})
app.use('/api/deposito', createDepositoRoutes())

describe('Actas de frascos preservan unidades sueltas — PostgreSQL integration', () => {
  let actorId: string
  let authorization: string

  beforeEach(async () => {
    await truncateDb(prisma)
    const actor = await prisma.user.create({
      data: { email: `acta-frascos-${crypto.randomUUID()}@test.local`, name: 'Integration', passwordHash: 'hash', role: Role.ADMIN },
    })
    actorId = actor.id
    const token = jwt.sign({
      sub: actor.id,
      email: actor.email,
      name: actor.name,
      apps: { deposito: { rol: 'encargado', activo: true } },
    }, process.env.PLATFORM_JWT_SECRET || 'test-secret')
    authorization = `Bearer ${token}`
  })

  afterAll(async () => { await prisma.$disconnect() })

  async function createFrascoStock(cantidadCajas: number, total: number) {
    const name = `Frasco ${crypto.randomUUID()}`
    const product = await prisma.depositoProducto.create({
      data: { nombreBase: name, nombreCompleto: name, categoria: 'frasco', codigo: `FR-${crypto.randomUUID()}` },
    })
    const stock = await prisma.inventarioFrasco.create({
      data: { productoId: product.id, articulo: name, unidadesPorCaja: 24, cantidadCajas, total },
    })
    return { product, stock }
  }

  async function distribute(product: { id: string; nombreCompleto: string }, cantidadCajas: number) {
    const acta = await request(app).post('/api/deposito/actas').set('Authorization', authorization).send({ fecha: '2026-09-23' })
    expect(acta.status).toBe(201)
    const item = await request(app).post(`/api/deposito/actas/${acta.body.id}/items`).set('Authorization', authorization).send({
      categoria: 'frasco', productoId: product.id, productoNombre: product.nombreCompleto, cantidadIngresada: cantidadCajas,
    })
    expect(item.status).toBe(201)
    const response = await request(app)
      .post(`/api/deposito/actas/${acta.body.id}/items/${item.body.id}/distribuir`)
      .set('Authorization', authorization)
      .send({ cantidad: cantidadCajas })
    expect(response.status, JSON.stringify(response.body)).toBe(200)
  }

  it('preserva el remainder al distribuir cajas sobre stock con unidades sueltas', async () => {
    const { product, stock } = await createFrascoStock(16, 400)
    await distribute(product, 5)

    const result = await prisma.inventarioFrasco.findUniqueOrThrow({ where: { id: stock.id } })
    expect(result).toMatchObject({ cantidadCajas: 21, total: 520 })
    expect(result.total % result.unidadesPorCaja).toBe(16)
  })

  it('distribuye cajas completas cuando no existe remainder', async () => {
    const { product, stock } = await createFrascoStock(10, 240)
    await distribute(product, 2)

    const result = await prisma.inventarioFrasco.findUniqueOrThrow({ where: { id: stock.id } })
    expect(result).toMatchObject({ cantidadCajas: 12, total: 288 })
    expect(result.total % result.unidadesPorCaja).toBe(0)
  })

  it('conserva el remainder en la secuencia real aprobación de orden → distribución de acta', async () => {
    const { product, stock } = await createFrascoStock(100, 2400)
    const order = await prisma.ordenProduccion.create({
      data: { solicitanteId: actorId, productoId: product.id, productoNombre: product.nombreCompleto, categoria: 'frasco', cantidad: 2000, estado: 'solicitada' },
    })
    const approved = await request(app).post(`/api/deposito/ordenes/${order.id}/aprobar`).set('Authorization', authorization)
    expect(approved.status, JSON.stringify(approved.body)).toBe(200)
    const afterOrder = await prisma.inventarioFrasco.findUniqueOrThrow({ where: { id: stock.id } })
    expect(afterOrder).toMatchObject({ cantidadCajas: 16, total: 400 })
    expect(afterOrder.total % afterOrder.unidadesPorCaja).toBe(16)

    await distribute(product, 5)

    const afterActa = await prisma.inventarioFrasco.findUniqueOrThrow({ where: { id: stock.id } })
    expect(afterActa).toMatchObject({ cantidadCajas: 21, total: 520 })
    expect(afterActa.total % afterActa.unidadesPorCaja).toBe(16)
  })
})
