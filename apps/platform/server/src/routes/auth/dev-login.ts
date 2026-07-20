import { Router } from 'express'
import { platformDb } from '@platform/db'
import { getUserByEmail, signAccessToken, signRefreshToken } from '@platform/core'

const router = Router()

const REFRESH_COOKIE_NAME = 'platform_refresh_token'
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function setRefreshTokenCookie(res: any, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: '/api/auth',
  })
}

/**
 * POST /api/auth/dev-login
 *
 * Dev-only: bypass Google OAuth for local development.
 * Redirects to the frontend callback with a signed token,
 * exactly like the real Google OAuth callback does.
 *
 * Only works when NODE_ENV !== 'production'.
 */
router.post('/dev-login', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const { email } = req.body as { email?: string }

  if (!email) {
    res.status(400).json({ error: 'Email requerido' })
    return
  }

  const platformUser = await getUserByEmail(
    platformDb as Parameters<typeof getUserByEmail>[0],
    email,
  )

  if (!platformUser) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }

  if (!platformUser.activo || platformUser.estado === 'disabled') {
    res.status(401).json({ error: 'Cuenta deshabilitada' })
    return
  }

  const apps = platformUser.appAccess.reduce<
    Record<string, { rol: string; activo: boolean }>
  >((acc, access) => {
    acc[access.app] = {
      rol: access.rol,
      activo: access.activo,
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

  const refreshToken = signRefreshToken(platformUser.id)
  setRefreshTokenCookie(res, refreshToken)

  // Respond with the redirect URL so the frontend can navigate
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5176'
  res.json({
    redirectUrl: `${frontendUrl}/auth/google/callback?token=${accessToken}`,
  })
})

export default router
