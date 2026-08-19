import crypto from 'crypto'
import { Router } from 'express'
import { platformDb } from '@platform/db'
import {
  getUserById,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
  APP_SLUG_BY_ID,
  AppIdEnum,
} from '@platform/core'
import {
  createSession,
  findSessionByTokenHash,
  revokeSession,
} from '../../services/auth/session-service'

const router = Router()

const REFRESH_COOKIE_NAME = 'platform_refresh_token'
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function getCookieValue(req: any, name: string): string | null {
  const raw = req.headers.cookie
  if (!raw) return null

  for (const part of raw.split(';')) {
    const [cookieName, ...rest] = part.trim().split('=')
    if (cookieName === name) {
      return decodeURIComponent(rest.join('='))
    }
  }

  return null
}

function setRefreshTokenCookie(res: any, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: '/api/auth',
  })
}

function clearRefreshTokenCookie(res: any): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/auth',
  })
}

// POST /api/auth/refresh — refresh access token
router.post('/refresh', async (req, res: any) => {
  try {
    const refreshToken = getCookieValue(req, REFRESH_COOKIE_NAME)

    if (!refreshToken) {
      res.status(401).json({ error: 'Refresh token requerido' })
      return
    }

    const payload = verifyRefreshToken(refreshToken)

    if (!payload) {
      clearRefreshTokenCookie(res)
      res.status(401).json({ error: 'Refresh token inválido o expirado' })
      return
    }

    const session = await findSessionByTokenHash(
      platformDb as any,
      hashRefreshToken(refreshToken),
    )

    if (!session || session.id !== payload.sid) {
      clearRefreshTokenCookie(res)
      res.status(401).json({ error: 'Sesión no encontrada' })
      return
    }

    if (session.revokedAt || session.expiresAt < new Date()) {
      clearRefreshTokenCookie(res)
      res.status(401).json({ error: 'Sesión revocada o expirada' })
      return
    }

    const platformUser = await getUserById(
      platformDb as Parameters<typeof getUserById>[0],
      payload.sub,
    )

    if (!platformUser) {
      await revokeSession(platformDb as any, session.id).catch(() => undefined)
      clearRefreshTokenCookie(res)
      res.status(401).json({ error: 'Usuario no encontrado' })
      return
    }

    if (!platformUser.activo || platformUser.estado === 'disabled') {
      await revokeSession(platformDb as any, session.id).catch(() => undefined)
      clearRefreshTokenCookie(res)
      res.status(401).json({ error: 'Cuenta deshabilitada' })
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

    // Rotate: mark previous session as revoked and create a new one.
    await revokeSession(platformDb as any, session.id)

    const sessionId = crypto.randomUUID()
    const newRefreshToken = signRefreshToken(platformUser.id, sessionId)
    const expiresAt = new Date(Date.now() + REFRESH_COOKIE_MAX_AGE_MS)
    const ip = req.ip ?? req.socket.remoteAddress ?? undefined
    const userAgent = req.headers['user-agent'] ?? undefined

    await createSession(platformDb as any, {
      id: sessionId,
      platformUserId: platformUser.id,
      refreshToken: newRefreshToken,
      expiresAt,
      userAgent,
      ip,
    })

    const newAccessToken = signAccessToken({
      sub: platformUser.id,
      email: platformUser.email,
      name: platformUser.nombre,
      isPlatformAdmin: platformUser.isPlatformAdmin ?? false,
      apps,
    })

    setRefreshTokenCookie(res, newRefreshToken)

    res.json({
      token: newAccessToken,
      user: {
        sub: platformUser.id,
        email: platformUser.email,
        name: platformUser.nombre,
        apps,
        isPlatformAdmin: platformUser.isPlatformAdmin ?? false,
        mustChangePassword: platformUser.mustChangePassword,
      },
    })
  } catch (error) {
    console.error('Error en refresh:', error)
    clearRefreshTokenCookie(res)
    res.status(401).json({ error: 'Refresh token inválido o expirado' })
  }
})

export default router
