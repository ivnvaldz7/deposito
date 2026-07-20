import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Express, NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

// ──────────────────────────────────────────────────
// Hoisted mocks
// ──────────────────────────────────────────────────
const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    pedido: {
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

function signVendedorToken(): string {
  return signToken({
    sub: 'vend-1',
    apps: { ale_bet: { rol: 'vendedor', activo: true } },
  })
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
describe('Ale-Bet Historial', () => {
  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = JWT_SECRET
  })

  describe('GET /api/ale-bet/historial', () => {
    it('returns historial with pedidos enriched with user names', async () => {
      mockDb.pedido.findMany.mockResolvedValue([
        {
          id: 'ped-1',
          numero: 'P-001',
          estado: 'COMPLETADO',
          createdAt: new Date(),
          clienteId: 'cliente-1',
          vendedorId: 'vend-1',
          armadorId: 'arm-1',
          cliente: { id: 'cliente-1', nombre: 'Cliente A' },
          items: [
            { id: 'item-1', cantidad: 5, producto: { id: 'prod-1', nombre: 'Producto A' } },
          ],
        },
      ])
      mockDb.platformUser.findMany.mockResolvedValue([
        { id: 'vend-1', nombre: 'Vendedor A' },
        { id: 'arm-1', nombre: 'Armador 1' },
      ])

      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/historial')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body).toHaveLength(1)
      expect(res.body[0].numero).toBe('P-001')
      expect(res.body[0].clienteNombre).toBe('Cliente A')
      expect(res.body[0].vendedorNombre).toBe('Vendedor A')
      expect(res.body[0].armadorNombre).toBe('Armador 1')
      expect(res.body[0].items).toHaveLength(1)
      expect(res.body[0].items[0].productoNombre).toBe('Producto A')
      expect(res.body[0].items[0].cantidad).toBe(5)
    })

    it('returns empty array when no pedidos match', async () => {
      mockDb.pedido.findMany.mockResolvedValue([])

      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/historial')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body).toEqual([])
    })

    it('filters by estado, desde, hasta, vendedorId, clienteId', async () => {
      mockDb.pedido.findMany.mockResolvedValue([])
      mockDb.platformUser.findMany.mockResolvedValue([])

      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/historial')
        .set('Authorization', `Bearer ${signToken()}`)
        .query({
          estado: 'APROBADO',
          desde: '2026-01-01',
          hasta: '2026-12-31',
          vendedorId: 'vend-1',
          clienteId: 'cliente-1',
        })
        .expect(200)

      expect(res.body).toEqual([])
      expect(mockDb.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            estado: 'APROBADO',
            clienteId: 'cliente-1',
            vendedorId: 'vend-1',
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      )
    })

    it('vendedor role auto-filters by own vendedorId', async () => {
      mockDb.pedido.findMany.mockResolvedValue([])
      mockDb.platformUser.findMany.mockResolvedValue([])

      const app = await createTestApp()
      await request(app)
        .get('/api/ale-bet/historial')
        .set('Authorization', `Bearer ${signVendedorToken()}`)
        .expect(200)

      expect(mockDb.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            vendedorId: 'vend-1',
          }),
        }),
      )
    })

    it('returns 400 for invalid desde parameter', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/historial')
        .set('Authorization', `Bearer ${signToken()}`)
        .query({ desde: 'not-a-date' })
        .expect(400)

      expect(res.body.error).toBe('Parámetro "desde" inválido')
    })

    it('returns 400 for invalid hasta parameter', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/historial')
        .set('Authorization', `Bearer ${signToken()}`)
        .query({ hasta: 'invalid-date' })
        .expect(400)

      expect(res.body.error).toBe('Parámetro "hasta" inválido')
    })

    it('returns 400 for invalid estado parameter', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/historial')
        .set('Authorization', `Bearer ${signToken()}`)
        .query({ estado: 'INVALID' })
        .expect(400)

      expect(res.body.error).toBe('Parámetro "estado" inválido')
    })

    it('returns 401 without token', async () => {
      const app = await createTestApp()
      await request(app).get('/api/ale-bet/historial').expect(401)
    })

    it('returns 403 without ale_bet access', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/historial')
        .set('Authorization', `Bearer ${signSinAccesoToken()}`)
        .expect(403)

      expect(res.body.error).toBe('No tiene acceso a esta aplicación')
    })

    it('returns 500 on DB error', async () => {
      mockDb.pedido.findMany.mockRejectedValue(new Error('DB error'))
      const app = await createTestApp()

      const res = await request(app)
        .get('/api/ale-bet/historial')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(500)

      expect(res.body.error).toBe('DB error')
    })
  })

  describe('GET /api/ale-bet/historial/export', () => {
    it('returns Excel file with correct Content-Type and Content-Disposition', async () => {
      mockDb.pedido.findMany.mockResolvedValue([
        {
          id: 'ped-1',
          numero: 'P-001',
          estado: 'COMPLETADO',
          createdAt: new Date(),
          clienteId: 'cliente-1',
          vendedorId: 'vend-1',
          armadorId: null,
          cliente: { id: 'cliente-1', nombre: 'Cliente A' },
          items: [
            { id: 'item-1', cantidad: 5, producto: { id: 'prod-1', nombre: 'Producto A' } },
          ],
        },
      ])
      mockDb.platformUser.findMany.mockResolvedValue([
        { id: 'vend-1', nombre: 'Vendedor A' },
      ])

      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/historial/export')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.headers['content-type']).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="historial-pedidos.xlsx"',
      )
    })

    it('returns 400 when filter is invalid', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/historial/export')
        .set('Authorization', `Bearer ${signToken()}`)
        .query({ estado: 'INVALID' })
        .expect(400)

      expect(res.body.error).toBe('Parámetro "estado" inválido')
    })

    it('returns 401 without token', async () => {
      const app = await createTestApp()
      await request(app).get('/api/ale-bet/historial/export').expect(401)
    })

    it('returns 403 without ale_bet access', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/historial/export')
        .set('Authorization', `Bearer ${signSinAccesoToken()}`)
        .expect(403)

      expect(res.body.error).toBe('No tiene acceso a esta aplicación')
    })

    it('returns 500 on DB error', async () => {
      mockDb.pedido.findMany.mockRejectedValue(new Error('DB error'))
      const app = await createTestApp()

      const res = await request(app)
        .get('/api/ale-bet/historial/export')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(500)

      expect(res.body.error).toBe('DB error')
    })
  })
})
