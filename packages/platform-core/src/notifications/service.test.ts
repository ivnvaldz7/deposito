import { describe, expect, it, vi } from 'vitest'
import {
  createNotification,
  getNotificationsByUser,
  markAsRead,
  markAllAsRead,
  purgeOlderThan,
} from './service'
import type { CreateNotificationInput } from './types'

const mockDb = () => ({
  notification: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
})

const makeInput = (overrides: Partial<CreateNotificationInput> = {}): CreateNotificationInput => ({
  userId: 'user_1',
  app: 'deposito',
  tipo: 'stock_bajo',
  titulo: 'Stock bajo',
  mensaje: 'Droga X está por debajo del mínimo',
  ...overrides,
})

const now = new Date('2026-07-01T12:00:00Z')
const thirtyOneDaysAgo = new Date('2026-05-31T12:00:00Z')

describe('createNotification', () => {
  it('crea una notificación con los datos provistos', async () => {
    const db = mockDb()
    vi.mocked(db.notification.create).mockResolvedValue({
      id: 'notif_1',
      userId: 'user_1',
      app: 'deposito',
      tipo: 'stock_bajo',
      titulo: 'Stock bajo',
      mensaje: 'Droga X está por debajo del mínimo',
      leida: false,
      link: null,
      metadata: null,
      createdAt: now,
    })

    const result = await createNotification(db as any, makeInput())

    expect(db.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_1',
        app: 'deposito',
        tipo: 'stock_bajo',
      }),
    })
    expect(result.leida).toBe(false)
  })
})

describe('getNotificationsByUser', () => {
  it('retorna notificaciones del usuario paginadas', async () => {
    const db = mockDb()
    const notifications = [
      { id: 'n1', userId: 'user_1', app: 'deposito', tipo: 'test', titulo: 'T1', mensaje: 'M1', leida: false, link: null, metadata: null, createdAt: now },
      { id: 'n2', userId: 'user_1', app: 'deposito', tipo: 'test', titulo: 'T2', mensaje: 'M2', leida: true, link: null, metadata: null, createdAt: now },
    ]
    vi.mocked(db.notification.findMany).mockResolvedValue(notifications)
    vi.mocked(db.notification.count).mockResolvedValue(2)

    const result = await getNotificationsByUser(db as any, 'user_1', {}, { page: 1, limit: 20 })

    expect(db.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user_1' }),
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      })
    )
    expect(result.notifications).toHaveLength(2)
    expect(result.total).toBe(2)
  })

  it('filtra por app específica', async () => {
    const db = mockDb()
    vi.mocked(db.notification.findMany).mockResolvedValue([])
    vi.mocked(db.notification.count).mockResolvedValue(0)

    await getNotificationsByUser(db as any, 'user_1', { app: 'ale_bet' })

    expect(db.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ app: 'ale_bet' }),
      })
    )
  })

  it('filtra por no leídas', async () => {
    const db = mockDb()
    vi.mocked(db.notification.findMany).mockResolvedValue([])
    vi.mocked(db.notification.count).mockResolvedValue(0)

    await getNotificationsByUser(db as any, 'user_1', { leida: false })

    expect(db.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ leida: false }),
      })
    )
  })
})

describe('markAsRead', () => {
  it('marca una notificación como leída si es owner', async () => {
    const db = mockDb()
    vi.mocked(db.notification.update).mockResolvedValue({
      id: 'n1', userId: 'user_1', app: 'deposito', tipo: 'test', titulo: 'T', mensaje: 'M', leida: true, link: null, metadata: null, createdAt: now,
    })

    await markAsRead(db as any, 'n1', 'user_1')

    expect(db.notification.update).toHaveBeenCalledWith({
      where: { id: 'n1', userId: 'user_1' },
      data: { leida: true },
    })
  })
})

describe('markAllAsRead', () => {
  it('marca todas como leídas para el usuario', async () => {
    const db = mockDb()
    vi.mocked(db.notification.updateMany).mockResolvedValue({ count: 3 })

    const result = await markAllAsRead(db as any, 'user_1')

    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', leida: false },
      data: { leida: true },
    })
    expect(result).toBe(3)
  })
})

describe('purgeOlderThan', () => {
  it('elimina notificaciones más viejas que los días indicados', async () => {
    const db = mockDb()
    vi.mocked(db.notification.deleteMany).mockResolvedValue({ count: 5 })

    const result = await purgeOlderThan(db as any, 30)

    expect(db.notification.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: expect.any(Date) } },
    })
    expect(result).toBe(5)
  })
})
