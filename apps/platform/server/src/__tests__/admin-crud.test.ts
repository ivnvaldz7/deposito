import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Express } from 'express'
import jwt from 'jsonwebtoken'

// ──────────────────────────────────────────────────
// Hoisted mocks (shared across tests)
// ──────────────────────────────────────────────────
const { mockGetUserByEmail, mockGetUserById, mockGoogleStrategy, mockDb, mockCore } =
  vi.hoisted(() => {
    const mockCreateUser = vi.fn()
    const mockListUsers = vi.fn()
    const mockUpdateAppAccess = vi.fn()
    const mockDeactivateUser = vi.fn()

    return {
      mockGetUserByEmail: vi.fn(),
      mockGetUserById: vi.fn(),
      mockGoogleStrategy: {
        name: 'google',
        getAuthUrl: vi.fn(),
        exchangeCode: vi.fn(),
        validateToken: vi.fn(),
      },
      mockDb: {
        platformDb: {
          platformUser: {
            findUnique: vi.fn(),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn(),
          },
          appAccess: { upsert: vi.fn() },
        },
      },
      mockCore: {
        createUser: mockCreateUser,
        listUsers: mockListUsers,
        updateAppAccess: mockUpdateAppAccess,
        deactivateUser: mockDeactivateUser,
      },
    }
  })

// ──────────────────────────────────────────────────
// Module-level mocking
// ──────────────────────────────────────────────────
vi.mock('@platform/core', () => {
  const _jwt = require('jsonwebtoken')

  function _getSecret(): string {
    return process.env.PLATFORM_JWT_SECRET || 'test-secret-for-jwt-min-32-chars!!'
  }

  return {
    signAccessToken: (payload: Record<string, unknown>) => {
      return _jwt.sign(payload, _getSecret(), { expiresIn: '15m' })
    },
    signRefreshToken: (userId: string) => {
      return _jwt.sign({ sub: userId, type: 'refresh' as const }, _getSecret(), {
        expiresIn: '7d',
      })
    },
    verifyAccessToken: (token: string) => {
      try {
        const decoded = _jwt.verify(token, _getSecret())
        if (typeof decoded !== 'object' || !decoded) return null
        const { sub, email, name, isPlatformAdmin, apps } = decoded as Record<
          string,
          unknown
        >
        if (!sub || !email || !apps) return null
        return {
          sub,
          email,
          name: name ?? '',
          isPlatformAdmin: isPlatformAdmin ?? false,
          apps,
        }
      } catch {
        return null
      }
    },
    verifyRefreshToken: (token: string) => {
      try {
        const decoded = _jwt.verify(token, _getSecret())
        if (typeof decoded !== 'object' || !decoded) return null
        const { sub, type, iat } = decoded as Record<string, unknown>
        if (!sub || type !== 'refresh') return null
        return { sub, type, iat: iat ?? Math.floor(Date.now() / 1000) }
      } catch {
        return null
      }
    },
    decodeToken: (token: string) => {
      try {
        const decoded = _jwt.decode(token)
        if (typeof decoded !== 'object' || !decoded) return null
        const { sub, email, name, isPlatformAdmin, apps } = decoded as Record<
          string,
          unknown
        >
        if (!sub || !email || !apps) return null
        return {
          sub,
          email,
          name: name ?? '',
          isPlatformAdmin: isPlatformAdmin ?? false,
          apps,
        }
      } catch {
        return null
      }
    },
    getUserByEmail: mockGetUserByEmail,
    getUserById: mockGetUserById,
    hashPassword: vi.fn(),
    comparePassword: vi.fn(),
    createUser: mockCore.createUser,
    listUsers: mockCore.listUsers,
    updateAppAccess: mockCore.updateAppAccess,
    deactivateUser: mockCore.deactivateUser,
  }
})

vi.mock('@platform/db', () => ({
  ...mockDb,
  AppId: {
    deposito: 'deposito',
    ale_bet: 'ale_bet',
    portal: 'portal',
    admin: 'admin',
  },
}))

vi.mock('../../auth/strategies/google', () => ({
  GoogleStrategy: vi.fn(function () {
    return mockGoogleStrategy
  }),
}))

// ──────────────────────────────────────────────────
// Imports (after mocks)
// ──────────────────────────────────────────────────
import { createTestApp } from './helpers/create-test-app'

