import { Router } from 'express'
import { sseManager } from '../lib/sse-manager'
import { authenticate, requireApp, type AuthRequest } from '../middleware/auth'

const router = Router()

router.get(
  '/stream',
  authenticate,
  requireApp('ale_bet', ['admin', 'vendedor', 'armador']),
  (req, res) => {
    const authReq = req as AuthRequest
    const user = authReq.user

    if (!user) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    sseManager.addClient(user.id, user.rol, res)
    res.write(`event: connected\ndata: ${JSON.stringify({ type: 'connected', userId: user.id })}\n\n`)

    const heartbeatInterval = setInterval(() => {
      if (res.writableEnded || res.destroyed) {
        clearInterval(heartbeatInterval)
        sseManager.removeClient(user.id)
        return
      }

      res.write(': heartbeat\n\n')
    }, 30_000)

    req.on('close', () => {
      clearInterval(heartbeatInterval)
      sseManager.removeClient(user.id)
    })
  }
)

export default router
