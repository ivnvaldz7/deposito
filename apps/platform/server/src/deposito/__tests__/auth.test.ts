import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

// ── Mocks para @platform/core ──────────────────────────────────────────────────

const mockGetUserByEmail = vi.hoisted(() => vi.fn())
const mockComparePassword = vi.hoisted(() => vi.fn())
const mockSignToken = vi.hoisted(() => vi.fn())

vi.mock('@platform/core', () => ({
  getUserByEmail: mockGetUserByEmail,
  comparePassword: mockComparePassword,
  signToken: mockSignToken,
  getUserById: vi.fn(),
}))

// ── Mocks para @platform/db ────────────────────────────────────────────────────

vi.mock('@platform/db', () => {
  class Decimal {
    value: number
    constructor(v: number) { this.value = v }
    toString() { return String(this.value) }
    toNumber() { return this.value }
  }

  class PrismaClientKnownRequestError extends Error {
    code: string
    constructor(message: string, opts: { code: string }) {
      super(message)
      this.code = opts.code
    }
  }

  return {
    Categoria: {
      droga: 'droga',
      estuche: 'estuche',
      etiqueta: 'etiqueta',
      frasco: 'frasco',
    },
    Mercado: {
      argentina: 'argentina',
      colombia: 'colombia',
      mexico: 'mexico',
      ecuador: 'ecuador',
      bolivia: 'bolivia',
      paraguay: 'paraguay',
      no_exportable: 'no_exportable',
    },
    CondicionEmbalaje: {
      bueno: 'bueno',
      regular: 'regular',
      malo: 'malo',
    },
    Prisma: { Decimal, PrismaClientKnownRequestError },
    platformDb: {},
    default: {},
  }
})

// ── Environment ─────────────────────────────────────────────────────────────────

const env = vi.hoisted(() => {
  process.env.PLATFORM_JWT_SECRET = 'test-secret'
  return {}
})

// ── Mocks para dependencias locales ────────────────────────────────────────────

const compareMock = vi.hoisted(() => vi.fn())
const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  depositoProducto: {
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

import authRouter from '../routes/auth'
import productosRouter from '../routes/productos'

void env

function buildPlatformUser(overrides: Record<string, any> = {}) {
  return {
    id: 'platform-user-1',
    email: 'encargado@test.com',
    nombre: 'Encargado Test',
    password: 'hashed_password',
    activo: true,
    appAccess: [
      { app: 'deposito', rol: 'encargado', activo: true },
    ],
    ...overrides,
  }
}

describe('Auth y autorización', () => {
  const app = createTestApp('/api/auth', authRouter)
  app.use('/api/productos', productosRouter)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('login correcto devuelve token válido', async () => {
    mockGetUserByEmail.mockResolvedValue(buildPlatformUser())
    mockComparePassword.mockResolvedValue(true)
    mockSignToken.mockReturnValue('fake-jwt-token')
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'encargado@test.com',
      name: 'Encargado',
      role: 'encargado',
    })
    prismaMock.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'encargado@test.com',
      name: 'Encargado',
      role: 'encargado',
    })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'encargado@test.com', password: 'password123' })

    expect(res.status).toBe(200)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user.email).toBe('encargado@test.com')
  })

  it('login incorrecto devuelve 401', async () => {
    mockGetUserByEmail.mockResolvedValue(buildPlatformUser())
    mockComparePassword.mockResolvedValue(false)

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
    const res = await request(app)
      .post('/api/productos')
      .set('x-test-role', 'observador')
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
