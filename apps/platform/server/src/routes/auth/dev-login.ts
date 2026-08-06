import { Router } from 'express'
import { platformDb } from '@platform/db'
import {
  getUserByEmail,
  getUserById,
  signAccessToken,
  signRefreshToken,
  updateAppAccess,
} from '@platform/core'

const router = Router()

const REFRESH_COOKIE_NAME = 'platform_refresh_token'
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * RBAC-LOG-01 PART A — DEV-only idempotent AppAccess sync.
 *
 * Email is ONLY a sync key. Navigation is never email-driven: the token is
 * always built from the user's AppAccess rows re-read after sync.
 */
const DEV_SYNC_ACCESS: Record<
  string,
  ReadonlyArray<{ app: 'deposito' | 'ale_bet'; rol: string }>
> = {
  'encargado@deposito.com': [
    { app: 'deposito', rol: 'encargado' },
    { app: 'ale_bet', rol: 'encargado' },
  ],
}

async function syncDevAccess(userId: string, email: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') return

  const entries = DEV_SYNC_ACCESS[email]
  if (!entries) return

  for (const entry of entries) {
    try {
      await updateAppAccess(
        platformDb as Parameters<typeof updateAppAccess>[0],
        userId,
        entry.app,
        { rol: entry.rol, activo: true },
      )
    } catch (syncError) {
      // Fail open: a DB hiccup must never block dev login.
      console.error(
        '[dev-login] No se pudo sincronizar acceso para',
        email,
        entry.app,
        syncError,
      )
    }
  }
}

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
  console.log('[dev-login] Request for:', email)

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

  // RBAC-LOG-01 PART A: idempotent sync (dev-only, fail-open) then RE-READ the
  // user so the JWT apps map is built from fresh AppAccess rows.
  let userForToken = platformUser
  try {
    await syncDevAccess(platformUser.id, platformUser.email)
    const freshUser = await getUserById(
      platformDb as Parameters<typeof getUserById>[0],
      platformUser.id,
    )
    if (freshUser) userForToken = freshUser
  } catch (reReadError) {
    console.error(
      '[dev-login] No se pudo re-leer el usuario tras el sync; usando snapshot previo',
      reReadError,
    )
  }

  const apps = userForToken.appAccess.reduce<
    Record<string, { rol: string; activo: boolean }>
  >((acc, access) => {
    acc[access.app.replace('_', '-')] = {
      rol: access.rol,
      activo: access.activo,
    }
    return acc
  }, {})

  const accessToken = signAccessToken({
    sub: userForToken.id,
    email: userForToken.email,
    name: userForToken.nombre,
    isPlatformAdmin: userForToken.isPlatformAdmin ?? false,
    apps,
  })

  const refreshToken = signRefreshToken(userForToken.id)
  setRefreshTokenCookie(res, refreshToken)

  // Respond with the redirect URL so the frontend can navigate
  const frontendUrl = process.env.FRONTEND_URL ?? req.get('origin') ?? 'http://localhost:5176'
  res.json({
    redirectUrl: `${frontendUrl}/auth/google/callback?token=${accessToken}`,
  })
})

export default router
