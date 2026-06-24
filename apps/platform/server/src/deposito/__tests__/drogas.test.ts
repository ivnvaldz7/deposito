import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

// drogas.ts no importa @platform/db (solo prisma local + middleware)

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

// ── Mocks ──────────────────────────────────────────────────────────────────────

interface DrogaMock {
  id: string
  nombre: string
  lote: string | null
  vencimiento: Date | null
  cantidad: number
}

const prismaMock = vi.hoisted(() => {
  let idCounter = 1
  const state: { drogas: DrogaMock[] } = { drogas: [] }

  function reset() {
    idCounter = 1
    state.drogas = []
  }

  return {
    state,
    reset,
    idCounter: () => idCounter++,
    inventarioDroga: {
      findMany: vi.fn(async ({ where, orderBy }: any = {}) => {
        let result = [...state.drogas]
        if (where?.nombre) {
          result = result.filter((d) => d.nombre === where.nombre)
        }
        if (where?.vencimiento?.lte) {
          result = result.filter((d) => d.vencimiento && d.vencimiento <= where.vencimiento.lte)
        }
        if (where?.cantidad?.gt != null) {
          result = result.filter((d) => d.cantidad > where.cantidad.gt)
        }
        // ordenar por nombre asc, vencimiento asc
        result.sort((a, b) => a.nombre.localeCompare(b.nombre) || (a.vencimiento?.getTime() ?? 0) - (b.vencimiento?.getTime() ?? 0))
        return result
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        return state.drogas.find((d) => {
          if (where?.nombre && d.nombre !== where.nombre) return false
          if (where?.lote !== undefined) {
            if (where.lote === null && d.lote !== null) return false
            if (where.lote !== null && d.lote !== where.lote) return false
          }
          return true
        }) ?? null
      }),
      create: vi.fn(async ({ data }: any) => {
        const droga: DrogaMock = {
          id: `droga-${idCounter++}`,
          nombre: data.nombre,
          lote: data.lote ?? null,
          vencimiento: data.vencimiento ?? null,
          cantidad: data.cantidad ?? 0,
        }
        state.drogas.push(droga)
        return droga
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const idx = state.drogas.findIndex((d) => d.id === where.id)
        if (idx === -1) {
          const err = new Error('Record not found')
          ;(err as any).code = 'P2025'
          throw err
        }
        state.drogas[idx] = { ...state.drogas[idx], ...data }
        if (data.vencimiento === null) state.drogas[idx].vencimiento = null
        if (data.lote === null) state.drogas[idx].lote = null
        return state.drogas[idx]
      }),
      delete: vi.fn(async ({ where }: any) => {
        const idx = state.drogas.findIndex((d) => d.id === where.id)
        if (idx === -1) {
          const err = new Error('Record not found')
          ;(err as any).code = 'P2025'
          throw err
        }
        state.drogas.splice(idx, 1)
      }),
    },
  }
})

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }))

import drogasRouter from '../routes/drogas'

