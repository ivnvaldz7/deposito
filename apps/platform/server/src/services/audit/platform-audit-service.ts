import type { Prisma, PrismaClient, AppId } from '@platform/db'
import type { PlatformAuditAction } from '@platform/core'

export type PlatformDb = Pick<PrismaClient, 'platformAuditoria'>

export interface AuditEventInput {
  actorId?: string
  targetUserId?: string
  action: PlatformAuditAction
  app?: AppId
  previous?: Prisma.InputJsonValue
  next?: Prisma.InputJsonValue
  ip?: string
  userAgent?: string
}

export async function auditAdminEvent(
  db: PlatformDb,
  input: AuditEventInput,
): Promise<void> {
  await db.platformAuditoria.create({
    data: {
      actorId: input.actorId ?? null,
      targetUserId: input.targetUserId ?? null,
      action: input.action,
      app: input.app ?? null,
      ...(input.previous !== undefined ? { previous: input.previous } : {}),
      ...(input.next !== undefined ? { next: input.next } : {}),
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  })
}
