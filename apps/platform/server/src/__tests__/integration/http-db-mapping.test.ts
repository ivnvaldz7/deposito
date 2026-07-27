import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createDepositoRoutes } from '../../deposito/routes/index'
import { platformDb as prisma, Role } from '@platform/db'
import { truncateDb } from '../utils/db-cleaner'
import jwt from 'jsonwebtoken'
import type { JwtPayload } from '@platform/core'

const app = express()
app.use(express.json())

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

app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (token) {
    try {
      const decoded: unknown = jwt.verify(token, process.env.PLATFORM_JWT_SECRET || 'test-secret')
      if (typeof decoded === 'object' && decoded !== null && 'sub' in decoded) {
        const payload = decoded as JwtPayload
        req.user = payload
        req.depositoUser = {
          id: payload.sub,
          email: payload.email || '',
          name: payload.name || '',
          role: payload.apps?.deposito?.rol || 'encargado'
        }
      }
    } catch (e) {
    }
  }
  next()
})

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

function createMockConstraintError(constraintName: string, code: string = '23514') {
  const error = new Error(`Simulated Constraint Error: ${constraintName}`)
  return Object.assign(error, {
    meta: {
      driverAdapterError: {
        cause: {
          code,
          message: `Simulated error for ${constraintName}`,
          constraint: constraintName,
        }
      }
    },
    code: 'P2010'
  })
}

describe('HTTP to DB Errors Mapping (PR-C1)', () => {
  let authToken: string
  let testOrderId: string

  beforeAll(async () => {
    await truncateDb(prisma)

    const admin = await prisma.user.create({
      data: {
        email: 'admin_http_mapping@example.com',
        name: 'Admin',
        passwordHash: 'hash',
        role: Role.ADMIN,
      }
    })
    
    authToken = signTestToken(admin.id, 'encargado', admin.email)

    const droga = await prisma.inventarioDroga.create({
      data: { nombre: 'Droga HTTP Test', cantidad: 100 }
    })
    
    const orden = await prisma.ordenProduccion.create({
      data: {
        solicitanteId: admin.id,
        productoNombre: 'Droga HTTP Test',
        categoria: 'droga',
        cantidad: 10,
        estado: 'aprobada',
        urgencia: 'normal',
      }
    })
    testOrderId = orden.id
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    await truncateDb(prisma)
  })

  it('Constraint conocida de stock (chk_inv_drogas_cantidad_no_negativa) -> 409', async () => {
    const spy = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(
      createMockConstraintError('chk_inv_drogas_cantidad_no_negativa')
    )

    const res = await request(app)
      .post(`/api/deposito/ordenes/${testOrderId}/ejecutar`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', 'key-stock-conocida')
    
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('INVENTORY_CONSTRAINT_VIOLATION')
    expect(res.body.message).toContain('inconsistencia de stock')
    
    spy.mockRestore()
  })

  it('UPC inválida (chk_inv_frascos_upc_positiva) -> 500', async () => {
    const spy = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(
      createMockConstraintError('chk_inv_frascos_upc_positiva')
    )

    const res = await request(app)
      .post(`/api/deposito/ordenes/${testOrderId}/ejecutar`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', 'key-upc')
    
    expect(res.status).toBe(500)
    expect(res.body.message).toBe('Error interno del servidor')

    spy.mockRestore()
  })

  it('Total incoherente (chk_inv_frascos_total_coherente) -> 500', async () => {
    const spy = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(
      createMockConstraintError('chk_inv_frascos_total_coherente')
    )

    const res = await request(app)
      .post(`/api/deposito/ordenes/${testOrderId}/ejecutar`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', 'key-total')
    
    expect(res.status).toBe(500)
    expect(res.body.message).toBe('Error interno del servidor')

    spy.mockRestore()
  })

  it('Movimiento cero (chk_movimientos_cantidad_no_cero) -> 500', async () => {
    const spy = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(
      createMockConstraintError('chk_movimientos_cantidad_no_cero')
    )

    const res = await request(app)
      .post(`/api/deposito/ordenes/${testOrderId}/ejecutar`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', 'key-mov-cero')
    
    expect(res.status).toBe(500)
    expect(res.body.message).toBe('Error interno del servidor')

    spy.mockRestore()
  })

  it('Constraint desconocida (chk_temporal_desconocida) -> 500', async () => {
    const spy = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(
      createMockConstraintError('chk_temporal_desconocida')
    )

    const res = await request(app)
      .post(`/api/deposito/ordenes/${testOrderId}/ejecutar`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', 'key-temporal')
    
    expect(res.status).toBe(500)
    expect(res.body.message).toBe('Error interno del servidor')

    spy.mockRestore()
  })
})
