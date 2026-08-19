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

describe('409 Aprobar y enviar reproduction', () => {
  let adminToken: string
  let clienteId: string
  let productoId: string
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
      data: {
        nombre: 'Cliente Test',
        cuit: '20123456789',
        estado: 'VALIDADO'
      }
    })
    clienteId = cliente.id

    const producto = await prisma.producto.create({
      data: {
        nombre: 'Producto Test',
        sku: 'TEST-1',
        stockMinimo: 10,
        unidadesPorCaja: 1,
      }
    })
    productoId = producto.id

    const lote = await prisma.lote.create({
      data: {
        productoId,
        numero: 'TEST-0001',
        cajas: 100,
        sueltos: 0
      }
    })
    const deposito = await prisma.ubicacionStock.upsert({
      where: { codigo: 'DEPOSITO' },
      update: {},
      create: { codigo: 'DEPOSITO', nombre: 'Depósito' },
    })
    await prisma.saldoStock.create({
      data: {
        productoId,
        loteId: lote.id,
        ubicacionId: deposito.id,
        cantidad: 100,
      },
    })
  })

  it('deberia reproducir el 409 al crear y luego aprobar', async () => {
    // 1. Create pedido (like in NuevoPedidoPage.tsx createPedido.mutateAsync)
    const createRes = await request(app)
      .post('/api/ale-bet/pedidos')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', 'idemp-123')
      .send({
        clienteId,
        items: [
          { productoId, cantidad: 1 }
        ]
      })

    expect(createRes.status).toBe(201)
    const pedidoCreado = createRes.body

    // 2. Consultar disponibilidad vigente
    const disponibilidadRes = await request(app)
      .get(`/api/ale-bet/pedidos/${pedidoCreado.id}/disponibilidad-stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)

    // 3. Aprobar pedido enviando fingerprint + transferencias sugeridas
    const aprobarRes = await request(app)
      .put(`/api/ale-bet/pedidos/${pedidoCreado.id}/aprobar`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', 'idemp-456')
      .send({
        expectedVersion: pedidoCreado.version,
        fingerprint: disponibilidadRes.body.fingerprint,
        transferencias: disponibilidadRes.body.transferencias,
      })

    if (aprobarRes.status === 409) {
      console.log('409 Error:', aprobarRes.body.error)
      console.log('creado.version:', pedidoCreado.version)
    }

    expect(aprobarRes.status).toBe(200)
  })
})
