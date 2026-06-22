import { Router } from 'express'
import { platformDb } from '@platform/db'
import {
  getUserById,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '@platform/core'

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
  const refreshToken = getCookieValue(req, REFRESH_COOKIE_NAME)

  if (!refreshToken) {
    res.status(401).json({ error: 'Refresh token requerido' })
    return
  }

  try {
    const payload = verifyRefreshToken(refreshToken)

    if (!payload) {
      clearRefreshTokenCookie(res)
      res.status(401).json({ error: 'Refresh token inválido o expirado' })
      return
    }

    const platformUser = await getUserById(
      platformDb as Parameters<typeof getUserById>[0],
      payload.sub
    )

    if (!platformUser || !platformUser.activo) {
      clearRefreshTokenCookie(res)
      res.status(401).json({ error: 'Usuario no encontrado' })
      return
    }

    if (platformUser.estado === 'disabled') {
      clearRefreshTokenCookie(res)
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

    // Rotate tokens
    const newAccessToken = signAccessToken({
      sub: platformUser.id,
      email: platformUser.email,
      name: platformUser.nombre,
      isPlatformAdmin: platformUser.isPlatformAdmin ?? false,
      apps,
    })
    const newRefreshToken = signRefreshToken(platformUser.id)

    setRefreshTokenCookie(res, newRefreshToken)

    res.json({
      token: newAccessToken,
      user: {
        sub: platformUser.id,
        email: platformUser.email,
        name: platformUser.nombre,
        apps,
        isPlatformAdmin: platformUser.isPlatformAdmin ?? false,
      },
    })
  } catch (error) {
    console.error('Error en refresh:', error)
    clearRefreshTokenCookie(res)
    res.status(401).json({ error: 'Refresh token inválido' })
  }
})

export default router
