import { Request, Response, Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../../middlewares/require-permission'
import { aggregateDrugCatalog } from '../services/droga-inventory-service'

const router = Router()

router.get('/', authenticate, requirePermission('deposito', 'drogas.read'), async (req: Request, res: Response): Promise<void> => {
  const nombre = typeof req.query['nombre'] === 'string' ? req.query['nombre'].trim() : ''
  const orderByExpiry = req.query['orden'] === 'proximo-vencimiento'
  try {
    const products = await prisma.depositoProducto.findMany({
      where: {
        categoria: 'droga',
        estado: 'ACTIVO',
        ...(nombre ? { nombreCompleto: { contains: nombre, mode: 'insensitive' } } : {}),
      },
      select: {
        id: true,
        nombreCompleto: true,
        stockMinimo: true,
        inventarioDrogas: {
          select: { id: true, lote: true, vencimiento: true, cantidad: true, createdAt: true },
          orderBy: [{ vencimiento: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
        },
      },
      orderBy: { nombreCompleto: 'asc' },
    })
    const result = aggregateDrugCatalog(products)
    if (orderByExpiry) {
      result.sort((left, right) => {
        const leftDate = left.proximoVencimiento?.getTime() ?? Number.POSITIVE_INFINITY
        const rightDate = right.proximoVencimiento?.getTime() ?? Number.POSITIVE_INFINITY
        return leftDate - rightDate || left.nombre.localeCompare(right.nombre)
      })
    }
    res.json(result)
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

router.get('/por-vencer', authenticate, requirePermission('deposito', 'drogas.read.por_vencer'), async (req: Request, res: Response): Promise<void> => {
  const parsedDays = typeof req.query['dias'] === 'string' ? Number.parseInt(req.query['dias'], 10) : 30
  const days = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.min(parsedDays, 365) : 30
  const limit = new Date()
  limit.setUTCDate(limit.getUTCDate() + days)
  limit.setUTCHours(23, 59, 59, 999)
  try {
    const products = await prisma.depositoProducto.findMany({
      where: { categoria: 'droga', estado: 'ACTIVO' },
      select: {
        id: true,
        nombreCompleto: true,
        stockMinimo: true,
        inventarioDrogas: {
          where: { cantidad: { gt: 0 }, vencimiento: { lte: limit } },
          select: { id: true, lote: true, vencimiento: true, cantidad: true, createdAt: true },
          orderBy: [{ vencimiento: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: { nombreCompleto: 'asc' },
    })
    res.json(aggregateDrugCatalog(products).filter((product) => product.lotes.length > 0))
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

export default router
