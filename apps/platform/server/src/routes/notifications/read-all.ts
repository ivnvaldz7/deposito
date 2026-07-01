import { Router, type Request, type Response } from 'express'
import { platformDb } from '@platform/db'
import { markAllAsRead } from '@platform/core'

const router = Router()

// ─── POST /api/notifications/read-all — marcar todas como leídas ─────────────
router.post('/read-all', async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const count = await markAllAsRead(platformDb as any, user.sub)
    res.json({ success: true, count })
  } catch (error) {
    console.error('[notifications] Error marking all as read:', error)
    res.status(500).json({ error: 'Error al marcar notificaciones como leídas' })
  }
})

export default router
