import { Router, type Request, type Response } from 'express'
import { eventBus, type JwtPayload } from '@platform/core'

const router = Router()

const HEARTBEAT_INTERVAL_MS = 30_000

// ─── GET /api/notifications/stream — SSE endpoint ───────────────────────────
router.get('/stream', (req: Request, res: Response) => {
  const user = req.user as JwtPayload

  // Headers SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // Ping de conexión
  res.write(`event: connected\ndata: ${JSON.stringify({ mensaje: 'Conectado' })}\n\n`)

  // Suscribir al eventBus — filtrar por apps del usuario
  const off = eventBus.on((event) => {
    // Admin recibe todo; los demás solo eventos de sus apps
    if (user.isPlatformAdmin || user.apps[event.app]?.activo) {
      res.write(`event: ${event.tipo}\ndata: ${JSON.stringify(event)}\n\n`)
    }
  })

  // Heartbeat cada 30s
  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`)
  }, HEARTBEAT_INTERVAL_MS)

  // Cleanup al cerrar conexión
  req.on('close', () => {
    off()
    clearInterval(heartbeat)
  })
})

export default router
