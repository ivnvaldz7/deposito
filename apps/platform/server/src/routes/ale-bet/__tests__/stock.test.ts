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
    movimientoStock: {
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

  function _getSecret(): string {
    return process.env.PLATFORM_JWT_SECRET || JWT_SECRET
  }

  return {
    signAccessToken: (payload: Record<string, unknown>) => {
      return _jwt.sign(payload, _getSecret(), { expiresIn: '15m' })
    },

    APP_SLUG_BY_ID: { deposito: 'deposito', ale_bet: 'ale-bet', portal: 'portal', admin: 'admin' },
    getAppAccess: (user, slug) => user && user.apps ? user.apps[slug] : undefined,
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
describe('Ale-Bet Stock', () => {
  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = JWT_SECRET
  })

  describe('GET /api/ale-bet/stock', () => {
    it('returns stock with calculated unidades and movimientos', async () => {
      mockDb.producto.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          nombre: 'Producto A',
          sku: 'SKU001',
          stockMinimo: 10,
          unidadesPorCaja: 20,
          activo: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          lotes: [
            {
              id: 'lote-1',
              numero: 'L001',
              activo: true,
              productoId: 'prod-1',
              fechaProduccion: new Date(),
              fechaVencimiento: new Date(),
              createdAt: new Date(),
              saldos: [
                { cantidad: 35, ubicacion: { codigo: 'DEPOSITO' } },
                { cantidad: 10, ubicacion: { codigo: 'ACONDICIONADO' } },
              ],
            },
          ],
        },
      ])
      mockDb.movimientoStock.findMany.mockResolvedValue([
        {
          id: 'mov-1',
          productoId: 'prod-1',
          cantidad: -5,
          tipo: 'SALIDA_PEDIDO',
          referencia: 'pedido-1',
          usuarioId: 'user-1',
          createdAt: new Date(),
        },
      ])

      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/stock')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body.productos).toHaveLength(1)
      expect(res.body.productos[0].stock).toBe(45)
      expect(res.body.productos[0].stockTotal).toBe(45)
      expect(res.body.productos[0].stockDeposito).toBe(35)
      expect(res.body.productos[0].stockAcondicionado).toBe(10)
      expect(res.body.productos[0].stockDisponiblePedido).toBe(45)
      expect(res.body.productos[0].lotes).toEqual([expect.objectContaining({
        id: 'lote-1',
        numero: 'L001',
        stockTotal: 45,
        stockDeposito: 35,
        stockAcondicionado: 10,
      })])
      expect(res.body.productos[0].stockBajo).toBe(false)
      expect(res.body.movimientos).toHaveLength(1)
      expect(res.body.movimientos[0].tipo).toBe('SALIDA_PEDIDO')
    })

    it('marks product as stockBajo when stock < stockMinimo', async () => {
      mockDb.producto.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          nombre: 'Producto A',
          sku: 'SKU001',
          stockMinimo: 100,
          unidadesPorCaja: 12,
          activo: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          lotes: [
            {
              id: 'lote-1',
              numero: 'L001',
              activo: true,
              productoId: 'prod-1',
              fechaProduccion: new Date(),
              fechaVencimiento: new Date(),
              createdAt: new Date(),
              saldos: [{ cantidad: 15, ubicacion: { codigo: 'DEPOSITO' } }],
            },
          ],
        },
      ])
      mockDb.movimientoStock.findMany.mockResolvedValue([])

      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/stock')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      // stock = 15, stockMinimo = 100 -> stockBajo = true
      expect(res.body.productos[0].stockBajo).toBe(true)
    })

    it('aggregates real balances by lot and location, including zero-balance lots', async () => {
      const date = new Date()
      mockDb.producto.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          nombre: 'Producto A',
          sku: 'SKU001',
          stockMinimo: 1,
          unidadesPorCaja: 20,
          activo: true,
          createdAt: date,
          updatedAt: date,
          lotes: [
            {
              id: 'lote-deposito',
              numero: 'L001',
              activo: true,
              productoId: 'prod-1',
              fechaProduccion: date,
              fechaVencimiento: date,
              createdAt: date,
              saldos: [{ cantidad: 7, ubicacion: { codigo: 'DEPOSITO' } }],
            },
            {
              id: 'lote-acondicionado',
              numero: 'L002',
              activo: true,
              productoId: 'prod-1',
              fechaProduccion: date,
              fechaVencimiento: date,
              createdAt: date,
              saldos: [{ cantidad: 4, ubicacion: { codigo: 'ACONDICIONADO' } }],
            },
            {
              id: 'lote-repartido',
              numero: 'L003',
              activo: true,
              productoId: 'prod-1',
              fechaProduccion: date,
              fechaVencimiento: date,
              createdAt: date,
              saldos: [
                { cantidad: 3, ubicacion: { codigo: 'DEPOSITO' } },
                { cantidad: 5, ubicacion: { codigo: 'ACONDICIONADO' } },
              ],
            },
            {
              id: 'lote-cero',
              numero: 'L004',
              activo: false,
              productoId: 'prod-1',
              fechaProduccion: date,
              fechaVencimiento: date,
              createdAt: date,
              saldos: [],
            },
          ],
        },
      ])
      mockDb.movimientoStock.findMany.mockResolvedValue([])

      const app = await createTestApp()
      const res = await request(app).get('/api/ale-bet/stock').set('Authorization', `Bearer ${signToken()}`).expect(200)
      const product = res.body.productos[0]

      expect(product.stockTotal).toBe(19)
      expect(product.stockDeposito).toBe(10)
      expect(product.stockAcondicionado).toBe(9)
      expect(product.lotes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'lote-deposito', stockTotal: 7, stockDeposito: 7, stockAcondicionado: 0 }),
        expect.objectContaining({ id: 'lote-acondicionado', stockTotal: 4, stockDeposito: 0, stockAcondicionado: 4 }),
        expect.objectContaining({ id: 'lote-repartido', stockTotal: 8, stockDeposito: 3, stockAcondicionado: 5 }),
        expect.objectContaining({ id: 'lote-cero', stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0 }),
      ]))
      expect(product.lotes.reduce((total: number, lote: { stockTotal: number }) => total + lote.stockTotal, 0)).toBe(product.stockTotal)
    })

    it('returns empty arrays when no data exists', async () => {
      mockDb.producto.findMany.mockResolvedValue([])
      mockDb.movimientoStock.findMany.mockResolvedValue([])

      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/stock')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body.productos).toEqual([])
      expect(res.body.movimientos).toEqual([])
    })

    it('returns 401 without token', async () => {
      const app = await createTestApp()
      await request(app).get('/api/ale-bet/stock').expect(401)
    })

    it('returns 403 without ale_bet access', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/stock')
        .set('Authorization', `Bearer ${signSinAccesoToken()}`)
        .expect(403)

      expect(res.body.error).toBe('No tiene acceso a esta aplicación')
    })

    it('returns 500 on DB error', async () => {
      mockDb.producto.findMany.mockRejectedValue(new Error('DB connection failed'))
      const app = await createTestApp()

      const res = await request(app)
        .get('/api/ale-bet/stock')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(500)

      expect(res.body.error).toBe('DB connection failed')
    })
  })

  describe('GET /api/ale-bet/stock/movimientos', () => {
    it('returns all movimientos', async () => {
      mockDb.movimientoStock.findMany.mockResolvedValue([
        {
          id: 'mov-1',
          productoId: 'prod-1',
          cantidad: 10,
          tipo: 'ENTRADA_MANUAL',
          referencia: null,
          usuarioId: 'user-1',
          createdAt: new Date(),
        },
      ])

      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/stock/movimientos')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body).toHaveLength(1)
      expect(res.body[0].tipo).toBe('ENTRADA_MANUAL')
    })

    it('returns empty array when no movimientos', async () => {
      mockDb.movimientoStock.findMany.mockResolvedValue([])

      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/stock/movimientos')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body).toEqual([])
    })

    it('returns 401 without token', async () => {
      const app = await createTestApp()
      await request(app).get('/api/ale-bet/stock/movimientos').expect(401)
    })

    it('returns 403 without ale_bet access', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get('/api/ale-bet/stock/movimientos')
        .set('Authorization', `Bearer ${signSinAccesoToken()}`)
        .expect(403)

      expect(res.body.error).toBe('No tiene acceso a esta aplicación')
    })

    it('returns 500 on DB error', async () => {
      mockDb.movimientoStock.findMany.mockRejectedValue(new Error('DB error'))
      const app = await createTestApp()

      const res = await request(app)
        .get('/api/ale-bet/stock/movimientos')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(500)

      expect(res.body.error).toBe('DB error')
    })
  })

  describe('POST /api/ale-bet/stock/transferencias', () => {
    it('rejects a malformed transfer before mutating stock', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .post('/api/ale-bet/stock/transferencias')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ productoId: 'producto-1', loteId: 'lote-1', origen: 'DEPOSITO', destino: 'ACONDICIONADO', cantidad: 0 })
        .expect(400)

      expect(res.body.error).toBe('Datos de transferencia inválidos')
    })

    it('forbids a vendedor from requesting an internal transfer', async () => {
      const app = await createTestApp()
      await request(app)
        .post('/api/ale-bet/stock/transferencias')
        .set('Authorization', `Bearer ${signToken({ apps: { 'ale-bet': { rol: 'vendedor', activo: true } } })}`)
        .send({ productoId: 'producto-1', loteId: 'lote-1', origen: 'DEPOSITO', destino: 'ACONDICIONADO', cantidad: 1 })
        .expect(403)
    })
  })
})
