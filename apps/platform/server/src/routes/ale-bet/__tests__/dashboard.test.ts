import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Express, NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

// ──────────────────────────────────────────────────
// Hoisted mocks
// ──────────────────────────────────────────────────
const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    producto: {
      findMany: vi.fn(),
    },
    pedido: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    platformUser: {
      findMany: vi.fn(),
    },
  },
}))

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────
const JWT_SECRET = 'test-secret-for-jwt-min-32-chars!!'

function signToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      sub: 'admin-1',
      email: 'admin@test.com',
      name: 'Admin',
      apps: { ale_bet: { rol: 'admin', activo: true } },
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '15m' },
  )
}

function signSinAccesoToken(): string {
  return signToken({
    sub: 'no-access',
    apps: { deposito: { rol: 'encargado', activo: true } },
  })
}

// ──────────────────────────────────────────────────
// Module-level mocking
// ──────────────────────────────────────────────────
vi.mock('@platform/core', () => {
  const _jwt = require('jsonwebtoken')

  function _getSecret(): string {
    return process.env.PLATFORM_JWT_SECRET || JWT_SECRET
  }

  return {
    signAccessToken: (payload: Record<string, unknown>) => {
      return _jwt.sign(payload, _getSecret(), { expiresIn: '15m' })
    },
    verifyAccessToken: (token: string) => {
      try {
        return _jwt.verify(token, _getSecret())
      } catch {
        return null
      }
    },
    decodeToken: (token: string) => {
      return _jwt.decode(token)
    },
    eventBus: { on: vi.fn(), emit: vi.fn() },
  }
})

vi.mock('@platform/db', () => ({
  platformDb: mockDb,
}))

// ──────────────────────────────────────────────────
// Async error wrapper (Express 4 does not forward
// async rejections to the error handler)
// ──────────────────────────────────────────────────
function wrapAsyncErrors(router: any): void {
  for (const layer of router.stack) {
    if (layer.route) {
      for (const routeLayer of layer.route.stack) {
        const handle = routeLayer.handle
        routeLayer.handle = (req: Request, res: Response, next: NextFunction) => {
          try {
            const result = handle(req, res, next)
            if (result?.catch) {
              result.catch(next)
            }
          } catch (err) {
            next(err)
          }
        }
      }
    } else if (layer.handle?.stack) {
      wrapAsyncErrors(layer.handle)
    }
  }
}

// ──────────────────────────────────────────────────
// Test app factory
// ──────────────────────────────────────────────────
async function createTestApp(): Promise<Express> {
  const express = await import('express')
  const { createAleBetRoutes } = await import('../index')
  const { verifyToken } = await import('../../../middlewares/verify-token')
  const app = express.default()
  app.use(express.json())

  const routes = createAleBetRoutes()
  wrapAsyncErrors(routes)
  app.use('/api/ale-bet', verifyToken, routes)

  // Error handler so async DB errors return 500
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: err.message || 'Error interno del servidor' })
  })

  return app
}

// ──────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────
describe('Ale-Bet Dashboard', () => {
  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = JWT_SECRET
  })

  describe('GET /api/ale-bet/dashboard', () => {
    it('returns aggregated data with stockCritico, counts, and recent pedidos', async () => {
      mockDb.producto.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          nombre: 'Producto A',
          stockMinimo: 10,
          lotes: [{ cajas: 2, sueltos: 5 }], // stock = 35, not critical
        },
        {
          id: 'prod-2',
          nombre: 'Producto B',
          stockMinimo: 100,
          lotes: [{ cajas: 1, sueltos: 0 }], // stock = 15, critical!
        },
      ])
      // pedido.count: first call = pedidosHoy, second call = enArmado
      mockDb.pedido.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2)
      mockDb.pedido.findMany.mockResolvedValue([
        {
          id: 'ped-1',
          numero: 'P-001',
          estado: 'PENDIENTE',
          cliente: { id: 'cliente-1', nombre: 'Cliente A' },
          vendedorId: 'vend-1',
          armadorId: null,
          items: [{ id: 'item-1' }, { id: 'item-2' }],
          createdAt: new Date(),
        },
      ])
      mockDb.platformUser.findMany.mockResolvedValue([
        { id: 'vend-1', nombre: 'Vendedor A' },
      ])

      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/dashboard')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body.stockCritico).toBe(1) // Only prod-2 is critical
      expect(res.body.pedidosHoy).toBe(3)
      expect(res.body.enArmado).toBe(2)
      expect(res.body.totalProductos).toBe(2)
      expect(res.body.pedidosRecientes).toHaveLength(1)
      expect(res.body.pedidosRecientes[0].vendedorNombre).toBe('Vendedor A')
      expect(res.body.pedidosRecientes[0].armadorNombre).toBeNull()
      expect(res.body.pedidosRecientes[0].cantidadItems).toBe(2)
    })

    it('returns zeros and empty arrays when no data exists', async () => {
      mockDb.producto.findMany.mockResolvedValue([])
      mockDb.pedido.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0)
      mockDb.pedido.findMany.mockResolvedValue([])
      mockDb.platformUser.findMany.mockResolvedValue([])

      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/dashboard')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body.stockCritico).toBe(0)
      expect(res.body.pedidosHoy).toBe(0)
      expect(res.body.enArmado).toBe(0)
      expect(res.body.totalProductos).toBe(0)
      expect(res.body.pedidosRecientes).toEqual([])
    })

    it('returns 401 without token', async () => {
      const app = await createTestApp()
      await request(app).get('/api/ale-bet/dashboard').expect(401)
    })

    it('returns 403 without ale_bet access', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/dashboard')
        .set('Authorization', `Bearer ${signSinAccesoToken()}`)
        .expect(403)

      expect(res.body.error).toBe('No tiene acceso a esta aplicación')
    })

    it('returns 500 on DB error', async () => {
      mockDb.producto.findMany.mockRejectedValue(new Error('DB error'))
      const app = await createTestApp()

      const res = await request(app)
        .get('/api/ale-bet/dashboard')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(500)

      expect(res.body.error).toBe('DB error')
    })
  })
})
