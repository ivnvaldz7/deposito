import { Prisma, TipoMovimiento } from '@platform/db'
import { calcularUnidades, descomponerUnidades } from './constants'
import { evaluateLotLifecycle } from './product-stock-admin-service'
import { orderEligibleLots } from './inventory-service'
import { markStockProjectionDirty } from './stock-projection/outbox'

type TransactionClient = Prisma.TransactionClient

type ReservationInput = Array<{ id: string; productoId: string; cantidad: number }>

type LockedLot = {
  id: string
  activo: boolean
  fechaVencimiento: Date | null
  fechaProduccion: Date | null
  createdAt: Date
  cantidad: number
  cajas: number
  sueltos: number
  unidadesPorCaja: number
  reservado: number
}

export class StockConflictError extends Error {}

async function lockLots(tx: TransactionClient, productoId: string): Promise<LockedLot[]> {
  return tx.$queryRaw<LockedLot[]>(Prisma.sql`
    SELECT lote.id, lote.activo, lote."fechaVencimiento", lote."fechaProduccion", lote."createdAt", saldo.cantidad, lote.cajas, lote.sueltos, producto."unidadesPorCaja",
      COALESCE((
        SELECT SUM(reserva.cantidad)::integer
        FROM "ale_bet"."ReservaStock" AS reserva
        WHERE reserva."loteId" = lote.id AND reserva.estado = 'ACTIVA'
      ), 0)::integer AS reservado
    FROM "ale_bet"."Lote" AS lote
    JOIN "ale_bet"."Producto" AS producto ON producto.id = lote."productoId"
    JOIN "ale_bet"."SaldoStock" AS saldo ON saldo."loteId" = lote.id AND saldo."productoId" = lote."productoId"
    JOIN "ale_bet"."UbicacionStock" AS ubicacion ON ubicacion.id = saldo."ubicacionId" AND ubicacion.codigo = 'DEPOSITO'
    WHERE lote."productoId" = ${productoId} AND lote.activo = true
    ORDER BY lote.id, saldo.id
    FOR UPDATE OF lote, saldo
  `)
}

async function getDepositoLocationId(tx: TransactionClient): Promise<string> {
  const location = await tx.ubicacionStock.findUnique({ where: { codigo: 'DEPOSITO' } })
  if (!location) throw new StockConflictError('No existe la ubicación DEPOSITO')
  return location.id
}

export async function releaseActiveReservations(tx: TransactionClient, pedidoId: string): Promise<void> {
  await tx.reservaStock.updateMany({
    where: { pedidoId, estado: 'ACTIVA' },
    data: { estado: 'LIBERADA', releasedAt: new Date() },
  })
}

export async function reserveFefo(tx: TransactionClient, pedidoId: string, items: ReservationInput): Promise<void> {
  const depositoId = await getDepositoLocationId(tx)
  const byProduct = new Map<string, ReservationInput>()
  for (const item of items) {
    const current = byProduct.get(item.productoId) ?? []
    current.push(item)
    byProduct.set(item.productoId, current)
  }

  for (const productoId of [...byProduct.keys()].sort((left, right) => left.localeCompare(right))) {
    const productItems = byProduct.get(productoId) ?? []
    const lockedLots = await lockLots(tx, productoId)
    // Keep FEFO reservation eligibility exactly aligned with preview/allocation.
    const lockedById = new Map(lockedLots.map((lot) => [lot.id, lot]))
    const eligibleLots = orderEligibleLots(lockedLots, new Date()).map((lot) => lockedById.get(lot.id)).filter((lot): lot is LockedLot => Boolean(lot))
    // This statement intentionally executes *after* the lot/balance locks. A
    // concurrent approver that waited for those locks must observe reservations
    // committed by the first approver, not the earlier statement snapshot.
    const reservationStore = tx.reservaStock as typeof tx.reservaStock & { groupBy?: typeof tx.reservaStock.groupBy }
    const reservations = reservationStore.groupBy ? await reservationStore.groupBy({
      by: ['loteId'],
      where: { loteId: { in: eligibleLots.map((lot) => lot.id) }, estado: 'ACTIVA' },
      _sum: { cantidad: true },
    }) : []
    const reservedByLot = new Map(reservations.map((reservation) => [reservation.loteId, reservation._sum.cantidad ?? 0]))
    const lots = eligibleLots.map((lot) => ({ ...lot, reservado: reservedByLot.get(lot.id) ?? lot.reservado }))
    const required = productItems.reduce((sum, item) => sum + item.cantidad, 0)
    const available = lots.reduce((sum, lot) => (
      sum + Math.max(0, lot.cantidad - lot.reservado)
    ), 0)

    if (available < required) {
      throw new StockConflictError(`Stock insuficiente para reservar producto ${productoId}. Disponible: ${available}u, solicitado: ${required}u`)
    }

    let lotIndex = 0
    let remainingInLot = lots.length > 0
      ? Math.max(0, lots[0].cantidad - lots[0].reservado)
      : 0

    for (const item of productItems) {
      let remaining = item.cantidad
      while (remaining > 0) {
        while (remainingInLot === 0 && lotIndex < lots.length - 1) {
          lotIndex += 1
          const lot = lots[lotIndex]
          remainingInLot = Math.max(0, lot.cantidad - lot.reservado)
        }
        const lot = lots[lotIndex]
        if (remainingInLot === 0 || !lot) throw new StockConflictError('Stock insuficiente luego de bloquear los lotes')
        const quantity = Math.min(remaining, remainingInLot)
        await tx.reservaStock.create({
          data: {
            cantidad: quantity,
            pedido: { connect: { id: pedidoId } },
            itemPedido: { connect: { id: item.id } },
            lote: { connect: { id: lot.id } },
            ubicacion: { connect: { id: depositoId } },
          },
        })
        remaining -= quantity
        remainingInLot -= quantity
      }
    }
  }
}

