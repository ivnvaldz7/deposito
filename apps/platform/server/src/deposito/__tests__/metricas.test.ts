import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

// metricas.ts solo importa type { Prisma }, no necesita mock de @platform/db
vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const role = req.header('x-test-role')
    if (!role) {
      res.status(401).json({ message: 'No autenticado' })
      return
    }
    req.depositoUser = {
      id: req.header('x-test-user-id') ?? 'enc-1',
      role,
      name: 'Usuario Test',
    }
    next()
  },
}))

// ── Mocks para funciones de fecha ──────────────────────────────────────────────

// Las funciones toLocaleString son runtime de JS, no se pueden mockear fácil.
// Testeamos la lógica de negocio con datos controlados.

// ── Helpers ────────────────────────────────────────────────────────────────────

interface Movimiento {
  id: string
  tipo: 'ingreso_acta' | 'egreso_orden' | 'ajuste_manual'
  categoria: string
  productoNombre: string
  cantidad: number
  createdAt: Date
  userId: string
  user: { name: string }
}

function makeMovimiento(overrides: Partial<Movimiento> = {}): Movimiento {
  return {
    id: 'mov-1',
    tipo: 'ingreso_acta',
    categoria: 'droga',
    productoNombre: 'IBUPROFENO 400 MG',
    cantidad: 100,
    createdAt: new Date('2025-01-15T10:00:00Z'),
    userId: 'user-1',
    user: { name: 'Carlos' },
    ...overrides,
  }
}

const prismaMock = vi.hoisted(() => ({
  movimiento: {
    findMany: vi.fn(),
  },
}))

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }))

import metricasRouter from '../routes/metricas'

describe('Métricas', () => {
  const app = createTestApp('/api/metricas', metricasRouter)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/metricas — resumen JSON', () => {
    it('devuelve resumen vacío cuando no hay movimientos', async () => {
      prismaMock.movimiento.findMany.mockResolvedValue([])

      const res = await request(app)
        .get('/api/metricas')
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        totalIngresos: 0,
        totalEgresos: 0,
        balance: 0,
        movimientosPeriodo: 0,
        ingresosPorCategoria: [],
        topProductosIngresados: [],
        topProductosSolicitados: [],
      })
    })

    it('calcula ingresos, egresos y balance correctamente', async () => {
      prismaMock.movimiento.findMany.mockResolvedValue([
        makeMovimiento({ id: 'm1', tipo: 'ingreso_acta', cantidad: 50 }),
        makeMovimiento({ id: 'm2', tipo: 'egreso_orden', cantidad: -30 }),
        makeMovimiento({ id: 'm3', tipo: 'ingreso_acta', cantidad: 20 }),
        makeMovimiento({ id: 'm4', tipo: 'ajuste_manual', cantidad: -5 }),
      ])

      const res = await request(app)
        .get('/api/metricas')
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(200)
      expect(res.body.totalIngresos).toBe(70)   // 50 + 20
      expect(res.body.totalEgresos).toBe(35)    // 30 + 5 (absoluto)
      expect(res.body.balance).toBe(35)          // 70 - 35
      expect(res.body.movimientosPeriodo).toBe(4)
    })

    it('agrupa ingresos por categoría', async () => {
      prismaMock.movimiento.findMany.mockResolvedValue([
        makeMovimiento({ id: 'm1', tipo: 'ingreso_acta', categoria: 'droga', cantidad: 100 }),
        makeMovimiento({ id: 'm2', tipo: 'ingreso_acta', categoria: 'estuche', cantidad: 50 }),
        makeMovimiento({ id: 'm3', tipo: 'ingreso_acta', categoria: 'droga', cantidad: 200 }),
      ])

      const res = await request(app)
        .get('/api/metricas')
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(200)
      expect(res.body.ingresosPorCategoria).toHaveLength(2)
      expect(res.body.ingresosPorCategoria).toContainEqual({ categoria: 'droga', total: 300 })
      expect(res.body.ingresosPorCategoria).toContainEqual({ categoria: 'estuche', total: 50 })
    })

    it('top 10 productos ingresados y solicitados', async () => {
      const movimientos = Array.from({ length: 15 }, (_, i) =>
        makeMovimiento({
          id: `m${i}`,
          tipo: i < 10 ? 'ingreso_acta' : 'egreso_orden',
          productoNombre: `PRODUCTO ${i}`,
          cantidad: i < 10 ? 100 - i * 5 : - (50 + i * 3),
        })
      )

      prismaMock.movimiento.findMany.mockResolvedValue(movimientos)

      const res = await request(app)
        .get('/api/metricas')
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(200)
      expect(res.body.topProductosIngresados).toHaveLength(10)
      expect(res.body.topProductosSolicitados).toHaveLength(5)
      // El más ingresado es PRODUCTO 0 con 100
      expect(res.body.topProductosIngresados[0].total).toBe(100)
    })

    it('devuelve 401 sin autenticación', async () => {
      const res = await request(app).get('/api/metricas')
      expect(res.status).toBe(401)
    })

    it('devuelve 403 con rol solicitante', async () => {
      const res = await request(app)
        .get('/api/metricas')
        .set('x-test-role', 'solicitante')
      expect(res.status).toBe(403)
    })
  })

  describe('GET /api/metricas/exportar-pdf', () => {
    it('devuelve Content-Type application/pdf', async () => {
      prismaMock.movimiento.findMany.mockResolvedValue([
        makeMovimiento({ id: 'm1', tipo: 'ingreso_acta', cantidad: 100 }),
      ])

      const res = await request(app)
        .get('/api/metricas/exportar-pdf')
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('application/pdf')
      expect(res.headers['content-disposition']).toMatch(/^attachment;/)
    })

    it('devuelve PDF vacío cuando no hay movimientos', async () => {
      prismaMock.movimiento.findMany.mockResolvedValue([])

      const res = await request(app)
        .get('/api/metricas/exportar-pdf')
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('application/pdf')
    })

    it('devuelve 401 sin autenticación', async () => {
      const res = await request(app).get('/api/metricas/exportar-pdf')
      expect(res.status).toBe(401)
    })
  })
})
