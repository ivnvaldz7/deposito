import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

const env = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret'
  return {}
})

const compareMock = vi.hoisted(() => vi.fn())
const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  producto: {
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
    create: vi.fn(async () => null),
  },
}))

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('bcryptjs', () => ({
  default: {
    compare: compareMock,
    hash: vi.fn(),
  },
  compare: compareMock,
  hash: vi.fn(),
}))

import authRouter from '../routes/auth'
import productosRouter from '../routes/productos'
import { signToken } from '../lib/jwt'

void env

describe('Auth y autorización', () => {
  const app = createTestApp('/api/auth', authRouter)
  app.use('/api/productos', productosRouter)

  beforeEach(() => {
    prismaMock.user.findUnique.mockReset()
    prismaMock.producto.findMany.mockClear()
    prismaMock.producto.findUnique.mockClear()
    prismaMock.producto.create.mockClear()
    compareMock.mockReset()
  })

  it('login correcto devuelve token válido', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'encargado@test.com',
      name: 'Encargado',
      role: 'encargado',
      passwordHash: 'hashed',
    })
    compareMock.mockResolvedValue(true)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'encargado@test.com', password: 'password123' })

    expect(res.status).toBe(200)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user.email).toBe('encargado@test.com')
  })

  it('login incorrecto devuelve 401', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'encargado@test.com',
      name: 'Encargado',
      role: 'encargado',
      passwordHash: 'hashed',
    })
    compareMock.mockResolvedValue(false)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'encargado@test.com', password: 'mal' })

    expect(res.status).toBe(401)
  })

  it('acceder a ruta protegida sin token devuelve 401', async () => {
    const res = await request(app).get('/api/productos')
    expect(res.status).toBe(401)
  })

  it('acceder a ruta de encargado con rol observador devuelve 403', async () => {
    const token = signToken({ sub: 'obs-1', role: 'observador', name: 'Observador' })

    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombreBase: 'PRODUCTO TEST',
        volumen: 100,
        unidad: 'ML',
        variante: null,
        categoria: 'estuche',
        nombreCompleto: 'PRODUCTO TEST 100 ML',
      })

    expect(res.status).toBe(403)
  })
})
