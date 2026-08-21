import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../../middlewares/require-permission'

const router = Router()

router.get('/', authenticate, requirePermission('deposito', 'drogas.read'), async (req: Request, res: Response): Promise<void> => {
  const nombreFilter = typeof req.query['nombre'] === 'string' ? req.query['nombre'] : undefined

  try {
    const drogas = await prisma.inventarioDroga.findMany({
      where: nombreFilter ? { nombre: nombreFilter } : undefined,
      orderBy: [{ nombre: 'asc' }, { vencimiento: 'asc' }],
    })
    res.json(drogas)
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// ─── GET /api/drogas/por-vencer?dias=30 ───────────────────────────────────────

router.get('/por-vencer', authenticate, requirePermission('deposito', 'drogas.read.por_vencer'), async (req: Request, res: Response): Promise<void> => {
  const dias = typeof req.query['dias'] === 'string' ? parseInt(req.query['dias'], 10) : 30
  const validDias = isNaN(dias) || dias <= 0 ? 30 : Math.min(dias, 365)

  const limitDate = new Date()
  limitDate.setDate(limitDate.getDate() + validDias)
  limitDate.setUTCHours(23, 59, 59, 999)

  try {
    const drogas = await prisma.inventarioDroga.findMany({
      where: {
        vencimiento: { lte: limitDate },
        cantidad: { gt: 0 },
      },
      orderBy: { vencimiento: 'asc' },
    })
    res.json(drogas)
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

export default router
