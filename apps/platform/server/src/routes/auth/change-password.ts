import crypto from 'crypto'
import { Router } from 'express'
import { platformDb } from '@platform/db'
import {
  comparePassword,
  hashPassword,
  signAccessToken,
  signRefreshToken,
  validatePasswordPolicy,
  APP_SLUG_BY_ID,
  AppIdEnum,
  PLATFORM_AUDIT_ACTIONS,
} from '@platform/core'
import { verifyToken } from '../../middlewares/verify-token'
import {
  createSession,
  revokeAllUserSessions,
} from '../../services/auth/session-service'
import { auditAdminEvent } from '../../services/audit/platform-audit-service'

const router = Router()

const REFRESH_COOKIE_NAME = 'platform_refresh_token'
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function setRefreshTokenCookie(res: any, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: '/api/auth',
  })
}

// POST /api/auth/change-password
// Authenticated endpoint for the current user to change their password.
router.post('/change-password', verifyToken, async (req, res) => {
  const user = req.user
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string
    newPassword?: string
  }

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Contraseña actual y nueva son obligatorias' })
    return
  }

  const ip = req.ip ?? req.socket.remoteAddress ?? undefined
  const userAgent = req.headers['user-agent'] ?? undefined

  try {
    validatePasswordPolicy(newPassword)
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Contraseña inválida' })
    return
  }

  const platformUser = await platformDb.platformUser.findUnique({
    where: { id: user.sub },
    include: { appAccess: true },
  })

  if (!platformUser || !platformUser.password) {
    res.status(401).json({ error: 'Usuario no encontrado' })
    return
  }

  const valid = await comparePassword(currentPassword, platformUser.password)
  if (!valid) {
    res.status(401).json({ error: 'Contraseña actual incorrecta' })
    return
  }

  if (currentPassword === newPassword) {
    res.status(400).json({ error: 'La nueva contraseña debe ser diferente a la actual' })
    return
  }

  const newHash = await hashPassword(newPassword)

  await platformDb.platformUser.update({
    where: { id: platformUser.id },
    data: {
      password: newHash,
      mustChangePassword: false,
    },
  })

  // Revoke all existing sessions and create a fresh one for the current client.
  const revoked = await revokeAllUserSessions(platformDb as any, platformUser.id)

  const apps = platformUser.appAccess.reduce<
    Record<string, { rol: string; activo: boolean }>
  >((acc, access) => {
    const slug = APP_SLUG_BY_ID[access.app as AppIdEnum]
    if (slug) {
      acc[slug] = {
        rol: access.rol,
        activo: access.activo,
      }
    }
    return acc
  }, {})

  const accessToken = signAccessToken({
    sub: platformUser.id,
    email: platformUser.email,
    name: platformUser.nombre,
    isPlatformAdmin: platformUser.isPlatformAdmin ?? false,
    apps,
  })

  const sessionId = crypto.randomUUID()
  const refreshToken = signRefreshToken(platformUser.id, sessionId)
  const expiresAt = new Date(Date.now() + REFRESH_COOKIE_MAX_AGE_MS)

  await createSession(platformDb as any, {
    id: sessionId,
    platformUserId: platformUser.id,
    refreshToken,
    expiresAt,
    userAgent,
    ip,
  })

  setRefreshTokenCookie(res, refreshToken)

  await auditAdminEvent(platformDb as any, {
    actorId: platformUser.id,
    targetUserId: platformUser.id,
    action: PLATFORM_AUDIT_ACTIONS.PASSWORD_CHANGED,
    previous: { revokedSessions: revoked.count },
    ip,
    userAgent,
  })

  res.json({
    token: accessToken,
    user: {
      sub: platformUser.id,
      email: platformUser.email,
      name: platformUser.nombre,
      apps,
      isPlatformAdmin: platformUser.isPlatformAdmin ?? false,
      mustChangePassword: false,
    },
  })
})

export default router
