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

interface EtiquetaMock {
  id: string
  articulo: string
  mercado: string
  cantidad: number
}

const prismaMock = vi.hoisted(() => {
  let idCounter = 1
  const state: { etiquetas: EtiquetaMock[] } = { etiquetas: [] }

  function reset() {
    idCounter = 1
    state.etiquetas = []
  }

  return {
    state,
    reset,
    inventarioEtiqueta: {
      findMany: vi.fn(async ({ where }: any = {}) => {
        let result = [...state.etiquetas]
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
          return state.etiquetas.find((e) => e.id === where.id) ?? null
        }
        if (where?.articulo_mercado) {
          return (
            state.etiquetas.find(
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
          state.etiquetas.find((e) => {
            if (where?.articulo && e.articulo !== where.articulo) return false
            if (where?.mercado && e.mercado !== where.mercado) return false
            if (where?.NOT?.id && e.id === where.NOT.id) return false
            return true
          }) ?? null
        )
      }),
      create: vi.fn(async ({ data }: any) => {
        const etiqueta: EtiquetaMock = {
          id: `etiqueta-${idCounter++}`,
          articulo: data.articulo,
          mercado: data.mercado,
          cantidad: data.cantidad,
        }
        state.etiquetas.push(etiqueta)
        return etiqueta
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const idx = state.etiquetas.findIndex((e) => e.id === where.id)
        if (idx === -1) {
          const err = new Error('Record not found')
          ;(err as any).code = 'P2025'
          throw err
        }
        state.etiquetas[idx] = { ...state.etiquetas[idx], ...data }
        return state.etiquetas[idx]
      }),
      delete: vi.fn(async ({ where }: any) => {
        const idx = state.etiquetas.findIndex((e) => e.id === where.id)
        if (idx === -1) {
          const err = new Error('Record not found')
          ;(err as any).code = 'P2025'
          throw err
        }
        state.etiquetas.splice(idx, 1)
      }),
    },
  }
})

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }))

import etiquetasRouter from '../routes/etiquetas'

async function crearEtiqueta(articulo: string, mercado: string, cantidad: number) {
  return prismaMock.inventarioEtiqueta.create({ data: { articulo, mercado, cantidad } })
}

