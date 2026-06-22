import { Router } from 'express'
import { verifyToken } from '../../middlewares/verify-token'
import { verifyAccessToken } from '@platform/core'

const router = Router()

// GET /api/auth/me — get current user info
router.get('/me', verifyToken, (req, res) => {
  const payload = req.user

  if (!payload) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  res.json({
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? '',
    apps: payload.apps,
    isPlatformAdmin: payload.isPlatformAdmin ?? false,
  })
})

export default router
