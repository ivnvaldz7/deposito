import { Router, Request, Response } from 'express'
import type { Prisma } from '@prisma/client'
import { TipoMovimiento } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'

const router = Router()

const TIPOS_VALIDOS = Object.values(TipoMovimiento)

// GET /api/movimientos — listar con filtros opcionales
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { tipo, producto, desde, hasta } = req.query

  const where: Prisma.MovimientoWhereInput = {}

  if (tipo && typeof tipo === 'string' && TIPOS_VALIDOS.includes(tipo as TipoMovimiento)) {
    where.tipo = tipo as TipoMovimiento
  }

  if (producto && typeof producto === 'string' && producto.trim()) {
    where.productoNombre = { contains: producto.trim(), mode: 'insensitive' }
  }

  const createdAtFilter: Prisma.DateTimeFilter<'Movimiento'> = {}
  if (desde && typeof desde === 'string') {
    createdAtFilter.gte = new Date(desde + 'T00:00:00.000Z')
  }
  if (hasta && typeof hasta === 'string') {
    createdAtFilter.lte = new Date(hasta + 'T23:59:59.999Z')
  }
  if (createdAtFilter.gte ?? createdAtFilter.lte) {
    where.createdAt = createdAtFilter
  }

  try {
    const movimientos = await prisma.movimiento.findMany({
      where,
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
    })
    res.json(movimientos)
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

export default router
