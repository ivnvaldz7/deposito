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
 * Auth Flow Integration Tests (P1.12)
 *
 * Tests the complete auth flow:
 * - Login redirect (Google OAuth)
 * - Callback handling (valid, invalid, not found, disabled)
 * - Token refresh (valid, expired, missing)
 * - Logout
 * - Me endpoint (valid, missing, expired)
 *
 * Uses supertest + mocked dependencies.
 * JWT signing/verification uses real crypto via jsonwebtoken.
 */
describe('Auth Flow — Integration Tests (P1.12)', () => {
  let app: Express

  const mockPlatformUser = {
    id: 'user_abc123',
    email: 'encargado@deposito.com',
    nombre: 'Juan Encargado',
    activo: true,
    estado: 'active',
    isPlatformAdmin: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    appAccess: [
      { app: 'deposito', rol: 'encargado', activo: true, userId: 'user_abc123' },
    ],
  }

  const disabledUser = {
    id: 'user_disabled_001',
    email: 'disabled@test.com',
    nombre: 'Disabled User',
    activo: false,
    estado: 'disabled',
    isPlatformAdmin: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    appAccess: [],
  }

  const pendingUser = {
    id: 'user_pending_001',
    email: 'pending@test.com',
    nombre: 'Pending User',
    activo: true,
    estado: 'pending',
    isPlatformAdmin: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    appAccess: [],
  }

  const inactiveUser = {
    id: 'user_inactive_001',
    email: 'inactive@test.com',
    nombre: 'Inactive User',
    activo: false,
    estado: 'active',
    isPlatformAdmin: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    appAccess: [],
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
  // 1. Login — Google OAuth redirect
  // ────────────────────────────────────────────────
  describe('GET /api/auth/google — Login redirect', () => {
    it('returns 302 with Location to Google OAuth URL', async () => {
      mockGoogleStrategy.getAuthUrl.mockResolvedValue(
        'https://accounts.google.com/o/oauth2/v2/auth?client_id=test-client-id&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fgoogle%2Fcallback&response_type=code&scope=profile+email&state=test-state&access_type=offline&prompt=consent'
      )

      const res = await request(app).get('/api/auth/google')

      expect(res.status).toBe(302)
      expect(res.headers.location).toContain('accounts.google.com')
      expect(res.headers.location).toContain('client_id=test-client-id')
      expect(mockGoogleStrategy.getAuthUrl).toHaveBeenCalledTimes(1)
    })

    it('returns 500 when getAuthUrl throws', async () => {
      mockGoogleStrategy.getAuthUrl.mockRejectedValue(new Error('OAuth error'))

      const res = await request(app)
        .get('/api/auth/google')

      expect(res.status).toBe(500)
      expect(res.body.error).toMatch(/Error al iniciar autenticación/i)
    })
  })

  // ────────────────────────────────────────────────
  // 2–6. Callback — Google OAuth callback
  // ────────────────────────────────────────────────
  describe('GET /api/auth/google/callback — OAuth callback', () => {
    it('with valid code → redirects to frontend with token + sets refresh cookie', async () => {
      mockGoogleStrategy.exchangeCode.mockResolvedValue({
        providerId: 'google-123',
        email: mockPlatformUser.email,
        name: mockPlatformUser.nombre,
      })
      mockGetUserByEmail.mockResolvedValue(mockPlatformUser)

      const res = await request(app).get(
        '/api/auth/google/callback?code=valid-code&state=test-state'
      )

      expect(res.status).toBe(302)
      expect(res.headers.location).toContain(
        'http://localhost:5176/auth/google/callback?token='
      )

      // Verify httpOnly refresh cookie is set
      const cookies = res.headers['set-cookie']
      expect(cookies).toBeDefined()
      const refreshCookie = (cookies as string[]).find((c: string) =>
        c.startsWith('platform_refresh_token=')
      )
      expect(refreshCookie).toBeDefined()
      expect(refreshCookie).toContain('HttpOnly')
      expect(refreshCookie).toContain('SameSite=Strict')
      expect(refreshCookie).toContain('Path=/api/auth')
    })

    it('with missing code → redirects to /login?error=missing_code', async () => {
      const res = await request(app).get('/api/auth/google/callback')

      expect(res.status).toBe(302)
      expect(res.headers.location).toContain('/login?error=missing_code')
    })

    it('with invalid code (exchangeCode throws) → redirects to /login?error=auth_failed', async () => {
      mockGoogleStrategy.exchangeCode.mockRejectedValue(
        new Error('Google OAuth: intercambio de código falló')
      )

      const res = await request(app).get(
        '/api/auth/google/callback?code=bad-code&state=test-state'
      )

      expect(res.status).toBe(302)
      expect(res.headers.location).toContain('/login?error=auth_failed')
    })

    it('with unknown email → redirects to /login?error=unauthorized', async () => {
      mockGoogleStrategy.exchangeCode.mockResolvedValue({
        providerId: 'google-456',
        email: 'unknown@notfound.com',
        name: 'Unknown User',
      })
      mockGetUserByEmail.mockResolvedValue(null)

      const res = await request(app).get(
        '/api/auth/google/callback?code=unknown-email&state=test-state'
      )

      expect(res.status).toBe(302)
      expect(res.headers.location).toContain('/login?error=unauthorized')
    })

    it('with disabled user → redirects to /login?error=disabled', async () => {
      mockGoogleStrategy.exchangeCode.mockResolvedValue({
        providerId: 'google-789',
        email: 'disabled@test.com',
        name: 'Disabled User',
      })
      mockGetUserByEmail.mockResolvedValue({
        ...mockPlatformUser,
        email: 'disabled@test.com',
        estado: 'disabled',
        activo: false,
      })

      const res = await request(app).get(
        '/api/auth/google/callback?code=disabled-user&state=test-state'
      )

      expect(res.status).toBe(302)
      expect(res.headers.location).toContain('/login?error=disabled')
    })

    it('with pending user auto-activates and redirects with token', async () => {
      const pendingFixture = {
        id: 'user_pending_001',
        email: 'pending@test.com',
        nombre: 'Pending User',
        activo: true,
        estado: 'pending',
        isPlatformAdmin: false,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        appAccess: [],
      }
      mockGoogleStrategy.exchangeCode.mockResolvedValue({
        providerId: 'google_123',
        email: 'pending@test.com',
        name: 'Pending User',
      })
      mockGetUserByEmail.mockResolvedValue(pendingFixture)
      mockDb.platformDb.platformUser.update.mockResolvedValue({
        ...pendingFixture,
        estado: 'active',
      })

      const res = await request(app)
        .get('/api/auth/google/callback?code=valid_code')

      expect(res.status).toBe(302)
      expect(mockDb.platformDb.platformUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user_pending_001' },
          data: { estado: 'active' },
        })
      )
      expect(res.header.location).toMatch(/token=/)
    })

    it('with activo: false and estado: active redirects to disabled', async () => {
      const inactiveFixture = {
        id: 'user_inactive_001',
        email: 'inactive@test.com',
        nombre: 'Inactive User',
        activo: false,
        estado: 'active',
        isPlatformAdmin: false,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        appAccess: [],
      }
      mockGoogleStrategy.exchangeCode.mockResolvedValue({
        providerId: 'google_456',
        email: 'inactive@test.com',
        name: 'Inactive User',
      })
      mockGetUserByEmail.mockResolvedValue(inactiveFixture)

      const res = await request(app)
        .get('/api/auth/google/callback?code=valid_code')

      expect(res.status).toBe(302)
      expect(res.header.location).toContain('error=disabled')
    })
  })

  // ────────────────────────────────────────────────
  // 7–9. Refresh token
  // ────────────────────────────────────────────────
  describe('POST /api/auth/refresh — Token refresh', () => {
    it('with valid refresh cookie → returns 200 with new token + rotated cookie', async () => {
      mockGetUserById.mockResolvedValue(mockPlatformUser)

      const { signRefreshToken } = await import('@platform/core')
      const refreshToken = signRefreshToken(mockPlatformUser.id)

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `platform_refresh_token=${refreshToken}`)

      expect(res.status).toBe(200)
      expect(res.body.token).toBeDefined()
      expect(typeof res.body.token).toBe('string')
      expect(res.body.token.length).toBeGreaterThan(0)
      expect(res.body.user).toBeDefined()
      expect(res.body.user.email).toBe(mockPlatformUser.email)
      expect(res.body.user.sub).toBe(mockPlatformUser.id)
      expect(res.body.user.name).toBe(mockPlatformUser.nombre)
      expect(res.body.user.isPlatformAdmin).toBe(false)
      expect(res.body.user.apps).toBeDefined()
      expect(res.body.user.apps.deposito).toBeDefined()

      // Verify refresh cookie was rotated (set again)
      const cookies = res.headers['set-cookie']
      expect(cookies).toBeDefined()
      const refreshCookie = (cookies as string[]).find((c: string) =>
        c.startsWith('platform_refresh_token=')
      )
      expect(refreshCookie).toBeDefined()
      expect(refreshCookie).toContain('HttpOnly')
    })

    it('with invalid refresh cookie → returns 401', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', 'platform_refresh_token=invalid-token-that-will-fail-verification')

      expect(res.status).toBe(401)
      expect(res.body.error).toBeDefined()
    })

    it('without refresh cookie → returns 401', async () => {
      const res = await request(app).post('/api/auth/refresh')

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Refresh token requerido')
    })
  })

  describe('POST /api/auth/refresh — edge cases', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      app = createTestApp()
    })

    it('returns 401 when user is disabled (activo: false)', async () => {
      const disabledUserFixture = {
        id: 'user_disabled_001',
        email: 'disabled@test.com',
        nombre: 'Disabled User',
        activo: false,
        estado: 'active',
        isPlatformAdmin: false,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        appAccess: [],
      }
      const token = jwt.sign(
        { sub: 'user_disabled_001', type: 'refresh' },
        process.env.PLATFORM_JWT_SECRET!,
        { expiresIn: '7d' }
      )
      mockGetUserById.mockResolvedValue(disabledUserFixture)

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `platform_refresh_token=${token}`)

      expect(res.status).toBe(401)
      expect(res.body.error).toMatch(/no encontrado/i)
    })

    it('returns 401 when user estado is disabled', async () => {
      const disabledEstadoUser = {
        id: 'user_disabled_002',
        email: 'disabled2@test.com',
        nombre: 'Disabled User 2',
        activo: true,
        estado: 'disabled',
        isPlatformAdmin: false,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        appAccess: [],
      }
      const token = jwt.sign(
        { sub: 'user_disabled_002', type: 'refresh' },
        process.env.PLATFORM_JWT_SECRET!,
        { expiresIn: '7d' }
      )
      mockGetUserById.mockResolvedValue(disabledEstadoUser)

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `platform_refresh_token=${token}`)

      expect(res.status).toBe(401)
      expect(res.body.error).toMatch(/deshabilitad/i)
    })

    it('returns 401 when user not found in DB', async () => {
      const token = jwt.sign(
        { sub: 'user_gone_001', type: 'refresh' },
        process.env.PLATFORM_JWT_SECRET!,
        { expiresIn: '7d' }
      )
      mockGetUserById.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `platform_refresh_token=${token}`)

      expect(res.status).toBe(401)
      expect(res.body.error).toMatch(/no encontrado/i)
    })

    it('returns 401 when getUserById throws (generic catch)', async () => {
      const token = jwt.sign(
        { sub: 'user_throw_001', type: 'refresh' },
        process.env.PLATFORM_JWT_SECRET!,
        { expiresIn: '7d' }
      )
      mockGetUserById.mockRejectedValue(new Error('DB connection lost'))

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `platform_refresh_token=${token}`)

      expect(res.status).toBe(401)
    })
  })

  // ────────────────────────────────────────────────
  // 10. Dev-login bypass
  // ────────────────────────────────────────────────
  describe('POST /api/auth/dev-login — local dev bypass', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      app = createTestApp()
    })

    it('with valid email returns token and user', async () => {
      const user = {
        id: 'user_dev_001',
        email: 'admin@example.com',
        nombre: 'Admin',
        activo: true,
        estado: 'active' as const,
        isPlatformAdmin: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        appAccess: [
          { app: 'deposito', rol: 'admin', activo: true, userId: 'user_dev_001' },
        ],
      }
      mockGetUserByEmail.mockResolvedValue(user)

      const res = await request(app)
        .post('/api/auth/dev-login')
        .send({ email: 'admin@example.com' })

      expect(res.status).toBe(200)
      expect(res.body.token).toBeDefined()
      expect(res.body.refreshToken).toBeDefined()
      expect(res.body.user.email).toBe('admin@example.com')
      expect(res.body.user.apps.deposito).toBeDefined()
    })

    it('returns 400 without email', async () => {
      const res = await request(app)
        .post('/api/auth/dev-login')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/email/i)
    })

    it('returns 404 for unknown email', async () => {
      mockGetUserByEmail.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/auth/dev-login')
        .send({ email: 'no-existe@test.com' })

      expect(res.status).toBe(404)
      expect(res.body.error).toMatch(/no encontrado/i)
    })

    it('returns 401 for disabled user', async () => {
      const disabledUser = {
        id: 'user_disabled_002',
        email: 'disabled@test.com',
        nombre: 'Disabled',
        activo: false,
        estado: 'disabled' as const,
        isPlatformAdmin: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        appAccess: [],
      }
      mockGetUserByEmail.mockResolvedValue(disabledUser)

      const res = await request(app)
        .post('/api/auth/dev-login')
        .send({ email: 'disabled@test.com' })

      expect(res.status).toBe(401)
      expect(res.body.error).toMatch(/deshabilitad/i)
    })
  })

  // ────────────────────────────────────────────────
  // 11. Logout
  // ────────────────────────────────────────────────
  describe('POST /api/auth/logout — Logout', () => {
    it('clears refresh cookie and returns 204', async () => {
      const res = await request(app).post('/api/auth/logout')

      expect(res.status).toBe(204)

      // Verify cookie is cleared (Expires in past)
      const cookies = res.headers['set-cookie']
      expect(cookies).toBeDefined()
      const clearCookie = (cookies as string[]).find((c: string) =>
        c.startsWith('platform_refresh_token=')
      )
      expect(clearCookie).toBeDefined()
      // Express clearCookie sets Expires to epoch: "Thu, 01 Jan 1970 00:00:00 GMT"
      expect(clearCookie).toContain('Expires=Thu, 01 Jan 1970')
    })
  })

  // ────────────────────────────────────────────────
  // 11–12. Me endpoint
  // ────────────────────────────────────────────────
  describe('GET /api/auth/me — Current user', () => {
    it('with valid Bearer token → returns user info', async () => {
      const { signAccessToken } = await import('@platform/core')
      const token = signAccessToken({
        sub: mockPlatformUser.id,
        email: mockPlatformUser.email,
        name: mockPlatformUser.nombre,
        isPlatformAdmin: false,
        apps: {
          deposito: { rol: 'encargado', activo: true },
        },
      })

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.sub).toBe(mockPlatformUser.id)
      expect(res.body.email).toBe(mockPlatformUser.email)
      expect(res.body.name).toBe(mockPlatformUser.nombre)
      expect(res.body.apps).toBeDefined()
      expect(res.body.apps.deposito).toBeDefined()
      expect(res.body.apps.deposito.rol).toBe('encargado')
      expect(res.body.isPlatformAdmin).toBe(false)
    })

    it('without Authorization header → returns 401', async () => {
      const res = await request(app).get('/api/auth/me')

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Token requerido')
    })

    it('with expired token → returns 401', async () => {
      const expiredToken = jwt.sign(
        {
          sub: mockPlatformUser.id,
          email: mockPlatformUser.email,
          name: mockPlatformUser.nombre,
          isPlatformAdmin: false,
          apps: { deposito: { rol: 'encargado', activo: true } },
        },
        process.env.PLATFORM_JWT_SECRET!,
        { expiresIn: -1 }
      )

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Token inválido o expirado')
    })

    it('with Basic auth returns 401', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Basic dGVzdDpwYXNz')

      expect(res.status).toBe(401)
    })

    it('with empty Bearer token returns 401', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer   ')

      expect(res.status).toBe(401)
    })
  })
})
