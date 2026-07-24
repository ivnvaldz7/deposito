import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'

const router = Router()

/**
 * GET /siguiente
 *
 * Devuelve el próximo número de lote disponible para productos ME.
 * Escanea todos los items de acta no-droga y devuelve el máximo número + 1.
 *
 * Response: { lote: "3436" }
 */
router.get('/siguiente', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await prisma.$queryRaw<{ max_num: number | null }[]>`
      SELECT MAX(CAST(REGEXP_REPLACE(lote, '[^0-9]', '', 'g') AS INTEGER)) as max_num
      FROM deposito.acta_items
      WHERE categoria != 'droga'
    `

    const maxNum = result[0]?.max_num ?? 0
    res.json({ lote: String(maxNum + 1) })
  } catch (error) {
    console.error('Error al obtener siguiente lote:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

export default router
