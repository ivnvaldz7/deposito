import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Express } from 'express'
import jwt from 'jsonwebtoken'

// ──────────────────────────────────────────────────
// Step 2 (RED): Hoisted mocks
// ──────────────────────────────────────────────────
const { mockGetUserByEmail, mockGetUserById, mockGoogleStrategy, mockDb } =
  vi.hoisted(() => ({
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
  }))

// ──────────────────────────────────────────────────
// Module-level mocking — fully self-contained
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
    createUser: vi.fn(),
    listUsers: vi.fn().mockResolvedValue([]),
    updateAppAccess: vi.fn(),
    deactivateUser: vi.fn(),
  }
})

vi.mock('@platform/db', () => mockDb)

vi.mock('../auth/strategies/google', () => ({
  GoogleStrategy: vi.fn(function () {
    return mockGoogleStrategy
  }),
}))

// ──────────────────────────────────────────────────
// Imports (mocks are already in place)
// ──────────────────────────────────────────────────
import { createTestApp } from './helpers/create-test-app'

/**
 * Route Guards Integration Tests (P1.12)
 *
 * Tests the guard/middleware chain:
 * - verifyToken (valid, missing, expired)
 * - requireApp(app) (with app, without app, inactive app)
 * - requirePlatformAdmin (admin, non-admin, missing, expired)
 * - Real admin CRUD route (guard only — does not test CRUD logic)
 */
