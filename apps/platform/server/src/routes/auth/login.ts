import { Router } from 'express'
import { GoogleStrategy } from '../../auth/strategies/google'
import crypto from 'crypto'

const router = Router()

// GET /api/auth/google — redirect to Google OAuth consent screen
router.get('/google', async (_req, res) => {
  try {
    const strategy = new GoogleStrategy()
    const state = crypto.randomBytes(16).toString('hex')
    const url = await strategy.getAuthUrl(state)
    res.redirect(url)
  } catch (error) {
    console.error('Error al iniciar login con Google:', error)
    res.status(500).json({ error: 'Error al iniciar autenticación' })
  }
})

export default router
