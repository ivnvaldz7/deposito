import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

vi.mock('@platform/db', () => ({
  DepositoTipoMovimiento: {
    ingreso_acta: 'ingreso_acta',
    egreso_orden: 'egreso_orden',
    ajuste_manual: 'ajuste_manual',
  },
  default: {},
}))

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

interface MovimientoMock {
  id: string
  tipo: string
  productoNombre: string
  cantidad: number
  createdAt: Date
  user: { name: string }
}

const prismaMock = vi.hoisted(() => {
  let idCounter = 1
  const state: { movimientos: MovimientoMock[] } = {
    movimientos: [],
  }

  function reset() {
    idCounter = 1
    state.movimientos.length = 0
  }

  return {
    state,
    reset,
    movimiento: {
      findMany: vi.fn(async ({ where, take, orderBy, include }: any = {}) => {
        let result = [...state.movimientos]

        if (where) {
          if (where.tipo) {
            result = result.filter((m) => m.tipo === where.tipo)
          }
          if (where.productoNombre) {
            const searchTerm = (where.productoNombre.contains ?? '').toLowerCase()
            result = result.filter((m) => m.productoNombre.toLowerCase().includes(searchTerm))
          }
          if (where.createdAt) {
            if (where.createdAt.gte) result = result.filter((m) => m.createdAt >= where.createdAt.gte)
            if (where.createdAt.lte) result = result.filter((m) => m.createdAt <= where.createdAt.lte)
          }
        }

        if (orderBy?.createdAt === 'desc') {
          result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        }

        if (take) result = result.slice(0, take)

        if (include?.user?.select) {
          result = result.map((m) => ({ ...m, user: { name: m.user.name } }))
        }

        return result
      }),
    },
  }
})

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }))

import movimientosRouter from '../routes/movimientos'

describe('Movimientos', () => {
  const app = createTestApp('/api/movimientos', movimientosRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.reset()
  })

  describe('GET /api/movimientos', () => {
    it('lista todos los movimientos (limit 100)', async () => {
      prismaMock.state.movimientos.push(
        { id: 'm-1', tipo: 'ingreso_acta', productoNombre: 'IBUPROFENO', cantidad: 50, createdAt: new Date('2024-06-01'), user: { name: 'Usuario Test' } },
        { id: 'm-2', tipo: 'egreso_orden', productoNombre: 'ACETAMINOFEN', cantidad: 10, createdAt: new Date('2024-06-02'), user: { name: 'Usuario Test' } },
      )

      const res = await request(app)
        .get('/api/movimientos')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body).toHaveLength(2)
    })

    it('filtra por tipo ingreso_acta', async () => {
      prismaMock.state.movimientos.push(
        { id: 'm-1', tipo: 'ingreso_acta', productoNombre: 'IBUPROFENO', cantidad: 50, createdAt: new Date('2024-06-01'), user: { name: 'Usuario Test' } },
        { id: 'm-2', tipo: 'egreso_orden', productoNombre: 'ACETAMINOFEN', cantidad: 10, createdAt: new Date('2024-06-02'), user: { name: 'Usuario Test' } },
        { id: 'm-3', tipo: 'ingreso_acta', productoNombre: 'ATP', cantidad: 100, createdAt: new Date('2024-06-03'), user: { name: 'Usuario Test' } },
      )

      const res = await request(app)
        .get('/api/movimientos?tipo=ingreso_acta')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
      expect(res.body.every((m: any) => m.tipo === 'ingreso_acta')).toBe(true)
    })

    it('filtra por producto (case-insensitive)', async () => {
      prismaMock.state.movimientos.push(
        { id: 'm-1', tipo: 'ingreso_acta', productoNombre: 'IBUPROFENO', cantidad: 50, createdAt: new Date('2024-06-01'), user: { name: 'Usuario Test' } },
        { id: 'm-2', tipo: 'egreso_orden', productoNombre: 'ACETAMINOFEN', cantidad: 10, createdAt: new Date('2024-06-02'), user: { name: 'Usuario Test' } },
      )

      const res = await request(app)
        .get('/api/movimientos?producto=ibup')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].productoNombre).toBe('IBUPROFENO')
    })

    it('filtra por rango de fechas', async () => {
      prismaMock.state.movimientos.push(
        { id: 'm-1', tipo: 'ingreso_acta', productoNombre: 'IBUPROFENO', cantidad: 50, createdAt: new Date('2024-06-01'), user: { name: 'Usuario Test' } },
        { id: 'm-2', tipo: 'egreso_orden', productoNombre: 'ACETAMINOFEN', cantidad: 10, createdAt: new Date('2024-01-15'), user: { name: 'Usuario Test' } },
        { id: 'm-3', tipo: 'ajuste_manual', productoNombre: 'ATP', cantidad: 20, createdAt: new Date('2025-03-01'), user: { name: 'Usuario Test' } },
      )

      const res = await request(app)
        .get('/api/movimientos?desde=2024-01-01&hasta=2024-12-31')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
    })

    it('devuelve 401 sin auth', async () => {
      const res = await request(app).get('/api/movimientos')
      expect(res.status).toBe(401)
    })

    it('ignora tipo inválido y devuelve todos', async () => {
      prismaMock.state.movimientos.push(
        { id: 'm-1', tipo: 'ingreso_acta', productoNombre: 'IBUPROFENO', cantidad: 50, createdAt: new Date('2024-06-01'), user: { name: 'Usuario Test' } },
      )

      const res = await request(app)
        .get('/api/movimientos?tipo=tipo_invalido')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
    })
  })
})
