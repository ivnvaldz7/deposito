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
const OTRO_CLIENTE_ID = 'cliente-2'
const PROD_A_ID = 'prod-a'
const PROD_B_ID = 'prod-b'

const productoA = { nombre: 'Producto A', sku: 'SKU-A', unidadesPorCaja: 10 }
const productoB = { nombre: 'Producto B', sku: 'SKU-B', unidadesPorCaja: 6 }

/**
 * Build a fake Pedido DESPACHADO for the given month in 2026.
 * despachadoAt is set to midnight UTC on the 15th of the given month.
 */
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

// ──────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────
describe('ALEBET-FACT-02 — Reporte de ventas por cliente', () => {
  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = JWT_SECRET
    vi.resetAllMocks()
  })

  const BASE_URL = '/api/ale-bet/facturacion/ventas'

  // ── RBAC ───────────────────────────────────────────────────────────────────

  describe('RBAC', () => {
    it('returns 401 without token', async () => {
      const app = await createTestApp()
      await request(app).get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026`).expect(401)
    })

    it('returns 403 when user has no ale-bet access at all', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026`)
        .set('Authorization', `Bearer ${signSinAccesoToken()}`)
        .expect(403)
      expect(res.body.error).toBeDefined()
    })

    it('returns 403 for vendedor role', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026`)
        .set('Authorization', `Bearer ${signVendedorToken()}`)
        .expect(403)
      expect(res.body.error).toMatch(/[Rr]ol/)
    })

    it('returns 403 for armador role', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026`)
        .set('Authorization', `Bearer ${signArmadorToken()}`)
        .expect(403)
      expect(res.body.error).toMatch(/[Rr]ol/)
    })

    it('returns 403 for encargado_deposito role', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026`)
        .set('Authorization', `Bearer ${signEncargadoDepositoToken()}`)
        .expect(403)
      expect(res.body.error).toMatch(/[Rr]ol/)
    })

    it('returns 200 for admin role', async () => {
      mockDb.pedido.findMany.mockResolvedValue([])
      const app = await createTestApp()
      await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)
    })

    it('returns 200 for facturacion role', async () => {
      mockDb.pedido.findMany.mockResolvedValue([])
      const app = await createTestApp()
      await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026`)
        .set('Authorization', `Bearer ${signFacturacionToken()}`)
        .expect(200)
    })
  })

  // ── Input validation ────────────────────────────────────────────────────────

  describe('Input validation', () => {
    it('returns 400 when clienteId is missing', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?year=2026`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(400)
      expect(res.body.error).toMatch(/clienteId/)
    })

    it('returns 400 when year is missing', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(400)
      expect(res.body.error).toMatch(/year/)
    })

    it('returns 400 when month is out of range (0)', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=0`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(400)
      expect(res.body.error).toMatch(/month/)
    })

    it('returns 400 when month is out of range (13)', async () => {
      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=13`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(400)
      expect(res.body.error).toMatch(/month/)
    })
  })

  // ── DESPACHADO filter ───────────────────────────────────────────────────────

  describe('Only DESPACHADO pedidos are included', () => {
    it('includes only DESPACHADO orders — excludes BORRADOR, APROBADO, EN_ARMADO, PREPARADO, CANCELADO', async () => {
      // The DB mock returns only the DESPACHADO result because that is what
      // the route queries (estado: 'DESPACHADO'). We verify the filter by
      // checking the query call args include estado: 'DESPACHADO'.
      mockDb.pedido.findMany.mockResolvedValue([
        pedidoDespachado('ped-1', CLIENTE_ID, 7, [
          { productoId: PROD_A_ID, cantidad: 20, producto: productoA },
        ]),
      ])

      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=7`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      // Verify the prisma call included estado DESPACHADO
      expect(mockDb.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ estado: 'DESPACHADO' }),
        }),
      )

      expect(res.body.pedidosDespachados).toBe(1)
    })

    it('returns zero counts when there are no dispatched orders', async () => {
      mockDb.pedido.findMany.mockResolvedValue([])

      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=7`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body.pedidosDespachados).toBe(0)
      expect(res.body.productosDistintos).toBe(0)
      expect(res.body.unidadesTotales).toBe(0)
      expect(res.body.productos).toEqual([])
    })
  })

  // ── Monthly report ──────────────────────────────────────────────────────────

  describe('Monthly report', () => {
    it('returns correct monthly totals for a single pedido', async () => {
      // 25 units of productoA, unidadesPorCaja=10 → 2 cajas + 5 sueltos
      mockDb.pedido.findMany.mockResolvedValue([
        pedidoDespachado('ped-1', CLIENTE_ID, 7, [
          { productoId: PROD_A_ID, cantidad: 25, producto: productoA },
        ]),
      ])

      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=7`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body.modo).toBe('mensual')
      expect(res.body.year).toBe(2026)
      expect(res.body.month).toBe(7)
      expect(res.body.pedidosDespachados).toBe(1)
      expect(res.body.productosDistintos).toBe(1)
      expect(res.body.unidadesTotales).toBe(25)

      const prodA = res.body.productos[0]
      expect(prodA.productoId).toBe(PROD_A_ID)
      expect(prodA.nombre).toBe('Producto A')
      expect(prodA.sku).toBe('SKU-A')
      expect(prodA.unidadesPorCaja).toBe(10)
      expect(prodA.cajas).toBe(2)
      expect(prodA.sueltos).toBe(5)
      expect(prodA.unidades).toBe(25)
    })

    it('aggregates multiple pedidos with same product correctly', async () => {
      // Two pedidos: 15 + 7 = 22 units of productoA, unidadesPorCaja=10 → 2 cajas + 2 sueltos
      mockDb.pedido.findMany.mockResolvedValue([
        pedidoDespachado('ped-1', CLIENTE_ID, 7, [
          { productoId: PROD_A_ID, cantidad: 15, producto: productoA },
        ]),
        pedidoDespachado('ped-2', CLIENTE_ID, 7, [
          { productoId: PROD_A_ID, cantidad: 7, producto: productoA },
        ]),
      ])

      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=7`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body.pedidosDespachados).toBe(2)
      expect(res.body.productosDistintos).toBe(1)
      expect(res.body.unidadesTotales).toBe(22)

      const prodA = res.body.productos[0]
      expect(prodA.cajas).toBe(2)
      expect(prodA.sueltos).toBe(2)
      expect(prodA.unidades).toBe(22)
    })

    it('handles multiple products in the same period', async () => {
      // prodA: 12 units, unidadesPorCaja=10 → 1 caja + 2 sueltos
      // prodB: 13 units, unidadesPorCaja=6  → 2 cajas + 1 suelto
      mockDb.pedido.findMany.mockResolvedValue([
        pedidoDespachado('ped-1', CLIENTE_ID, 7, [
          { productoId: PROD_A_ID, cantidad: 12, producto: productoA },
          { productoId: PROD_B_ID, cantidad: 13, producto: productoB },
        ]),
      ])

      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=7`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body.productosDistintos).toBe(2)
      expect(res.body.unidadesTotales).toBe(25)

      const pA = res.body.productos.find((p: { productoId: string }) => p.productoId === PROD_A_ID)
      const pB = res.body.productos.find((p: { productoId: string }) => p.productoId === PROD_B_ID)

      expect(pA.cajas).toBe(1)
      expect(pA.sueltos).toBe(2)

      expect(pB.cajas).toBe(2)
      expect(pB.sueltos).toBe(1)
    })

    it('uses dynamic unidadesPorCaja per product', async () => {
      // productoB has unidadesPorCaja=6; 7 units → 1 caja + 1 suelto
      mockDb.pedido.findMany.mockResolvedValue([
        pedidoDespachado('ped-1', CLIENTE_ID, 7, [
          { productoId: PROD_B_ID, cantidad: 7, producto: productoB },
        ]),
      ])

      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=7`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      const pB = res.body.productos[0]
      expect(pB.unidadesPorCaja).toBe(6)
      expect(pB.cajas).toBe(1)
      expect(pB.sueltos).toBe(1)
    })

    it('filters by month via despachadoAt date range passed to the query', async () => {
      mockDb.pedido.findMany.mockResolvedValue([])

      const app = await createTestApp()
      await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026&month=3`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      // Verify the date range for March 2026 UTC
      expect(mockDb.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            despachadoAt: {
              gte: new Date(Date.UTC(2026, 2, 1)), // March 1
              lt: new Date(Date.UTC(2026, 3, 1)),  // April 1
            },
          }),
        }),
      )
    })

    it('filters by clienteId', async () => {
      mockDb.pedido.findMany.mockResolvedValue([])

      const app = await createTestApp()
      await request(app)
        .get(`${BASE_URL}?clienteId=${OTRO_CLIENTE_ID}&year=2026&month=7`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(mockDb.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clienteId: OTRO_CLIENTE_ID }),
        }),
      )
    })
  })

  // ── Annual report ───────────────────────────────────────────────────────────

  describe('Annual report', () => {
    it('returns correct annual totals across multiple months', async () => {
      // Jan: 10 units of prodA; Jul: 20 units of prodA
      mockDb.pedido.findMany.mockResolvedValue([
        pedidoDespachado('ped-jan', CLIENTE_ID, 1, [
          { productoId: PROD_A_ID, cantidad: 10, producto: productoA },
        ]),
        pedidoDespachado('ped-jul', CLIENTE_ID, 7, [
          { productoId: PROD_A_ID, cantidad: 20, producto: productoA },
        ]),
      ])

      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body.modo).toBe('anual')
      expect(res.body.pedidosDespachados).toBe(2)
      expect(res.body.productosDistintos).toBe(1)
      expect(res.body.unidadesTotales).toBe(30)

      // Annual product total: 30 units, unidadesPorCaja=10 → 3 cajas + 0 sueltos
      const pA = res.body.productos[0]
      expect(pA.cajas).toBe(3)
      expect(pA.sueltos).toBe(0)
      expect(pA.unidades).toBe(30)
    })

    it('includes per-month breakdown only for months with sales', async () => {
      mockDb.pedido.findMany.mockResolvedValue([
        pedidoDespachado('ped-jan', CLIENTE_ID, 1, [
          { productoId: PROD_A_ID, cantidad: 10, producto: productoA },
        ]),
        pedidoDespachado('ped-jul', CLIENTE_ID, 7, [
          { productoId: PROD_A_ID, cantidad: 20, producto: productoA },
        ]),
      ])

      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      // Only Jan and Jul should appear, not all 12 months
      expect(res.body.meses).toHaveLength(2)
      expect(res.body.meses[0].month).toBe(1)
      expect(res.body.meses[1].month).toBe(7)
    })

    it('returns empty meses array when no sales in the year', async () => {
      mockDb.pedido.findMany.mockResolvedValue([])

      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body.pedidosDespachados).toBe(0)
      expect(res.body.meses).toEqual([])
      expect(res.body.productos).toEqual([])
    })

    it('monthly breakdown has correct per-month totals', async () => {
      // Jan: prodA 10 units; Jul: prodA 20 + prodB 6 units
      mockDb.pedido.findMany.mockResolvedValue([
        pedidoDespachado('ped-jan', CLIENTE_ID, 1, [
          { productoId: PROD_A_ID, cantidad: 10, producto: productoA },
        ]),
        pedidoDespachado('ped-jul', CLIENTE_ID, 7, [
          { productoId: PROD_A_ID, cantidad: 20, producto: productoA },
          { productoId: PROD_B_ID, cantidad: 6, producto: productoB },
        ]),
      ])

      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      const jan = res.body.meses.find((m: { month: number }) => m.month === 1)
      expect(jan.pedidosDespachados).toBe(1)
      expect(jan.productosDistintos).toBe(1)
      expect(jan.unidadesTotales).toBe(10)

      const jul = res.body.meses.find((m: { month: number }) => m.month === 7)
      expect(jul.pedidosDespachados).toBe(1)
      expect(jul.productosDistintos).toBe(2)
      expect(jul.unidadesTotales).toBe(26)
    })

    it('filters by year via despachadoAt date range', async () => {
      mockDb.pedido.findMany.mockResolvedValue([])

      const app = await createTestApp()
      await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2025`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(mockDb.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            despachadoAt: {
              gte: new Date(Date.UTC(2025, 0, 1)),
              lt: new Date(Date.UTC(2026, 0, 1)),
            },
          }),
        }),
      )
    })

    it('aggregates multiple pedidos of the same product across months correctly', async () => {
      // Same product dispatched in 3 different months
      mockDb.pedido.findMany.mockResolvedValue([
        pedidoDespachado('ped-1', CLIENTE_ID, 1, [
          { productoId: PROD_A_ID, cantidad: 10, producto: productoA },
        ]),
        pedidoDespachado('ped-2', CLIENTE_ID, 3, [
          { productoId: PROD_A_ID, cantidad: 13, producto: productoA },
        ]),
        pedidoDespachado('ped-3', CLIENTE_ID, 8, [
          { productoId: PROD_A_ID, cantidad: 7, producto: productoA },
        ]),
      ])

      const app = await createTestApp()
      const res = await request(app)
        .get(`${BASE_URL}?clienteId=${CLIENTE_ID}&year=2026`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      // Annual total: 10+13+7 = 30 units, unidadesPorCaja=10 → 3 cajas + 0 sueltos
      expect(res.body.unidadesTotales).toBe(30)
      expect(res.body.productosDistintos).toBe(1)
      const pA = res.body.productos[0]
      expect(pA.cajas).toBe(3)
      expect(pA.sueltos).toBe(0)
    })
  })
})
