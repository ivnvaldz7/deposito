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
      apps: { 'ale-bet': { rol: 'admin', activo: true } },
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
  const { hasPermission } = require('@platform/core/permissions')

  function _getSecret(): string {
    return process.env.PLATFORM_JWT_SECRET || JWT_SECRET
  }

  return {
    signAccessToken: (payload: Record<string, unknown>) => {
      return _jwt.sign(payload, _getSecret(), { expiresIn: '15m' })
    },

    APP_SLUG_BY_ID: { deposito: 'deposito', ale_bet: 'ale-bet', portal: 'portal', admin: 'admin' },
    getAppAccess: (user, slug) => user && user.apps ? user.apps[slug] : undefined,
    hasPermission,
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
          unidadesPorCaja: 15,
          lotes: [{ saldos: [{ cantidad: 35, ubicacion: { codigo: 'DEPOSITO' } }], reservas: [] }], // stock = 35, not critical
        },
        {
          id: 'prod-2',
          nombre: 'Producto B',
          stockMinimo: 100,
          unidadesPorCaja: 15,
          lotes: [{ saldos: [{ cantidad: 15, ubicacion: { codigo: 'DEPOSITO' } }], reservas: [] }], // stock = 15, critical!
        },
      ])
      mockDb.pedido.count.mockResolvedValueOnce(3) // pending Automation documents
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
      expect(res.body.pendientesRemito).toBe(3)
      expect(res.body.enArmado).toBe(0)
      expect(res.body.totalProductos).toBe(2)
      expect(res.body.pedidosRecientes).toHaveLength(1)
      expect(res.body.pedidosRecientes[0].vendedorNombre).toBe('Vendedor A')
      expect(res.body.pedidosRecientes[0].armadorNombre).toBeNull()
      expect(res.body.pedidosRecientes[0].cantidadItems).toBe(2)
    })

    it('uses total physical stock and treats equality as critical', async () => {
      mockDb.producto.findMany.mockResolvedValue([
        { id: 'p-80', stockMinimo: 100, lotes: [{ saldos: [{ cantidad: 80, ubicacion: { codigo: 'DEPOSITO' } }], reservas: [] }] },
        { id: 'p-100', stockMinimo: 100, lotes: [{ saldos: [{ cantidad: 100, ubicacion: { codigo: 'ACONDICIONADO' } }], reservas: [] }] },
        { id: 'p-101', stockMinimo: 100, lotes: [{ saldos: [{ cantidad: 101, ubicacion: { codigo: 'DEPOSITO' } }], reservas: [] }] },
      ])
      mockDb.pedido.count.mockResolvedValue(0)
      mockDb.pedido.findMany.mockResolvedValue([])
      mockDb.platformUser.findMany.mockResolvedValue([])

      const app = await createTestApp()
      const res = await request(app).get('/api/ale-bet/dashboard').set('Authorization', `Bearer ${signToken()}`).expect(200)

      expect(res.body.stockCritico).toBe(2)
    })

    it('counts critical stock from total physical quantity, ignores null minimums, and never checks a location alone', async () => {
      mockDb.producto.findMany.mockResolvedValue([
        // 259 total (259 + 0), minimum 60 -> normal.
        { id: 'p-amino', stockMinimo: 60, lotes: [{ saldos: [
          { cantidad: 259, ubicacion: { codigo: 'DEPOSITO' } },
          { cantidad: 0, ubicacion: { codigo: 'ACONDICIONADO' } },
        ], reservas: [] }] },
        // 70 total (50 + 20), minimum 100 -> critical.
        { id: 'p-low', stockMinimo: 100, lotes: [{ saldos: [
          { cantidad: 50, ubicacion: { codigo: 'DEPOSITO' } },
          { cantidad: 20, ubicacion: { codigo: 'ACONDICIONADO' } },
        ], reservas: [] }] },
        // Null means not configured, even with zero physical stock.
        { id: 'p-unconfigured', stockMinimo: null, lotes: [{ saldos: [], reservas: [] }] },
        // A zero deposit does not make the product critical when the total is 200.
        { id: 'p-acondicionado', stockMinimo: 60, lotes: [{ saldos: [
          { cantidad: 0, ubicacion: { codigo: 'DEPOSITO' } },
          { cantidad: 200, ubicacion: { codigo: 'ACONDICIONADO' } },
        ], reservas: [] }] },
      ])
      mockDb.pedido.count.mockResolvedValue(0)
      mockDb.pedido.findMany.mockResolvedValue([])
      mockDb.platformUser.findMany.mockResolvedValue([])

      const app = await createTestApp()
      const res = await request(app).get('/api/ale-bet/dashboard').set('Authorization', `Bearer ${signToken()}`).expect(200)

      expect(res.body.stockCritico).toBe(1)
      expect(res.body.totalProductos).toBe(4)
    })

    it('returns 39 critical products out of 43 when four products are above their minimum', async () => {
      const criticalProducts = Array.from({ length: 39 }, (_, index) => ({
        id: `critical-${index}`,
        stockMinimo: 100,
        lotes: [{ saldos: [{ cantidad: 0, ubicacion: { codigo: 'DEPOSITO' } }], reservas: [] }],
      }))
      const normalProducts = [
        { id: 'normal-deposito-a', stockMinimo: 50, lotes: [{ saldos: [{ cantidad: 82, ubicacion: { codigo: 'DEPOSITO' } }], reservas: [] }] },
        { id: 'normal-deposito-b', stockMinimo: 200, lotes: [{ saldos: [{ cantidad: 1368, ubicacion: { codigo: 'DEPOSITO' } }], reservas: [] }] },
        { id: 'normal-deposito-c', stockMinimo: 100, lotes: [{ saldos: [{ cantidad: 1215, ubicacion: { codigo: 'DEPOSITO' } }], reservas: [] }] },
        { id: 'normal-amino', stockMinimo: 60, lotes: [{ saldos: [
          { cantidad: 259, ubicacion: { codigo: 'DEPOSITO' } },
          { cantidad: 0, ubicacion: { codigo: 'ACONDICIONADO' } },
        ], reservas: [] }] },
      ]
      mockDb.producto.findMany.mockResolvedValue([...criticalProducts, ...normalProducts])
      mockDb.pedido.count.mockResolvedValue(0)
      mockDb.pedido.findMany.mockResolvedValue([])
      mockDb.platformUser.findMany.mockResolvedValue([])

      const app = await createTestApp()
      const res = await request(app).get('/api/ale-bet/dashboard').set('Authorization', `Bearer ${signToken()}`).expect(200)

      expect(res.body).toMatchObject({ stockCritico: 39, totalProductos: 43 })
    })

    it('returns zeros and empty arrays when no data exists', async () => {
      mockDb.producto.findMany.mockResolvedValue([])
      mockDb.pedido.count.mockResolvedValueOnce(0)
      mockDb.pedido.findMany.mockResolvedValue([])
      mockDb.platformUser.findMany.mockResolvedValue([])

      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/dashboard')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body.stockCritico).toBe(0)
      expect(res.body.pedidosHoy).toBe(0)
      expect(res.body.pendientesRemito).toBe(0)
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

      expect(res.body.error).toBe('Permiso insuficiente')
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
