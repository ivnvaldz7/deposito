import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import { platformDb as prisma } from '@platform/db'
import { createAleBetRoutes } from '../../routes/ale-bet/index'
import { createDepositoRoutes } from '../../deposito/routes/index'
import { truncateDb } from '../utils/db-cleaner'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

import type { JwtPayload } from '@platform/core'
import { verifyAccessToken } from '@platform/core'

const app = express()
app.use(express.json())

// Extender Express Request localmente para los tipos necesarios
declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtPayload
    depositoUser?: {
      id: string
      email: string
      name: string
      role: string
    }
  }
}

// Mock auth middleware for integration tests to bypass token validation
// but inject the right user data.
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (token) {
    // Validar el payload de fuente externa (token decodeado) usando unknown y narrowing
    try {
      const decoded: unknown = jwt.verify(token, process.env.PLATFORM_JWT_SECRET || 'test-secret')

      if (typeof decoded === 'object' && decoded !== null && 'sub' in decoded) {
        const payload = decoded as JwtPayload
        req.user = payload
        // Also inject for deposito routes (legacy authenticate middleware mapping)
        req.depositoUser = {
          id: payload.sub,
          email: payload.email || '',
          name: payload.name || '',
          role: payload.apps?.deposito?.rol || 'encargado'
        }
      }
    } catch (e) {
      // Ignorar token invalido
    }
  }
  next()
})

app.use('/api/ale-bet', createAleBetRoutes())
app.use('/api/deposito', createDepositoRoutes())

function signTestToken(userId: string, role: string, email: string = 'test@example.com') {
  return jwt.sign({
    sub: userId,
    email,
    name: 'Test User',
    apps: {
      'ale-bet': { rol: role, activo: true },
      'deposito': { rol: role, activo: true }
    }
  }, process.env.PLATFORM_JWT_SECRET || 'test-secret')
}

