import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

// events.ts no usa prisma ni @platform/db — solo JWT + SSE manager

const env = vi.hoisted(() => {
  process.env.PLATFORM_JWT_SECRET = 'test-secret'
  return {}
})

void env

const sseManagerMock = vi.hoisted(() => ({
  addClient: vi.fn(() => 'client-uuid-1'),
  removeClient: vi.fn(),
  broadcast: vi.fn(),
  broadcastGlobal: vi.fn(),
}))

vi.mock('../lib/sse-manager', () => ({ sseManager: sseManagerMock }))

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

import eventsRouter from '../routes/events'

describe('Eventos SSE', () => {
  const app = createTestApp('/api/events', eventsRouter)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/events/auth — emitir ticket', () => {
    it('devuelve ticket con autenticación', async () => {
      const res = await request(app)
        .post('/api/events/auth')
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('ticket')
      expect(typeof res.body.ticket).toBe('string')
    })

    it('devuelve 401 sin autenticación', async () => {
      const res = await request(app).post('/api/events/auth')
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/events — validar ticket SSE', () => {
    it('devuelve 401 sin ticket', async () => {
      const res = await request(app).get('/api/events')
      expect(res.status).toBe(401)
      expect(res.body.message).toBe('Ticket requerido')
    })

    it('devuelve 401 con ticket inválido', async () => {
      const res = await request(app).get('/api/events?ticket=no-existe')
      expect(res.status).toBe(401)
      expect(res.body.message).toBe('Ticket inválido o expirado')
    })

    it('flujo completo: ticket creado permite conexión SSE', async () => {
      const postRes = await request(app)
        .post('/api/events/auth')
        .set('x-test-role', 'encargado')
      expect(postRes.status).toBe(200)
      const ticket = postRes.body.ticket

      // Conectar SSE. El streaming nunca termina, esperamos timeout.
      // Lo importante es que addClient se haya llamado con los datos correctos.
      await expect(
        request(app)
          .get(`/api/events?ticket=${ticket}`)
          .timeout(300)
      ).rejects.toThrow()

      expect(sseManagerMock.addClient).toHaveBeenCalledWith('enc-1', 'encargado', expect.any(Object))
    })
  })
})
