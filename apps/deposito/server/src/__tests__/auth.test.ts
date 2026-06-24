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
    findFirst: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  depositoProducto: {
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
    create: vi.fn(async () => null),
  },
}))

const platformDbMock = vi.hoisted(() => {
  const mockDb = {}
  return {
    platformDb: mockDb,
    Categoria: {
      droga: 'droga',
      estuche: 'estuche',
      etiqueta: 'etiqueta',
      frasco: 'frasco',
    },
    Prisma: {},
  }
})
const coreMock = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  comparePassword: vi.fn(),
  getUserById: vi.fn(),
  signToken: vi.fn(),
  verifyToken: vi.fn(),
}))

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@platform/db', () => platformDbMock)
vi.mock('@platform/core', () => coreMock)
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
    prismaMock.user.findFirst.mockReset()
    prismaMock.user.update.mockReset()
    prismaMock.user.upsert.mockReset()
    prismaMock.depositoProducto.findMany.mockClear()
    prismaMock.depositoProducto.findUnique.mockClear()
    prismaMock.depositoProducto.create.mockClear()
    compareMock.mockReset()
    coreMock.getUserByEmail.mockReset()
    coreMock.comparePassword.mockReset()
    coreMock.getUserById.mockReset()
    coreMock.signToken.mockReset()
    coreMock.verifyToken.mockReset()
  })

  it('login correcto devuelve token válido', async () => {
    coreMock.getUserByEmail.mockResolvedValue({
      id: 'platform-user-1',
      email: 'encargado@test.com',
      nombre: 'Encargado',
      password: 'hashed',
      activo: true,
      appAccess: [
        { app: 'deposito', rol: 'encargado', activo: true }
      ]
    })
    coreMock.comparePassword.mockResolvedValue(true)
    coreMock.signToken.mockReturnValue('mocked-platform-token')

    prismaMock.user.findUnique.mockResolvedValue(null) // para ensureDepositoUser
    const testUser = {
      id: 'deposito-user-1',
      platformUserId: 'platform-user-1',
      email: 'encargado@test.com',
      name: 'Encargado',
      role: 'encargado',
    }
    prismaMock.user.findFirst.mockResolvedValue(testUser)
    prismaMock.user.upsert.mockResolvedValue(testUser)
    prismaMock.user.update.mockResolvedValue(testUser)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'encargado@test.com', password: 'password123' })

    expect(res.status).toBe(200)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user.email).toBe('encargado@test.com')
  })

  it('login incorrecto devuelve 401', async () => {
    coreMock.getUserByEmail.mockResolvedValue({
      id: 'platform-user-1',
      email: 'encargado@test.com',
      nombre: 'Encargado',
      password: 'hashed',
      activo: true,
      appAccess: [
        { app: 'deposito', rol: 'encargado', activo: true }
      ]
    })
    coreMock.comparePassword.mockResolvedValue(false)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'encargado@test.com', password: 'mal' })

    expect(res.status).toBe(401)
  })

  it('acceder a ruta protegida sin token devuelve 401', async () => {
    coreMock.verifyToken.mockReturnValue(null)
    const res = await request(app).get('/api/productos')
    expect(res.status).toBe(401)
  })

  it('acceder a ruta de encargado con rol observador devuelve 403', async () => {
    const payload = {
      sub: 'obs-1',
      email: 'observador@test.com',
      apps: {
        deposito: { rol: 'observador', activo: true }
      }
    }
    coreMock.verifyToken.mockReturnValue(payload)
    prismaMock.user.findFirst = vi.fn().mockResolvedValue({
      id: 'deposito-obs-1',
      platformUserId: 'obs-1',
      email: 'observador@test.com',
      name: 'Observador',
      role: 'observador'
    })

    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer test-token`)
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

  it('POST /api/auth/refresh devuelve 401 si no hay cookie de refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh')
    expect(res.status).toBe(401)
  })

  it('POST /api/auth/refresh funciona correctamente con cookie válida', async () => {
    // Mockear verifyRefreshToken
    vi.spyOn(await import('../lib/jwt'), 'verifyRefreshToken').mockReturnValue({
      sub: 'platform-user-1',
      type: 'refresh'
    } as any)

    coreMock.getUserById.mockResolvedValue({
      id: 'platform-user-1',
      email: 'encargado@test.com',
      nombre: 'Encargado',
      password: 'hashed',
      activo: true,
      appAccess: [
        { app: 'deposito', rol: 'encargado', activo: true }
      ]
    })
    coreMock.signToken.mockReturnValue('new-mocked-token')

    const testUser = {
      id: 'deposito-user-1',
      platformUserId: 'platform-user-1',
      email: 'encargado@test.com',
      name: 'Encargado',
      role: 'encargado',
    }
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.user.findFirst.mockResolvedValue(testUser)
    prismaMock.user.upsert.mockResolvedValue(testUser)
    prismaMock.user.update.mockResolvedValue(testUser)

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', ['deposito_refresh_token=valid-token'])

    expect(res.status).toBe(200)
    expect(res.body.token).toBe('new-mocked-token')
  })
})
