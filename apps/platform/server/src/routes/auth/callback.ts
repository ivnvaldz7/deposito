import crypto from 'crypto'
import { Router } from 'express'
import { platformDb } from '@platform/db'
import { GoogleStrategy } from '../../auth/strategies/google'
import {
  getUserByEmail,
  signAccessToken,
  signRefreshToken,
  APP_SLUG_BY_ID,
  AppIdEnum,
} from '@platform/core'
import { createSession } from '../../services/auth/session-service'

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

// GET /api/auth/google/callback — handle Google OAuth callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query as { code?: string }

    if (!code) {
      res.redirect('/login?error=missing_code')
      return
    }

    const strategy = new GoogleStrategy()
    const authUser = await strategy.exchangeCode(code)

    const platformUser = await getUserByEmail(
      platformDb as Parameters<typeof getUserByEmail>[0],
      authUser.email,
    )

    if (!platformUser) {
      res.redirect('/login?error=unauthorized')
      return
    }

    if (platformUser.estado === 'disabled') {
      res.redirect('/login?error=disabled')
      return
    }

    if (!platformUser.activo) {
      res.redirect('/login?error=disabled')
      return
    }

    // Activate pending users created for Google login.
    if (platformUser.estado === 'pending' || !platformUser.estado) {
      await platformDb.platformUser.update({
        where: { id: platformUser.id },
        data: { estado: 'active' },
      })
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
    const ip = req.ip ?? req.socket.remoteAddress ?? undefined
    const userAgent = req.headers['user-agent'] ?? undefined

    await createSession(platformDb as any, {
      id: sessionId,
      platformUserId: platformUser.id,
      refreshToken,
      expiresAt,
      userAgent,
      ip,
    })

    setRefreshTokenCookie(res, refreshToken)

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5176'
    res.redirect(`${frontendUrl}/auth/google/callback?token=${accessToken}`)
  } catch (error) {
    console.error('Error en callback de Google:', error)
    res.redirect('/login?error=auth_failed')
  }
})

export default router