describe('Route Guards — Integration Tests (P1.12)', () => {
  let app: Express

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
  // Test route under requireApp('deposito') guard
  // ────────────────────────────────────────────────
  describe('requireApp("deposito") guard via /api/deposito/health', () => {
    it('with valid token + deposito access → returns 200', async () => {
      const { signAccessToken } = await import('@platform/core')
      const token = signAccessToken({
        sub: 'user_abc123',
        email: 'encargado@deposito.com',
        name: 'Juan Encargado',
        isPlatformAdmin: false,
        apps: {
          deposito: { rol: 'encargado', activo: true },
        },
      })

      const res = await request(app)
        .get('/api/deposito/health')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.module).toBe('deposito')
    })

    it('without Authorization header → returns 401', async () => {
      const res = await request(app).get('/api/deposito/health')

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Token requerido')
    })

    it('with expired token → returns 401 ("Token inválido o expirado")', async () => {
      const expiredToken = jwt.sign(
        {
          sub: 'user_abc123',
          email: 'encargado@deposito.com',
          name: 'Juan Encargado',
          isPlatformAdmin: false,
          apps: { deposito: { rol: 'encargado', activo: true } },
        },
        process.env.PLATFORM_JWT_SECRET!,
        { expiresIn: -1 }
      )

      const res = await request(app)
        .get('/api/deposito/health')
        .set('Authorization', `Bearer ${expiredToken}`)

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Token inválido o expirado')
    })

    it('with valid token but missing deposito app → returns 403', async () => {
      const { signAccessToken } = await import('@platform/core')
      const token = signAccessToken({
        sub: 'user_aleb',
        email: 'solo-alebet@test.com',
        name: 'Solo AleBet',
        isPlatformAdmin: false,
        apps: {
          'ale-bet': { rol: 'encargado', activo: true },
        },
      })

      const res = await request(app)
        .get('/api/deposito/health')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(403)
      expect(res.body.error).toContain('No tiene acceso')
    })

    it('with valid token but deposito app is inactive → returns 403', async () => {
      const { signAccessToken } = await import('@platform/core')
      const token = signAccessToken({
        sub: 'user_inactive',
        email: 'inactive@test.com',
        name: 'Inactive User',
        isPlatformAdmin: false,
        apps: {
          deposito: { rol: 'encargado', activo: false },
        },
      })

      const res = await request(app)
        .get('/api/deposito/health')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(403)
      expect(res.body.error).toContain('No tiene acceso')
    })
  })

  // ────────────────────────────────────────────────
  // Test route under requirePlatformAdmin guard
  // ────────────────────────────────────────────────
  describe('requirePlatformAdmin guard via /api/admin/guard-test', () => {
    it('with valid admin token (isPlatformAdmin=true) → returns 200', async () => {
      mockGetUserById.mockResolvedValue({
        id: 'admin_xyz789',
        email: 'admin@plataforma.com',
        nombre: 'Admin',
        activo: true,
        estado: 'active',
        isPlatformAdmin: true,
        appAccess: [
          { app: 'deposito', rol: 'admin', activo: true, userId: 'admin_xyz789' },
          { app: 'admin', rol: 'admin', activo: true, userId: 'admin_xyz789' },
        ],
      })

      const { signAccessToken } = await import('@platform/core')
      const token = signAccessToken({
        sub: 'admin_xyz789',
        email: 'admin@plataforma.com',
        name: 'Admin',
        isPlatformAdmin: true,
        apps: {
          deposito: { rol: 'admin', activo: true },
          admin: { rol: 'admin', activo: true },
        },
      })

      const res = await request(app)
        .get('/api/admin/guard-test')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.module).toBe('admin')
    })

    it('with valid token but NOT isPlatformAdmin → returns 403', async () => {
      mockGetUserById.mockResolvedValue({
        id: 'user_abc123',
        email: 'encargado@deposito.com',
        nombre: 'Juan Encargado',
        activo: true,
        estado: 'active',
        isPlatformAdmin: false,
        appAccess: [
          { app: 'deposito', rol: 'encargado', activo: true, userId: 'user_abc123' },
        ],
      })

      const { signAccessToken } = await import('@platform/core')
      const token = signAccessToken({
        sub: 'user_abc123',
        email: 'encargado@deposito.com',
        name: 'Juan Encargado',
        isPlatformAdmin: false,
        apps: {
          deposito: { rol: 'encargado', activo: true },
        },
      })

      const res = await request(app)
        .get('/api/admin/guard-test')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(403)
      expect(res.body.error).toContain('administrador')
    })

    it('without Authorization header → returns 401', async () => {
      const res = await request(app).get('/api/admin/guard-test')

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Token requerido')
    })

    it('with expired token → returns 401', async () => {
      const expiredToken = jwt.sign(
        {
          sub: 'admin_xyz789',
          email: 'admin@plataforma.com',
          name: 'Admin',
          isPlatformAdmin: true,
          apps: {
            deposito: { rol: 'admin', activo: true },
            admin: { rol: 'admin', activo: true },
          },
        },
        process.env.PLATFORM_JWT_SECRET!,
        { expiresIn: -1 }
      )

      const res = await request(app)
        .get('/api/admin/guard-test')
        .set('Authorization', `Bearer ${expiredToken}`)

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Token inválido o expirado')
    })
  })

  // ────────────────────────────────────────────────
  // Real admin CRUD route — guard only
  // ────────────────────────────────────────────────
  describe('requirePlatformAdmin guard on real /api/admin/ endpoint', () => {
    it('with valid admin token → returns 200 (empty list from mocked db)', async () => {
      mockGetUserById.mockResolvedValue({
        id: 'admin_xyz789',
        email: 'admin@plataforma.com',
        nombre: 'Admin',
        activo: true,
        estado: 'active',
        isPlatformAdmin: true,
        appAccess: [
          { app: 'admin', rol: 'admin', activo: true, userId: 'admin_xyz789' },
        ],
      })

      const { signAccessToken } = await import('@platform/core')
      const token = signAccessToken({
        sub: 'admin_xyz789',
        email: 'admin@plataforma.com',
        name: 'Admin',
        isPlatformAdmin: true,
        apps: {
          admin: { rol: 'admin', activo: true },
        },
      })

      const res = await request(app)
        .get('/api/admin/')
        .set('Authorization', `Bearer ${token}`)

      // Guard passes → hits listUsers handler (mocked to return [])
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body).toHaveLength(0)
    })

    it('with valid token but NOT isPlatformAdmin → returns 403', async () => {
      mockGetUserById.mockResolvedValue({
        id: 'user_abc123',
        email: 'encargado@deposito.com',
        nombre: 'Juan Encargado',
        activo: true,
        estado: 'active',
        isPlatformAdmin: false,
        appAccess: [
          { app: 'deposito', rol: 'encargado', activo: true, userId: 'user_abc123' },
        ],
      })

      const { signAccessToken } = await import('@platform/core')
      const token = signAccessToken({
        sub: 'user_abc123',
        email: 'encargado@deposito.com',
        name: 'Juan Encargado',
        isPlatformAdmin: false,
        apps: {
          deposito: { rol: 'encargado', activo: true },
        },
      })

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
})
