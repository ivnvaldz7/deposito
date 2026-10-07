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

describe('Crear Cliente Facturacion', () => {
  it('creates full client', async () => {
    const server = await app()

    const user = await prisma.usuario.findFirst({ where: { rol: 'facturacion' } })
    const tokenStr = token('facturacion')

    const payload = {
      nombre: 'Cliente de prueba',
      contacto: 'Juan',
      referencia: 'Ref',
      direccion: 'Calle Falsa 123',
      localidad: 'Capital',
      provincia: 'Buenos Aires',
      cuit: '20123456789',
      condicionIva: 'Responsable Inscripto',
      condicionVenta: 'Contado'
    }

    const res = await request(server).post('/api/ale-bet/clientes')
      .set('Authorization', `Bearer ${tokenStr}`)
      .send(payload)
      
    console.log(res.status, res.body)
  })
})
