import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { verifyToken } from '../lib/jwt'
import { authenticate, AuthRequest } from '../middleware/auth'
import { sseManager } from '../lib/sse-manager'

const router = Router()

// ─── Tickets de corta duración (en memoria) ───────────────────────────────────

interface SSETicket {
  userId: string
  role: string
  expiresAt: number // epoch ms
}

const tickets = new Map<string, SSETicket>()
const TICKET_TTL_MS = 30_000 // 30 segundos

function purgeExpiredTickets() {
  const now = Date.now()
  for (const [id, t] of tickets.entries()) {
    if (t.expiresAt < now) tickets.delete(id)
  }
}

// ─── POST /api/events/auth — emitir ticket SSE (auth por header) ──────────────

router.post('/auth', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const ticketId = randomUUID()
  tickets.set(ticketId, {
    userId: req.user!.id,
    role: req.user!.role,
    expiresAt: Date.now() + TICKET_TTL_MS,
  })

  // Limpiar tickets expirados cada 50 requests para evitar fuga de memoria
  if (tickets.size > 50) purgeExpiredTickets()

  res.json({ ticket: ticketId })
})

// ─── GET /api/events?ticket=xxx — conexión SSE ────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const ticketId = typeof req.query['ticket'] === 'string' ? req.query['ticket'] : undefined
  if (!ticketId) {
    res.status(401).json({ message: 'Ticket requerido' })
    return
  }

  const ticket = tickets.get(ticketId)
  tickets.delete(ticketId) // uso único — invalidar inmediatamente

  if (!ticket || ticket.expiresAt < Date.now()) {
    res.status(401).json({ message: 'Ticket inválido o expirado' })
    return
  }

  // Headers SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const clientId = sseManager.addClient(ticket.userId, ticket.role, res)

  // Ping de conexión exitosa
  res.write(
    `data: ${JSON.stringify({ tipo: 'conectado', mensaje: 'Conectado', timestamp: new Date().toISOString() })}\n\n`
  )

  req.on('close', () => {
    sseManager.removeClient(clientId)
  })
})

// Mantener compatibilidad con el token directo solo para verificar que el jwt sigue siendo válido
// (ya no se usa para SSE — se usa solo en POST /auth)
export { verifyToken }

export default router
