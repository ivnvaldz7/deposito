import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Express } from 'express'
import jwt from 'jsonwebtoken'

// ──────────────────────────────────────────────────
// Hoisted mocks
// ──────────────────────────────────────────────────
const { mockGetUserByEmail, mockGetUserById, mockGoogleStrategy, mockDb, mockCore } =
  vi.hoisted(() => {
    const mockCreateUser = vi.fn()
    const mockUpdateAppAccess = vi.fn()

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
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn(),
            update: vi.fn(),
          },
          appAccess: { upsert: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
          session: {
            create: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          platformAuditoria: { create: vi.fn() },
        },
      },
      mockCore: {
        createUser: mockCreateUser,
        updateAppAccess: mockUpdateAppAccess,
      },
    }
  })

vi.mock('@platform/core', () => {
  const _jwt = require('jsonwebtoken')
  const crypto = require('crypto')

  function _getSecret(): string {
    return process.env.PLATFORM_JWT_SECRET || 'test-secret-for-jwt-min-32-chars!!'
  }

  return {
    signAccessToken: (payload: Record<string, unknown>) => {
      return _jwt.sign(payload, _getSecret(), { expiresIn: '15m' })
    },
    signRefreshToken: (userId: string, sessionId: string = 'session_test_1') => {
      return _jwt.sign(
        { sub: userId, type: 'refresh' as const, sid: sessionId },
        _getSecret(),
        { expiresIn: '7d' },
      )
    },
    verifyRefreshToken: (token: string) => {
      try {
        const decoded = _jwt.verify(token, _getSecret())
        if (typeof decoded !== 'object' || !decoded) return null
        const { sub, type, iat, sid } = decoded as Record<string, unknown>
        if (!sub || type !== 'refresh') return null
        return {
          sub,
          type,
          iat: iat ?? Math.floor(Date.now() / 1000),
          sid: sid ?? 'session_test_1',
        }
      } catch {
        return null
      }
    },
    hashRefreshToken: (token: string) =>
      crypto.createHash('sha256').update(token).digest('hex'),
    APP_SLUG_BY_ID: { deposito: 'deposito', ale_bet: 'ale-bet', portal: 'portal', admin: 'admin' },
    getAppAccess: (user: unknown, slug: string) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user && (user as any).apps ? (user as any).apps[slug] : undefined,
    verifyAccessToken: (token: string) => {
      try {
        const decoded = _jwt.verify(token, _getSecret())
        if (typeof decoded !== 'object' || !decoded) return null
        const { sub, email, name, isPlatformAdmin, apps } = decoded as Record<string, unknown>
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
    hashPassword: vi.fn().mockResolvedValue('$2b$10$hashedNewPassword'),
    comparePassword: vi.fn(),
    validatePasswordPolicy: vi.fn(),
    isValidAppRole: (app: string, rol: string) => {
      const roles: Record<string, string[]> = {
        deposito: ['encargado', 'observador', 'solicitante'],
        ale_bet: ['admin', 'vendedor', 'armador', 'facturacion', 'observador', 'encargado'],
        admin: ['admin'],
        portal: ['viewer'],
      }
      const list = roles[app]
      return list !== undefined && list.includes(rol)
    },
    createUser: mockCore.createUser,
    listUsers: vi.fn().mockResolvedValue([]),
    updateAppAccess: mockCore.updateAppAccess,
    deactivateUser: vi.fn(),
    removeAppAccess: vi.fn(),
    PLATFORM_AUDIT_ACTIONS: {
      LOGIN_SUCCESS: 'LOGIN_SUCCESS',
      LOGIN_FAILURE: 'LOGIN_FAILURE',
      LOGOUT: 'LOGOUT',
      PASSWORD_CHANGED: 'PASSWORD_CHANGED',
      PASSWORD_RESET: 'PASSWORD_RESET',
      USER_CREATED: 'USER_CREATED',
      USER_ACTIVATED: 'USER_ACTIVATED',
      USER_DEACTIVATED: 'USER_DEACTIVATED',
      SESSIONS_REVOKED: 'SESSIONS_REVOKED',
      APP_ACCESS_GRANTED: 'APP_ACCESS_GRANTED',
      APP_ACCESS_REVOKED: 'APP_ACCESS_REVOKED',
      APP_ACCESS_ROLE_CHANGED: 'APP_ACCESS_ROLE_CHANGED',
      APP_ACCESS_ENABLED: 'APP_ACCESS_ENABLED',
      APP_ACCESS_DISABLED: 'APP_ACCESS_DISABLED',
    },
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

vi.mock('../auth/strategies/google', () => ({
  GoogleStrategy: vi.fn(function () {
    return mockGoogleStrategy
  }),
}))

// ──────────────────────────────────────────────────
// Imports (after mocks)
// ──────────────────────────────────────────────────
import { createTestApp } from './helpers/create-test-app'
import { hashRefreshToken, verifyRefreshToken } from '@platform/core'

function buildAccessToken(user: {
  id: string
  email: string
  nombre: string
  isPlatformAdmin: boolean
  apps: Record<string, { rol: string; activo: boolean }>
}): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.nombre,
      isPlatformAdmin: user.isPlatformAdmin,
      apps: user.apps,
    },
    process.env.PLATFORM_JWT_SECRET!,
    { expiresIn: '15m' },
  )
}

function futureDate(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
}

function activeSession(id: string, platformUserId = 'user_abc123') {
  return {
    id,
    platformUserId,
    tokenHash: 'hash',
    expiresAt: futureDate(),
    revokedAt: null,
    createdAt: new Date(),
  }
}

describe('ADMIN AUTH FASE 1A — sesiones, contraseñas y auditoría', () => {
  let app: Express

  const regularUser = {
    id: 'user_abc123',
    email: 'encargado@deposito.com',
    nombre: 'Juan Encargado',
    activo: true,
    estado: 'active' as const,
    isPlatformAdmin: false,
    mustChangePassword: false,
    password: '$2b$10$hashedPasswordString',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    appAccess: [
      { app: 'deposito', rol: 'encargado', activo: true, userId: 'user_abc123' },
    ],
  }

  const adminUser = {
    id: 'admin_xyz789',
    email: 'admin@plataforma.com',
    nombre: 'Admin User',
    activo: true,
    estado: 'active' as const,
    isPlatformAdmin: true,
    mustChangePassword: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    appAccess: [
      { app: 'admin', rol: 'admin', activo: true, userId: 'admin_xyz789' },
    ],
  }

  const adminApps = { admin: { rol: 'admin', activo: true } }

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

  function mockUsersById(): void {
    mockGetUserById.mockImplementation((_db: unknown, id: string) =>
      Promise.resolve(id === 'admin_xyz789' ? adminUser : regularUser),
    )
  }

  // ────────────────────────────────────────────────
  // 1. Login crea una Session persistente
  // ────────────────────────────────────────────────
  describe('POST /api/auth/login — crea Session persistente', () => {
    it('persiste una sesión cuyo tokenHash es el hash del JWT de la cookie (FASE1A-S1)', async () => {
      mockGetUserByEmail.mockResolvedValue(regularUser)
      vi.mocked(mockDb.platformDb.session.create).mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: data.id,
          platformUserId: data.platformUserId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          revokedAt: null,
          createdAt: new Date(),
        }),
      )
      const comparePassword = (await import('@platform/core')).comparePassword as ReturnType<typeof vi.fn>
      comparePassword.mockResolvedValue(true)

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'encargado@deposito.com', password: 'correct-password' })

      expect(res.status).toBe(200)
      expect(res.body.user.sub).toBe('user_abc123')
      expect(res.body.user.mustChangePassword).toBe(false)

      // Cookie JWT firmado con sid = session.id y hash persistido del mismo JWT
      const cookies = res.headers['set-cookie'] as string[]
      const refreshCookie = cookies.find((c: string) => c.startsWith('platform_refresh_token='))
      expect(refreshCookie).toBeDefined()
      const refreshToken = decodeURIComponent(refreshCookie!.split('=')[1].split(';')[0])

      const sessionCreateArg = mockDb.platformDb.session.create.mock.calls[0][0]
      const payload = verifyRefreshToken(refreshToken) as { sid: string } | null
      expect(payload).not.toBeNull()
      expect(payload!.sid).toBe(sessionCreateArg.data.id)
      expect(sessionCreateArg.data.tokenHash).toBe(hashRefreshToken(refreshToken))

      // Auditoría de éxito registrada sin secretos
      const auditCalls = mockDb.platformDb.platformAuditoria.create.mock.calls
      const successAudit = auditCalls.find(
        ([arg]: any[]) => arg.data.action === 'LOGIN_SUCCESS',
      )
      expect(successAudit).toBeDefined()
      expect(JSON.stringify(successAudit![0].data)).not.toMatch(/password/i)
      expect(JSON.stringify(successAudit![0].data)).not.toMatch(/refresh/i)
    })

    it('registra LOGIN_FAILURE sin exponer la contraseña (FASE1A-S2)', async () => {
      mockGetUserByEmail.mockResolvedValue(regularUser)
      const comparePassword = (await import('@platform/core')).comparePassword as ReturnType<typeof vi.fn>
      comparePassword.mockResolvedValue(false)

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'encargado@deposito.com', password: 'wrong-password' })

      expect(res.status).toBe(401)
      const auditCalls = mockDb.platformDb.platformAuditoria.create.mock.calls
      const failureAudit = auditCalls.find(
        ([arg]: any[]) => arg.data.action === 'LOGIN_FAILURE',
      )
      expect(failureAudit).toBeDefined()
      expect(JSON.stringify(failureAudit![0].data)).not.toMatch(/wrong-password/i)
      expect(JSON.stringify(failureAudit![0].data)).not.toContain('"password"')
      expect(failureAudit![0].data.previous.reason).toBe('bad_password')
    })

    it('no crea sesión cuando la contraseña es incorrecta (FASE1A-S3)', async () => {
      mockGetUserByEmail.mockResolvedValue(regularUser)
      const comparePassword = (await import('@platform/core')).comparePassword as ReturnType<typeof vi.fn>
      comparePassword.mockResolvedValue(false)

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'encargado@deposito.com', password: 'wrong-password' })

      expect(res.status).toBe(401)
      expect(mockDb.platformDb.session.create).not.toHaveBeenCalled()
    })
  })

  // ────────────────────────────────────────────────
  // 2. Refresh: rotación + replay rechazado
  // ────────────────────────────────────────────────
  describe('POST /api/auth/refresh — rotación y anti-replay', () => {
    it('rota la sesión y rechaza el replay del token anterior (FASE1A-R1)', async () => {
      mockGetUserById.mockResolvedValue(regularUser)
      mockDb.platformDb.session.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: data.id,
          platformUserId: data.platformUserId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          revokedAt: null,
          createdAt: new Date(),
        }),
      )
      // Primera búsqueda → sesión activa; replay → sesión ya revocada por la rotación
      mockDb.platformDb.session.findUnique
        .mockResolvedValueOnce(activeSession('session_a'))
        .mockResolvedValueOnce({ ...activeSession('session_a'), revokedAt: new Date() })

      const refreshToken = jwt.sign(
        { sub: 'user_abc123', type: 'refresh', sid: 'session_a' },
        process.env.PLATFORM_JWT_SECRET!,
        { expiresIn: '7d' },
      )

      const first = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `platform_refresh_token=${refreshToken}`)

      expect(first.status).toBe(200)
      expect(first.body.token).toBeDefined()
      expect(first.body.user.mustChangePassword).toBe(false)

      // La sesión original fue revocada
      expect(mockDb.platformDb.session.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'session_a' } }),
      )

      // Se creó una sesión nueva con un JWT firmado con el nuevo sid
      const createCalls = mockDb.platformDb.session.create.mock.calls
      expect(createCalls).toHaveLength(1)
      const newSid = createCalls[0][0].data.id
      const newCookie = (first.headers['set-cookie'] as string[]).find((c) =>
        c.startsWith('platform_refresh_token=')
      )!
      const newJwt = decodeURIComponent(newCookie.split('=')[1].split(';')[0])
      const newPayload = verifyRefreshToken(newJwt) as { sid: string } | null
      expect(newPayload!.sid).toBe(newSid)

      // REPLAY: reutilizar el token viejo → la sesión original está revocada → 401
      const replay = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `platform_refresh_token=${refreshToken}`)

      expect(replay.status).toBe(401)
      expect(replay.body.error).toMatch(/revocada|no encontrada/i)
    })

    it('rechaza un refresh token sin sesión persistida (FASE1A-R2)', async () => {
      mockGetUserById.mockResolvedValue(regularUser)
      mockDb.platformDb.session.findUnique.mockResolvedValue(null)

      const refreshToken = jwt.sign(
        { sub: 'user_abc123', type: 'refresh', sid: 'session_ghost' },
        process.env.PLATFORM_JWT_SECRET!,
        { expiresIn: '7d' },
      )

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `platform_refresh_token=${refreshToken}`)

      expect(res.status).toBe(401)
      expect(res.body.error).toMatch(/sesión/i)
    })
  })

  // ────────────────────────────────────────────────
  // 3. Logout: revoca la sesión actual + idempotente
  // ────────────────────────────────────────────────
  describe('POST /api/auth/logout — revoca sesión', () => {
    it('revoca la sesión de la cookie y limpia la cookie (FASE1A-L1)', async () => {
      mockDb.platformDb.session.findUnique.mockResolvedValue(activeSession('session_b'))
      const refreshToken = jwt.sign(
        { sub: 'user_abc123', type: 'refresh', sid: 'session_b' },
        process.env.PLATFORM_JWT_SECRET!,
        { expiresIn: '7d' },
      )

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', `platform_refresh_token=${refreshToken}`)

      expect(res.status).toBe(204)
      expect(mockDb.platformDb.session.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'session_b' } }),
      )
      const auditCalls = mockDb.platformDb.platformAuditoria.create.mock.calls
      expect(auditCalls.some(([arg]: any[]) => arg.data.action === 'LOGOUT')).toBe(true)
    })

    it('es idempotente: sin cookie o sesión ya revocada responde 204 igual (FASE1A-L2)', async () => {
      mockDb.platformDb.session.findUnique.mockResolvedValue(null)

      const res1 = await request(app).post('/api/auth/logout')
      expect(res1.status).toBe(204)

      const res2 = await request(app).post('/api/auth/logout')
      expect(res2.status).toBe(204)
    })
  })

  // ────────────────────────────────────────────────
  // 4. Desactivación revoca todas las sesiones
  // ────────────────────────────────────────────────
  describe('PUT /api/admin/:id/status — desactivación revoca sesiones', () => {
    it('al desactivar revoca todas las sesiones y audita (FASE1A-D1)', async () => {
      mockUsersById()
      mockDb.platformDb.platformUser.update.mockResolvedValue({
        ...regularUser,
        activo: false,
        estado: 'disabled',
      })
      mockDb.platformDb.session.updateMany.mockResolvedValue({ count: 3 })
      const token = buildAccessToken({
        id: adminUser.id,
        email: adminUser.email,
        nombre: adminUser.nombre,
        isPlatformAdmin: true,
        apps: adminApps,
      })

      const res = await request(app)
        .put('/api/admin/user_abc123/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ activo: false, estado: 'disabled' })

      expect(res.status).toBe(200)
      expect(mockDb.platformDb.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ platformUserId: 'user_abc123' }),
        }),
      )
      const auditCalls = mockDb.platformDb.platformAuditoria.create.mock.calls
      expect(auditCalls.some(([arg]: any[]) => arg.data.action === 'SESSIONS_REVOKED')).toBe(true)
      expect(auditCalls.some(([arg]: any[]) => arg.data.action === 'USER_DEACTIVATED')).toBe(true)
    })

    it('un refresh posterior con sesión revocada es rechazado (FASE1A-D2)', async () => {
      mockGetUserById.mockResolvedValue(regularUser)
      mockDb.platformDb.session.findUnique.mockResolvedValue({
        ...activeSession('session_c'),
        revokedAt: new Date(),
      })

      const refreshToken = jwt.sign(
        { sub: 'user_abc123', type: 'refresh', sid: 'session_c' },
        process.env.PLATFORM_JWT_SECRET!,
        { expiresIn: '7d' },
      )

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `platform_refresh_token=${refreshToken}`)

      expect(res.status).toBe(401)
      expect(res.body.error).toMatch(/revocada/i)
    })
  })

  // ────────────────────────────────────────────────
  // 5. Change-password: flujo completo
  // ────────────────────────────────────────────────
  describe('POST /api/auth/change-password — cambio de contraseña', () => {
    it('valida actual, actualiza, revoca todas y crea nueva sesión (FASE1A-P1)', async () => {
      const userWithPending = { ...regularUser, mustChangePassword: true }
      mockDb.platformDb.platformUser.findUnique.mockResolvedValue(userWithPending)
      mockDb.platformDb.platformUser.update.mockResolvedValue({
        ...userWithPending,
        mustChangePassword: false,
      })
      mockDb.platformDb.session.updateMany.mockResolvedValue({ count: 2 })
      mockDb.platformDb.session.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: data.id,
          platformUserId: data.platformUserId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          revokedAt: null,
          createdAt: new Date(),
        }),
      )
      const comparePassword = (await import('@platform/core')).comparePassword as ReturnType<typeof vi.fn>
      comparePassword.mockResolvedValue(true)

      const token = buildAccessToken({
        id: regularUser.id,
        email: regularUser.email,
        nombre: regularUser.nombre,
        isPlatformAdmin: false,
        apps: { deposito: { rol: 'encargado', activo: true } },
      })

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'Temporal123!', newPassword: 'NuevaClave123!' })

      expect(res.status).toBe(200)
      expect(res.body.user.mustChangePassword).toBe(false)
      expect(res.body.token).toBeDefined()

      // Revocó todas las sesiones previas
      expect(mockDb.platformDb.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ platformUserId: 'user_abc123' }) }),
      )
      // Creó una nueva sesión
      expect(mockDb.platformDb.session.create).toHaveBeenCalledTimes(1)
      // Audita PASSWORD_CHANGED
      const auditCalls = mockDb.platformDb.platformAuditoria.create.mock.calls
      expect(auditCalls.some(([arg]: any[]) => arg.data.action === 'PASSWORD_CHANGED')).toBe(true)
      // El audit no contiene la nueva contraseña
      expect(JSON.stringify(auditCalls)).not.toMatch(/NuevaClave/i)
    })

    it('rechaza contraseña actual incorrecta (FASE1A-P2)', async () => {
      mockDb.platformDb.platformUser.findUnique.mockResolvedValue(regularUser)
      const comparePassword = (await import('@platform/core')).comparePassword as ReturnType<typeof vi.fn>
      comparePassword.mockResolvedValue(false)

      const token = buildAccessToken({
        id: regularUser.id,
        email: regularUser.email,
        nombre: regularUser.nombre,
        isPlatformAdmin: false,
        apps: { deposito: { rol: 'encargado', activo: true } },
      })

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'WrongPass!', newPassword: 'NuevaClave123!' })

      expect(res.status).toBe(401)
      expect(res.body.error).toMatch(/actual incorrecta/i)
      expect(mockDb.platformDb.session.create).not.toHaveBeenCalled()
    })

    it('rechaza nueva contraseña igual a la actual (FASE1A-P3)', async () => {
      mockDb.platformDb.platformUser.findUnique.mockResolvedValue(regularUser)
      const comparePassword = (await import('@platform/core')).comparePassword as ReturnType<typeof vi.fn>
      comparePassword.mockResolvedValue(true)

      const token = buildAccessToken({
        id: regularUser.id,
        email: regularUser.email,
        nombre: regularUser.nombre,
        isPlatformAdmin: false,
        apps: { deposito: { rol: 'encargado', activo: true } },
      })

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'MismaClave123!', newPassword: 'MismaClave123!' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/diferente/i)
    })
  })

  // ────────────────────────────────────────────────
  // 6. Alta y reset admin con password temporal
  // ────────────────────────────────────────────────
  describe('POST /api/admin/ y POST /:id/reset-password — password temporal', () => {
    it('la alta genera una password temporal devuelta una sola vez (FASE1A-C1)', async () => {
      mockGetUserById.mockResolvedValue(adminUser)
      mockGetUserByEmail.mockResolvedValue(null)
      mockCore.createUser.mockImplementation(
        (_db: unknown, input: { email: string; nombre: string }) =>
          Promise.resolve({
            id: 'user_new_001',
            email: input.email,
            nombre: input.nombre,
            activo: true,
            estado: 'active',
            isPlatformAdmin: false,
            mustChangePassword: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            appAccess: [{ app: 'deposito', rol: 'encargado', activo: true, userId: 'user_new_001' }],
          }),
      )
      const token = buildAccessToken({
        id: adminUser.id,
        email: adminUser.email,
        nombre: adminUser.nombre,
        isPlatformAdmin: true,
        apps: adminApps,
      })

      const res = await request(app)
        .post('/api/admin/')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'nuevo@deposito.com',
          nombre: 'Nuevo Usuario',
          appAccess: [{ app: 'deposito', rol: 'encargado' }],
        })

      expect(res.status).toBe(201)
      expect(res.body.user.mustChangePassword).toBe(true)
      expect(typeof res.body.temporaryPassword).toBe('string')
      expect(res.body.temporaryPassword.length).toBeGreaterThanOrEqual(12)

      // createUser fue llamado con mustChangePassword: true y sin password propio
      const createArg = mockCore.createUser.mock.calls[0][1]
      expect(createArg.mustChangePassword).toBe(true)
      expect(createArg.password).toBeDefined()
      expect(createArg.password).not.toContain('nuevo@deposito.com')

      // La auditoría NO contiene el temporaryPassword
      const auditCalls = mockDb.platformDb.platformAuditoria.create.mock.calls
      expect(JSON.stringify(auditCalls)).not.toMatch(res.body.temporaryPassword)
      expect(auditCalls.some(([arg]: any[]) => arg.data.action === 'USER_CREATED')).toBe(true)
      expect(auditCalls.some(([arg]: any[]) => arg.data.action === 'APP_ACCESS_GRANTED')).toBe(true)
    })

    it('POST /:id/reset-password devuelve temporal, fuerza cambio y revoca sesiones (FASE1A-RST1)', async () => {
      mockUsersById()
      mockDb.platformDb.platformUser.update.mockResolvedValue({
        ...regularUser,
        mustChangePassword: true,
      })
      mockDb.platformDb.session.updateMany.mockResolvedValue({ count: 2 })
      const token = buildAccessToken({
        id: adminUser.id,
        email: adminUser.email,
        nombre: adminUser.nombre,
        isPlatformAdmin: true,
        apps: adminApps,
      })

      const res = await request(app)
        .post('/api/admin/user_abc123/reset-password')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(typeof res.body.temporaryPassword).toBe('string')
      expect(res.body.temporaryPassword.length).toBeGreaterThanOrEqual(12)

      const updateArg = mockDb.platformDb.platformUser.update.mock.calls[0][0]
      expect(updateArg.data.mustChangePassword).toBe(true)
      expect(mockDb.platformDb.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ platformUserId: 'user_abc123' }) }),
      )

      const auditCalls = mockDb.platformDb.platformAuditoria.create.mock.calls
      expect(auditCalls.some(([arg]: any[]) => arg.data.action === 'PASSWORD_RESET')).toBe(true)
      expect(JSON.stringify(auditCalls)).not.toMatch(res.body.temporaryPassword)
    })

    it('POST /:id/reset-password para usuario inexistente → 404 (FASE1A-RST2)', async () => {
      mockGetUserById.mockImplementation((_db: unknown, id: string) =>
        Promise.resolve(id === 'admin_xyz789' ? adminUser : null),
      )
      const token = buildAccessToken({
        id: adminUser.id,
        email: adminUser.email,
        nombre: adminUser.nombre,
        isPlatformAdmin: true,
        apps: adminApps,
      })

      const res = await request(app)
        .post('/api/admin/user_ghost/reset-password')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toMatch(/no encontrado/i)
    })
  })

  // ────────────────────────────────────────────────
  // 7. Google callback crea Session persistente
  // ────────────────────────────────────────────────
  describe('GET /api/auth/google/callback — Google crea Session', () => {
    it('tras un login válido crea una sesión persistente (FASE1A-G1)', async () => {
      mockGoogleStrategy.exchangeCode.mockResolvedValue({
        providerId: 'google-123',
        email: regularUser.email,
        name: regularUser.nombre,
      })
      mockGetUserByEmail.mockResolvedValue(regularUser)
      mockDb.platformDb.session.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: data.id,
          platformUserId: data.platformUserId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          revokedAt: null,
          createdAt: new Date(),
        }),
      )

      const res = await request(app)
        .get('/api/auth/google/callback?code=valid-code')

      expect(res.status).toBe(302)
      expect(mockDb.platformDb.session.create).toHaveBeenCalledTimes(1)
      const createArg = mockDb.platformDb.session.create.mock.calls[0][0]
      expect(createArg.data.platformUserId).toBe('user_abc123')

      const cookies = res.headers['set-cookie'] as string[]
      const refreshCookie = cookies.find((c: string) => c.startsWith('platform_refresh_token='))
      expect(refreshCookie).toBeDefined()
      const refreshToken = decodeURIComponent(refreshCookie!.split('=')[1].split(';')[0])
      const payload = verifyRefreshToken(refreshToken) as { sid: string } | null
      expect(payload!.sid).toBe(createArg.data.id)
      expect(createArg.data.tokenHash).toBe(hashRefreshToken(refreshToken))
    })
  })
})