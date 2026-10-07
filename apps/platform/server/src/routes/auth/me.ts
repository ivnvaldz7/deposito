import { Router } from 'express'
import { platformDb } from '@platform/db'
import { verifyToken } from '../../middlewares/verify-token'
import { verifyAccessToken } from '@platform/core'

const router = Router()

// GET /api/auth/me — get current user info
router.get('/me', verifyToken, async (req, res) => {
  const payload = req.user

  if (!payload) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  let mustChangePassword = false
  try {
    const platformUser = await platformDb.platformUser.findUnique({
      where: { id: payload.sub },
      select: { mustChangePassword: true },
    })
    mustChangePassword = platformUser?.mustChangePassword ?? false
  } catch {
    // Fail open: /me must not break when the DB is unavailable.
  }

  res.json({
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? '',
    apps: payload.apps,
    isPlatformAdmin: payload.isPlatformAdmin ?? false,
    mustChangePassword,
  })
})

export default router
