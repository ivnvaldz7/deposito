import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

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

interface UserMock {
  id: string
  email: string
  name: string
  role: string
  createdAt: Date
}

const prismaMock = vi.hoisted(() => {
  const state: { users: UserMock[] } = { users: [] }

  function reset() {
    state.users = []
  }

  return {
    state,
    reset,
    user: {
      findMany: vi.fn(async ({ select, orderBy }: any) => {
        let result = [...state.users]
        if (orderBy?.createdAt === 'asc') {
          result.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        }
        if (select) {
          return result.map((u) => {
            const picked: Record<string, unknown> = {}
            for (const key of Object.keys(select)) {
              if (key in u) picked[key] = (u as Record<string, unknown>)[key]
            }
            return picked
          })
        }
        return result
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const idx = state.users.findIndex((u) => u.id === where.id)
        if (idx === -1) {
          const err = new Error('Record not found')
          ;(err as any).code = 'P2025'
          throw err
        }
        state.users[idx] = { ...state.users[idx], ...data }
        return state.users[idx]
      }),
      delete: vi.fn(async ({ where }: any) => {
        const idx = state.users.findIndex((u) => u.id === where.id)
        if (idx === -1) {
          const err = new Error('Record not found')
          ;(err as any).code = 'P2025'
          throw err
        }
        state.users.splice(idx, 1)
      }),
    },
  }
})

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }))

import usersRouter from '../routes/users'

function crearUser(overrides: Partial<UserMock> = {}): UserMock {
  const idx = prismaMock.state.users.length + 1
  const user: UserMock = {
    id: `user-${idx}`,
    email: `user${idx}@test.com`,
    name: `User ${idx}`,
    role: 'solicitante',
    createdAt: new Date(),
    ...overrides,
  }
  prismaMock.state.users.push(user)
  return user
}

describe('Users', () => {
  const app = createTestApp('/api/users', usersRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.reset()
  })

  describe('GET /api/users', () => {
    it('devuelve lista de usuarios (solo campos select)', async () => {
      crearUser({ id: 'u-1', email: 'a@test.com', name: 'Alice', role: 'encargado' })
      crearUser({ id: 'u-2', email: 'b@test.com', name: 'Bob', role: 'observador' })

      const res = await request(app)
        .get('/api/users')
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
      expect(res.body[0].email).toBe('a@test.com')
      expect(res.body[1].email).toBe('b@test.com')
      // solo los campos seleccionados
      expect(Object.keys(res.body[0]).sort()).toEqual(['createdAt', 'email', 'id', 'name', 'role'])
    })

    it('devuelve 403 con rol observador', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(403)
    })
  })

  describe('PUT /api/users/:id', () => {
    it('cambia el rol de un usuario', async () => {
      crearUser({ id: 'u-1', email: 'user@test.com', role: 'solicitante' })

      const res = await request(app)
        .put('/api/users/u-1')
        .set('x-test-role', 'encargado')
        .send({ role: 'encargado' })

      expect(res.status).toBe(200)
      expect(res.body.role).toBe('encargado')
    })

    it('devuelve 404 si el usuario no existe', async () => {
      const res = await request(app)
        .put('/api/users/no-existe')
        .set('x-test-role', 'encargado')
        .send({ role: 'observador' })

      expect(res.status).toBe(404)
      expect(res.body.message).toBe('Usuario no encontrado')
    })

    it('rechaza rol inválido', async () => {
      crearUser({ id: 'u-1', email: 'user@test.com' })

      const res = await request(app)
        .put('/api/users/u-1')
        .set('x-test-role', 'encargado')
        .send({ role: 'superadmin' })

      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /api/users/:id', () => {
    it('elimina un usuario existente', async () => {
      crearUser({ id: 'u-1', email: 'user@test.com' })

      const res = await request(app)
        .delete('/api/users/u-1')
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(204)
      expect(prismaMock.state.users).toHaveLength(0)
    })

    it('devuelve 404 si el usuario no existe', async () => {
      const res = await request(app)
        .delete('/api/users/no-existe')
        .set('x-test-role', 'encargado')

      expect(res.status).toBe(404)
      expect(res.body.message).toBe('Usuario no encontrado')
    })

    it('rechaza auto-eliminación (req.depositoUser.id === :id)', async () => {
      crearUser({ id: 'enc-1', email: 'enc@test.com', role: 'encargado' })

      const res = await request(app)
        .delete('/api/users/enc-1')
        .set('x-test-role', 'encargado')
        .set('x-test-user-id', 'enc-1')

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('No podés eliminar tu propia cuenta')
    })
  })
})
