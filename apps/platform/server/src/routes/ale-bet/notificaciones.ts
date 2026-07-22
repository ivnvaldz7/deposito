import { Router } from 'express'
import type { JwtPayload } from '@platform/core'
import { requireApp } from '../../middlewares/require-app'
import { sseManager } from './sse-manager'

const router = Router()

router.get(
  '/stream',
  requireApp('ale-bet', ['admin', 'vendedor', 'armador']),
  (req, res) => {
    const user = req.user as JwtPayload | undefined

    if (!user) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    const rol = user.apps['ale_bet']?.rol

    if (!rol) {
      res.status(403).json({ error: 'No tiene acceso a Ale-Bet' })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    sseManager.addClient(user.sub, rol, res)
    res.write(`event: connected\ndata: ${JSON.stringify({ type: 'connected', userId: user.sub })}\n\n`)

    const heartbeatInterval = setInterval(() => {
      if (res.writableEnded || res.destroyed) {
        clearInterval(heartbeatInterval)
        sseManager.removeClient(user.sub)
        return
      }

      res.write(': heartbeat\n\n')
    }, 30_000)

    req.on('close', () => {
      clearInterval(heartbeatInterval)
      sseManager.removeClient(user.sub)
    })
  }
)

export default router
