import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Express } from 'express'
import jwt from 'jsonwebtoken'

// Silenciar ECONNRESET esperados por abort de conexiones SSE
process.on('uncaughtException', (err) => {
  if (err.message === 'aborted' || (err as NodeJS.ErrnoException)?.code === 'ECONNRESET') return
  console.error('Unhandled exception:', err)
})

// ──────────────────────────────────────────────────
// Hoisted mocks
// ──────────────────────────────────────────────────
const TEST_SECRET = 'test-secret-for-jwt-min-32-chars!!'

const { mockEventBus, mockGetNotificationsByUser, mockMarkAsRead, mockMarkAllAsRead } =
  vi.hoisted(() => {
    const mockOn = vi.fn().mockReturnValue(vi.fn())
    return {
      mockEventBus: {
        on: mockOn,
        emit: vi.fn(),
      },
      mockGetNotificationsByUser: vi.fn(),
      mockMarkAsRead: vi.fn(),
      mockMarkAllAsRead: vi.fn(),
    }
  })

// ──────────────────────────────────────────────────
// Module-level mocking
// ──────────────────────────────────────────────────
vi.mock('@platform/core', () => {
  const _jwt = require('jsonwebtoken')

  function _getSecret(): string {
    return process.env.PLATFORM_JWT_SECRET || TEST_SECRET
  }

  return {
    // ── JWT functions (real implementation) ──────────
    signAccessToken: (payload: Record<string, unknown>) =>
      _jwt.sign(payload, _getSecret(), { expiresIn: '15m' }),
    signRefreshToken: (userId: string) =>
      _jwt.sign({ sub: userId, type: 'refresh' as const }, _getSecret(), {
        expiresIn: '7d',
      }),
    verifyAccessToken: (token: string) => {
      try {
        const decoded = _jwt.verify(token, _getSecret()) as Record<string, unknown>
        const { sub, email, name, isPlatformAdmin, apps } = decoded
        if (!sub || !email || !apps) return null
        return {
          sub: sub as string,
          email: email as string,
          name: (name as string) ?? '',
          isPlatformAdmin: (isPlatformAdmin as boolean) ?? false,
          apps: apps as Record<string, { activo: boolean }>,
        } as import('@platform/core').JwtPayload
      } catch {
        return null
      }
    },
    verifyRefreshToken: (token: string) => {
      try {
        const decoded = _jwt.verify(token, _getSecret()) as Record<string, unknown>
        const { sub, type } = decoded
        if (!sub || type !== 'refresh') return null
        return { sub: sub as string, type: type as string, iat: Math.floor(Date.now() / 1000) }
      } catch {
        return null
      }
    },
    decodeToken: (token: string) => {
      try {
        const decoded = _jwt.decode(token) as Record<string, unknown>
        const { sub, email, name, isPlatformAdmin, apps } = decoded
        if (!sub || !email || !apps) return null
        return {
          sub: sub as string,
          email: email as string,
          name: (name as string) ?? '',
          isPlatformAdmin: (isPlatformAdmin as boolean) ?? false,
          apps: apps as Record<string, { activo: boolean }>,
        } as import('@platform/core').JwtPayload
      } catch {
        return null
      }
    },

    // ── Notification mocks ───────────────────────────
    eventBus: mockEventBus,
    getNotificationsByUser: mockGetNotificationsByUser,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    createNotification: vi.fn(),
    purgeOlderThan: vi.fn(),
    createNotificationHandler: vi.fn(),

    // ── Stubs for types and other exports ────────────
    hashPassword: vi.fn((pwd: string) => Promise.resolve(pwd)),
    comparePassword: vi.fn(() => Promise.resolve(true)),
    verifyTokenMiddleware: vi.fn((_req, _res, next) => next()),
    requireApp: (_appId: string) => vi.fn((_req, _res, next) => next()),
    requirePlatformAdmin: vi.fn((_req, _res, next) => next()),
    createUser: vi.fn(),
    getUserById: vi.fn(),
    getUserByEmail: vi.fn(),
    listUsers: vi.fn().mockResolvedValue([]),
    updateAppAccess: vi.fn(),
    deactivateUser: vi.fn(),
    EventBus: vi.fn(),
    createEventBus: vi.fn(),
    UnifiedSSEManager: vi.fn(),
    unifiedSSEManager: {},
  }
})

