import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestApp } from '../helpers/create-test-app'
import { type Express } from 'express'
import { platformDb as prisma } from '@platform/db'
import jwt from 'jsonwebtoken'
import { truncateDb } from '../utils/db-cleaner'

describe('409 Aprobar y enviar reproduction', () => {
  let adminToken: string
  let clienteId: string
  let productoId: string
  let app: Express

  beforeEach(async () => {
    app = createTestApp()
    adminToken = jwt.sign(
      { sub: 'admin-1', apps: { 'ale-bet': { rol: 'admin' } } },
      process.env.JWT_SECRET || 'test-secret',
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
        stockMinimo: 10
      }
    })
    productoId = producto.id

    await prisma.lote.create({
      data: {
        productoId,
        cajas: 100,
        sueltos: 0
      }
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
          { productoId, cajas: 1, sueltos: 0 }
        ]
      })

    expect(createRes.status).toBe(201)
    const pedidoCreado = createRes.body

    // 2. Aprobar pedido (like in NuevoPedidoPage.tsx aprobarPedido.mutateAsync)
    const aprobarRes = await request(app)
      .put(`/api/ale-bet/pedidos/${pedidoCreado.id}/aprobar`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', 'idemp-456')
      .send({
        expectedVersion: pedidoCreado.version
      })

    if (aprobarRes.status === 409) {
      console.log('409 Error:', aprobarRes.body.error)
      console.log('creado.version:', pedidoCreado.version)
    }

    expect(aprobarRes.status).toBe(200)
  })
})
