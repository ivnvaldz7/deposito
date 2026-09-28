import { Router } from 'express'
import { z } from 'zod'
import { platformDb as prisma, TipoReglaTransferenciaProducto } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { hasPermission } from '@platform/core'
import { requireApp } from '../../middlewares/require-app'
import { requirePermission } from '../../middlewares/require-permission'
import { InventoryConflictError, transferInternal } from './inventory-service'
import { transferConfiguredPresentation, isSameProductRule } from './presentation-transfer-service'
import { aggregateProductAvailability } from './stock-aggregation'
import { syncStockProjectionAfterCommit } from './stock-projection/direct-sync'
import { acquireIdempotencyRecord, calculateFingerprint, completeIdempotencyRecord, getSingleIdempotencyKey, toPersistableResponseBody } from '../../utils/idempotency'

const router = Router()
const transferSchema = z.object({
  productoId: z.string().min(1),
  loteId: z.string().min(1),
  origen: z.enum(['DEPOSITO', 'ACONDICIONADO']),
  destino: z.enum(['DEPOSITO', 'ACONDICIONADO']),
  cantidad: z.number().int().positive(),
  transferRuleId: z.string().min(1).optional(),
}).refine((value) => value.origen !== value.destino, { message: 'Source and destination must differ' })

router.get('/', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.read'), async (req, res) => {
  const user = req.user as JwtPayload
  const includeArchived = req.query.includeArchived === 'true' && hasPermission(user, 'ale-bet', 'stock.read.archived')

  const [productos, movimientos] = await Promise.all([
    prisma.producto.findMany({
      where: { activo: true },
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
        // Zero-balance lots remain in DB and history, but aren't operable in
        // the normal stock view. The explicitly archived view stays complete.
        lotes: includeArchived ? availability.lotes : availability.lotes.filter((lote) => lote.stockTotal > 0),
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

router.get('/transfer-rules', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.transfer'), async (req, res) => {
  const productoId = typeof req.query.productoId === 'string' ? req.query.productoId : ''
  if (!productoId) { res.status(400).json({ error: 'productoId es requerido' }); return }
  const rules = await prisma.productoTransferRule.findMany({
    where: { sourceProductId: productoId, activo: true },
    orderBy: [{ orden: 'asc' }, { label: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      label: true,
      tipo: true,
      targetProduct: { select: { id: true, nombre: true } },
    },
  })
  res.json({ rules })
})

router.post('/transferencias', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.transfer'), async (req, res) => {
  const parsed = transferSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos de transferencia inválidos', details: parsed.error.flatten() }); return }
  const idempotencyKey = getSingleIdempotencyKey(req.rawHeaders)
  if (!idempotencyKey) { res.status(400).json({ error: 'Idempotency-Key es requerido' }); return }

  try {
    const actorId = (req.user as JwtPayload).sub
    const scope = 'ale-bet.stock.transfer'
    const fingerprint = calculateFingerprint('POST', scope, parsed.data.loteId, parsed.data)
    const result = await prisma.$transaction(async (tx) => {
      const acquired = await acquireIdempotencyRecord(tx, actorId, scope, idempotencyKey, fingerprint)
      if (acquired.type === 'REPLAY') return { replayed: true, body: acquired.body }

      const configuredRules = await tx.productoTransferRule.findMany({
        where: { sourceProductId: parsed.data.productoId, activo: true },
        select: { id: true, sourceProductId: true, targetProductId: true, tipo: true },
      })
      const selectedRule = parsed.data.transferRuleId
        ? configuredRules.find((rule) => rule.id === parsed.data.transferRuleId)
        : undefined
      let response: { movimientoId: string; targetProductId?: string; targetLoteId?: string }

      if (configuredRules.length > 0 && parsed.data.origen === 'ACONDICIONADO') {
        if (!selectedRule || parsed.data.destino !== 'DEPOSITO') {
          throw new InventoryConflictError('Debe seleccionar un destino permitido para transferir desde Acondicionado')
        }
        if (selectedRule.tipo === TipoReglaTransferenciaProducto.SAME_PRODUCT) {
          if (!isSameProductRule(selectedRule)) throw new InventoryConflictError('Regla de transferencia inválida')
          response = await transferInternal(tx, { ...parsed.data, actorId, idempotencyKey })
        } else {
          response = await transferConfiguredPresentation(tx, { ...parsed.data, actorId, idempotencyKey, transferRuleId: selectedRule.id })
        }
      } else {
        if (parsed.data.transferRuleId) throw new InventoryConflictError('Destino de transferencia no configurado para el producto')
        response = await transferInternal(tx, { ...parsed.data, actorId, idempotencyKey })
      }

      await completeIdempotencyRecord(tx, acquired.id, 201, toPersistableResponseBody(response))
      return { replayed: false, body: response }
    })
    if (!result.replayed) await syncStockProjectionAfterCommit()
    res.status(201).json(result.body)
  } catch (error) {
    if (error instanceof InventoryConflictError) { res.status(409).json({ error: error.message }); return }
    console.error('Error en transferencia de stock', error)
    res.status(500).json({ error: 'No se pudo completar la transferencia de stock' })
  }
})

export default router