describe('Drogas', () => {
  const app = createTestApp('/api/drogas', drogasRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.reset()
  })

  describe('GET /api/drogas', () => {
    it('devuelve lista vacía inicialmente', async () => {
      const res = await request(app)
        .get('/api/drogas')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('devuelve todas las drogas ordenadas', async () => {
      await prismaMock.inventarioDroga.create({ data: { nombre: 'IBUPROFENO', cantidad: 50 } })
      await prismaMock.inventarioDroga.create({ data: { nombre: 'ACETAMINOFEN', cantidad: 100 } })

      const res = await request(app)
        .get('/api/drogas')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
      expect(res.body[0].nombre).toBe('ACETAMINOFEN')
      expect(res.body[1].nombre).toBe('IBUPROFENO')
    })

    it('filtra por nombre', async () => {
      await prismaMock.inventarioDroga.create({ data: { nombre: 'IBUPROFENO', cantidad: 50 } })
      await prismaMock.inventarioDroga.create({ data: { nombre: 'ACETAMINOFEN', cantidad: 100 } })

      const res = await request(app)
        .get('/api/drogas?nombre=IBUPROFENO')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].nombre).toBe('IBUPROFENO')
    })

    it('devuelve 401 sin autenticación', async () => {
      const res = await request(app).get('/api/drogas')
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/drogas/por-vencer', () => {
    const futureDate = (daysFromNow: number): Date => {
      const d = new Date()
      d.setDate(d.getDate() + daysFromNow)
      return d
    }

    it('devuelve drogas próximas a vencer', async () => {
      await prismaMock.inventarioDroga.create({ data: { nombre: 'VENCE PRONTO', vencimiento: futureDate(10), cantidad: 50 } })
      await prismaMock.inventarioDroga.create({ data: { nombre: 'VENCE LEJOS', vencimiento: futureDate(200), cantidad: 50 } })

      const res = await request(app)
        .get('/api/drogas/por-vencer?dias=30')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].nombre).toBe('VENCE PRONTO')
    })

    it('excluye drogas con cantidad 0', async () => {
      await prismaMock.inventarioDroga.create({ data: { nombre: 'SIN STOCK', vencimiento: futureDate(5), cantidad: 0 } })

      const res = await request(app)
        .get('/api/drogas/por-vencer?dias=30')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(0)
    })

    it('clampa días entre 1 y 365', async () => {
      const res = await request(app)
        .get('/api/drogas/por-vencer?dias=999')
        .set('x-test-role', 'observador')
      expect(res.status).toBe(200)
    })
  })

  describe('POST /api/drogas', () => {
    it('crea una droga con datos válidos', async () => {
      const res = await request(app)
        .post('/api/drogas')
        .set('x-test-role', 'encargado')
        .send({ nombre: 'NUEVA DROGA', cantidad: 100 })

      expect(res.status).toBe(201)
      expect(res.body.nombre).toBe('NUEVA DROGA')
      expect(res.body.cantidad).toBe(100)
    })

    it('rechaza datos inválidos (nombre muy corto)', async () => {
      const res = await request(app)
        .post('/api/drogas')
        .set('x-test-role', 'encargado')
        .send({ nombre: 'A', cantidad: 10 })

      expect(res.status).toBe(400)
    })

    it('rechaza duplicado sin lote (app-level uniqueness)', async () => {
      await prismaMock.inventarioDroga.create({ data: { nombre: 'UNICA', cantidad: 50 } })

      const res = await request(app)
        .post('/api/drogas')
        .set('x-test-role', 'encargado')
        .send({ nombre: 'UNICA', cantidad: 100 })

      expect(res.status).toBe(409)
      expect(res.body.message).toContain('sin lote específico')
    })

    it('permite mismo nombre con distinto lote', async () => {
      await prismaMock.inventarioDroga.create({ data: { nombre: 'DROGA X', lote: 'LOTE001', cantidad: 50 } })

      const res = await request(app)
        .post('/api/drogas')
        .set('x-test-role', 'encargado')
        .send({ nombre: 'DROGA X', lote: 'LOTE002', cantidad: 30 })

      expect(res.status).toBe(201)
    })

    it('devuelve 403 con rol observador', async () => {
      const res = await request(app)
        .post('/api/drogas')
        .set('x-test-role', 'observador')
        .send({ nombre: 'TEST', cantidad: 10 })

      expect(res.status).toBe(403)
    })
  })

  describe('PUT /api/drogas/:id', () => {
    it('actualiza una droga existente', async () => {
      const created = await prismaMock.inventarioDroga.create({ data: { nombre: 'ORIGINAL', cantidad: 50 } })

      const res = await request(app)
        .put(`/api/drogas/${created.id}`)
        .set('x-test-role', 'encargado')
        .send({ nombre: 'ACTUALIZADO', cantidad: 100 })

      expect(res.status).toBe(200)
      expect(res.body.nombre).toBe('ACTUALIZADO')
      expect(res.body.cantidad).toBe(100)
    })

    it('devuelve 404 para id inexistente', async () => {
      const res = await request(app)
        .put('/api/drogas/no-existe')
        .set('x-test-role', 'encargado')
        .send({ nombre: 'TEST' })

      expect(res.status).toBe(404)
    })

    it('rechaza body vacío', async () => {
      const created = await prismaMock.inventarioDroga.create({ data: { nombre: 'TEST', cantidad: 10 } })

      const res = await request(app)
        .put(`/api/drogas/${created.id}`)
        .set('x-test-role', 'encargado')
        .send({})

      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /api/drogas/:id', () => {
    it('elimina una droga existente', async () => {
      const created = await prismaMock.inventarioDroga.create({ data: { nombre: 'A ELIMINAR', cantidad: 10 } })

      const res = await request(app)
        .delete(`/api/drogas/${created.id}`)
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(204)

      // Verificar que ya no existe
      const lista = await request(app)
        .get('/api/drogas')
        .set('x-test-role', 'observador')
      expect(lista.body).toHaveLength(0)
    })

    it('devuelve 404 para id inexistente', async () => {
      const res = await request(app)
        .delete('/api/drogas/no-existe')
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(404)
    })
  })
})
