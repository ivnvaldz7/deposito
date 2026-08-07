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
    cliente: {
      findUnique: vi.fn(),
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

function signFacturacionToken(): string {
  return signToken({
    sub: 'fact-1',
    apps: { 'ale-bet': { rol: 'facturacion', activo: true } },
  })
}

function signVendedorToken(): string {
  return signToken({
    sub: 'vend-1',
    apps: { 'ale-bet': { rol: 'vendedor', activo: true } },
  })
}

function signArmadorToken(): string {
  return signToken({
    sub: 'armador-1',
    apps: { 'ale-bet': { rol: 'armador', activo: true } },
  })
}

function signEncargadoDepositoToken(): string {
  return signToken({
    sub: 'enc-1',
    apps: { 'ale-bet': { rol: 'encargado_deposito', activo: true } },
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
    getAppAccess: (user: Record<string, unknown>, slug: string) =>
      user && user.apps ? (user.apps as Record<string, unknown>)[slug] : undefined,
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
function wrapAsyncErrors(router: { stack: Array<{ route?: { stack: Array<{ handle: (req: Request, res: Response, next: NextFunction) => void }> }; handle?: { stack: unknown[] } }> }): void {
  for (const layer of router.stack) {
    if (layer.route) {
      for (const routeLayer of layer.route.stack) {
        const handle = routeLayer.handle
        routeLayer.handle = (req: Request, res: Response, next: NextFunction) => {
          try {
            const result = handle(req, res, next)
            if (result && typeof (result as Promise<unknown>).catch === 'function') {
              ;(result as Promise<unknown>).catch(next)
            }
          } catch (err) {
            next(err)
          }
        }
      }
    } else if (layer.handle?.stack) {
      wrapAsyncErrors(layer.handle as typeof router)
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
  wrapAsyncErrors(routes as Parameters<typeof wrapAsyncErrors>[0])
  app.use('/api/ale-bet', verifyToken, routes)

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: err.message || 'Error interno del servidor' })
  })

  return app
}

// ──────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────
const CLIENTE_ID = 'cliente-1'
const PROD_A_ID = 'prod-a'

const productoA = { nombre: 'Producto A', sku: 'SKU-A', unidadesPorCaja: 10 }

function pedidoDespachado(
  id: string,
  clienteId: string,
  month: number,
  items: Array<{ productoId: string; cantidad: number; producto: { nombre: string; sku: string; unidadesPorCaja: number } }>,
) {
  return {
    id,
    clienteId,
    estado: 'DESPACHADO',
    despachadoAt: new Date(Date.UTC(2026, month - 1, 15)),
    items,
  }
}

const clienteOeste = { nombre: 'Veterinaria Oeste S.A.', cuit: '30-12345678-9' }

// ──────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────
describe('ALEBET-FACT-02 — GET /ventas/pdf export endpoint', () => {
  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = JWT_SECRET
    vi.resetAllMocks()
  })

  const BASE_URL = '/api/ale-bet/facturacion/ventas/pdf'

  describe('RBAC', () => {
    it('returns 403 for vendedor role with no PDF bytes', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=8`)
        .set('Authorization', `Bearer ${signVendedorToken()}`)
        .expect(403)
      expect(res.body.error).toMatch(/[Rr]ol/)
      expect(res.headers['content-type']).not.toMatch(/application\/pdf/)
      expect(res.text.startsWith('%PDF')).toBe(false)
      expect(mockDb.pedido.findMany).not.toHaveBeenCalled()
    })

    it('returns 403 for armador role with no PDF bytes', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=8`)
        .set('Authorization', `Bearer ${signArmadorToken()}`)
        .expect(403)
      expect(res.body.error).toMatch(/[Rr]ol/)
      expect(res.headers['content-type']).not.toMatch(/application\/pdf/)
      expect(res.text.startsWith('%PDF')).toBe(false)
    })

    it('returns 403 for encargado_deposito role with no PDF bytes', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=8`)
        .set('Authorization', `Bearer ${signEncargadoDepositoToken()}`)
        .expect(403)
      expect(res.body.error).toMatch(/[Rr]ol/)
      expect(res.headers['content-type']).not.toMatch(/application\/pdf/)
      expect(res.text.startsWith('%PDF')).toBe(false)
    })
  })

  describe('Success responses', () => {
    it('returns a mensual PDF with attachment disposition and slugified filename (R1/R5)', async () => {
      mockDb.pedido.findMany.mockResolvedValue([
        pedidoDespachado('ped-1', CLIENTE_ID, 8, [
          { productoId: PROD_A_ID, cantidad: 25, producto: productoA },
        ]),
      ])
      mockDb.cliente.findUnique.mockResolvedValue(clienteOeste)

      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=8`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.headers['content-type']).toMatch(/application\/pdf/)
      expect(res.headers['content-disposition']).toMatch(/attachment/)
      expect(res.headers['content-disposition']).toContain('ventas-veterinaria-oeste-s-a-2026-08.pdf')
      // Real PDF bytes flowed through the response.
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-')
    })

    it('returns an anual PDF for the facturacion role without month (R1/R5)', async () => {
      mockDb.pedido.findMany.mockResolvedValue([
        pedidoDespachado('ped-jan', CLIENTE_ID, 1, [
          { productoId: PROD_A_ID, cantidad: 10, producto: productoA },
        ]),
        pedidoDespachado('ped-jul', CLIENTE_ID, 7, [
          { productoId: PROD_A_ID, cantidad: 20, producto: productoA },
        ]),
      ])
      mockDb.cliente.findUnique.mockResolvedValue(clienteOeste)

      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026`)
        .set('Authorization', `Bearer ${signFacturacionToken()}`)
        .expect(200)

      expect(res.headers['content-type']).toMatch(/application\/pdf/)
      expect(res.headers['content-disposition']).toMatch(/attachment/)
      expect(res.headers['content-disposition']).toContain('ventas-veterinaria-oeste-s-a-2026.pdf')
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-')
    })

    it('queries only DESPACHADO pedidos in the requested period', async () => {
      mockDb.pedido.findMany.mockResolvedValue([])
      mockDb.cliente.findUnique.mockResolvedValue(clienteOeste)

      const app = await createTestApp()
      await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=3`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(400)

      expect(mockDb.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clienteId: CLIENTE_ID,
            estado: 'DESPACHADO',
            despachadoAt: {
              gte: new Date(Date.UTC(2026, 2, 1)),
              lt: new Date(Date.UTC(2026, 3, 1)),
            },
          }),
        }),
      )
    })
  })

  describe('Coherent 400 responses', () => {
    it('returns 400 {error} when there are no sales in the period (R1)', async () => {
      mockDb.pedido.findMany.mockResolvedValue([])
      mockDb.cliente.findUnique.mockResolvedValue(clienteOeste)

      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=8`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(400)

      expect(res.body.error).toBe('No hay ventas para el período seleccionado')
      expect(res.headers['content-type']).toMatch(/application\/json/)
      // No empty PDF ever shipped.
      expect(res.text.startsWith('%PDF')).toBe(false)
    })

    it('returns 400 when the cliente does not exist', async () => {
      mockDb.pedido.findMany.mockResolvedValue([
        pedidoDespachado('ped-1', CLIENTE_ID, 8, [
          { productoId: PROD_A_ID, cantidad: 25, producto: productoA },
        ]),
      ])
      mockDb.cliente.findUnique.mockResolvedValue(null)

      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=8`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(400)

      expect(res.body.error).toBe('Cliente no encontrado')
    })

    it('returns 400 with the JSON route message when month is out of range (13)', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=13`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(400)
      expect(res.body.error).toMatch(/month/)
    })

    it('returns 400 with the JSON route message when year is missing', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&month=8`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(400)
      expect(res.body.error).toMatch(/year/)
    })

    it('returns 400 with the JSON route message when clienteId is missing', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?year=2026&month=8`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(400)
      expect(res.body.error).toMatch(/clienteId/)
    })
  })
})
