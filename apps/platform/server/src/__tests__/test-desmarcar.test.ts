import type { Express } from 'express'
async function app(): Promise<Express> {
  const express = await import('express')
  const { createAleBetRoutes } = await import('../routes/ale-bet')
  const { verifyToken } = await import('../middlewares/verify-token')
  const server = express.default()
  server.use(express.json())
  server.use('/api/ale-bet', verifyToken, createAleBetRoutes())
  return server
}
import request from 'supertest'
import { prisma } from '@platform/db'
import jwt from 'jsonwebtoken'
import { describe, it, expect } from 'vitest'

const JWT_SECRET = 'test-secret-for-jwt-min-32-chars!!'
function token(role: 'admin' | 'vendedor' | 'armador' | 'facturacion', subject = `${role}-1`): string {
  return jwt.sign({ sub: subject, apps: { 'ale-bet': { rol: role, activo: true } } }, JWT_SECRET, { expiresIn: '15m' })
}

describe('Desmarcar', () => {
  it('toggles completado successfully', async () => {
    const server = await app()

    const user = await prisma.usuario.findFirst({ where: { rol: 'armador' } })
    const auth = `Bearer ${token('armador')}`

    let pedido = await prisma.pedido.findFirst({
      where: { estado: 'EN_ARMADO' },
      include: { items: true }
    })
    
    if (!pedido) {
      console.log("No pedido in EN_ARMADO found.")
      return
    }
    const item = pedido.items[0]
    let version = pedido.version
    
    const res1 = await request(server).put(`/api/ale-bet/pedidos/${pedido.id}/items/${item.id}/completar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ expectedVersion: version })
      
    expect(res1.status).toBe(200)
    expect(res1.body.version).toBe(version + 1)
    
    version = res1.body.version
    const res2 = await request(server).put(`/api/ale-bet/pedidos/${pedido.id}/items/${item.id}/completar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ expectedVersion: version })
      
    console.log(res2.body)
    expect(res2.status).toBe(200)
  })
})
