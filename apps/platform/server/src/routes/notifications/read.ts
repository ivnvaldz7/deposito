import { Router, type Request, type Response } from 'express'
import { platformDb } from '@platform/db'
import { markAsRead } from '@platform/core'

const router = Router()

// ─── PATCH /api/notifications/:id/read — marcar como leída ───────────────────
router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const id = req.params.id as string
    await markAsRead(platformDb as any, id, user.sub)
    res.json({ success: true })
  } catch (error: any) {
    // Prisma error P2025 = record not found (incluye owner mismatch)
    if (error?.code === 'P2025') {
      res.status(404).json({ error: 'Notificación no encontrada' })
      return
    }
    console.error('[notifications] Error marking as read:', error)
    res.status(500).json({ error: 'Error al marcar como leída' })
  }
})

export default router
