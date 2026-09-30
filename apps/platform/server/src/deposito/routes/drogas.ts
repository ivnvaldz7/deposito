import { Request, Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../../middlewares/require-permission'
import { aggregateDrugCatalog } from '../services/droga-inventory-service'

const router = Router()

const ajustarCantidadSchema = z.object({
  cantidad: z.number().finite().min(0, 'La cantidad no puede ser negativa'),
  motivo: z.string().trim().min(3, 'Indicá el motivo del ajuste').max(500),
})

router.get('/', authenticate, requirePermission('deposito', 'drogas.read'), async (req: Request, res: Response): Promise<void> => {
  const nombre = typeof req.query['nombre'] === 'string' ? req.query['nombre'].trim() : ''
  const orderByExpiry = req.query['orden'] === 'proximo-vencimiento'
  try {
    const products = await prisma.depositoProducto.findMany({
      where: {
        categoria: 'droga',
        activo: true,
        ...(nombre ? { nombreCompleto: { contains: nombre, mode: 'insensitive' } } : {}),
      },
      select: {
        id: true,
        codigo: true,
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

// An adjustment never rewrites the original ingress. It changes only the
// current lot balance and creates an auditable delta in Movimientos.
router.patch('/:inventarioId/cantidad', authenticate, requirePermission('deposito', 'ingresos.create'), async (req: Request, res: Response): Promise<void> => {
  const parsedId = z.string().uuid().safeParse(req.params.inventarioId)
  const parsedBody = ajustarCantidadSchema.safeParse(req.body)
  if (!parsedId.success || !parsedBody.success) {
    res.status(400).json({ message: 'Datos de ajuste inválidos', errors: parsedBody.success ? undefined : parsedBody.error.flatten() })
    return
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const inventario = await tx.inventarioDroga.findUnique({
        where: { id: parsedId.data },
        select: { id: true, productoId: true, nombre: true, lote: true, cantidad: true },
      })
      if (!inventario) return null

      const cantidadAnterior = inventario.cantidad
      const cantidadNueva = parsedBody.data.cantidad
      const diferencia = cantidadNueva - cantidadAnterior
      if (diferencia === 0) return { inventario, diferencia: 0 }

      const actualizado = await tx.inventarioDroga.update({
        where: { id: inventario.id },
        data: { cantidad: cantidadNueva },
      })
      await tx.movimiento.create({
        data: {
          tipo: 'ajuste_manual',
          categoria: 'droga',
          productoNombre: inventario.nombre,
          productoId: inventario.productoId,
          lote: inventario.lote,
          cantidad: diferencia,
          referenciaId: inventario.id,
          justificacion: parsedBody.data.motivo,
          createdBy: req.depositoUser!.id,
        },
      })
      return { inventario: actualizado, diferencia }
    })

    if (!result) {
      res.status(404).json({ message: 'Lote de droga no encontrado' })
      return
    }
    res.json(result)
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined
    console.error('[deposito:drogas] No se pudo ajustar la cantidad', {
      inventarioId: parsedId.data,
      actorId: req.depositoUser?.id,
      code,
      message: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ message: 'No se pudo ajustar la cantidad' })
  }
})

// Kept as an explicit, authenticated compatibility boundary. Historic opening
// data stays available from inventory and traceability reads, but cannot change.
router.patch('/:productoId/apertura/:inventarioId', authenticate, requirePermission('deposito', 'ingresos.create'), async (_req: Request, res: Response): Promise<void> => {
  res.status(410).json({
    error: 'La edición de apertura está cerrada para la operación normal. Usá un ajuste de stock; el historial existente no se modifica.',
  })
})

export default router
