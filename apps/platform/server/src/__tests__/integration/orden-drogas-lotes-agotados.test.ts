import crypto from 'node:crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { platformDb as db } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { createDepositoRoutes } from '../../deposito/routes'

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.PLATFORM_JWT_SECRET || 'test-secret') as JwtPayload
      req.user = payload
      req.depositoUser = {
        id: payload.sub,
        email: payload.email ?? '',
        name: payload.name ?? '',
        role: payload.apps?.deposito?.rol ?? 'encargado',
      }
    } catch { /* Invalid tokens continue unauthenticated. */ }
  }
  next()
})
app.use('/api/deposito', createDepositoRoutes())

const productIds: string[] = []
const orderIds: string[] = []
let actorId = ''
let authorization = ''

describe('orden de drogas elimina solo lotes agotados — PostgreSQL integration', () => {
  beforeAll(async () => {
    const testDb = await db.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`
    if (testDb[0]?.database !== 'platform_test_automation') {
      throw new Error(`Test DB insegura: se recibió ${testDb[0]?.database ?? 'desconocida'}`)
    }

    const actor = await db.user.create({
      data: {
        email: `orden-drogas-${crypto.randomUUID()}@test.local`,
        name: 'Orden Drogas Integration',
        passwordHash: 'integration-only',
        role: 'encargado',
      },
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

  afterEach(async () => {
    if (orderIds.length > 0) {
      await db.movimiento.deleteMany({ where: { referenciaId: { in: orderIds } } })
      await db.ordenProduccion.deleteMany({ where: { id: { in: orderIds } } })
      orderIds.length = 0
    }
    if (productIds.length > 0) {
      await db.inventarioDroga.deleteMany({ where: { productoId: { in: productIds } } })
      await db.depositoProducto.deleteMany({ where: { id: { in: productIds } } })
      productIds.length = 0
    }
  })

  afterAll(async () => {
    if (actorId) await db.user.deleteMany({ where: { id: actorId } })
    await db.$disconnect()
  })

  async function createDrug(name: string) {
    const product = await db.depositoProducto.create({
      data: { nombreBase: name, nombreCompleto: name, categoria: 'droga' },
    })
    productIds.push(product.id)
    return product
  }

  async function approve(productId: string, name: string, cantidad: number) {
    const created = await request(app)
      .post('/api/deposito/ordenes')
      .set('Authorization', authorization)
      .send({ categoria: 'droga', productoId: productId, cantidad })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const orderId = created.body.id as string
    orderIds.push(orderId)

    const response = await request(app)
      .post(`/api/deposito/ordenes/${orderId}/aprobar`)
      .set('Authorization', authorization)
    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(response.body.estado).toBe('aprobada')
    expect(await db.depositoProducto.findUnique({ where: { id: productId } })).not.toBeNull()
    expect(await db.ordenProduccion.findUnique({ where: { id: orderId } })).toMatchObject({ estado: 'aprobada', cantidad })

    const movements = await db.movimiento.findMany({
      where: { referenciaId: orderId },
      orderBy: { lote: 'asc' },
    })
    expect(movements.every((movement) => movement.tipo === 'egreso_orden' && movement.categoria === 'droga')).toBe(true)
    expect(movements.every((movement) => movement.referenciaTipo === 'orden')).toBe(true)
    expect(movements.every((movement) => movement.productoNombre === name && movement.createdBy === actorId)).toBe(true)
    return { orderId, movements }
  }

  it('elimina el lote consumido por completo y conserva catálogo, movimiento y orden', async () => {
    const name = `Droga agotada ${crypto.randomUUID()}`
    const product = await createDrug(name)
    await db.inventarioDroga.create({ data: { productoId: product.id, nombre: name, lote: '122052', cantidad: 25 } })

    const { orderId, movements } = await approve(product.id, name, 25)

    expect(await db.inventarioDroga.count({ where: { productoId: product.id } })).toBe(0)
    expect(await db.depositoProducto.findUnique({ where: { id: product.id } })).not.toBeNull()
    expect(await db.ordenProduccion.findUnique({ where: { id: orderId } })).toMatchObject({ estado: 'aprobada', cantidad: 25 })
    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({ lote: '122052', cantidad: -25 })

    const catalog = await request(app).get('/api/deposito/drogas').set('Authorization', authorization)
    expect(catalog.status).toBe(200)
    expect(catalog.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ productoId: product.id, cantidadTotal: 0, lotes: [] }),
    ]))
  })

  it('conserva en cinco unidades el lote parcialmente consumido', async () => {
    const name = `Droga parcial ${crypto.randomUUID()}`
    const product = await createDrug(name)
    await db.inventarioDroga.create({ data: { productoId: product.id, nombre: name, lote: 'PARCIAL', cantidad: 30 } })

    const { movements } = await approve(product.id, name, 25)

    await expect(db.inventarioDroga.findMany({ where: { productoId: product.id } })).resolves.toMatchObject([
      { lote: 'PARCIAL', cantidad: 5 },
    ])
    expect(movements).toHaveLength(1)
    expect(movements[0]?.cantidad).toBe(-25)
  })

  it('aplica FIFO y elimina solo el primer lote agotado', async () => {
    const name = `Droga FIFO ${crypto.randomUUID()}`
    const product = await createDrug(name)
    await db.inventarioDroga.createMany({ data: [
      { productoId: product.id, nombre: name, lote: 'A', cantidad: 10, vencimiento: new Date('2027-01-01T00:00:00.000Z') },
      { productoId: product.id, nombre: name, lote: 'B', cantidad: 20, vencimiento: new Date('2028-01-01T00:00:00.000Z') },
    ] })

    const { movements } = await approve(product.id, name, 15)

    await expect(db.inventarioDroga.findMany({ where: { productoId: product.id } })).resolves.toMatchObject([
      { lote: 'B', cantidad: 15 },
    ])
    expect(movements.map((movement) => ({ lote: movement.lote, cantidad: movement.cantidad }))).toEqual([
      { lote: 'A', cantidad: -10 },
      { lote: 'B', cantidad: -5 },
    ])
  })
})
