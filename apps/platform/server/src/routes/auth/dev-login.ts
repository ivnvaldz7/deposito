import { Router } from 'express'
import { platformDb } from '@platform/db'
import { getUserByEmail, signAccessToken, signRefreshToken } from '@platform/core'

const router = Router()

/**
 * POST /api/auth/dev-login
 *
 * Dev-only: bypass Google OAuth for local development.
 * Returns a signed JWT for the given user email.
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

  res.json({
    token: accessToken,
    refreshToken,
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
