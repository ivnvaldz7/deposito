import { Router } from 'express'

const router = Router()

const REFRESH_COOKIE_NAME = 'platform_refresh_token'

// POST /api/auth/logout — clear refresh cookie
router.post('/logout', async (_req, res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/auth',
  })
  res.status(204).send()
})

export default router
