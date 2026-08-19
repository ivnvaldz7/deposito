import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { type Express } from 'express'
import express from 'express'
import { platformDb as prisma } from '@platform/db'
import jwt from 'jsonwebtoken'
import { truncateDb } from '../utils/db-cleaner'
import { createAleBetRoutes } from '../../routes/ale-bet/index'
import { verifyToken } from '../../middlewares/verify-token'
import type { JwtPayload } from '@platform/core'

declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtPayload
  }
}

describe('Ale-Bet pedidos disponibilidad y aprobación', () => {
  let adminToken: string
  let clienteId: string
  let app: Express

  beforeEach(async () => {
    process.env.PLATFORM_JWT_SECRET = process.env.PLATFORM_JWT_SECRET || 'test-secret'
    app = express()
    app.use(express.json())
    app.use('/api/ale-bet', verifyToken, createAleBetRoutes())
    adminToken = jwt.sign(
      { sub: 'admin-1', email: 'admin@test.com', apps: { 'ale-bet': { rol: 'admin', activo: true } } },
      process.env.PLATFORM_JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    )
    await truncateDb(prisma as any)

    const cliente = await prisma.cliente.create({
      data: { nombre: 'Cliente Test', cuit: '20123456789', estado: 'VALIDADO' }
    })
    clienteId = cliente.id

    await prisma.ubicacionStock.upsert({
      where: { codigo: 'DEPOSITO' },
      update: {},
      create: { codigo: 'DEPOSITO', nombre: 'Depósito' },
    })
    await prisma.ubicacionStock.upsert({
      where: { codigo: 'ACONDICIONADO' },
      update: {},
      create: { codigo: 'ACONDICIONADO', nombre: 'Acondicionado' },
    })
  })

  async function createProductoLoteStock(data: {
    nombre: string
    sku: string
    unidadesPorCaja: number
    lotes: Array<{ numero: string; vencimiento: Date; deposito: number; acondicionado: number }>
  }) {
    const producto = await prisma.producto.create({
      data: {
        nombre: data.nombre,
        sku: data.sku,
        stockMinimo: 10,
        unidadesPorCaja: data.unidadesPorCaja,
      }
    })

    const deposito = await prisma.ubicacionStock.findUniqueOrThrow({ where: { codigo: 'DEPOSITO' } })
    const acondicionado = await prisma.ubicacionStock.findUniqueOrThrow({ where: { codigo: 'ACONDICIONADO' } })

    for (const l of data.lotes) {
      const lote = await prisma.lote.create({
        data: {
          productoId: producto.id,
          numero: l.numero,
          fechaVencimiento: l.vencimiento,
          cajas: Math.floor((l.deposito + l.acondicionado) / data.unidadesPorCaja),
          sueltos: (l.deposito + l.acondicionado) % data.unidadesPorCaja,
        }
      })
      if (l.deposito > 0) {
        await prisma.saldoStock.create({
          data: { productoId: producto.id, loteId: lote.id, ubicacionId: deposito.id, cantidad: l.deposito },
        })
      }
      if (l.acondicionado > 0) {
        await prisma.saldoStock.create({
          data: { productoId: producto.id, loteId: lote.id, ubicacionId: acondicionado.id, cantidad: l.acondicionado },
        })
      }
    }

    return producto.id
  }

  async function crearPedido(productoId: string, cantidad: number, idempotencyKey = 'idemp-create') {
    const res = await request(app)
      .post('/api/ale-bet/pedidos')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ clienteId, items: [{ productoId, cantidad }] })
    expect(res.status).toBe(201)
    return res.body
  }

  async function disponibilidad(pedidoId: string) {
    const res = await request(app)
      .get(`/api/ale-bet/pedidos/${pedidoId}/disponibilidad-stock`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    return res.body
  }

  async function aprobar(pedidoId: string, body: object, idempotencyKey = 'idemp-approve') {
    return request(app)
      .put(`/api/ale-bet/pedidos/${pedidoId}/aprobar`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
  }

  it('A. listado y búsqueda reportan el mismo disponible basado en SaldoStock', async () => {
    const productoId = await createProductoLoteStock({
      nombre: 'AMANTINA 500 ML',
      sku: 'AMANTINA-500',
      unidadesPorCaja: 10,
      lotes: [
        { numero: 'L-001', vencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), deposito: 40, acondicionado: 40 },
      ],
    })

    const listRes = await request(app).get('/api/ale-bet/productos').set('Authorization', `Bearer ${adminToken}`)
    expect(listRes.status).toBe(200)
    const fromList = listRes.body.find((p: { id: string }) => p.id === productoId)
    expect(fromList?.disponible).toBe(80)

    const searchRes = await request(app)
      .get('/api/ale-bet/productos/search')
      .query({ q: 'AMANTINA' })
      .set('Authorization', `Bearer ${adminToken}`)
    expect(searchRes.status).toBe(200)
    const fromSearch = searchRes.body.find((p: { id: string }) => p.id === productoId)
    expect(fromSearch?.disponible).toBe(80)
    expect(fromSearch?.disponible).toBe(fromList?.disponible)
  })

  it('B. pedido ≤ stockDeposito: DISPONIBLE y aprueba sin transferencias', async () => {
    const productoId = await createProductoLoteStock({
      nombre: 'Producto Depósito',
      sku: 'DEP-001',
      unidadesPorCaja: 1,
      lotes: [{ numero: 'L-001', vencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), deposito: 100, acondicionado: 0 }],
    })

    const pedido = await crearPedido(productoId, 30)
    const disp = await disponibilidad(pedido.id)
    expect(disp.status).toBe('DISPONIBLE')
    expect(disp.stockDeposito).toBe(100)
    expect(disp.stockAcondicionado).toBe(0)
    expect(disp.transferencias).toHaveLength(0)

    const aprobado = await aprobar(pedido.id, {
      expectedVersion: pedido.version,
      fingerprint: disp.fingerprint,
      transferencias: disp.transferencias,
    })
    expect(aprobado.status).toBe(200)
    expect(aprobado.body.estado).toBe('APROBADO')
  })

  it('C. pedido ≤ total pero > deposito: DISPONIBLE_CON_TRANSFERENCIA y aprueba con transferencias', async () => {
    const productoId = await createProductoLoteStock({
      nombre: 'AMANTINA 500 ML',
      sku: 'AMANTINA-500',
      unidadesPorCaja: 10,
      lotes: [
        { numero: 'L-001', vencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), deposito: 40, acondicionado: 40 },
      ],
    })

    const pedido = await crearPedido(productoId, 60)
    const disp = await disponibilidad(pedido.id)
    expect(disp.status).toBe('DISPONIBLE_CON_TRANSFERENCIA')
    expect(disp.stockDeposito).toBe(40)
    expect(disp.stockAcondicionado).toBe(40)
    expect(disp.transferencias).toHaveLength(1)
    expect(disp.transferencias[0]).toMatchObject({
      productoId,
      origen: 'ACONDICIONADO',
      destino: 'DEPOSITO',
      cantidad: 20,
    })

    const aprobado = await aprobar(pedido.id, {
      expectedVersion: pedido.version,
      fingerprint: disp.fingerprint,
      transferencias: disp.transferencias,
    })
    expect(aprobado.status).toBe(200)
    expect(aprobado.body.estado).toBe('APROBADO')

    const saldos = await prisma.saldoStock.findMany({
      where: { productoId },
      include: { ubicacion: { select: { codigo: true } } },
    })
    const total = saldos.reduce((sum, s) => sum + s.cantidad, 0)
    expect(total).toBe(80)
    const dep = saldos.find((s) => s.ubicacion.codigo === 'DEPOSITO')
    expect(dep?.cantidad).toBe(60)
    const aco = saldos.find((s) => s.ubicacion.codigo === 'ACONDICIONADO')
    expect(aco?.cantidad).toBe(20)
  })

  it('D. pedido > stockTotal: INSUFICIENTE y no permite aprobar', async () => {
    const productoId = await createProductoLoteStock({
      nombre: 'Producto Insuficiente',
      sku: 'INS-001',
      unidadesPorCaja: 1,
      lotes: [{ numero: 'L-001', vencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), deposito: 20, acondicionado: 10 }],
    })

    const pedido = await crearPedido(productoId, 40)
    const disp = await disponibilidad(pedido.id)
    expect(disp.status).toBe('INSUFICIENTE')
    expect(disp.shortfall).toBe(10)

    const fallo = await aprobar(pedido.id, {
      expectedVersion: pedido.version,
      fingerprint: disp.fingerprint,
      transferencias: disp.transferencias,
    })
    expect(fallo.status).toBe(409)
  })

  it('E. asignación multilote FEFO cuando un solo lote no alcanza', async () => {
    const productoId = await createProductoLoteStock({
      nombre: 'Multilote FEFO',
      sku: 'FEFO-001',
      unidadesPorCaja: 1,
      lotes: [
        { numero: 'L-ANTERIOR', vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), deposito: 25, acondicionado: 0 },
        { numero: 'L-POSTERIOR', vencimiento: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), deposito: 50, acondicionado: 0 },
      ],
    })

    const pedido = await crearPedido(productoId, 60)
    const disp = await disponibilidad(pedido.id)
    expect(disp.status).toBe('DISPONIBLE')
    expect(disp.allocations).toHaveLength(2)
    const primera = disp.allocations.find((a: { cantidad: number }) => a.cantidad === 25)
    const segunda = disp.allocations.find((a: { cantidad: number }) => a.cantidad === 35)
    expect(primera).toBeDefined()
    expect(segunda).toBeDefined()

    const aprobado = await aprobar(pedido.id, {
      expectedVersion: pedido.version,
      fingerprint: disp.fingerprint,
      transferencias: disp.transferencias,
    })
    expect(aprobado.status).toBe(200)
  })

  it('F. aprobar con transferencia invalida el fingerprint y rechaza la segunda aprobación', async () => {
    const productoId = await createProductoLoteStock({
      nombre: 'Fingerprint',
      sku: 'FP-001',
      unidadesPorCaja: 1,
      lotes: [{ numero: 'L-001', vencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), deposito: 40, acondicionado: 40 }],
    })

    const pedido = await crearPedido(productoId, 60)
    const disp = await disponibilidad(pedido.id)
    expect(disp.status).toBe('DISPONIBLE_CON_TRANSFERENCIA')

    const primero = await aprobar(pedido.id, {
      expectedVersion: pedido.version,
      fingerprint: disp.fingerprint,
      transferencias: disp.transferencias,
    }, 'idemp-fp-1')
    expect(primero.status).toBe(200)

    const segundo = await aprobar(pedido.id, {
      expectedVersion: pedido.version,
      fingerprint: disp.fingerprint,
      transferencias: disp.transferencias,
    }, 'idemp-fp-2')
    expect(segundo.status).toBe(409)
  })

  it('G. aprobación idempotente: mismo Idempotency-Key retorna 200 sin duplicar reservas', async () => {
    const productoId = await createProductoLoteStock({
      nombre: 'Idempotencia',
      sku: 'IDEMP-001',
      unidadesPorCaja: 1,
      lotes: [{ numero: 'L-001', vencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), deposito: 100, acondicionado: 0 }],
    })

    const pedido = await crearPedido(productoId, 30)
    const disp = await disponibilidad(pedido.id)

    const primero = await aprobar(pedido.id, {
      expectedVersion: pedido.version,
      fingerprint: disp.fingerprint,
      transferencias: disp.transferencias,
    }, 'idemp-igual')
    expect(primero.status).toBe(200)

    const segundo = await aprobar(pedido.id, {
      expectedVersion: pedido.version,
      fingerprint: disp.fingerprint,
      transferencias: disp.transferencias,
    }, 'idemp-igual')
    expect(segundo.status).toBe(200)

    const reservas = await prisma.reservaStock.findMany({ where: { pedidoId: pedido.id } })
    const reservada = reservas.reduce((sum, r) => sum + r.cantidad, 0)
    expect(reservada).toBe(30)
  })
})
