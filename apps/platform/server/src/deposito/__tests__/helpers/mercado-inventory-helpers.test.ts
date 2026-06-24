import { describe, expect, it, vi } from 'vitest'
import { Router } from 'express'
import request from 'supertest'
import { createTestApp } from '../helpers/create-test-app'

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

vi.mock('../../middleware/auth', () => ({
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

vi.mock('../../middleware/require-role', () => ({
  requireRole:
    (...roles: string[]) =>
    (req: any, res: any, next: any) => {
      if (!req.depositoUser) {
        res.status(401).json({ message: 'No autenticado' })
        return
      }
      if (!roles.includes(req.depositoUser.role)) {
        res.status(403).json({ message: 'No autorizado' })
        return
      }
      next()
    },
}))

interface RecordMock {
  id: string
  articulo: string
  mercado: string
  cantidad: number
}

function buildMockOperations() {
  let idCounter = 1
  const state: RecordMock[] = []

  return {
    state,
    operations: {
      buildWhere: vi.fn((mercado?: string) => (mercado ? { mercado } : {})),
      findMany: vi.fn(async ({ where }: { where: any }) => {
        let result = [...state]
        if (where?.mercado) {
          result = result.filter((r) => r.mercado === where.mercado)
        }
        result.sort(
          (a, b) => a.mercado.localeCompare(b.mercado) || a.articulo.localeCompare(b.articulo),
        )
        return result
      }),
      findByComposite: vi.fn(async (articulo: string, mercado: string) => {
        return state.find((r) => r.articulo === articulo && r.mercado === mercado) ?? null
      }),
      findById: vi.fn(async (id: string) => {
        return state.find((r) => r.id === id) ?? null
      }),
      findConflict: vi.fn(async (articulo: string, mercado: string, id: string) => {
        return (
          state.find((r) => r.articulo === articulo && r.mercado === mercado && r.id !== id) ?? null
        )
      }),
      create: vi.fn(async (data: { articulo: string; mercado: string; cantidad: number }) => {
        const record: RecordMock = {
          id: `rec-${idCounter++}`,
          ...data,
        }
        state.push(record)
        return record
      }),
      update: vi.fn(async (id: string, data: Partial<RecordMock>) => {
        const idx = state.findIndex((r) => r.id === id)
        if (idx === -1) throw new Error('Not found')
        state[idx] = { ...state[idx], ...data }
        return state[idx]
      }),
      delete: vi.fn(async (id: string) => {
        const idx = state.findIndex((r) => r.id === id)
        if (idx === -1) throw new Error('Not found')
        state.splice(idx, 1)
      }),
    },
  }
}

import {
  parseCrearMercadoInventoryBody,
  parseEditarMercadoInventoryBody,
  resolveMercadoQuery,
  getMercadoInventoryOrderBy,
  hasMercadoInventoryConflict,
  resolveMercadoInventoryUpdate,
  buildMercadoInventoryUpdateData,
  registerMercadoInventoryRoutes,
  MERCADOS_VALIDOS,
} from '../../routes/shared/mercado-inventory-helpers'

describe('mercado-inventory-helpers', () => {
  describe('MERCADOS_VALIDOS', () => {
    it('contiene todos los mercados', () => {
      expect(MERCADOS_VALIDOS).toContain('argentina')
      expect(MERCADOS_VALIDOS).toContain('colombia')
      expect(MERCADOS_VALIDOS).toContain('mexico')
      expect(MERCADOS_VALIDOS).toContain('ecuador')
      expect(MERCADOS_VALIDOS).toContain('bolivia')
      expect(MERCADOS_VALIDOS).toContain('paraguay')
      expect(MERCADOS_VALIDOS).toContain('no_exportable')
    })
  })

  describe('parseCrearMercadoInventoryBody', () => {
    it('acepta datos válidos', () => {
      const result = parseCrearMercadoInventoryBody({
        articulo: 'TEST',
        mercado: 'argentina',
        cantidad: 10,
      })
      expect(result.success).toBe(true)
    })

    it('rechaza articulo muy corto', () => {
      const result = parseCrearMercadoInventoryBody({
        articulo: 'A',
        mercado: 'argentina',
        cantidad: 10,
      })
      expect(result.success).toBe(false)
    })

    it('rechaza mercado inválido', () => {
      const result = parseCrearMercadoInventoryBody({
        articulo: 'TEST',
        mercado: 'invalido',
        cantidad: 10,
      })
      expect(result.success).toBe(false)
    })

    it('rechaza cantidad negativa', () => {
      const result = parseCrearMercadoInventoryBody({
        articulo: 'TEST',
        mercado: 'argentina',
        cantidad: -1,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('parseEditarMercadoInventoryBody', () => {
    it('acepta datos parciales', () => {
      const result = parseEditarMercadoInventoryBody({ articulo: 'NUEVO' })
      expect(result.success).toBe(true)
    })

    it('rechaza body vacío', () => {
      const result = parseEditarMercadoInventoryBody({})
      expect(result.success).toBe(false)
    })

    it('rechaza mercado inválido', () => {
      const result = parseEditarMercadoInventoryBody({
        articulo: 'TEST',
        mercado: 'invalido',
        cantidad: 10,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('resolveMercadoQuery', () => {
    it('devuelve el mercado si es válido', () => {
      expect(resolveMercadoQuery('argentina')).toBe('argentina')
    })

    it('devuelve undefined si es inválido', () => {
      expect(resolveMercadoQuery('invalido')).toBeUndefined()
    })

    it('devuelve undefined si no es string', () => {
      expect(resolveMercadoQuery(123)).toBeUndefined()
      expect(resolveMercadoQuery(undefined)).toBeUndefined()
    })
  })

  describe('getMercadoInventoryOrderBy', () => {
    it('devuelve orden por mercado y articulo ascendente', () => {
      const orderBy = getMercadoInventoryOrderBy()
      expect(orderBy).toEqual([{ mercado: 'asc' }, { articulo: 'asc' }])
    })
  })

  describe('hasMercadoInventoryConflict', () => {
    it('devuelve true si existe combinación', async () => {
      const mock = buildMockOperations()
      await mock.operations.create({ articulo: 'EXISTE', mercado: 'argentina', cantidad: 10 })
      const result = await hasMercadoInventoryConflict(
        mock.operations.findByComposite,
        'EXISTE',
        'argentina',
      )
      expect(result).toBe(true)
    })

    it('devuelve false si no existe combinación', async () => {
      const mock = buildMockOperations()
      const result = await hasMercadoInventoryConflict(
        mock.operations.findByComposite,
        'NO EXISTE',
        'argentina',
      )
      expect(result).toBe(false)
    })
  })

  describe('resolveMercadoInventoryUpdate', () => {
    it('devuelve { existing: null } si no encuentra por id', async () => {
      const mock = buildMockOperations()
      const result = await resolveMercadoInventoryUpdate(
        mock.operations,
        'no-existe',
        { articulo: 'NUEVO' },
      )
      expect(result.existing).toBeNull()
      expect(result.hasConflict).toBe(false)
    })

    it('detecta conflicto si nuevo articulo+mercado ya existe', async () => {
      const mock = buildMockOperations()
      await mock.operations.create({ articulo: 'EXISTENTE', mercado: 'argentina', cantidad: 10 })
      const mine = await mock.operations.create({
        articulo: 'MIO',
        mercado: 'colombia',
        cantidad: 20,
      })
      const result = await resolveMercadoInventoryUpdate(
        mock.operations,
        mine.id,
        { articulo: 'EXISTENTE', mercado: 'argentina' },
      )
      expect(result.existing).not.toBeNull()
      expect(result.hasConflict).toBe(true)
    })

    it('no detecta conflicto si es el mismo registro', async () => {
      const mock = buildMockOperations()
      const mine = await mock.operations.create({
        articulo: 'UNICO',
        mercado: 'argentina',
        cantidad: 10,
      })
      const result = await resolveMercadoInventoryUpdate(
        mock.operations,
        mine.id,
        { cantidad: 50 },
      )
      expect(result.existing).not.toBeNull()
      expect(result.hasConflict).toBe(false)
    })
  })

  describe('buildMercadoInventoryUpdateData', () => {
    it('solo incluye campos definidos', () => {
      const data = buildMercadoInventoryUpdateData({ articulo: 'NUEVO', cantidad: 99 })
      expect(data).toEqual({ articulo: 'NUEVO', cantidad: 99 })
      expect(data).not.toHaveProperty('mercado')
    })

    it('devuelve objeto vacío si no hay campos', () => {
      const data = buildMercadoInventoryUpdateData({})
      expect(data).toEqual({})
    })
  })

  describe('registerMercadoInventoryRoutes', () => {
    it('registra rutas GET, POST, PUT, DELETE en el router', () => {
      const router = Router()
      const spyGet = vi.spyOn(router, 'get')
      const spyPost = vi.spyOn(router, 'post')
      const spyPut = vi.spyOn(router, 'put')
      const spyDelete = vi.spyOn(router, 'delete')

      const mock = buildMockOperations()
      registerMercadoInventoryRoutes({
        router,
        operations: mock.operations,
        messages: { conflict: 'Conflicto', notFound: 'No encontrado' },
      })

      expect(spyGet).toHaveBeenCalledTimes(1)
      expect(spyPost).toHaveBeenCalledTimes(1)
      expect(spyPut).toHaveBeenCalledTimes(1)
      expect(spyDelete).toHaveBeenCalledTimes(1)
    })

    describe('GET /', () => {
      it('devuelve lista vacía', async () => {
        const router = Router()
        const mock = buildMockOperations()
        registerMercadoInventoryRoutes({
          router,
          operations: mock.operations,
          messages: { conflict: 'c', notFound: 'n' },
        })
        const app = createTestApp('/api/test', router)

        const res = await request(app)
          .get('/api/test')
          .set('x-test-role', 'observador')

        expect(res.status).toBe(200)
        expect(res.body).toEqual([])
      })
    })

    describe('POST /', () => {
      it('crea un registro', async () => {
        const router = Router()
        const mock = buildMockOperations()
        registerMercadoInventoryRoutes({
          router,
          operations: mock.operations,
          messages: { conflict: 'Conflicto', notFound: 'No encontrado' },
        })
        const app = createTestApp('/api/test', router)

        const res = await request(app)
          .post('/api/test')
          .set('x-test-role', 'encargado')
          .send({ articulo: 'NUEVO', mercado: 'argentina', cantidad: 10 })

        expect(res.status).toBe(201)
        expect(res.body.articulo).toBe('NUEVO')
        expect(res.body.cantidad).toBe(10)
      })

      it('rechaza duplicado', async () => {
        const router = Router()
        const mock = buildMockOperations()
        registerMercadoInventoryRoutes({
          router,
          operations: mock.operations,
          messages: { conflict: 'Ya existe', notFound: 'No encontrado' },
        })
        const app = createTestApp('/api/test', router)

        await mock.operations.create({ articulo: 'UNICO', mercado: 'argentina', cantidad: 5 })

        const res = await request(app)
          .post('/api/test')
          .set('x-test-role', 'encargado')
          .send({ articulo: 'UNICO', mercado: 'argentina', cantidad: 10 })

        expect(res.status).toBe(409)
        expect(res.body.message).toBe('Ya existe')
      })
    })

    describe('PUT /:id', () => {
      it('actualiza un registro existente', async () => {
        const router = Router()
        const mock = buildMockOperations()
        registerMercadoInventoryRoutes({
          router,
          operations: mock.operations,
          messages: { conflict: 'c', notFound: 'n' },
        })
        const app = createTestApp('/api/test', router)

        const created = await mock.operations.create({
          articulo: 'ORIGINAL',
          mercado: 'argentina',
          cantidad: 10,
        })

        const res = await request(app)
          .put(`/api/test/${created.id}`)
          .set('x-test-role', 'encargado')
          .send({ articulo: 'ACTUALIZADO', cantidad: 99 })

        expect(res.status).toBe(200)
        expect(res.body.articulo).toBe('ACTUALIZADO')
        expect(res.body.cantidad).toBe(99)
      })

      it('devuelve 404 para id inexistente', async () => {
        const router = Router()
        const mock = buildMockOperations()
        registerMercadoInventoryRoutes({
          router,
          operations: mock.operations,
          messages: { conflict: 'c', notFound: 'No encontrado' },
        })
        const app = createTestApp('/api/test', router)

        const res = await request(app)
          .put('/api/test/no-existe')
          .set('x-test-role', 'encargado')
          .send({ articulo: 'TEST', mercado: 'argentina', cantidad: 10 })

        expect(res.status).toBe(404)
      })
    })

    describe('DELETE /:id', () => {
      it('elimina un registro existente', async () => {
        const router = Router()
        const mock = buildMockOperations()
        registerMercadoInventoryRoutes({
          router,
          operations: mock.operations,
          messages: { conflict: 'c', notFound: 'n' },
        })
        const app = createTestApp('/api/test', router)

        const created = await mock.operations.create({
          articulo: 'A ELIMINAR',
          mercado: 'argentina',
          cantidad: 10,
        })

        const res = await request(app)
          .delete(`/api/test/${created.id}`)
          .set('x-test-role', 'encargado')

        expect(res.status).toBe(204)
        expect(mock.state).toHaveLength(0)
      })

      it('devuelve 404 para id inexistente', async () => {
        const router = Router()
        const mock = buildMockOperations()
        registerMercadoInventoryRoutes({
          router,
          operations: mock.operations,
          messages: { conflict: 'c', notFound: 'No encontrado' },
        })
        const app = createTestApp('/api/test', router)

        const res = await request(app)
          .delete('/api/test/no-existe')
          .set('x-test-role', 'encargado')

        expect(res.status).toBe(404)
      })
    })
  })
})
