import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

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

interface FrascoMock {
  id: string
  articulo: string
  unidadesPorCaja: number
  cantidadCajas: number
  total: number
}

const prismaMock = vi.hoisted(() => {
  let idCounter = 1
  const state: { frascos: FrascoMock[] } = { frascos: [] }

  function reset() {
    idCounter = 1
    state.frascos = []
  }

  return {
    state,
    reset,
    inventarioFrasco: {
      findMany: vi.fn(async ({ orderBy }: any = {}) => {
        const result = [...state.frascos]
        if (orderBy?.articulo === 'asc') {
          result.sort((a, b) => a.articulo.localeCompare(b.articulo))
        }
        return result
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.articulo) return state.frascos.find((f) => f.articulo === where.articulo) ?? null
        if (where.id) return state.frascos.find((f) => f.id === where.id) ?? null
        return null
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        return state.frascos.find((f) => {
          if (where?.articulo && f.articulo !== where.articulo) return false
          if (where?.NOT?.id && f.id === where.NOT.id) return false
          return true
        }) ?? null
      }),
      create: vi.fn(async ({ data }: any) => {
        const frasco: FrascoMock = {
          id: `frasco-${idCounter++}`,
          articulo: data.articulo,
          unidadesPorCaja: data.unidadesPorCaja,
          cantidadCajas: data.cantidadCajas,
          total: data.total,
        }
        state.frascos.push(frasco)
        return frasco
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const idx = state.frascos.findIndex((f) => f.id === where.id)
        if (idx === -1) {
          const err = new Error('Record not found')
          ;(err as any).code = 'P2025'
          throw err
        }
        state.frascos[idx] = { ...state.frascos[idx], ...data }
        return state.frascos[idx]
      }),
      delete: vi.fn(async ({ where }: any) => {
        const idx = state.frascos.findIndex((f) => f.id === where.id)
        if (idx === -1) {
          const err = new Error('Record not found')
          ;(err as any).code = 'P2025'
          throw err
        }
        state.frascos.splice(idx, 1)
      }),
    },
  }
})

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }))

import frascosRouter from '../routes/frascos'

