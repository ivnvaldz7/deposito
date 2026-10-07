import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDb, mockVerifyToken, mockIsValidAppRole } = vi.hoisted(() => ({
  mockDb: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  mockVerifyToken: vi.fn(),
  mockIsValidAppRole: vi.fn(),
}))

vi.mock('../lib/prisma', () => ({ prisma: mockDb }))
vi.mock('@platform/core', () => ({
  verifyToken: mockVerifyToken,
  isValidAppRole: mockIsValidAppRole,
}))

import { authenticate } from '../middleware/auth'

const payload = {
  sub: 'platform-system-1',
  email: ' System@AleBet.com ',
  name: 'System User',
  apps: { deposito: { activo: true, rol: 'encargado' } },
}

const linkedUser = {
  id: 'legacy-linked-1',
  email: 'system@alebet.com',
  name: 'System User',
  role: 'encargado',
  platformUserId: 'platform-system-1',
}

function createApp() {
  const app = express()
  app.get('/protected', authenticate, (req, res) => {
    res.status(200).json({ depositoUser: req.depositoUser })
  })
  return app
}

describe('Depósito JIT authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyToken.mockReturnValue(payload)
    mockIsValidAppRole.mockReturnValue(true)
  })

  it('reuses a legacy user already linked by platformUserId', async () => {
    mockDb.user.findUnique.mockResolvedValue(linkedUser)

    const response = await request(createApp())
      .get('/protected')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.depositoUser.id).toBe(linkedUser.id)
    expect(mockDb.user.findFirst).not.toHaveBeenCalled()
    expect(mockDb.user.create).not.toHaveBeenCalled()
  })

  it('links an unlinked legacy email record without creating a duplicate', async () => {
    const legacyUser = { ...linkedUser, platformUserId: null, role: 'observador' }
    mockDb.user.findUnique.mockResolvedValue(null)
    mockDb.user.findFirst.mockResolvedValue(legacyUser)
    mockDb.user.update.mockResolvedValue(linkedUser)

    const response = await request(createApp())
      .get('/protected')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(mockDb.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'system@alebet.com', mode: 'insensitive' } },
    })
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: legacyUser.id },
      data: { platformUserId: payload.sub, role: 'encargado' },
    })
    expect(mockDb.user.create).not.toHaveBeenCalled()
  })

  it('creates a user only when neither platformUserId nor email exists', async () => {
    mockDb.user.findUnique.mockResolvedValue(null)
    mockDb.user.findFirst.mockResolvedValue(null)
    mockDb.user.create.mockResolvedValue(linkedUser)

    const response = await request(createApp())
      .get('/protected')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(mockDb.user.create).toHaveBeenCalledWith({
      data: {
        email: 'system@alebet.com',
        name: payload.name,
        role: 'encargado',
        passwordHash: '',
        platformUserId: payload.sub,
      },
    })
  })

  it('denies an email already linked to another PlatformUser without mutation', async () => {
    mockDb.user.findUnique.mockResolvedValue(null)
    mockDb.user.findFirst.mockResolvedValue({
      ...linkedUser,
      platformUserId: 'another-platform-user',
    })

    const response = await request(createApp())
      .get('/protected')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(403)
    expect(response.body.message).toBe('Identidad de Depósito no reconciliable')
    expect(mockDb.user.update).not.toHaveBeenCalled()
    expect(mockDb.user.create).not.toHaveBeenCalled()
  })

  it('recovers from a concurrent unique violation by re-reading the winner', async () => {
    mockDb.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(linkedUser)
    mockDb.user.findFirst.mockResolvedValue(null)
    mockDb.user.create.mockRejectedValue({ code: 'P2002' })

    const response = await request(createApp())
      .get('/protected')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(mockDb.user.create).toHaveBeenCalledTimes(1)
    expect(mockDb.user.findUnique).toHaveBeenCalledTimes(2)
  })

  it('recovers from a concurrent link unique violation by re-reading the winner', async () => {
    const legacyUser = { ...linkedUser, platformUserId: null }
    mockDb.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(linkedUser)
    mockDb.user.findFirst.mockResolvedValue(legacyUser)
    mockDb.user.update.mockRejectedValue({ code: '23505' })

    const response = await request(createApp())
      .get('/protected')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(mockDb.user.update).toHaveBeenCalledTimes(1)
    expect(mockDb.user.findUnique).toHaveBeenCalledTimes(2)
  })

  it('returns a controlled error when a unique violation cannot be reconciled', async () => {
    mockDb.user.findUnique.mockResolvedValue(null)
    mockDb.user.findFirst.mockResolvedValue(null)
    mockDb.user.create.mockRejectedValue({ code: 'P2002' })

    const response = await request(createApp())
      .get('/protected')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(500)
    expect(response.body.message).toBe('No se pudo sincronizar el usuario de Depósito')
    expect(mockDb.user.create).toHaveBeenCalledTimes(2)
  })

  it('denies inactive AppAccess before touching legacy users', async () => {
    mockVerifyToken.mockReturnValue({
      ...payload,
      apps: { deposito: { activo: false, rol: 'encargado' } },
    })

    const response = await request(createApp())
      .get('/protected')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(403)
    expect(mockDb.user.findUnique).not.toHaveBeenCalled()
    expect(mockDb.user.findFirst).not.toHaveBeenCalled()
  })

  it('syncs the canonical AppAccess role without trusting the legacy role', async () => {
    const legacyUser = { ...linkedUser, platformUserId: null, role: 'solicitante' }
    mockDb.user.findUnique.mockResolvedValue(null)
    mockDb.user.findFirst.mockResolvedValue(legacyUser)
    mockDb.user.update.mockResolvedValue({ ...linkedUser, role: 'encargado' })

    const response = await request(createApp())
      .get('/protected')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.depositoUser.role).toBe('encargado')
    expect(mockDb.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: 'encargado' }),
    }))
  })
})