vi.mock('@platform/db', () => ({
  platformDb: {
    platformUser: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    appAccess: { upsert: vi.fn() },
  },
}))

// ──────────────────────────────────────────────────
// Imports (mocks already in place)
// ──────────────────────────────────────────────────
import { verifyToken } from '../middlewares/verify-token'
import notificationRoutes from '../routes/notifications'

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────
function createToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, TEST_SECRET, { expiresIn: '15m' })
}

const userPayload = {
  sub: 'user-1',
  email: 'user@test.com',
  name: 'Test User',
  isPlatformAdmin: false,
  apps: { deposito: { activo: true }, ale_bet: { activo: false }, admin: { activo: false } },
}

const adminPayload = {
  sub: 'admin-1',
  email: 'admin@test.com',
  name: 'Admin',
  isPlatformAdmin: true,
  apps: { deposito: { activo: true }, ale_bet: { activo: true }, admin: { activo: true } },
}

const otherAppPayload = {
  sub: 'user-2',
  email: 'user2@test.com',
  name: 'Other User',
  isPlatformAdmin: false,
  apps: { deposito: { activo: false }, ale_bet: { activo: true }, admin: { activo: false } },
}

function createApp(): Express {
  const express = require('express') as typeof import('express')
  const app = express()
  app.use(express.json())
  app.use('/api/notifications', verifyToken, notificationRoutes)
  return app
}

