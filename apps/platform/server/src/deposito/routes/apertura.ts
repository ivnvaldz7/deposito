import { Router, type Request, type Response } from 'express'
import { authenticate } from '../middleware/auth'

const router = Router()

// Historical opening movements remain readable through the normal inventory and
// traceability endpoints. Operational writes must use the ordinary stock flows.
router.post('/', authenticate, async (_req: Request, res: Response): Promise<void> => {
  res.status(410).json({
    error: 'La carga inicial está cerrada para la operación normal. Los datos y movimientos históricos permanecen disponibles.',
  })
})

export default router
