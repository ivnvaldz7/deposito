import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

vi.mock('@platform/db', () => ({
  EstadoPendiente: {
    en_esterilizacion: 'en_esterilizacion',
    recibido: 'recibido',
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

const prismaMock = vi.hoisted(() => {
  let idCounter = 1
  const state: { pendientes: any[] } = { pendientes: [] }

  function reset() {
    idCounter = 1
    state.pendientes = []
  }

  const nextId = () => `pendiente-${idCounter++}`

  return {
    state,
    reset,
    insumoPendiente: {
      findMany: vi.fn(async ({ where, orderBy }: any = {}) => {
        let result = [...state.pendientes]
        if (where?.estado) result = result.filter((p: any) => p.estado === where.estado)
        if (orderBy?.fechaEnvio === 'desc') result.sort((a: any, b: any) => b.fechaEnvio - a.fechaEnvio)
        return result
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        return state.pendientes.find((p: any) => p.id === where.id) ?? null
      }),
      create: vi.fn(async ({ data }: any) => {
        const item: any = {
          id: nextId(),
          articulo: data.articulo,
          cantidad: data.cantidad,
          destino: data.destino,
          estado: data.estado ?? 'en_esterilizacion',
          fechaEnvio: data.fechaEnvio,
          fechaRetornoEstimada: data.fechaRetornoEstimada ?? null,
          notas: data.notas ?? null,
          createdBy: data.createdBy,
          fechaRecibido: data.fechaRecibido ?? null,
          categoria: data.categoria ?? null,
          user: { name: 'Usuario Test' },
        }
        state.pendientes.push(item)
        return item
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const idx = state.pendientes.findIndex((p: any) => p.id === where.id)
        if (idx === -1) {
          const err = new Error('Record not found')
          ;(err as any).code = 'P2025'
          throw err
        }
        state.pendientes[idx] = { ...state.pendientes[idx], ...data }
        return state.pendientes[idx]
      }),
    },
    $transaction: vi.fn(async (fn: any) => {
      return fn(prismaMock)
    }),
  }
})

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }))

import pendientesRouter from '../routes/pendientes'

describe('Pendientes', () => {
  const app = createTestApp('/api/pendientes', pendientesRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.reset()
  })

  describe('GET /api/pendientes', () => {
    it('devuelve lista vacía inicialmente', async () => {
      const res = await request(app)
        .get('/api/pendientes')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('devuelve todos los pendientes', async () => {
      await prismaMock.insumoPendiente.create({
        data: { articulo: 'INSUMO A', cantidad: 10, destino: 'QUIROFANO 1', fechaEnvio: new Date('2024-01-15'), createdBy: 'enc-1' },
      })
      await prismaMock.insumoPendiente.create({
        data: { articulo: 'INSUMO B', cantidad: 20, destino: 'QUIROFANO 2', fechaEnvio: new Date('2024-01-10'), createdBy: 'enc-1' },
      })

      const res = await request(app)
        .get('/api/pendientes')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
    })

    it('filtra por estado', async () => {
      await prismaMock.insumoPendiente.create({
        data: { articulo: 'A', cantidad: 10, destino: 'D1', fechaEnvio: new Date(), createdBy: 'enc-1', estado: 'en_esterilizacion' },
      })
      await prismaMock.insumoPendiente.create({
        data: { articulo: 'B', cantidad: 10, destino: 'D2', fechaEnvio: new Date(), createdBy: 'enc-1', estado: 'recibido' },
      })

      const res = await request(app)
        .get('/api/pendientes?estado=en_esterilizacion')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].articulo).toBe('A')
    })

    it('ignora filtro con estado inválido', async () => {
      await prismaMock.insumoPendiente.create({
        data: { articulo: 'A', cantidad: 10, destino: 'D1', fechaEnvio: new Date(), createdBy: 'enc-1' },
      })
      await prismaMock.insumoPendiente.create({
        data: { articulo: 'B', cantidad: 10, destino: 'D2', fechaEnvio: new Date(), createdBy: 'enc-1' },
      })

      const res = await request(app)
        .get('/api/pendientes?estado=invalido')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
    })

    it('devuelve 401 sin autenticación', async () => {
      const res = await request(app).get('/api/pendientes')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/pendientes', () => {
    it('crea un pendiente con datos válidos', async () => {
      const res = await request(app)
        .post('/api/pendientes')
        .set('x-test-role', 'encargado')
        .send({
          articulo: 'INSUMO NUEVO',
          cantidad: 50,
          destino: 'QUIROFANO 3',
          fechaEnvio: '2024-02-01',
        })

      expect(res.status).toBe(201)
      expect(res.body.articulo).toBe('INSUMO NUEVO')
      expect(res.body.cantidad).toBe(50)
      expect(res.body.estado).toBe('en_esterilizacion')
      expect(res.body.user.name).toBe('Usuario Test')
    })

    it('crea con fechaRetornoEstimada y notas', async () => {
      const res = await request(app)
        .post('/api/pendientes')
        .set('x-test-role', 'encargado')
        .send({
          articulo: 'CON RETORNO',
          cantidad: 30,
          destino: 'ESTERILIZACION',
          fechaEnvio: '2024-03-01',
          fechaRetornoEstimada: '2024-03-15',
          notas: 'Urgente',
        })

      expect(res.status).toBe(201)
      expect(res.body.fechaRetornoEstimada).toBeTruthy()
      expect(res.body.notas).toBe('Urgente')
    })

    it('rechaza fecha inválida (no YYYY-MM-DD)', async () => {
      const res = await request(app)
        .post('/api/pendientes')
        .set('x-test-role', 'encargado')
        .send({
          articulo: 'TEST',
          cantidad: 10,
          destino: 'DESTINO',
          fechaEnvio: '01-02-2024',
        })

      expect(res.status).toBe(400)
    })

    it('rechaza datos inválidos (articulo muy corto)', async () => {
      const res = await request(app)
        .post('/api/pendientes')
        .set('x-test-role', 'encargado')
        .send({
          articulo: 'A',
          cantidad: 10,
          destino: 'DESTINO',
          fechaEnvio: '2024-01-01',
        })

      expect(res.status).toBe(400)
    })

    it('devuelve 403 con rol observador', async () => {
      const res = await request(app)
        .post('/api/pendientes')
        .set('x-test-role', 'observador')
        .send({
          articulo: 'TEST',
          cantidad: 10,
          destino: 'DESTINO',
          fechaEnvio: '2024-01-01',
        })

      expect(res.status).toBe(403)
    })
  })

  describe('PUT /api/pendientes/:id', () => {
    it('actualiza un pendiente existente', async () => {
      const created = await prismaMock.insumoPendiente.create({
        data: { articulo: 'ORIGINAL', cantidad: 100, destino: 'QUIROFANO', fechaEnvio: new Date('2024-01-01'), createdBy: 'enc-1' },
      })

      const res = await request(app)
        .put(`/api/pendientes/${created.id}`)
        .set('x-test-role', 'encargado')
        .send({ cantidad: 200 })

      expect(res.status).toBe(200)
      expect(res.body.cantidad).toBe(200)
    })

    it('actualiza múltiples campos', async () => {
      const created = await prismaMock.insumoPendiente.create({
        data: { articulo: 'ORIGINAL', cantidad: 100, destino: 'QUIROFANO', fechaEnvio: new Date('2024-01-01'), createdBy: 'enc-1' },
      })

      const res = await request(app)
        .put(`/api/pendientes/${created.id}`)
        .set('x-test-role', 'encargado')
        .send({ articulo: 'NUEVO', destino: 'OTRO', notas: 'Nota nueva' })

      expect(res.status).toBe(200)
      expect(res.body.articulo).toBe('NUEVO')
      expect(res.body.destino).toBe('OTRO')
      expect(res.body.notas).toBe('Nota nueva')
    })

    it('devuelve 404 para id inexistente', async () => {
      const res = await request(app)
        .put('/api/pendientes/no-existe')
        .set('x-test-role', 'encargado')
        .send({ cantidad: 50 })

      expect(res.status).toBe(404)
    })

    it('rechaza body vacío', async () => {
      const created = await prismaMock.insumoPendiente.create({
        data: { articulo: 'TEST', cantidad: 10, destino: 'DESTINO', fechaEnvio: new Date(), createdBy: 'enc-1' },
      })

      const res = await request(app)
        .put(`/api/pendientes/${created.id}`)
        .set('x-test-role', 'encargado')
        .send({})

      expect(res.status).toBe(400)
    })

    it('devuelve 403 con rol observador', async () => {
      const created = await prismaMock.insumoPendiente.create({
        data: { articulo: 'TEST', cantidad: 10, destino: 'DESTINO', fechaEnvio: new Date(), createdBy: 'enc-1' },
      })

      const res = await request(app)
        .put(`/api/pendientes/${created.id}`)
        .set('x-test-role', 'observador')
        .send({ cantidad: 5 })

      expect(res.status).toBe(403)
    })
  })

  describe('PUT /api/pendientes/:id/recibir', () => {
    it('recibe cantidad completa (sin split)', async () => {
      const created = await prismaMock.insumoPendiente.create({
        data: { articulo: 'INSUMO', cantidad: 50, destino: 'QUIROFANO', fechaEnvio: new Date('2024-01-01'), createdBy: 'enc-1' },
      })

      const res = await request(app)
        .put(`/api/pendientes/${created.id}/recibir`)
        .set('x-test-role', 'encargado')
        .send({ cantidadRecibida: 50 })

      expect(res.status).toBe(200)
      expect(res.body.recibido.estado).toBe('recibido')
      expect(res.body.recibido.cantidad).toBe(50)
      expect(res.body.recibido.fechaRecibido).toBeTruthy()
      expect(res.body.pendienteRestante).toBeNull()
    })

    it('crea split si recibe menos de lo enviado', async () => {
      const created = await prismaMock.insumoPendiente.create({
        data: { articulo: 'INSUMO SPLIT', cantidad: 100, destino: 'QUIROFANO', fechaEnvio: new Date('2024-01-01'), createdBy: 'enc-1' },
      })

      const res = await request(app)
        .put(`/api/pendientes/${created.id}/recibir`)
        .set('x-test-role', 'encargado')
        .send({ cantidadRecibida: 40 })

      expect(res.status).toBe(200)
      expect(res.body.recibido.estado).toBe('recibido')
      expect(res.body.recibido.cantidad).toBe(40)
      expect(res.body.recibido.fechaRecibido).toBeTruthy()
      expect(res.body.pendienteRestante).toBeTruthy()
      expect(res.body.pendienteRestante.cantidad).toBe(60)
      expect(res.body.pendienteRestante.estado).toBe('en_esterilizacion')
    })

    it('devuelve 404 para id inexistente', async () => {
      const res = await request(app)
        .put('/api/pendientes/no-existe/recibir')
        .set('x-test-role', 'encargado')
        .send({ cantidadRecibida: 10 })

      expect(res.status).toBe(404)
    })

    it('devuelve 409 si ya está recibido', async () => {
      const created = await prismaMock.insumoPendiente.create({
        data: { articulo: 'YA RECIBIDO', cantidad: 50, destino: 'QUIROFANO', fechaEnvio: new Date(), createdBy: 'enc-1', estado: 'recibido' },
      })

      const res = await request(app)
        .put(`/api/pendientes/${created.id}/recibir`)
        .set('x-test-role', 'encargado')
        .send({ cantidadRecibida: 10 })

      expect(res.status).toBe(409)
      expect(res.body.message).toBe('El pendiente ya está marcado como recibido')
    })

    it('rechaza cantidad recibida mayor a enviada', async () => {
      const created = await prismaMock.insumoPendiente.create({
        data: { articulo: 'POCO', cantidad: 10, destino: 'QUIROFANO', fechaEnvio: new Date(), createdBy: 'enc-1' },
      })

      const res = await request(app)
        .put(`/api/pendientes/${created.id}/recibir`)
        .set('x-test-role', 'encargado')
        .send({ cantidadRecibida: 99 })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('La cantidad recibida no puede superar la cantidad enviada')
    })

    it('devuelve 403 con rol observador', async () => {
      const created = await prismaMock.insumoPendiente.create({
        data: { articulo: 'TEST', cantidad: 10, destino: 'DESTINO', fechaEnvio: new Date(), createdBy: 'enc-1' },
      })

      const res = await request(app)
        .put(`/api/pendientes/${created.id}/recibir`)
        .set('x-test-role', 'observador')
        .send({ cantidadRecibida: 5 })

      expect(res.status).toBe(403)
    })

    it('rechaza cantidadRecibida cero o negativa', async () => {
      const created = await prismaMock.insumoPendiente.create({
        data: { articulo: 'TEST', cantidad: 50, destino: 'DESTINO', fechaEnvio: new Date(), createdBy: 'enc-1' },
      })

      const res = await request(app)
        .put(`/api/pendientes/${created.id}/recibir`)
        .set('x-test-role', 'encargado')
        .send({ cantidadRecibida: 0 })

      expect(res.status).toBe(400)
    })
  })
})