describe('Frascos', () => {
  const app = createTestApp('/api/frascos', frascosRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.reset()
  })

  describe('GET /api/frascos', () => {
    it('devuelve lista vacía inicialmente', async () => {
      const res = await request(app)
        .get('/api/frascos')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('devuelve frascos ordenados por articulo', async () => {
      await prismaMock.inventarioFrasco.create({
        data: { articulo: 'FRASCO B', unidadesPorCaja: 10, cantidadCajas: 5, total: 50 },
      })
      await prismaMock.inventarioFrasco.create({
        data: { articulo: 'FRASCO A', unidadesPorCaja: 20, cantidadCajas: 3, total: 60 },
      })

      const res = await request(app)
        .get('/api/frascos')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
      expect(res.body[0].articulo).toBe('FRASCO A')
      expect(res.body[1].articulo).toBe('FRASCO B')
    })

    it('devuelve 401 sin autenticación', async () => {
      const res = await request(app).get('/api/frascos')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/frascos', () => {
    it('crea un frasco con cálculo de total', async () => {
      const res = await request(app)
        .post('/api/frascos')
        .set('x-test-role', 'encargado')
        .send({ articulo: 'FRASCO NUEVO', unidadesPorCaja: 10, cantidadCajas: 5 })

      expect(res.status).toBe(201)
      expect(res.body.articulo).toBe('FRASCO NUEVO')
      expect(res.body.unidadesPorCaja).toBe(10)
      expect(res.body.cantidadCajas).toBe(5)
      expect(res.body.total).toBe(50)
    })

    it('rechaza datos inválidos', async () => {
      const res = await request(app)
        .post('/api/frascos')
        .set('x-test-role', 'encargado')
        .send({ articulo: 'A', unidadesPorCaja: -1, cantidadCajas: 0 })

      expect(res.status).toBe(400)
    })

    it('rechaza artículo duplicado', async () => {
      await prismaMock.inventarioFrasco.create({
        data: { articulo: 'DUPLICADO', unidadesPorCaja: 10, cantidadCajas: 5, total: 50 },
      })

      const res = await request(app)
        .post('/api/frascos')
        .set('x-test-role', 'encargado')
        .send({ articulo: 'DUPLICADO', unidadesPorCaja: 5, cantidadCajas: 2 })

      expect(res.status).toBe(409)
      expect(res.body.message).toBe('Ya existe ese artículo')
    })

    it('devuelve 403 con rol observador', async () => {
      const res = await request(app)
        .post('/api/frascos')
        .set('x-test-role', 'observador')
        .send({ articulo: 'TEST', unidadesPorCaja: 10, cantidadCajas: 5 })

      expect(res.status).toBe(403)
    })
  })

  describe('PUT /api/frascos/:id', () => {
    it('actualiza un frasco con recálculo de total', async () => {
      const created = await prismaMock.inventarioFrasco.create({
        data: { articulo: 'ORIGINAL', unidadesPorCaja: 10, cantidadCajas: 5, total: 50 },
      })

      const res = await request(app)
        .put(`/api/frascos/${created.id}`)
        .set('x-test-role', 'encargado')
        .send({ cantidadCajas: 10 })

      expect(res.status).toBe(200)
      expect(res.body.cantidadCajas).toBe(10)
      expect(res.body.total).toBe(100)
    })

    it('actualiza también con cambio de artículo y recálculo', async () => {
      const created = await prismaMock.inventarioFrasco.create({
        data: { articulo: 'VIEJO', unidadesPorCaja: 10, cantidadCajas: 5, total: 50 },
      })

      const res = await request(app)
        .put(`/api/frascos/${created.id}`)
        .set('x-test-role', 'encargado')
        .send({ articulo: 'NUEVO', unidadesPorCaja: 20 })

      expect(res.status).toBe(200)
      expect(res.body.articulo).toBe('NUEVO')
      expect(res.body.unidadesPorCaja).toBe(20)
      expect(res.body.total).toBe(100)
    })

    it('devuelve 404 para id inexistente', async () => {
      const res = await request(app)
        .put('/api/frascos/no-existe')
        .set('x-test-role', 'encargado')
        .send({ unidadesPorCaja: 10 })

      expect(res.status).toBe(404)
    })

    it('rechaza body vacío', async () => {
      const created = await prismaMock.inventarioFrasco.create({
        data: { articulo: 'TEST', unidadesPorCaja: 10, cantidadCajas: 5, total: 50 },
      })

      const res = await request(app)
        .put(`/api/frascos/${created.id}`)
        .set('x-test-role', 'encargado')
        .send({})

      expect(res.status).toBe(400)
    })

    it('rechaza artículo duplicado en actualización', async () => {
      const frasco1 = await prismaMock.inventarioFrasco.create({
        data: { articulo: 'FRASCO UNO', unidadesPorCaja: 10, cantidadCajas: 5, total: 50 },
      })
      await prismaMock.inventarioFrasco.create({
        data: { articulo: 'FRASCO DOS', unidadesPorCaja: 20, cantidadCajas: 3, total: 60 },
      })

      const res = await request(app)
        .put(`/api/frascos/${frasco1.id}`)
        .set('x-test-role', 'encargado')
        .send({ articulo: 'FRASCO DOS' })

      expect(res.status).toBe(409)
      expect(res.body.message).toBe('Ya existe un frasco con ese artículo')
    })

    it('devuelve 403 con rol observador', async () => {
      const created = await prismaMock.inventarioFrasco.create({
        data: { articulo: 'TEST', unidadesPorCaja: 10, cantidadCajas: 5, total: 50 },
      })

      const res = await request(app)
        .put(`/api/frascos/${created.id}`)
        .set('x-test-role', 'observador')
        .send({ cantidadCajas: 1 })

      expect(res.status).toBe(403)
    })
  })

  describe('DELETE /api/frascos/:id', () => {
    it('elimina un frasco existente', async () => {
      const created = await prismaMock.inventarioFrasco.create({
        data: { articulo: 'A ELIMINAR', unidadesPorCaja: 10, cantidadCajas: 5, total: 50 },
      })

      const res = await request(app)
        .delete(`/api/frascos/${created.id}`)
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(204)

      const lista = await request(app)
        .get('/api/frascos')
        .set('x-test-role', 'observador')
      expect(lista.body).toHaveLength(0)
    })

    it('devuelve 404 para id inexistente', async () => {
      const res = await request(app)
        .delete('/api/frascos/no-existe')
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(404)
    })

    it('devuelve 403 con rol observador', async () => {
      const res = await request(app)
        .delete('/api/frascos/alguna-id')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(403)
    })
  })
})
