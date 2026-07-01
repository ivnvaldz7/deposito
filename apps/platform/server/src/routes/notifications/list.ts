import { Router, type Request, type Response } from 'express'
import { platformDb } from '@platform/db'
import { getNotificationsByUser } from '@platform/core'
import type { AppId } from '@platform/core'

const router = Router()

// ─── GET /api/notifications — historial paginado ─────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20))

    const filters: { app?: AppId; leida?: boolean; tipo?: string } = {}
    if (req.query.app) filters.app = req.query.app as AppId
    if (req.query.leida !== undefined) filters.leida = req.query.leida === 'true'
    if (req.query.tipo) filters.tipo = req.query.tipo as string

    const result = await getNotificationsByUser(
      platformDb as any,
      user.sub,
      filters,
      { page, limit },
    )

    res.json(result)
  } catch (error) {
    console.error('[notifications] Error listing:', error)
    res.status(500).json({ error: 'Error al obtener notificaciones' })
  }
})

export default router