export async function consumeActiveReservations(
  tx: TransactionClient,
  pedidoId: string,
  actorId: string,
  options: { skipOutbox?: boolean } = {},
): Promise<void> {
  const reservations = await tx.reservaStock.findMany({
    where: { pedidoId, estado: 'ACTIVA' },
    orderBy: [{ loteId: 'asc' }, { ubicacionId: 'asc' }, { id: 'asc' }],
  })
  if (reservations.length === 0) throw new StockConflictError('El pedido no tiene reservas activas para despachar')

  const consumedProductIds = new Set<string>()

  for (const reservation of reservations) {
    const locked = await tx.$queryRaw<Array<{ id: string; productoId: string; cajas: number; sueltos: number; unidadesPorCaja: number; cantidad: number; saldoId: string }>>(Prisma.sql`
      SELECT lote.id, lote."productoId", lote.cajas, lote.sueltos, producto."unidadesPorCaja", saldo.cantidad, saldo.id AS "saldoId"
      FROM "ale_bet"."Lote" AS lote
      JOIN "ale_bet"."Producto" AS producto ON producto.id = lote."productoId"
      JOIN "ale_bet"."SaldoStock" AS saldo ON saldo."loteId" = lote.id AND saldo."ubicacionId" = ${reservation.ubicacionId}
      WHERE lote.id = ${reservation.loteId}
      FOR UPDATE OF lote, saldo
    `)
    const lot = locked[0]
    if (!lot) throw new StockConflictError('Lote reservado no encontrado')
    const physical = lot.cantidad
    if (physical < reservation.cantidad) throw new StockConflictError('El stock físico es menor que la reserva a consumir')

    const remaining = physical - reservation.cantidad
    if (remaining < 0) throw new StockConflictError('El stock físico resultante no puede ser negativo')
    await tx.saldoStock.update({ where: { id: lot.saldoId }, data: { cantidad: { decrement: reservation.cantidad } } })
    await tx.lote.update({
      where: { id: lot.id },
      data: descomponerUnidades(remaining, lot.unidadesPorCaja),
    })
    await tx.reservaStock.update({ where: { id: reservation.id }, data: { estado: 'CONSUMIDA', consumedAt: new Date() } })
    await tx.movimientoStock.create({
      data: {
        productoId: lot.productoId,
        cantidad: -reservation.cantidad,
        tipo: TipoMovimiento.SALIDA_PEDIDO,
        referencia: pedidoId,
        usuarioId: actorId,
        pedidoId,
        loteId: lot.id,
        reservaId: reservation.id,
        origenUbicacionId: reservation.ubicacionId,
      },
    })
    await evaluateLotLifecycle(tx, { loteId: lot.id, productoId: lot.productoId })
    consumedProductIds.add(lot.productoId)
  }

  if (!options.skipOutbox) {
    for (const productId of consumedProductIds) {
      await markStockProjectionDirty(tx, {
        productId,
        causeType: 'CONSUMO_PEDIDO',
        causeId: pedidoId,
      })
    }
  }
}

type ReturnItemInput = Array<{ productoId: string; cantidad: number }>

/**
 * Re-enters returned units in the same lots and stock locations from which
 * they were consumed during dispatch. Reservation rows are locked first, so
 * two concurrent returns cannot put more back than was originally shipped.
 */