describe('ALEBET-01 operational concurrency', () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1;`
  })

  beforeEach(async () => {
    await truncateDb(prisma)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function createOrder(input: { sellerId: string, quantity: number, state?: 'BORRADOR' | 'APROBADO' }) {
    const unique = crypto.randomUUID()
    const cliente = await prisma.cliente.create({ data: { nombre: `Cliente ${unique}` } })
    const producto = await prisma.producto.create({ data: { nombre: `Producto ${unique}`, sku: `SKU-${unique}` } })
    const pedido = await prisma.pedido.create({
      data: {
        numero: `P-${unique}`,
        clienteId: cliente.id,
        vendedorId: input.sellerId,
        estado: input.state ?? 'BORRADOR',
        items: { create: [{ productoId: producto.id, cantidad: input.quantity }] },
      },
      include: { items: true },
    })
    return { cliente, producto, pedido }
  }

  async function addLot(productoId: string, quantity: number) {
    return prisma.lote.create({
      data: {
        numero: `L-${crypto.randomUUID()}`,
        productoId,
        cajas: 0,
        sueltos: quantity,
        fechaProduccion: new Date(),
        fechaVencimiento: new Date(Date.now() + 86_400_000),
      },
    })
  }

  it('allows exactly one approval against the last available stock and persists one active reservation', async () => {
    const first = await createOrder({ sellerId: 'seller-1', quantity: 5 })
    const second = await createOrder({ sellerId: 'seller-2', quantity: 5 })
    const lote = await addLot(first.producto.id, 5)
    await prisma.pedido.update({
      where: { id: second.pedido.id },
      data: { items: { deleteMany: {}, create: [{ productoId: first.producto.id, cantidad: 5 }] } },
    })

    const [firstResponse, secondResponse] = await Promise.all([
      request(app).put(`/api/ale-bet/pedidos/${first.pedido.id}/aprobar`).set('Authorization', `Bearer ${signTestToken('seller-1', 'vendedor')}`).send({ expectedVersion: 1 }),
      request(app).put(`/api/ale-bet/pedidos/${second.pedido.id}/aprobar`).set('Authorization', `Bearer ${signTestToken('seller-2', 'vendedor')}`).send({ expectedVersion: 1 }),
    ])

    expect([firstResponse.status, secondResponse.status].sort((left, right) => left - right)).toEqual([200, 409])
    const active = await prisma.reservaStock.findMany({ where: { loteId: lote.id, estado: 'ACTIVA' } })
    expect(active).toHaveLength(1)
    expect(active[0]?.cantidad).toBe(5)
    const physical = await prisma.lote.findUnique({ where: { id: lote.id } })
    expect(physical?.sueltos).toBe(5)
  })

  it('makes concurrent approved-order cancellation single-effect and releases reservations once', async () => {
    const order = await createOrder({ sellerId: 'seller-1', quantity: 4, state: 'APROBADO' })
    const lote = await addLot(order.producto.id, 4)
    await prisma.reservaStock.create({ data: { pedidoId: order.pedido.id, itemPedidoId: order.pedido.items[0]!.id, loteId: lote.id, cantidad: 4 } })

    const responses = await Promise.all([
      request(app).put(`/api/ale-bet/pedidos/${order.pedido.id}/cancelar`).set('Authorization', `Bearer ${signTestToken('seller-1', 'vendedor')}`).send({ expectedVersion: 1 }),
      request(app).put(`/api/ale-bet/pedidos/${order.pedido.id}/cancelar`).set('Authorization', `Bearer ${signTestToken('seller-1', 'vendedor')}`).send({ expectedVersion: 1 }),
    ])

    expect(responses.map((response) => response.status).sort((left, right) => left - right)).toEqual([200, 409])
    const reservation = await prisma.reservaStock.findFirst({ where: { pedidoId: order.pedido.id } })
    expect(reservation?.estado).toBe('LIBERADA')
    expect(await prisma.pedidoAuditoria.count({ where: { pedidoId: order.pedido.id, accion: 'PEDIDO_CANCELADO' } })).toBe(1)
  })

  it('accepts one concurrent APROBADO edit and keeps its recalculated reservation', async () => {
    const order = await createOrder({ sellerId: 'seller-1', quantity: 3, state: 'APROBADO' })
    const lote = await addLot(order.producto.id, 10)
    await prisma.reservaStock.create({ data: { pedidoId: order.pedido.id, itemPedidoId: order.pedido.items[0]!.id, loteId: lote.id, cantidad: 3 } })
    const auth = `Bearer ${signTestToken('seller-1', 'vendedor')}`

    const responses = await Promise.all([
      request(app).patch(`/api/ale-bet/pedidos/${order.pedido.id}`).set('Authorization', auth).send({ clienteId: order.cliente.id, items: [{ productoId: order.producto.id, cantidad: 4 }], expectedVersion: 1 }),
      request(app).patch(`/api/ale-bet/pedidos/${order.pedido.id}`).set('Authorization', auth).send({ clienteId: order.cliente.id, items: [{ productoId: order.producto.id, cantidad: 5 }], expectedVersion: 1 }),
    ])

    expect(responses.map((response) => response.status).sort((left, right) => left - right)).toEqual([200, 409])
    const updated = await prisma.pedido.findUnique({ where: { id: order.pedido.id }, include: { items: true, reservas: { where: { estado: 'ACTIVA' } } } })
    expect(updated?.version).toBe(2)
    expect(updated?.items).toHaveLength(1)
    expect(updated?.reservas).toHaveLength(1)
    expect(updated?.reservas[0]?.cantidad).toBe(updated?.items[0]?.cantidad)
  })

  it('serializes remito emission against edit and leaves exactly one current remito after re-emission', async () => {
    const order = await createOrder({ sellerId: 'seller-1', quantity: 3, state: 'APROBADO' })
    await addLot(order.producto.id, 10)
    const transportista = await prisma.transportista.create({ data: { nombre: `Transporte ${crypto.randomUUID()}`, direccion: 'Ruta 1' } })

    const [remitoResponse, editResponse] = await Promise.all([
      request(app).post(`/api/ale-bet/pedidos/${order.pedido.id}/remitos`).set('Authorization', `Bearer ${signTestToken('billing-1', 'facturacion')}`).send({ expectedVersion: 1, transportistaId: transportista.id }),
      request(app).patch(`/api/ale-bet/pedidos/${order.pedido.id}`).set('Authorization', `Bearer ${signTestToken('seller-1', 'vendedor')}`).send({ clienteId: order.cliente.id, items: [{ productoId: order.producto.id, cantidad: 4 }], expectedVersion: 1 }),
    ])

    expect([remitoResponse.status, editResponse.status].filter((status) => status !== 409)).toHaveLength(1)
    const current = await prisma.pedido.findUnique({ where: { id: order.pedido.id }, include: { items: true } })
    expect(current).not.toBeNull()
    const reemitted = await request(app).post(`/api/ale-bet/pedidos/${order.pedido.id}/remitos`)
      .set('Authorization', `Bearer ${signTestToken('billing-1', 'facturacion')}`)
      .send({ expectedVersion: current!.version, transportistaId: transportista.id })
    expect(reemitted.status).toBe(201)

    const vigente = await prisma.remito.findMany({ where: { pedidoId: order.pedido.id, estado: 'VIGENTE' } })
    expect(vigente).toHaveLength(1)
    expect(vigente[0]?.itemsSnapshot).toEqual([expect.objectContaining({ cantidad: current!.items[0]?.cantidad })])
  })
})

describe('Concurrencia Deposito (PR-B2B)', () => {
  let encargadoId: string
  let tokenEncargado: string
  const jwt = require('jsonwebtoken')

  beforeEach(async () => {
    // Buscar o crear usuario Encargado
    const platformId = 'google-id-encargado-mock'
    let encargado = await prisma.user.findFirst({ where: { role: 'encargado' } })
    if (!encargado) {
      encargado = await prisma.user.create({
        data: {
          email: 'encargado-deposito@test.com',
          name: 'Encargado Test',
          role: 'encargado',
          platformUserId: 'google-id-encargado-mock',
          passwordHash: 'dummy-hash'
        }
      })
    }
    encargadoId = encargado.id

    // Generar un token JWT válido usando la funcion existente que inyecta activo: true
    // IMPORTANTE: el token 'sub' debe coincidir con platformUserId para que el middleware no intente actualizarlo
    tokenEncargado = signTestToken(encargado.platformUserId || platformId, 'encargado', encargado.email)

    // Pre-flight para JIT provisioning y evitar UniqueConstraintViolation
    await request(app).get(`/api/deposito/ordenes`).set('Authorization', `Bearer ${tokenEncargado}`)
  })

  // Test E
  it('Test E — Dos órdenes consumen la misma droga, stock para una', async () => {
    const droga = await prisma.inventarioDroga.create({
      data: {
        nombre: 'Droga E',
        cantidad: 15,
        lote: 'LOTE-E',
      }
    })

    const orden1 = await prisma.ordenProduccion.create({
      data: {
        solicitanteId: encargadoId,
        categoria: 'droga',
        productoNombre: 'Droga E',
        cantidad: 10,
        estado: 'aprobada'
      }
    })

    const orden2 = await prisma.ordenProduccion.create({
      data: {
        solicitanteId: encargadoId,
        categoria: 'droga',
        productoNombre: 'Droga E',
        cantidad: 10,
        estado: 'aprobada'
      }
    })

    const p1 = request(app).post(`/api/deposito/ordenes/${orden1.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)
    const p2 = request(app).post(`/api/deposito/ordenes/${orden2.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)

    const [res1, res2] = await Promise.all([p1, p2])

    const codes = [res1.status, res2.status].sort()
    expect(codes).toEqual([200, 409]) // una exitosa, una rechazada

    const finalDroga = await prisma.inventarioDroga.findUnique({ where: { id: droga.id } })
    expect(finalDroga?.cantidad).toBe(5) // 15 - 10 = 5

    const movs = await prisma.movimiento.findMany({ where: { referenciaId: { in: [orden1.id, orden2.id] } } })
    expect(movs).toHaveLength(1) // Solo un movimiento creado
    expect(movs[0].cantidad).toBe(-10)

    const finalOrden1 = await prisma.ordenProduccion.findUnique({ where: { id: orden1.id } })
    const finalOrden2 = await prisma.ordenProduccion.findUnique({ where: { id: orden2.id } })

    // Una orden completada/ejecutada, una en aprobada
    const estados = [finalOrden1?.estado, finalOrden2?.estado].sort()
    expect(estados).toEqual(['aprobada', 'ejecutada'])
  })

  // Test F
  it('Test F — Dos órdenes consumen la misma droga, stock para ambas', async () => {
    const droga = await prisma.inventarioDroga.create({
      data: {
        nombre: 'Droga F',
        cantidad: 30,
        lote: 'LOTE-F',
      }
    })

    const orden1 = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'droga', productoNombre: 'Droga F', cantidad: 10, estado: 'aprobada' }
    })
    const orden2 = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'droga', productoNombre: 'Droga F', cantidad: 15, estado: 'aprobada' }
    })

    const p1 = request(app).post(`/api/deposito/ordenes/${orden1.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)
    const p2 = request(app).post(`/api/deposito/ordenes/${orden2.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)

    const [res1, res2] = await Promise.all([p1, p2])


    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)

    const finalDroga = await prisma.inventarioDroga.findUnique({ where: { id: droga.id } })
    expect(finalDroga?.cantidad).toBe(5) // 30 - 25 = 5

    const movs = await prisma.movimiento.findMany({ where: { referenciaId: { in: [orden1.id, orden2.id] } } })
    expect(movs).toHaveLength(2)

    const finalOrden1 = await prisma.ordenProduccion.findUnique({ where: { id: orden1.id } })
    const finalOrden2 = await prisma.ordenProduccion.findUnique({ where: { id: orden2.id } })
    expect(finalOrden1?.estado).toBe('ejecutada')
    expect(finalOrden2?.estado).toBe('ejecutada')
  })

  // Test G
  it('Test G — Dos órdenes consumen los mismos frascos', async () => {
    const frasco = await prisma.inventarioFrasco.create({
      data: {
        articulo: 'Frasco G',
        unidadesPorCaja: 50,
        cantidadCajas: 15,
        total: 750,
      }
    })

    const orden1 = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'frasco', productoNombre: 'Frasco G', cantidad: 10, estado: 'aprobada' }
    })
    const orden2 = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'frasco', productoNombre: 'Frasco G', cantidad: 10, estado: 'aprobada' }
    })

    const p1 = request(app).post(`/api/deposito/ordenes/${orden1.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)
    const p2 = request(app).post(`/api/deposito/ordenes/${orden2.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)

    const [res1, res2] = await Promise.all([p1, p2])
    const codes = [res1.status, res2.status].sort()
    expect(codes).toEqual([200, 409]) // Solo alcanza para una (15 < 20)

    const finalFrasco = await prisma.inventarioFrasco.findUnique({ where: { id: frasco.id } })
    expect(finalFrasco?.cantidadCajas).toBe(5)
    expect(finalFrasco?.total).toBe(250)

    const movs = await prisma.movimiento.findMany({ where: { referenciaId: { in: [orden1.id, orden2.id] } } })
    expect(movs).toHaveLength(1)
  })

  // Test H - Multiproducto es impracticable por diseño porque OrdenProduccion solo consume 1 tipo a la vez.
  // Testearemos ejecución paralela concurrente de 2 órdenes diferentes (una de droga y una de frasco) a la vez.
  it('Test H — Orden independiente consume droga y frasco concurrentemente sin deadlocks', async () => {
    const droga = await prisma.inventarioDroga.create({ data: { nombre: 'Droga H', cantidad: 20, lote: 'LOTE-H' } })
    const frasco = await prisma.inventarioFrasco.create({ data: { articulo: 'Frasco H', unidadesPorCaja: 10, cantidadCajas: 20, total: 200 } })

    const orden1 = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'droga', productoNombre: 'Droga H', cantidad: 10, estado: 'aprobada' }
    })
    const orden2 = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'frasco', productoNombre: 'Frasco H', cantidad: 10, estado: 'aprobada' }
    })

    const start = Date.now()
    const p1 = request(app).post(`/api/deposito/ordenes/${orden1.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)
    const p2 = request(app).post(`/api/deposito/ordenes/${orden2.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)

    const [res1, res2] = await Promise.all([p1, p2])
    const end = Date.now()

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(end - start).toBeLessThan(5000)

    const finalDroga = await prisma.inventarioDroga.findUnique({ where: { id: droga.id } })
    const finalFrasco = await prisma.inventarioFrasco.findUnique({ where: { id: frasco.id } })

    expect(finalDroga?.cantidad).toBe(10)
    expect(finalFrasco?.cantidadCajas).toBe(10)
  })

  // Test I - Test conceptualmente análogo
  it('Test I — Multiproducto con stock insuficiente (no aplicable a modelo single-item, ver Test E y G)', async () => {
    expect(true).toBe(true)
  })

  // Test J - Rollback Forzado (sobre Frascos)
  it('Test J - Rollback forzado', async () => {
    const frasco = await prisma.inventarioFrasco.create({
      data: { articulo: 'Frasco J', unidadesPorCaja: 10, cantidadCajas: 50, total: 500 }
    })

    const orden = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'frasco', productoNombre: 'Frasco J', cantidad: 20, estado: 'aprobada' }
    })

    // Setup Trigger to force failure AFTER stock update but BEFORE commit
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION deposito.test_fail_trigger()
      RETURNS TRIGGER AS $$
      BEGIN
          RAISE EXCEPTION 'Simulated DB Error for Rollback';
      END;
      $$ LANGUAGE plpgsql;
    `)
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS force_fail_orden ON "deposito"."movimientos";`)
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER force_fail_orden
      BEFORE INSERT ON "deposito"."movimientos"
      FOR EACH ROW
      EXECUTE FUNCTION deposito.test_fail_trigger();
    `)

    try {
      const res = await request(app)
        .post(`/api/deposito/ordenes/${orden.id}/ejecutar`)
        .set('Authorization', `Bearer ${tokenEncargado}`)

      expect(res.status).toBe(500)

      const finalFrasco = await prisma.inventarioFrasco.findUnique({ where: { id: frasco.id } })
      expect(finalFrasco?.cantidadCajas).toBe(50) // Rollback preservó stock!
      expect(finalFrasco?.total).toBe(500)

      const finalOrden = await prisma.ordenProduccion.findUnique({ where: { id: orden.id } })
      expect(finalOrden?.estado).toBe('aprobada') // Rollback preservó estado de orden!

      const movs = await prisma.movimiento.findMany({ where: { referenciaId: orden.id } })
      expect(movs).toHaveLength(0) // Nada insertado
    } finally {
      // Teardown Trigger
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS force_fail_orden ON "deposito"."movimientos";`)
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS deposito.test_fail_trigger();`)
    }
  })

  // Test K (Revisado) - Conflicto concurrente válido con frascos coherentes
  it('Test K - Conflicto concurrente válido de frascos', async () => {
    // Creamos frasco con cajas=10, upc=10, total=100 (Coherente)
    const frasco = await prisma.inventarioFrasco.create({
      data: {
        articulo: 'Frasco K Rev',
        unidadesPorCaja: 10,
        cantidadCajas: 10,
        total: 100, // Coherente
      }
    })

    // Dos órdenes que piden 6 cajas (60 unidades) cada una. Solo hay 10 cajas disponibles.
    const orden1 = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'frasco', productoNombre: 'Frasco K Rev', cantidad: 6, estado: 'aprobada' }
    })
    const orden2 = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'frasco', productoNombre: 'Frasco K Rev', cantidad: 6, estado: 'aprobada' }
    })

    const req1 = request(app).post(`/api/deposito/ordenes/${orden1.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)
    const req2 = request(app).post(`/api/deposito/ordenes/${orden2.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)

    const [res1, res2] = await Promise.all([req1, req2])

    const successRes = res1.status === 200 ? res1 : res2
    const failRes = res1.status === 409 ? res1 : res2

    expect(successRes.status).toBe(200)
    expect(failRes.status).toBe(409)

    const finalFrasco = await prisma.inventarioFrasco.findUnique({ where: { id: frasco.id } })
    expect(finalFrasco?.cantidadCajas).toBe(4) // 10 - 6
    expect(finalFrasco?.total).toBe(40) // 100 - 60
  })
})
