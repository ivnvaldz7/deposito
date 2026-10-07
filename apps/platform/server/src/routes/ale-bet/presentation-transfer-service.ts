import { Prisma, TipoMovimiento, TipoReglaTransferenciaProducto } from '@platform/db'
import { InventoryConflictError, assertTransferQuantity, type StockLocationCode } from './inventory-service'
import { evaluateLotLifecycle } from './product-stock-admin-service'
import { markStockProjectionDirty } from './stock-projection/outbox'

type Tx = Prisma.TransactionClient

type PresentationTransferInput = {
  actorId: string
  productoId: string
  loteId: string
  cantidad: number
  idempotencyKey: string
  transferRuleId: string
}

type TransferReference = {
  operacion: 'TRANSFERENCIA_PRESENTACION'
  rule: { id: string; label: string; tipo: TipoReglaTransferenciaProducto }
  origen: { productoId: string; loteId: string; ubicacion: 'ACONDICIONADO' }
  destino: { productoId: string; loteId: string; ubicacion: 'DEPOSITO' }
}

function sameInstant(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime()
}

function buildReference(input: TransferReference): string {
  return JSON.stringify(input)
}

async function lockBalance(tx: Tx, productoId: string, loteId: string, ubicacionId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM "ale_bet"."SaldoStock"
    WHERE "productoId" = ${productoId} AND "loteId" = ${loteId} AND "ubicacionId" = ${ubicacionId}
    FOR UPDATE
  `)
}

export async function transferConfiguredPresentation(
  tx: Tx,
  input: PresentationTransferInput,
): Promise<{ movimientoId: string; targetProductId: string; targetLoteId: string }> {
  assertTransferQuantity(input.cantidad)

  const rule = await tx.productoTransferRule.findFirst({
    where: { id: input.transferRuleId, sourceProductId: input.productoId, activo: true },
    select: { id: true, sourceProductId: true, targetProductId: true, label: true, tipo: true },
  })
  if (!rule || rule.tipo !== TipoReglaTransferenciaProducto.PRESENTATION || rule.sourceProductId === rule.targetProductId) {
    throw new InventoryConflictError('Destino de presentación no configurado para el producto')
  }

  const locations = await tx.ubicacionStock.findMany({
    where: { codigo: { in: ['ACONDICIONADO', 'DEPOSITO'] } },
    select: { id: true, codigo: true, activo: true },
  })
  const origin = locations.find((location) => location.codigo === 'ACONDICIONADO' && location.activo)
  const destination = locations.find((location) => location.codigo === 'DEPOSITO' && location.activo)
  if (!origin || !destination) throw new InventoryConflictError('Ubicaciones operativas no encontradas')

  // All conversions from the same source lot serialize here. This makes both
  // the source decrement and derived-lot creation safe under concurrent calls.
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM "ale_bet"."Lote" WHERE id = ${input.loteId} AND "productoId" = ${input.productoId} FOR UPDATE
  `)
  const sourceLot = await tx.lote.findFirst({
    where: { id: input.loteId, productoId: input.productoId, producto: { activo: true } },
    select: { id: true, numero: true, fechaProduccion: true, fechaVencimiento: true },
  })
  if (!sourceLot) throw new InventoryConflictError('Lote origen no encontrado para el producto')

  let targetLot = await tx.lote.findUnique({
    where: { productoId_derivedFromLoteId: { productoId: rule.targetProductId, derivedFromLoteId: sourceLot.id } },
    select: { id: true, numero: true, fechaProduccion: true, fechaVencimiento: true, derivedFromLoteId: true },
  })
  if (targetLot) {
    if (
      targetLot.numero !== sourceLot.numero ||
      !sameInstant(targetLot.fechaProduccion, sourceLot.fechaProduccion) ||
      !sameInstant(targetLot.fechaVencimiento, sourceLot.fechaVencimiento)
    ) {
      throw new InventoryConflictError('El lote derivado existente no coincide con la trazabilidad del lote origen')
    }
  } else {
    const matchingLots = (await tx.lote.findMany({
      where: { productoId: rule.targetProductId, numero: sourceLot.numero },
      select: { id: true, numero: true, fechaProduccion: true, fechaVencimiento: true, derivedFromLoteId: true },
    })).filter((lot) =>
      sameInstant(lot.fechaProduccion, sourceLot.fechaProduccion) &&
      sameInstant(lot.fechaVencimiento, sourceLot.fechaVencimiento),
    )
    if (matchingLots.length > 1) throw new InventoryConflictError('Existen múltiples lotes destino con la misma identidad física')
    if (matchingLots.length === 1) {
      const matchingLot = matchingLots[0]!
      if (matchingLot.derivedFromLoteId && matchingLot.derivedFromLoteId !== sourceLot.id) {
        throw new InventoryConflictError('El lote destino existente está trazado a otro lote origen')
      }
      targetLot = matchingLot.derivedFromLoteId
        ? matchingLot
        : await tx.lote.update({
          where: { id: matchingLot.id },
          data: { derivedFromLoteId: sourceLot.id },
          select: { id: true, numero: true, fechaProduccion: true, fechaVencimiento: true, derivedFromLoteId: true },
        })
    } else {
    targetLot = await tx.lote.create({
      data: {
        productoId: rule.targetProductId,
        numero: sourceLot.numero,
        fechaProduccion: sourceLot.fechaProduccion,
        fechaVencimiento: sourceLot.fechaVencimiento,
        derivedFromLoteId: sourceLot.id,
      },
      select: { id: true, numero: true, fechaProduccion: true, fechaVencimiento: true, derivedFromLoteId: true },
    })
    }
  }

  await lockBalance(tx, input.productoId, sourceLot.id, origin.id)
  await lockBalance(tx, rule.targetProductId, targetLot.id, destination.id)
  const source = await tx.saldoStock.findUnique({
    where: { productoId_loteId_ubicacionId: { productoId: input.productoId, loteId: sourceLot.id, ubicacionId: origin.id } },
    select: { id: true, cantidad: true },
  })
  if (!source) throw new InventoryConflictError('Saldo origen no encontrado')

  const reservations = await tx.reservaStock.aggregate({
    where: { loteId: sourceLot.id, ubicacionId: origin.id, estado: 'ACTIVA' },
    _sum: { cantidad: true },
  })
  const available = source.cantidad - (reservations._sum.cantidad ?? 0)
  if (available < input.cantidad) throw new InventoryConflictError('Stock acondicionado insuficiente')

  await tx.saldoStock.update({ where: { id: source.id }, data: { cantidad: { decrement: input.cantidad } } })
  await tx.saldoStock.upsert({
    where: { productoId_loteId_ubicacionId: { productoId: rule.targetProductId, loteId: targetLot.id, ubicacionId: destination.id } },
    create: { productoId: rule.targetProductId, loteId: targetLot.id, ubicacionId: destination.id, cantidad: input.cantidad },
    update: { cantidad: { increment: input.cantidad } },
  })

  const movement = await tx.movimientoStock.create({
    data: {
      productoId: input.productoId,
      loteId: sourceLot.id,
      cantidad: input.cantidad,
      tipo: TipoMovimiento.TRANSFERENCIA_INTERNA,
      referencia: buildReference({
        operacion: 'TRANSFERENCIA_PRESENTACION',
        rule: { id: rule.id, label: rule.label, tipo: rule.tipo },
        origen: { productoId: input.productoId, loteId: sourceLot.id, ubicacion: 'ACONDICIONADO' },
        destino: { productoId: rule.targetProductId, loteId: targetLot.id, ubicacion: 'DEPOSITO' },
      }),
      usuarioId: input.actorId,
      origenUbicacionId: origin.id,
      destinoUbicacionId: destination.id,
      idempotencyKey: input.idempotencyKey,
    },
  })
  await Promise.all([
    evaluateLotLifecycle(tx, { loteId: sourceLot.id, productoId: input.productoId }),
    evaluateLotLifecycle(tx, { loteId: targetLot.id, productoId: rule.targetProductId }),
    markStockProjectionDirty(tx, { productId: input.productoId, causeType: 'TRANSFER', causeId: input.idempotencyKey }),
    markStockProjectionDirty(tx, { productId: rule.targetProductId, causeType: 'TRANSFER', causeId: input.idempotencyKey }),
  ])

  return { movimientoId: movement.id, targetProductId: rule.targetProductId, targetLoteId: targetLot.id }
}

export function isSameProductRule(rule: { tipo: TipoReglaTransferenciaProducto; sourceProductId: string; targetProductId: string }): boolean {
  return rule.tipo === TipoReglaTransferenciaProducto.SAME_PRODUCT && rule.sourceProductId === rule.targetProductId
}
