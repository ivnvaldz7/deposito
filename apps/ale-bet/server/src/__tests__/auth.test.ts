import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

const comparePasswordMock = vi.hoisted(() => vi.fn())
const getUserByEmailMock = vi.hoisted(() => vi.fn())
const signTokenMock = vi.hoisted(() => vi.fn(() => 'signed-token'))

vi.mock('@platform/db', () => ({
  platformDb: {},
}))

vi.mock('@platform/core', () => ({
  comparePassword: comparePasswordMock,
  getUserByEmail: getUserByEmailMock,
  signToken: signTokenMock,
}))

import authRouter from '../routes/auth'

describe('Auth Ale-Bet', () => {
  const app = createTestApp('/api/auth', authRouter)

  beforeEach(() => {
    comparePasswordMock.mockReset()
    getUserByEmailMock.mockReset()
    signTokenMock.mockClear()
})

  it('login correcto devuelve token y rol de ale_bet', async () => {
    getUserByEmailMock.mockResolvedValue({
      id: 'platform-1',
      email: 'admin@alebet.com',
      nombre: 'Admin',
      password: 'hashed',
      activo: true,
      appAccess: [
        { app: 'ale_bet', rol: 'admin', activo: true },
        { app: 'deposito', rol: 'encargado', activo: true },
      ],
    })
    comparePasswordMock.mockResolvedValue(true)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@alebet.com', password: 'alebet123' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBe('signed-token')
    expect(res.body.user.email).toBe('admin@alebet.com')
    expect(res.body.user.rol).toBe('admin')
    expect(signTokenMock).toHaveBeenCalledWith({
      sub: 'platform-1',
      email: 'admin@alebet.com',
      apps: {
        ale_bet: { rol: 'admin', activo: true },
        deposito: { rol: 'encargado', activo: true },
      },
    })
  })

  it('rechaza usuario sin acceso a ale_bet', async () => {
    getUserByEmailMock.mockResolvedValue({
      id: 'platform-2',
      email: 'user@test.com',
      nombre: 'User',
      password: 'hashed',
      activo: true,
      appAccess: [{ app: 'deposito', rol: 'observador', activo: true }],
    })
    comparePasswordMock.mockResolvedValue(true)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'password123' })

    expect(res.status).toBe(403)
    expect(res.body.error).toContain('Ale-Bet')
  })

  it('rechaza credenciales inválidas', async () => {
    getUserByEmailMock.mockResolvedValue({
      id: 'platform-3',
      email: 'vendor@test.com',
      nombre: 'Vendor',
      password: 'hashed',
      activo: true,
      appAccess: [{ app: 'ale_bet', rol: 'vendedor', activo: true }],
    })
    comparePasswordMock.mockResolvedValue(false)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'vendor@test.com', password: 'mal' })

    expect(res.status).toBe(401)
    expect(res.body.error).toContain('Credenciales')
  })
})
