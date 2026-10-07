import crypto from 'crypto'
import type { PrismaClient, Session } from '@platform/db'
import { hashRefreshToken } from '@platform/core'

export type PlatformDb = Pick<PrismaClient, 'session'>

export interface CreateSessionInput {
  id?: string
  platformUserId: string
  refreshToken: string
  expiresAt: Date
  userAgent?: string
  ip?: string
}

export async function createSession(
  db: PlatformDb,
  input: CreateSessionInput,
): Promise<Session> {
  return db.session.create({
    data: {
      id: input.id ?? crypto.randomUUID(),
      platformUserId: input.platformUserId,
      tokenHash: hashRefreshToken(input.refreshToken),
      expiresAt: input.expiresAt,
      userAgent: input.userAgent,
      ip: input.ip,
    },
  })
}

export async function findSessionByTokenHash(
  db: PlatformDb,
  tokenHash: string,
): Promise<Session | null> {
  return db.session.findUnique({
    where: { tokenHash },
  })
}

export async function revokeSession(
  db: PlatformDb,
  sessionId: string,
  revokedAt: Date = new Date(),
): Promise<Session> {
  return db.session.update({
    where: { id: sessionId },
    data: { revokedAt },
  })
}

export async function revokeAllUserSessions(
  db: PlatformDb,
  platformUserId: string,
  revokedAt: Date = new Date(),
): Promise<{ count: number }> {
  const result = await db.session.updateMany({
    where: {
      platformUserId,
      revokedAt: null,
    },
    data: { revokedAt },
  })

  return { count: result.count }
}

export function generateSecureTemporaryPassword(length = 12): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*-_'
  const bytes = crypto.randomBytes(length)
  let password = ''
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length]
  }
  return password
}