/**
 * Admin CRUD Integration Tests (P3.6)
 *
 * Tests the admin user management endpoints:
 * - GET /api/admin/ — list users (admin token)
 * - GET /api/admin/ — non-admin → 403
 * - POST /api/admin/ — create user (valid, duplicate, missing fields)
 * - PUT /api/admin/:id/access — update app access
 * - PUT /api/admin/:id/status — update user status
 *
 * Uses supertest + mocked DB.
 * Routes mounted at /api/admin with verifyToken + requirePlatformAdmin.
 */
describe('Admin CRUD — Integration Tests (P3.6)', () => {
  let app: Express

  const adminUser = {
    id: 'admin_xyz789',
    email: 'admin@plataforma.com',
    nombre: 'Admin User',
    activo: true,
    estado: 'active',
    isPlatformAdmin: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    appAccess: [
      { app: 'deposito', rol: 'admin', activo: true, userId: 'admin_xyz789' },
      { app: 'admin', rol: 'admin', activo: true, userId: 'admin_xyz789' },
    ],
  }

  const regularUser = {
    id: 'user_abc123',
    email: 'encargado@deposito.com',
    nombre: 'Juan Encargado',
    activo: true,
    estado: 'active',
    isPlatformAdmin: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    appAccess: [
      { app: 'deposito', rol: 'encargado', activo: true, userId: 'user_abc123' },
    ],
  }

  const mockUser = {
    id: 'user_new_001',
    email: 'nuevo@deposito.com',
    nombre: 'Nuevo Usuario',
    activo: true,
    estado: 'active',
    isPlatformAdmin: false,
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    appAccess: [
      { id: 'acc_001', userId: 'user_new_001', app: 'deposito', rol: 'encargado', activo: true, createdAt: new Date('2026-01-15') },
    ],
  }

  function buildAdminToken(): string {
    return jwt.sign(
      {
        sub: 'admin_xyz789',
        email: 'admin@plataforma.com',
        name: 'Admin User',
        isPlatformAdmin: true,
        apps: { deposito: { rol: 'admin', activo: true }, admin: { rol: 'admin', activo: true } },
      },
      process.env.PLATFORM_JWT_SECRET!,
      { expiresIn: '15m' },
    )
  }

  function buildNonAdminToken(): string {
    return jwt.sign(
      {
        sub: 'user_abc123',
        email: 'encargado@deposito.com',
        name: 'Juan Encargado',
        isPlatformAdmin: false,
        apps: { deposito: { rol: 'encargado', activo: true } },
      },
      process.env.PLATFORM_JWT_SECRET!,
      { expiresIn: '15m' },
    )
  }

  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = 'test-secret-for-jwt-min-32-chars!!'
    process.env.FRONTEND_URL = 'http://localhost:5176'
    process.env.GOOGLE_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback'

    vi.clearAllMocks()
    app = createTestApp()
  })

  afterEach(() => {
    delete process.env.PLATFORM_JWT_SECRET
    delete process.env.FRONTEND_URL
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    delete process.env.GOOGLE_REDIRECT_URI
  })

  // ────────────────────────────────────────────────
  // GET /api/admin/ — List users
  // ────────────────────────────────────────────────
  describe('GET /api/admin/ — List users', () => {
    it('with admin token → returns 200 and user list', async () => {
      mockGetUserById.mockResolvedValue(adminUser)
      mockCore.listUsers.mockResolvedValue([mockUser])
      const token = buildAdminToken()

      const res = await request(app)
        .get('/api/admin/')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].email).toBe('nuevo@deposito.com')
      expect(res.body[0].nombre).toBe('Nuevo Usuario')
      expect(mockCore.listUsers).toHaveBeenCalledTimes(1)
    })

    it('with admin token and empty list → returns 200 with empty array', async () => {
      mockGetUserById.mockResolvedValue(adminUser)
      mockCore.listUsers.mockResolvedValue([])
      const token = buildAdminToken()

      const res = await request(app)
        .get('/api/admin/')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body).toHaveLength(0)
    })

    it('with non-admin token → returns 403', async () => {
      mockGetUserById.mockResolvedValue(regularUser)
      const token = buildNonAdminToken()

      const res = await request(app)
        .get('/api/admin/')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(403)
      expect(res.body.error).toContain('administrador')
    })

    it('without token → returns 401', async () => {
      const res = await request(app).get('/api/admin/')

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Token requerido')
    })
  })

  // ────────────────────────────────────────────────
  // POST /api/admin/ — Create user
  // ────────────────────────────────────────────────
  describe('POST /api/admin/ — Create user', () => {
    it('with valid data → returns 201 and created user', async () => {
      mockGetUserById.mockResolvedValue(adminUser)
      mockGetUserByEmail.mockResolvedValue(null)
      mockCore.createUser.mockResolvedValue(mockUser)
      const token = buildAdminToken()

      const res = await request(app)
        .post('/api/admin/')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'nuevo@deposito.com',
          nombre: 'Nuevo Usuario',
          password: 'password123',
          appAccess: [{ app: 'deposito', rol: 'encargado' }],
        })

      expect(res.status).toBe(201)
      expect(res.body.email).toBe('nuevo@deposito.com')
      expect(res.body.nombre).toBe('Nuevo Usuario')
      expect(mockCore.createUser).toHaveBeenCalledTimes(1)
    })

    it('with duplicate email → returns 409', async () => {
      mockGetUserById.mockResolvedValue(adminUser)
      mockGetUserByEmail.mockResolvedValue(mockUser)
      const token = buildAdminToken()

      const res = await request(app)
        .post('/api/admin/')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'nuevo@deposito.com',
          nombre: 'Nuevo Usuario',
          password: 'password123',
          appAccess: [{ app: 'deposito', rol: 'encargado' }],
        })

      expect(res.status).toBe(409)
      expect(res.body.error).toContain('Ya existe')
      expect(mockCore.createUser).not.toHaveBeenCalled()
    })

    it('with missing required fields → returns 400', async () => {
      mockGetUserById.mockResolvedValue(adminUser)
      const token = buildAdminToken()

      const res = await request(app)
        .post('/api/admin/')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'nuevo@deposito.com',
          // missing nombre and password
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('obligatorios')
    })
  })

  // ────────────────────────────────────────────────
  // PUT /api/admin/:id/access — Update app access
  // ────────────────────────────────────────────────
  describe('PUT /api/admin/:id/access — Update app access', () => {
    it('with valid data → returns 200 and updated access', async () => {
      mockGetUserById.mockResolvedValue(adminUser)
      const updatedAccess = {
        id: 'acc_001',
        userId: 'user_new_001',
        app: 'deposito',
        rol: 'observador',
        activo: true,
      }
      mockCore.updateAppAccess.mockResolvedValue(updatedAccess)
      const token = buildAdminToken()

      const res = await request(app)
        .put('/api/admin/user_new_001/access')
        .set('Authorization', `Bearer ${token}`)
        .send({ app: 'deposito', rol: 'observador', activo: true })

      expect(res.status).toBe(200)
      expect(res.body.rol).toBe('observador')
      expect(res.body.app).toBe('deposito')
      expect(mockCore.updateAppAccess).toHaveBeenCalledTimes(1)
    })

    it('with invalid app → returns 400', async () => {
      mockGetUserById.mockResolvedValue(adminUser)
      const token = buildAdminToken()

      const res = await request(app)
        .put('/api/admin/user_new_001/access')
        .set('Authorization', `Bearer ${token}`)
        .send({ app: 'invalid_app', rol: 'encargado', activo: true })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('App inválida')
    })
  })

  // ────────────────────────────────────────────────
  // PUT /api/admin/:id/status — Update user status
  // ────────────────────────────────────────────────
  describe('PUT /api/admin/:id/status — Update user status', () => {
    it('with activo: false → returns 200 with updated user', async () => {
      mockGetUserById.mockResolvedValue(adminUser)
      const disabledUser = { ...mockUser, activo: false, estado: 'disabled' }
      mockDb.platformDb.platformUser.update.mockResolvedValue(disabledUser)
      const token = buildAdminToken()

      const res = await request(app)
        .put('/api/admin/user_new_001/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ activo: false, estado: 'disabled' })

      expect(res.status).toBe(200)
      expect(res.body.activo).toBe(false)
      expect(mockDb.platformDb.platformUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user_new_001' },
          data: expect.objectContaining({ activo: false, estado: 'disabled' }),
        }),
      )
    })

    it('with empty body → returns 400', async () => {
      mockGetUserById.mockResolvedValue(adminUser)
      const token = buildAdminToken()

      const res = await request(app)
        .put('/api/admin/user_new_001/status')
        .set('Authorization', `Bearer ${token}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Estado inválido')
    })
  })
})
