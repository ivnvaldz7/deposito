import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

vi.mock('@platform/db', () => ({
  Mercado: {
    argentina: 'argentina',
    colombia: 'colombia',
    mexico: 'mexico',
    ecuador: 'ecuador',
    bolivia: 'bolivia',
    paraguay: 'paraguay',
    no_exportable: 'no_exportable',
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

interface EstucheMock {
  id: string
  articulo: string
  mercado: string
  cantidad: number
}

const prismaMock = vi.hoisted(() => {
  let idCounter = 1
  const state: { estuches: EstucheMock[] } = { estuches: [] }

  function reset() {
    idCounter = 1
    state.estuches = []
  }

  return {
    state,
    reset,
    inventarioEstuche: {
      findMany: vi.fn(async ({ where }: any = {}) => {
        let result = [...state.estuches]
        if (where?.mercado) {
          result = result.filter((e) => e.mercado === where.mercado)
        }
        result.sort(
          (a, b) => a.mercado.localeCompare(b.mercado) || a.articulo.localeCompare(b.articulo),
        )
        return result
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        if (where?.id) {
          return state.estuches.find((e) => e.id === where.id) ?? null
        }
        if (where?.articulo_mercado) {
          return (
            state.estuches.find(
              (e) =>
                e.articulo === where.articulo_mercado.articulo &&
                e.mercado === where.articulo_mercado.mercado,
            ) ?? null
          )
        }
        return null
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        return (
          state.estuches.find((e) => {
            if (where?.articulo && e.articulo !== where.articulo) return false
            if (where?.mercado && e.mercado !== where.mercado) return false
            if (where?.NOT?.id && e.id === where.NOT.id) return false
            return true
          }) ?? null
        )
      }),
      create: vi.fn(async ({ data }: any) => {
        const estuche: EstucheMock = {
          id: `estuche-${idCounter++}`,
          articulo: data.articulo,
          mercado: data.mercado,
          cantidad: data.cantidad,
        }
        state.estuches.push(estuche)
        return estuche
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const idx = state.estuches.findIndex((e) => e.id === where.id)
        if (idx === -1) {
          const err = new Error('Record not found')
          ;(err as any).code = 'P2025'
          throw err
        }
        state.estuches[idx] = { ...state.estuches[idx], ...data }
        return state.estuches[idx]
      }),
      delete: vi.fn(async ({ where }: any) => {
        const idx = state.estuches.findIndex((e) => e.id === where.id)
        if (idx === -1) {
          const err = new Error('Record not found')
          ;(err as any).code = 'P2025'
          throw err
        }
        state.estuches.splice(idx, 1)
      }),
    },
  }
})

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }))

import estuchesRouter from '../routes/estuches'

async function crearEstuche(articulo: string, mercado: string, cantidad: number) {
  return prismaMock.inventarioEstuche.create({ data: { articulo, mercado, cantidad } })
}

describe('Estuches', () => {
  const app = createTestApp('/api/estuches', estuchesRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.reset()
  })

  describe('GET /api/estuches', () => {
    it('devuelve lista vacía inicialmente', async () => {
      const res = await request(app)
        .get('/api/estuches')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('devuelve todos los estuches ordenados', async () => {
      await crearEstuche('ESTUCHE B', 'argentina', 10)
      await crearEstuche('ESTUCHE A', 'argentina', 20)

      const res = await request(app)
        .get('/api/estuches')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
      expect(res.body[0].articulo).toBe('ESTUCHE A')
      expect(res.body[1].articulo).toBe('ESTUCHE B')
    })

    it('filtra por mercado', async () => {
      await crearEstuche('ARG', 'argentina', 10)
      await crearEstuche('COL', 'colombia', 20)

      const res = await request(app)
        .get('/api/estuches?mercado=argentina')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].articulo).toBe('ARG')
    })

    it('devuelve 401 sin autenticación', async () => {
      const res = await request(app).get('/api/estuches')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/estuches', () => {
    it('crea un estuche con datos válidos', async () => {
      const res = await request(app)
        .post('/api/estuches')
        .set('x-test-role', 'encargado')
        .send({ articulo: 'NUEVO ESTUCHE', mercado: 'argentina', cantidad: 50 })

      expect(res.status).toBe(201)
      expect(res.body.articulo).toBe('NUEVO ESTUCHE')
      expect(res.body.mercado).toBe('argentina')
      expect(res.body.cantidad).toBe(50)
    })

    it('rechaza datos inválidos (articulo muy corto)', async () => {
      const res = await request(app)
        .post('/api/estuches')
        .set('x-test-role', 'encargado')
        .send({ articulo: 'A', mercado: 'argentina', cantidad: 10 })

      expect(res.status).toBe(400)
    })

    it('rechaza duplicado (mismo artículo + mercado)', async () => {
      await crearEstuche('UNICO', 'argentina', 50)

      const res = await request(app)
        .post('/api/estuches')
        .set('x-test-role', 'encargado')
        .send({ articulo: 'UNICO', mercado: 'argentina', cantidad: 100 })

      expect(res.status).toBe(409)
      expect(res.body.message).toBe('Ya existe ese artículo para ese mercado')
    })

    it('permite mismo artículo en distinto mercado', async () => {
      await crearEstuche('COMUN', 'argentina', 10)

      const res = await request(app)
        .post('/api/estuches')
        .set('x-test-role', 'encargado')
        .send({ articulo: 'COMUN', mercado: 'colombia', cantidad: 20 })

      expect(res.status).toBe(201)
    })

    it('devuelve 403 con rol observador', async () => {
      const res = await request(app)
        .post('/api/estuches')
        .set('x-test-role', 'observador')
        .send({ articulo: 'TEST', mercado: 'argentina', cantidad: 10 })

      expect(res.status).toBe(403)
    })

    it('rechaza mercado inválido', async () => {
      const res = await request(app)
        .post('/api/estuches')
        .set('x-test-role', 'encargado')
        .send({ articulo: 'TEST', mercado: 'invalido', cantidad: 10 })

      expect(res.status).toBe(400)
    })
  })

  describe('PUT /api/estuches/:id', () => {
    it('actualiza un estuche existente', async () => {
      const created = await crearEstuche('ORIGINAL', 'argentina', 50)

      const res = await request(app)
        .put(`/api/estuches/${created.id}`)
        .set('x-test-role', 'encargado')
        .send({ articulo: 'ACTUALIZADO', cantidad: 100 })

      expect(res.status).toBe(200)
      expect(res.body.articulo).toBe('ACTUALIZADO')
      expect(res.body.cantidad).toBe(100)
    })

    it('devuelve 404 para id inexistente', async () => {
      const res = await request(app)
        .put('/api/estuches/no-existe')
        .set('x-test-role', 'encargado')
        .send({ articulo: 'TEST', mercado: 'argentina', cantidad: 10 })

      expect(res.status).toBe(404)
    })

    it('rechaza body vacío', async () => {
      const created = await crearEstuche('TEST', 'argentina', 10)

      const res = await request(app)
        .put(`/api/estuches/${created.id}`)
        .set('x-test-role', 'encargado')
        .send({})

      expect(res.status).toBe(400)
    })

    it('detecta conflicto al cambiar a artículo+mercado existente', async () => {
      await crearEstuche('EXISTENTE', 'argentina', 10)
      const created = await crearEstuche('A CAMBIAR', 'colombia', 20)

      const res = await request(app)
        .put(`/api/estuches/${created.id}`)
        .set('x-test-role', 'encargado')
        .send({ articulo: 'EXISTENTE', mercado: 'argentina' })

      expect(res.status).toBe(409)
      expect(res.body.message).toBe('Ya existe ese artículo para ese mercado')
    })
  })

  describe('DELETE /api/estuches/:id', () => {
    it('elimina un estuche existente', async () => {
      const created = await crearEstuche('A ELIMINAR', 'argentina', 10)

      const res = await request(app)
        .delete(`/api/estuches/${created.id}`)
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(204)

      const lista = await request(app)
        .get('/api/estuches')
        .set('x-test-role', 'observador')
      expect(lista.body).toHaveLength(0)
    })

    it('devuelve 404 para id inexistente', async () => {
      const res = await request(app)
        .delete('/api/estuches/no-existe')
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(404)
    })

    it('devuelve 403 con rol observador', async () => {
      const res = await request(app)
        .delete('/api/estuches/alguna-id')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(403)
    })
  })
})
