import { Router, Request, Response } from 'express'
import { verifyToken } from '../lib/jwt'
import { sseManager } from '../lib/sse-manager'

const router = Router()

// GET /api/events — conexión SSE
// EventSource no puede enviar headers, por eso el token va como query param
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const token = typeof req.query['token'] === 'string' ? req.query['token'] : undefined
  if (!token) {
    res.status(401).json({ message: 'Token requerido' })
    return
  }

  let payload
  try {
    payload = verifyToken(token)
  } catch {
    res.status(401).json({ message: 'Token inválido o expirado' })
    return
  }

  // Headers SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // nginx: deshabilitar buffering
  res.flushHeaders()

  const clientId = sseManager.addClient(payload.sub, payload.role, res)

  // Ping de conexión exitosa
  res.write(
    `data: ${JSON.stringify({ tipo: 'conectado', mensaje: 'Conectado', timestamp: new Date().toISOString() })}\n\n`
  )

  // Limpiar cliente al desconectar
  req.on('close', () => {
    sseManager.removeClient(clientId)
  })
})

export default router
