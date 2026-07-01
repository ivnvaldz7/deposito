import type {
  ActivityEvent,
  CreateNotificationInput,
  NotificationFilter,
  ListOptions,
  NotificationRow,
} from './types'

// ─── Tipos helpers ────────────────────────────────────────────────────────────

/**
 * Interfaz mínima para operaciones de notificación contra Prisma.
 * No usamos Pick<PrismaClient, 'notification'> porque el modelo
 * Notification se agregó al schema después de la última generación del client.
 */
interface NotificationDb {
  notification: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>
    count: (args: { where: Record<string, unknown> }) => Promise<number>
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>
    updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>
    deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>
  }
}

interface PaginatedResult<T> {
  notifications: T[]
  total: number
  page: number
  limit: number
}

// ─── Crear ────────────────────────────────────────────────────────────────────

export async function createNotification(
  db: NotificationDb,
  input: CreateNotificationInput,
): Promise<NotificationRow> {
  return db.notification.create({
    data: {
      userId: input.userId,
      app: input.app,
      tipo: input.tipo,
      titulo: input.titulo,
      mensaje: input.mensaje,
      ...(input.link ? { link: input.link } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    },
  }) as unknown as NotificationRow
}

// ─── Listar ───────────────────────────────────────────────────────────────────

export async function getNotificationsByUser(
  db: NotificationDb,
  userId: string,
  filter: NotificationFilter = {},
  options: ListOptions = {},
): Promise<PaginatedResult<NotificationRow>> {
  const page = options.page ?? 1
  const limit = options.limit ?? 20
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = { userId }

  if (filter.app) where.app = filter.app
  if (filter.leida !== undefined) where.leida = filter.leida
  if (filter.tipo) where.tipo = filter.tipo

  const [notifications, total] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.notification.count({ where }),
  ])

  return {
    notifications: notifications as unknown as NotificationRow[],
    total,
    page,
    limit,
  }
}

// ─── Marcar una como leída ────────────────────────────────────────────────────

export async function markAsRead(
  db: NotificationDb,
  id: string,
  userId: string,
): Promise<void> {
  await db.notification.update({
    where: { id, userId },
    data: { leida: true },
  })
}

// ─── Marcar todas como leídas ─────────────────────────────────────────────────

export async function markAllAsRead(
  db: NotificationDb,
  userId: string,
): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, leida: false },
    data: { leida: true },
  })
  return result.count
}

// ─── Purgar viejas ────────────────────────────────────────────────────────────

export async function purgeOlderThan(
  db: NotificationDb,
  days: number,
): Promise<number> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const result = await db.notification.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  })
  return result.count
}

// ─── Handler para suscribir al EventBus ───────────────────────────────────────

import type { EventHandler } from './event-bus'

export function createNotificationHandler(db: NotificationDb): EventHandler {
  return async (event: ActivityEvent) => {
    if (event.userId) {
      await createNotification(db, {
        userId: event.userId,
        app: event.app,
        tipo: event.tipo,
        titulo: event.titulo,
        mensaje: event.mensaje,
        link: event.link,
        metadata: event.metadata,
      }).catch((err) => {
        console.error('[notifications] Error persisting event:', err)
      })
    }
  }
}
