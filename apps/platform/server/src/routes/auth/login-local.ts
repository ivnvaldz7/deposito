import crypto from 'crypto'
import { Router } from 'express'
import { platformDb } from '@platform/db'
import {
  getUserByEmail,
  comparePassword,
  signAccessToken,
  signRefreshToken,
  APP_SLUG_BY_ID,
  AppIdEnum,
  PLATFORM_AUDIT_ACTIONS,
} from '@platform/core'
import { createSession } from '../../services/auth/session-service'
import { auditAdminEvent } from '../../services/audit/platform-audit-service'

const router = Router()

const REFRESH_COOKIE_NAME = 'platform_refresh_token'
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function setRefreshTokenCookie(res: any, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: '/api/auth',
  })
}

/**
 * POST /api/auth/login
 *
 * Email/password login for pre-registered internal users.
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string }
  const ip = req.ip ?? req.socket.remoteAddress ?? undefined
  const userAgent = req.headers['user-agent'] ?? undefined

  if (!email) {
    res.status(400).json({ error: 'Email requerido' })
    return
  }

  if (!password) {
    res.status(400).json({ error: 'Contraseña requerida' })
    return
  }

  const platformUser = await getUserByEmail(
    platformDb as Parameters<typeof getUserByEmail>[0],
    email,
  )

  if (!platformUser) {
    await auditAdminEvent(platformDb as any, {
      action: PLATFORM_AUDIT_ACTIONS.LOGIN_FAILURE,
      previous: { email, reason: 'not_found' },
      ip,
      userAgent,
    })
    res.status(401).json({ error: 'Email o contraseña incorrectos' })
    return
  }

  if (!platformUser.activo || platformUser.estado === 'disabled') {
    await auditAdminEvent(platformDb as any, {
      actorId: platformUser.id,
      targetUserId: platformUser.id,
      action: PLATFORM_AUDIT_ACTIONS.LOGIN_FAILURE,
      previous: { email, reason: 'disabled' },
      ip,
      userAgent,
    })
    res.status(401).json({ error: 'Cuenta deshabilitada' })
    return
  }

  if (platformUser.estado === 'pending') {
    await auditAdminEvent(platformDb as any, {
      actorId: platformUser.id,
      targetUserId: platformUser.id,
      action: PLATFORM_AUDIT_ACTIONS.LOGIN_FAILURE,
      previous: { email, reason: 'pending' },
      ip,
      userAgent,
    })
    res.status(401).json({ error: 'Email o contraseña incorrectos' })
    return
  }

  if (!platformUser.password) {
    await auditAdminEvent(platformDb as any, {
      actorId: platformUser.id,
      targetUserId: platformUser.id,
      action: PLATFORM_AUDIT_ACTIONS.LOGIN_FAILURE,
      previous: { email, reason: 'no_password' },
      ip,
      userAgent,
    })
    res.status(401).json({ error: 'Email o contraseña incorrectos' })
    return
  }

  const valid = await comparePassword(password, platformUser.password)
  if (!valid) {
    await auditAdminEvent(platformDb as any, {
      actorId: platformUser.id,
      targetUserId: platformUser.id,
      action: PLATFORM_AUDIT_ACTIONS.LOGIN_FAILURE,
      previous: { email, reason: 'bad_password' },
      ip,
      userAgent,
    })
    res.status(401).json({ error: 'Email o contraseña incorrectos' })
    return
  }

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

  const session = await createSession(platformDb as any, {
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
    action: PLATFORM_AUDIT_ACTIONS.LOGIN_SUCCESS,
    previous: { method: 'local', sessionId: session.id },
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
      mustChangePassword: platformUser.mustChangePassword,
    },
  })
})

export default router
