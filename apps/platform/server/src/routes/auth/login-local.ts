import { Router } from 'express'
import { platformDb } from '@platform/db'
import {
  getUserByEmail,
  comparePassword,
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

/**
 * POST /api/auth/login
 *
 * Email/password login for pre-registered users.
 * Returns JWT tokens matching the existing Google OAuth format.
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string }

  // Validate required fields
  if (!email) {
    res.status(400).json({ error: 'Email requerido' })
    return
  }

  if (!password) {
    res.status(400).json({ error: 'Contraseña requerida' })
    return
  }

  // Look up user
  const platformUser = await getUserByEmail(
    platformDb as Parameters<typeof getUserByEmail>[0],
    email,
  )

  if (!platformUser) {
    res.status(401).json({ error: 'Email o contraseña incorrectos' })
    return
  }

  // User state enforcement
  if (!platformUser.activo || platformUser.estado === 'disabled') {
    res.status(401).json({ error: 'Cuenta deshabilitada' })
    return
  }

  // Reject pending users (they have no password — created via Google OAuth)
  if (platformUser.estado === 'pending') {
    res.status(401).json({ error: 'Email o contraseña incorrectos' })
    return
  }

  // Check password hash exists
  if (!platformUser.password) {
    res.status(401).json({ error: 'Email o contraseña incorrectos' })
    return
  }

  // Verify password
  const valid = await comparePassword(password, platformUser.password)
  if (!valid) {
    res.status(401).json({ error: 'Email o contraseña incorrectos' })
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

  // Return token and user (same format as refresh.ts)
  res.json({
    token: accessToken,
    user: {
      sub: platformUser.id,
      email: platformUser.email,
      name: platformUser.nombre,
      apps,
      isPlatformAdmin: platformUser.isPlatformAdmin ?? false,
    },
  })
})

export default router
