import { Router } from 'express'
import { z } from 'zod'
import { platformDb as prisma } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { requireApp } from '../../middlewares/require-app'
import { calcularUnidades } from './constants'
import { InventoryConflictError, transferInternal } from './inventory-service'

const router = Router()
const transferSchema = z.object({
  productoId: z.string().min(1),
  loteId: z.string().min(1),
  origen: z.enum(['DEPOSITO', 'ACONDICIONADO']),
  destino: z.enum(['DEPOSITO', 'ACONDICIONADO']),
  cantidad: z.number().int().positive(),
}).refine((value) => value.origen !== value.destino, { message: 'Source and destination must differ' })

router.get('/', requireApp('ale-bet', ['admin', 'encargado']), async (_req, res) => {
  const [productos, movimientos] = await Promise.all([
    prisma.producto.findMany({
      include: {
        lotes: {
          where: { activo: true },
          orderBy: { fechaVencimiento: 'asc' },
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
      const stock = producto.lotes.reduce(
        (total, lote) => total + calcularUnidades(lote.cajas, lote.sueltos, producto.unidadesPorCaja),
        0
      )

      return {
        ...producto,
        stock,
        stockTotal: stock,
        stockDeposito: stock,
        stockAcondicionado: 0,
        stockDisponiblePedido: stock,
        stockBajo: stock < producto.stockMinimo,
      }
    }),
    movimientos,
  })
})

router.get('/movimientos', requireApp('ale-bet', ['admin', 'encargado']), async (_req, res) => {
  const movimientos = await prisma.movimientoStock.findMany({
    orderBy: { createdAt: 'desc' },
  })

  res.json(movimientos)
})

router.post('/transferencias', requireApp('ale-bet', ['admin', 'encargado']), async (req, res) => {
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