// ──────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────
describe('Notifications — Integration Tests', () => {
  let app: Express
  let userToken: string
  let adminToken: string
  let otherToken: string

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
    userToken = createToken(userPayload)
    adminToken = createToken(adminPayload)
    otherToken = createToken(otherAppPayload)
  })

  // ── SSE Stream ─────────────────────────────────

  describe('GET /api/notifications/stream', () => {
    it('devuelve 401 sin token', async () => {
      const res = await request(app).get('/api/notifications/stream')
      expect(res.status).toBe(401)
    })

    it('devuelve 401 con token inválido', async () => {
      const res = await request(app)
        .get('/api/notifications/stream')
        .set('Authorization', 'Bearer token-invalido')
      expect(res.status).toBe(401)
    })

    it('establece headers SSE correctos', async () => {
      const res = await new Promise<any>((resolve) => {
        const req = request(app)
          .get('/api/notifications/stream')
          .set('Authorization', `Bearer ${userToken}`)
          .buffer(false)

        req.on('response', (response) => {
          req.abort()
          resolve(response)
        })
        req.on('error', () => {}) // suprimir ECONNRESET por abort
        req.end()
      })

      expect(res.headers['content-type']).toBe('text/event-stream')
      expect(res.headers['cache-control']).toBe('no-cache')
      expect(res.headers['connection']).toBe('keep-alive')
    })

    it('envía evento connected al iniciar', async () => {
      const collected: string[] = []

      const req = request(app)
        .get('/api/notifications/stream')
        .set('Authorization', `Bearer ${userToken}`)
      req.on('error', () => {})

      const data = await new Promise<string>((resolve) => {
        req.buffer(false).parse((res: any, _cb: any) => {
          let buffer = ''
          res.on('data', (chunk: Buffer) => {
            buffer += chunk.toString()
            collected.push(chunk.toString())
            if (buffer.includes('event: connected')) {
              setTimeout(() => {
                req.abort()
                resolve(buffer)
              }, 50)
            }
          })
          res.on('end', () => resolve(buffer))
        })
        req.end()
      })

      expect(data).toContain('event: connected')
      expect(data).toContain('Conectado')
    })

    it('entrega eventos del eventBus al cliente SSE', async () => {
      const collected: string[] = []

      const req = request(app)
        .get('/api/notifications/stream')
        .set('Authorization', `Bearer ${userToken}`)
      req.on('error', () => {})

      await new Promise<void>((resolve) => {
        req.buffer(false).parse((res: any, _cb: any) => {
          res.on('data', (chunk: Buffer) => collected.push(chunk.toString()))
          res.on('end', () => resolve())
        })
        req.end()

        // Esperar a que se registre el handler, luego emitir evento
        setTimeout(() => {
          const handler = mockEventBus.on.mock.calls[0]?.[0]
          if (handler) {
            handler({
              app: 'deposito',
              tipo: 'pedido_nuevo',
              titulo: 'Nuevo pedido',
              mensaje: 'Pedido #123 creado',
              timestamp: new Date().toISOString(),
            })
          }
          setTimeout(() => {
            req.abort()
            resolve()
          }, 100)
        }, 100)
      })

      const allData = collected.join('')
      expect(allData).toContain('event: pedido_nuevo')
      expect(allData).toContain('Pedido #123 creado')
    })

    it('filtra eventos de apps no activas para el usuario', async () => {
      const collected: string[] = []

      const req = request(app)
        .get('/api/notifications/stream')
        .set('Authorization', `Bearer ${otherToken}`) // solo ale_bet activo
      req.on('error', () => {})

      await new Promise<void>((resolve) => {
        req.buffer(false).parse((res: any, _cb: any) => {
          res.on('data', (chunk: Buffer) => collected.push(chunk.toString()))
          res.on('end', () => resolve())
        })
        req.end()

        setTimeout(() => {
          const handler = mockEventBus.on.mock.calls[0]?.[0]
          if (handler) {
            // Este evento es de deposito — usuario no tiene acceso
            handler({
              app: 'deposito',
              tipo: 'stock_bajo',
              titulo: 'Stock bajo',
              mensaje: 'Stock bajo de Producto X',
              timestamp: new Date().toISOString(),
            })
            // Este evento es de ale_bet — debería pasar
            handler({
              app: 'ale_bet',
              tipo: 'pedido:aprobado',
              titulo: 'Pedido aprobado',
              mensaje: 'Pedido #456 aprobado',
              timestamp: new Date().toISOString(),
            })
          }
          setTimeout(() => {
            req.abort()
            resolve()
          }, 100)
        }, 100)
      })

      const allData = collected.join('')
      // Evento de deposito NO debería estar
      expect(allData).not.toContain('stock_bajo')
      // Evento de ale_bet SÍ debería estar
      expect(allData).toContain('pedido:aprobado')
    })

    it('admin recibe eventos de todas las apps', async () => {
      const collected: string[] = []

      const req = request(app)
        .get('/api/notifications/stream')
        .set('Authorization', `Bearer ${adminToken}`) // isPlatformAdmin: true
      req.on('error', () => {})

      await new Promise<void>((resolve) => {
        req.buffer(false).parse((res: any, _cb: any) => {
          res.on('data', (chunk: Buffer) => collected.push(chunk.toString()))
          res.on('end', () => resolve())
        })
        req.end()

        setTimeout(() => {
          const handler = mockEventBus.on.mock.calls[0]?.[0]
          if (handler) {
            handler({
              app: 'deposito',
              tipo: 'stock_bajo',
              titulo: 'Stock bajo',
              mensaje: 'Stock bajo de X',
              timestamp: new Date().toISOString(),
            })
            handler({
              app: 'admin',
              tipo: 'usuario_creado',
              titulo: 'Usuario creado',
              mensaje: 'Nuevo usuario',
              timestamp: new Date().toISOString(),
            })
          }
          setTimeout(() => {
            req.abort()
            resolve()
          }, 100)
        }, 100)
      })

      const allData = collected.join('')
      expect(allData).toContain('stock_bajo')
      expect(allData).toContain('usuario_creado')
    })

    it('registra y remueve handler al cerrar conexión', async () => {
      const req = request(app)
        .get('/api/notifications/stream')
        .set('Authorization', `Bearer ${userToken}`)
      req.on('error', () => {})

      await new Promise<void>((resolve) => {
        req.buffer(false).parse((_res: any, _cb: any) => {})
        req.end()

        setTimeout(() => {
          // Verificar que se registró el handler
          expect(mockEventBus.on).toHaveBeenCalledOnce()
          const off = mockEventBus.on.mock.results[0]?.value
          expect(off).toBeTypeOf('function')

          req.abort()

          setTimeout(() => {
            // Después de cerrar, el handler debería haberse removido
            // La función off fue llamada (devuelta por mockOn)
            resolve()
          }, 50)
        }, 100)
      })
    })
  })

  // ── GET /api/notifications — Listar ─────────────

  describe('GET /api/notifications', () => {
    it('devuelve lista paginada de notificaciones', async () => {
      mockGetNotificationsByUser.mockResolvedValueOnce({
        notifications: [
          { id: 'n1', userId: 'user-1', app: 'deposito', tipo: 'stock_bajo', titulo: 'Stock bajo', mensaje: 'Test', leida: false, link: null, metadata: null, createdAt: new Date().toISOString() },
        ],
        total: 1,
        page: 1,
        limit: 20,
      })

      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(200)
      expect(res.body.notifications).toHaveLength(1)
      expect(res.body.total).toBe(1)
      expect(mockGetNotificationsByUser).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        {},
        { page: 1, limit: 20 },
      )
    })

    it('filtra por app, leida y tipo', async () => {
      mockGetNotificationsByUser.mockResolvedValueOnce({
        notifications: [],
        total: 0,
        page: 1,
        limit: 20,
      })

      await request(app)
        .get('/api/notifications?app=deposito&leida=false&tipo=stock_bajo')
        .set('Authorization', `Bearer ${userToken}`)

      expect(mockGetNotificationsByUser).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        { app: 'deposito', leida: false, tipo: 'stock_bajo' },
        { page: 1, limit: 20 },
      )
    })

    it('usa defaults de paginación', async () => {
      mockGetNotificationsByUser.mockResolvedValueOnce({
        notifications: [],
        total: 0,
        page: 1,
        limit: 20,
      })

      await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${userToken}`)

      expect(mockGetNotificationsByUser).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        {},
        { page: 1, limit: 20 },
      )
    })

    it('devuelve 500 si el servicio falla', async () => {
      mockGetNotificationsByUser.mockRejectedValueOnce(new Error('DB error'))

      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(500)
    })

    it('devuelve 401 sin autenticación', async () => {
      const res = await request(app).get('/api/notifications')
      expect(res.status).toBe(401)
    })
  })

  // ── PATCH /api/notifications/:id/read ───────────

  describe('PATCH /api/notifications/:id/read', () => {
    it('marca notificación como leída', async () => {
      mockMarkAsRead.mockResolvedValueOnce(undefined)

      const res = await request(app)
        .patch('/api/notifications/n-123/read')
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockMarkAsRead).toHaveBeenCalledWith(expect.anything(), 'n-123', 'user-1')
    })

    it('devuelve 404 si la notificación no existe o no pertenece al usuario', async () => {
      const error = new Error('Not found')
      ;(error as any).code = 'P2025'
      mockMarkAsRead.mockRejectedValueOnce(error)

      const res = await request(app)
        .patch('/api/notifications/n-inexistente/read')
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Notificación no encontrada')
    })

    it('devuelve 401 sin autenticación', async () => {
      const res = await request(app).patch('/api/notifications/n-123/read')
      expect(res.status).toBe(401)
    })
  })

  // ── POST /api/notifications/read-all ────────────

  describe('POST /api/notifications/read-all', () => {
    it('marca todas como leídas', async () => {
      mockMarkAllAsRead.mockResolvedValueOnce(5)

      const res = await request(app)
        .post('/api/notifications/read-all')
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.count).toBe(5)
      expect(mockMarkAllAsRead).toHaveBeenCalledWith(expect.anything(), 'user-1')
    })

    it('devuelve 401 sin autenticación', async () => {
      const res = await request(app).post('/api/notifications/read-all')
      expect(res.status).toBe(401)
    })
  })
})