export async function returnConsumedReservations(
  tx: TransactionClient,
  pedidoId: string,
  actorId: string,
  items: ReturnItemInput,
  motivo: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id
    FROM "ale_bet"."ReservaStock"
    WHERE "pedidoId" = ${pedidoId} AND estado = 'CONSUMIDA'
    FOR UPDATE
  `)

  const requestedByProduct = new Map<string, number>()
  for (const item of items) {
    requestedByProduct.set(item.productoId, (requestedByProduct.get(item.productoId) ?? 0) + item.cantidad)
  }

  const consumed = await tx.reservaStock.findMany({
    where: { pedidoId, estado: 'CONSUMIDA' },
    include: { lote: { select: { productoId: true } } },
    orderBy: [{ consumedAt: 'asc' }, { id: 'asc' }],
  })
  if (consumed.length === 0) throw new StockConflictError('El pedido no tiene stock consumido para devolver')

  const returned = await tx.movimientoStock.findMany({
    where: { pedidoId, tipo: TipoMovimiento.DEVOLUCION_PEDIDO },
    select: { reservaId: true, cantidad: true },
  })
  const returnedByReservation = new Map<string, number>()
  for (const movement of returned) {
    if (movement.reservaId) returnedByReservation.set(movement.reservaId, (returnedByReservation.get(movement.reservaId) ?? 0) + movement.cantidad)
  }

  const reservationsByProduct = new Map<string, typeof consumed>()
  for (const reservation of consumed) {
    const entries = reservationsByProduct.get(reservation.lote.productoId) ?? []
    entries.push(reservation)
    reservationsByProduct.set(reservation.lote.productoId, entries)
  }

  for (const [productoId, requested] of requestedByProduct) {
    const available = (reservationsByProduct.get(productoId) ?? []).reduce(
      (total, reservation) => total + Math.max(0, reservation.cantidad - (returnedByReservation.get(reservation.id) ?? 0)),
      0,
    )
    if (requested > available) {
      throw new StockConflictError(`No se pueden devolver ${requested} unidades del producto ${productoId}; quedan ${available} unidades disponibles para devolver`)
    }
  }

  const returnedProductIds = new Set<string>()
  for (const [productoId, requested] of [...requestedByProduct.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    let remaining = requested
    const reservations = reservationsByProduct.get(productoId) ?? []
    for (const reservation of reservations) {
      const returnable = reservation.cantidad - (returnedByReservation.get(reservation.id) ?? 0)
      if (returnable <= 0) continue
      const quantity = Math.min(remaining, returnable)
      const locked = await tx.$queryRaw<Array<{ id: string; productoId: string; cajas: number; sueltos: number; unidadesPorCaja: number; cantidad: number; saldoId: string }>>(Prisma.sql`
        SELECT lote.id, lote."productoId", lote.cajas, lote.sueltos, producto."unidadesPorCaja", saldo.cantidad, saldo.id AS "saldoId"
        FROM "ale_bet"."Lote" AS lote
        JOIN "ale_bet"."Producto" AS producto ON producto.id = lote."productoId"
        JOIN "ale_bet"."SaldoStock" AS saldo ON saldo."loteId" = lote.id AND saldo."ubicacionId" = ${reservation.ubicacionId}
        WHERE lote.id = ${reservation.loteId}
        FOR UPDATE OF lote, saldo
      `)
      const lot = locked[0]
      if (!lot) throw new StockConflictError('Lote original de la devolución no encontrado')

      const nextQuantity = lot.cantidad + quantity
      await tx.saldoStock.update({ where: { id: lot.saldoId }, data: { cantidad: { increment: quantity } } })
      await tx.lote.update({ where: { id: lot.id }, data: descomponerUnidades(nextQuantity, lot.unidadesPorCaja) })
      await tx.movimientoStock.create({
        data: {
          productoId,
          cantidad: quantity,
          tipo: TipoMovimiento.DEVOLUCION_PEDIDO,
          referencia: `DEVOLUCION_PEDIDO:${pedidoId}`,
          usuarioId: actorId,
          pedidoId,
          loteId: lot.id,
          reservaId: reservation.id,
          destinoUbicacionId: reservation.ubicacionId,
        },
      })
      await evaluateLotLifecycle(tx, { loteId: lot.id, productoId })
      returnedByReservation.set(reservation.id, (returnedByReservation.get(reservation.id) ?? 0) + quantity)
      returnedProductIds.add(productoId)
      remaining -= quantity
      if (remaining === 0) break
    }
    if (remaining > 0) {
      throw new StockConflictError(`No se pudieron asignar las unidades devueltas del producto ${productoId}`)
    }
  }

  for (const productId of returnedProductIds) {
    await markStockProjectionDirty(tx, {
      productId,
      causeType: 'DEVOLUCION_PEDIDO',
      causeId: pedidoId,
    })
  }
}