describe('Etiquetas', () => {
  const app = createTestApp('/api/etiquetas', etiquetasRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.reset()
  })

  describe('GET /api/etiquetas', () => {
    it('devuelve lista vacía inicialmente', async () => {
      const res = await request(app)
        .get('/api/etiquetas')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('devuelve todas las etiquetas ordenadas', async () => {
      await crearEtiqueta('ETIQUETA B', 'argentina', 10)
      await crearEtiqueta('ETIQUETA A', 'argentina', 20)

      const res = await request(app)
        .get('/api/etiquetas')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
      expect(res.body[0].articulo).toBe('ETIQUETA A')
      expect(res.body[1].articulo).toBe('ETIQUETA B')
    })

    it('filtra por mercado', async () => {
      await crearEtiqueta('ARG', 'argentina', 10)
      await crearEtiqueta('COL', 'colombia', 20)

      const res = await request(app)
        .get('/api/etiquetas?mercado=argentina')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].articulo).toBe('ARG')
    })

    it('devuelve 401 sin autenticación', async () => {
      const res = await request(app).get('/api/etiquetas')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/etiquetas', () => {
    it('crea una etiqueta con datos válidos', async () => {
      const res = await request(app)
        .post('/api/etiquetas')
        .set('x-test-role', 'encargado')
        .send({ articulo: 'NUEVA ETIQUETA', mercado: 'argentina', cantidad: 50 })

      expect(res.status).toBe(201)
      expect(res.body.articulo).toBe('NUEVA ETIQUETA')
      expect(res.body.mercado).toBe('argentina')
      expect(res.body.cantidad).toBe(50)
    })

    it('rechaza datos inválidos (articulo muy corto)', async () => {
      const res = await request(app)
        .post('/api/etiquetas')
        .set('x-test-role', 'encargado')
        .send({ articulo: 'A', mercado: 'argentina', cantidad: 10 })

      expect(res.status).toBe(400)
    })

    it('rechaza duplicado (mismo artículo + mercado)', async () => {
      await crearEtiqueta('UNICA', 'argentina', 50)

      const res = await request(app)
        .post('/api/etiquetas')
        .set('x-test-role', 'encargado')
        .send({ articulo: 'UNICA', mercado: 'argentina', cantidad: 100 })

      expect(res.status).toBe(409)
      expect(res.body.message).toBe('Ya existe esa etiqueta para ese mercado')
    })

    it('permite mismo artículo en distinto mercado', async () => {
      await crearEtiqueta('COMUN', 'argentina', 10)

      const res = await request(app)
        .post('/api/etiquetas')
        .set('x-test-role', 'encargado')
        .send({ articulo: 'COMUN', mercado: 'colombia', cantidad: 20 })

      expect(res.status).toBe(201)
    })

    it('devuelve 403 con rol observador', async () => {
      const res = await request(app)
        .post('/api/etiquetas')
        .set('x-test-role', 'observador')
        .send({ articulo: 'TEST', mercado: 'argentina', cantidad: 10 })

      expect(res.status).toBe(403)
    })

    it('rechaza mercado inválido', async () => {
      const res = await request(app)
        .post('/api/etiquetas')
        .set('x-test-role', 'encargado')
        .send({ articulo: 'TEST', mercado: 'invalido', cantidad: 10 })

      expect(res.status).toBe(400)
    })
  })

  describe('PUT /api/etiquetas/:id', () => {
    it('actualiza una etiqueta existente', async () => {
      const created = await crearEtiqueta('ORIGINAL', 'argentina', 50)

      const res = await request(app)
        .put(`/api/etiquetas/${created.id}`)
        .set('x-test-role', 'encargado')
        .send({ articulo: 'ACTUALIZADO', cantidad: 100 })

      expect(res.status).toBe(200)
      expect(res.body.articulo).toBe('ACTUALIZADO')
      expect(res.body.cantidad).toBe(100)
    })

    it('devuelve 404 para id inexistente', async () => {
      const res = await request(app)
        .put('/api/etiquetas/no-existe')
        .set('x-test-role', 'encargado')
        .send({ articulo: 'TEST', mercado: 'argentina', cantidad: 10 })

      expect(res.status).toBe(404)
    })

    it('rechaza body vacío', async () => {
      const created = await crearEtiqueta('TEST', 'argentina', 10)

      const res = await request(app)
        .put(`/api/etiquetas/${created.id}`)
        .set('x-test-role', 'encargado')
        .send({})

      expect(res.status).toBe(400)
    })

    it('detecta conflicto al cambiar a artículo+mercado existente', async () => {
      await crearEtiqueta('EXISTENTE', 'argentina', 10)
      const created = await crearEtiqueta('A CAMBIAR', 'colombia', 20)

      const res = await request(app)
        .put(`/api/etiquetas/${created.id}`)
        .set('x-test-role', 'encargado')
        .send({ articulo: 'EXISTENTE', mercado: 'argentina' })

      expect(res.status).toBe(409)
      expect(res.body.message).toBe('Ya existe esa etiqueta para ese mercado')
    })
  })

  describe('DELETE /api/etiquetas/:id', () => {
    it('elimina una etiqueta existente', async () => {
      const created = await crearEtiqueta('A ELIMINAR', 'argentina', 10)

      const res = await request(app)
        .delete(`/api/etiquetas/${created.id}`)
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(204)

      const lista = await request(app)
        .get('/api/etiquetas')
        .set('x-test-role', 'observador')
      expect(lista.body).toHaveLength(0)
    })

    it('devuelve 404 para id inexistente', async () => {
      const res = await request(app)
        .delete('/api/etiquetas/no-existe')
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(404)
    })

    it('devuelve 403 con rol observador', async () => {
      const res = await request(app)
        .delete('/api/etiquetas/alguna-id')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(403)
    })
  })
})
