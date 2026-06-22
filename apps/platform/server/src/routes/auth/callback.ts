import { Router } from 'express'
import { platformDb } from '@platform/db'
import { GoogleStrategy } from '../../auth/strategies/google'
import {
  getUserByEmail,
  getUserById,
  signAccessToken,
  signRefreshToken,
} from '@platform/core'

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
    const { code, state } = req.query as { code?: string; state?: string }

    if (!code) {
      res.redirect('/login?error=missing_code')
      return
    }

    const strategy = new GoogleStrategy()
    const authUser = await strategy.exchangeCode(code)

    // Look up PlatformUser by email
    const platformUser = await getUserByEmail(
      platformDb as Parameters<typeof getUserByEmail>[0],
      authUser.email
    )

    if (!platformUser) {
      // User not pre-registered
      res.redirect('/login?error=unauthorized')
      return
    }

    if (platformUser.estado === 'disabled') {
      res.redirect('/login?error=disabled')
      return
    }

    // If pending, activate user
    if (platformUser.estado === 'pending' || !platformUser.estado) {
      await platformDb.platformUser.update({
        where: { id: platformUser.id },
        data: { estado: 'active' },
      })
    }

    if (!platformUser.activo) {
      res.redirect('/login?error=disabled')
      return
    }

    // Build apps record from access
    const apps = platformUser.appAccess.reduce<
      Record<string, { rol: string; activo: boolean }>
    >((acc, access) => {
      acc[access.app] = {
        rol: access.rol,
        activo: access.activo,
      }
      return acc
    }, {})

    // Sign tokens
    const accessToken = signAccessToken({
      sub: platformUser.id,
      email: platformUser.email,
      name: platformUser.nombre,
      isPlatformAdmin: platformUser.isPlatformAdmin ?? false,
      apps,
    })
    const refreshToken = signRefreshToken(platformUser.id)

    setRefreshTokenCookie(res, refreshToken)

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5176'
    res.redirect(`${frontendUrl}/auth/google/callback?token=${accessToken}`)
  } catch (error) {
    console.error('Error en callback de Google:', error)
    res.redirect('/login?error=auth_failed')
  }
})

export default router
