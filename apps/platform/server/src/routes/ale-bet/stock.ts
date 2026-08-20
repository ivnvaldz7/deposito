import { Router } from 'express'
import { z } from 'zod'
import { platformDb as prisma } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { getAppAccess } from '@platform/core'
import { requireApp } from '../../middlewares/require-app'
import { requirePermission } from '../../middlewares/require-permission'
import { InventoryConflictError, transferInternal } from './inventory-service'
import { aggregateProductAvailability } from './stock-aggregation'

const router = Router()
const transferSchema = z.object({
  productoId: z.string().min(1),
  loteId: z.string().min(1),
  origen: z.enum(['DEPOSITO', 'ACONDICIONADO']),
  destino: z.enum(['DEPOSITO', 'ACONDICIONADO']),
  cantidad: z.number().int().positive(),
}).refine((value) => value.origen !== value.destino, { message: 'Source and destination must differ' })

router.get('/', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.read'), async (req, res) => {
  const user = req.user as JwtPayload
  const appAccess = getAppAccess(user, 'ale-bet')
  const includeArchived = req.query.includeArchived === 'true' && (user.isPlatformAdmin || ['admin', 'encargado'].includes(appAccess?.rol ?? ''))

  const [productos, movimientos] = await Promise.all([
    prisma.producto.findMany({
      include: {
        lotes: {
          where: includeArchived ? undefined : { activo: true },
          orderBy: { fechaVencimiento: 'asc' },
          include: {
            saldos: {
              include: { ubicacion: { select: { codigo: true } } },
            },
            reservas: { where: { estado: 'ACTIVA' }, select: { cantidad: true } },
          },
        },
      },
      orderBy: { nombre: 'asc' },
    }),
    prisma.movimientoStock.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
    }),
  ])

  res.json({
    productos: productos.map((producto) => {
      const availability = aggregateProductAvailability(producto)
      return {
        ...producto,
        lotes: availability.lotes,
        stock: availability.stockTotal,
        stockTotal: availability.stockTotal,
        stockDeposito: availability.stockDeposito,
        stockAcondicionado: availability.stockAcondicionado,
        stockDisponiblePedido: availability.disponible,
        stockBajo: availability.stockBajo,
      }
    }),
    movimientos,
  })
})

router.get('/movimientos', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.read'), async (_req, res) => {
  const movimientos = await prisma.movimientoStock.findMany({
    orderBy: { createdAt: 'desc' },
  })

  res.json(movimientos)
})

router.post('/transferencias', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.transfer'), async (req, res) => {
  const parsed = transferSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos de transferencia inválidos', details: parsed.error.flatten() }); return }
  const idempotencyKey = req.header('Idempotency-Key')
  if (!idempotencyKey) { res.status(400).json({ error: 'Idempotency-Key es requerido' }); return }

  try {
    const result = await prisma.$transaction((tx) => transferInternal(tx, {
      ...parsed.data,
      actorId: (req.user as JwtPayload).sub,
      idempotencyKey,
    }))
    res.status(201).json(result)
  } catch (error) {
    if (error instanceof InventoryConflictError) { res.status(409).json({ error: error.message }); return }
    throw error
  }
})

export default router
