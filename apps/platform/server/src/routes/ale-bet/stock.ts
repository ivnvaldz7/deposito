import { Router } from 'express'
import { z } from 'zod'
import { platformDb as prisma } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { getAppAccess } from '@platform/core'
import { requireApp } from '../../middlewares/require-app'
import { InventoryConflictError, transferInternal } from './inventory-service'

const router = Router()
const transferSchema = z.object({
  productoId: z.string().min(1),
  loteId: z.string().min(1),
  origen: z.enum(['DEPOSITO', 'ACONDICIONADO']),
  destino: z.enum(['DEPOSITO', 'ACONDICIONADO']),
  cantidad: z.number().int().positive(),
}).refine((value) => value.origen !== value.destino, { message: 'Source and destination must differ' })

router.get('/', requireApp('ale-bet'), async (req, res) => {
  const user = req.user as JwtPayload
  const appAccess = getAppAccess(user, 'ale-bet')
  const includeArchived = req.query.includeArchived === 'true' && ['admin', 'encargado'].includes(appAccess?.rol ?? '')

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
      const lotes = producto.lotes.map((lote) => {
        const stockDeposito = lote.saldos
          .filter((saldo) => saldo.ubicacion.codigo === 'DEPOSITO')
          .reduce((total, saldo) => total + saldo.cantidad, 0)
        const stockAcondicionado = lote.saldos
          .filter((saldo) => saldo.ubicacion.codigo === 'ACONDICIONADO')
          .reduce((total, saldo) => total + saldo.cantidad, 0)
        const stockTotal = lote.saldos.reduce((total, saldo) => total + saldo.cantidad, 0)

        return {
          id: lote.id,
          numero: lote.numero,
          fechaProduccion: lote.fechaProduccion,
          fechaVencimiento: lote.fechaVencimiento,
          activo: lote.activo,
          stockTotal,
          stockDeposito,
          stockAcondicionado,
        }
      })
      const stockTotal = lotes.reduce((total, lote) => total + lote.stockTotal, 0)
      const stockDeposito = lotes.reduce((total, lote) => total + lote.stockDeposito, 0)
      const stockAcondicionado = lotes.reduce((total, lote) => total + lote.stockAcondicionado, 0)

      return {
        ...producto,
        lotes,
        stock: stockTotal,
        stockTotal,
        stockDeposito,
        stockAcondicionado,
        stockDisponiblePedido: stockDeposito,
        stockBajo: stockTotal < producto.stockMinimo,
      }
    }),
    movimientos,
  })
})

router.get('/movimientos', requireApp('ale-bet'), async (_req, res) => {
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
