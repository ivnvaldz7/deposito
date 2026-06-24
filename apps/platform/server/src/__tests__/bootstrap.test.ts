import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Express } from 'express'

// ──────────────────────────────────────────────────
// Hoisted mocks
// ──────────────────────────────────────────────────
const { mockGetUserByEmail, mockCreateUser, mockDb } = vi.hoisted(() => ({
  mockGetUserByEmail: vi.fn(),
  mockCreateUser: vi.fn(),
  mockDb: {
    platformUser: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    appAccess: { upsert: vi.fn() },
  },
}))

// ──────────────────────────────────────────────────
// Module-level mocking
// ──────────────────────────────────────────────────
vi.mock('@platform/core', () => ({
  createUser: mockCreateUser,
  getUserByEmail: mockGetUserByEmail,
  hashPassword: vi.fn().mockResolvedValue('hashed-password'),
  comparePassword: vi.fn(),
}))

vi.mock('@platform/db', () => ({
  platformDb: mockDb,
  AppId: {
    deposito: 'deposito',
    ale_bet: 'ale_bet',
    portal: 'portal',
    admin: 'admin',
  },
}))

// ──────────────────────────────────────────────────
// Test setup
// ──────────────────────────────────────────────────
async function createTestApp(): Promise<Express> {
  const express = await import('express')
  const { createBootstrapRoutes } = await import('../routes/bootstrap/index')
  const app = express.default()
  app.use(express.json())
  app.use('/api', createBootstrapRoutes())
  return app
}

describe('POST /api/bootstrap', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    process.env = { ...OLD_ENV }
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  it('devuelve 404 si BOOTSTRAP_ADMIN_EMAIL no está configurado', async () => {
    const app = await createTestApp()

    const res = await request(app).post('/api/bootstrap').expect(404)

    expect(res.body).toEqual({
      error: 'Bootstrap no configurado (BOOTSTRAP_ADMIN_EMAIL)',
    })
    expect(mockGetUserByEmail).not.toHaveBeenCalled()
  })

  it('devuelve 403 si BOOTSTRAP_KEY está configurado pero no se envía', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@test.com'
    process.env.BOOTSTRAP_KEY = 'secret-key'
    process.env.ADMIN_PASSWORD = 'password123'
    const app = await createTestApp()

    const res = await request(app).post('/api/bootstrap').expect(403)

    expect(res.body).toEqual({ error: 'x-bootstrap-key inválido' })
    expect(mockGetUserByEmail).not.toHaveBeenCalled()
  })

  it('devuelve 403 si el x-bootstrap-key no coincide', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@test.com'
    process.env.BOOTSTRAP_KEY = 'secret-key'
    process.env.ADMIN_PASSWORD = 'password123'
    const app = await createTestApp()

    const res = await request(app)
      .post('/api/bootstrap')
      .set('x-bootstrap-key', 'wrong-key')
      .expect(403)

    expect(res.body).toEqual({ error: 'x-bootstrap-key inválido' })
  })

  it('procede si x-bootstrap-key coincide', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@test.com'
    process.env.BOOTSTRAP_KEY = 'secret-key'
    process.env.ADMIN_PASSWORD = 'password123'
    mockGetUserByEmail.mockResolvedValue(null)
    mockCreateUser.mockResolvedValue({ id: 'user-1', email: 'admin@test.com', nombre: 'Administrador' })
    const app = await createTestApp()

    await request(app)
      .post('/api/bootstrap')
      .set('x-bootstrap-key', 'secret-key')
      .expect(201)

    expect(mockGetUserByEmail).toHaveBeenCalledWith(expect.anything(), 'admin@test.com')
    expect(mockCreateUser).toHaveBeenCalled()
  })

  it('devuelve 500 si ADMIN_PASSWORD no está configurado', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@test.com'
    delete process.env.ADMIN_PASSWORD
    const app = await createTestApp()

    const res = await request(app).post('/api/bootstrap').expect(500)

    expect(res.body).toEqual({ error: 'ADMIN_PASSWORD no configurado' })
  })

  it('crea un nuevo superadmin (201) si el usuario no existe', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@test.com'
    process.env.ADMIN_PASSWORD = 'password123'
    mockGetUserByEmail.mockResolvedValue(null)
    mockCreateUser.mockResolvedValue({ id: 'user-1', email: 'admin@test.com', nombre: 'Administrador' })
    const app = await createTestApp()

    const res = await request(app).post('/api/bootstrap').expect(201)

    expect(res.body).toEqual({
      created: true,
      email: 'admin@test.com',
      message: 'Superadmin creado exitosamente',
    })
    expect(mockCreateUser).toHaveBeenCalledWith(expect.anything(), {
      email: 'admin@test.com',
      nombre: 'Administrador',
      password: 'password123',
      appAccess: [
        { app: 'deposito', rol: 'encargado' },
        { app: 'ale_bet', rol: 'supervisor' },
        { app: 'admin', rol: 'admin' },
        { app: 'portal', rol: 'viewer' },
      ],
    })
    expect(mockDb.platformUser.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { isPlatformAdmin: true },
    })
  })

  it('actualiza un usuario existente como admin (200) si ya existe', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'existing@test.com'
    process.env.ADMIN_PASSWORD = 'password123'
    mockGetUserByEmail.mockResolvedValue({
      id: 'existing-id',
      email: 'existing@test.com',
      estado: 'active',
    })
    const app = await createTestApp()

    const res = await request(app).post('/api/bootstrap').expect(200)

    expect(res.body).toEqual({
      created: false,
      email: 'existing@test.com',
      message: 'Usuario existente actualizado como administrador',
    })
    expect(mockDb.platformUser.update).toHaveBeenCalledWith({
      where: { id: 'existing-id' },
      data: { isPlatformAdmin: true, estado: 'active' },
    })
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('activa un usuario disabled al actualizarlo como admin', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'disabled@test.com'
    process.env.ADMIN_PASSWORD = 'password123'
    mockGetUserByEmail.mockResolvedValue({
      id: 'disabled-id',
      email: 'disabled@test.com',
      estado: 'disabled',
    })
    const app = await createTestApp()

    const res = await request(app).post('/api/bootstrap').expect(200)

    expect(res.body.created).toBe(false)
    expect(mockDb.platformUser.update).toHaveBeenCalledWith({
      where: { id: 'disabled-id' },
      data: { isPlatformAdmin: true, estado: 'active' },
    })
  })

  it('no requiere BOOTSTRAP_KEY si no está configurado', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@test.com'
    process.env.ADMIN_PASSWORD = 'password123'
    delete process.env.BOOTSTRAP_KEY
    mockGetUserByEmail.mockResolvedValue(null)
    mockCreateUser.mockResolvedValue({ id: 'user-1' })
    const app = await createTestApp()

    await request(app).post('/api/bootstrap').expect(201)
  })
})
