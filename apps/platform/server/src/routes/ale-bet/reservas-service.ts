import { Prisma, TipoMovimiento } from '@platform/db'
import { calcularUnidades, descomponerUnidades } from './constants'

type TransactionClient = Prisma.TransactionClient

type ReservationInput = Array<{ id: string; productoId: string; cantidad: number }>

type LockedLot = {
  id: string
  cajas: number
  sueltos: number
  unidadesPorCaja: number
  reservado: number
}

export class StockConflictError extends Error {}

async function lockLots(tx: TransactionClient, productoId: string): Promise<LockedLot[]> {
  return tx.$queryRaw<LockedLot[]>(Prisma.sql`
    SELECT lote.id, lote.cajas, lote.sueltos, producto."unidadesPorCaja",
      COALESCE((
        SELECT SUM(reserva.cantidad)::integer
        FROM "ale_bet"."ReservaStock" AS reserva
        WHERE reserva."loteId" = lote.id AND reserva.estado = 'ACTIVA'
      ), 0)::integer AS reservado
    FROM "ale_bet"."Lote" AS lote
    JOIN "ale_bet"."Producto" AS producto ON producto.id = lote."productoId"
    WHERE lote."productoId" = ${productoId} AND lote.activo = true
    ORDER BY lote."fechaVencimiento" ASC, lote.id ASC
    FOR UPDATE
  `)
}

export async function releaseActiveReservations(tx: TransactionClient, pedidoId: string): Promise<void> {
  await tx.reservaStock.updateMany({
    where: { pedidoId, estado: 'ACTIVA' },
    data: { estado: 'LIBERADA', releasedAt: new Date() },
  })
}

export async function reserveFefo(tx: TransactionClient, pedidoId: string, items: ReservationInput): Promise<void> {
  const byProduct = new Map<string, ReservationInput>()
  for (const item of items) {
    const current = byProduct.get(item.productoId) ?? []
    current.push(item)
    byProduct.set(item.productoId, current)
  }

  for (const productoId of [...byProduct.keys()].sort((left, right) => left.localeCompare(right))) {
    const productItems = byProduct.get(productoId) ?? []
    const lots = await lockLots(tx, productoId)
    const required = productItems.reduce((sum, item) => sum + item.cantidad, 0)
    const available = lots.reduce((sum, lot) => (
      sum + Math.max(0, calcularUnidades(lot.cajas, lot.sueltos, lot.unidadesPorCaja) - lot.reservado)
    ), 0)

    if (available < required) {
      throw new StockConflictError(`Stock insuficiente para reservar producto ${productoId}. Disponible: ${available}u, solicitado: ${required}u`)
    }

    let lotIndex = 0
    let remainingInLot = lots.length > 0
      ? Math.max(0, calcularUnidades(lots[0].cajas, lots[0].sueltos, lots[0].unidadesPorCaja) - lots[0].reservado)
      : 0

    for (const item of productItems) {
      let remaining = item.cantidad
      while (remaining > 0) {
        while (remainingInLot === 0 && lotIndex < lots.length - 1) {
          lotIndex += 1
          const lot = lots[lotIndex]
          remainingInLot = Math.max(0, calcularUnidades(lot.cajas, lot.sueltos, lot.unidadesPorCaja) - lot.reservado)
        }
        const lot = lots[lotIndex]
        if (remainingInLot === 0 || !lot) throw new StockConflictError('Stock insuficiente luego de bloquear los lotes')
        const quantity = Math.min(remaining, remainingInLot)
        await tx.reservaStock.create({ data: { pedidoId, itemPedidoId: item.id, loteId: lot.id, cantidad: quantity } })
        remaining -= quantity
        remainingInLot -= quantity
      }
    }
  }
}

export async function consumeActiveReservations(tx: TransactionClient, pedidoId: string, actorId: string): Promise<void> {
  const reservations = await tx.reservaStock.findMany({
    where: { pedidoId, estado: 'ACTIVA' },
    orderBy: [{ loteId: 'asc' }, { id: 'asc' }],
  })
  if (reservations.length === 0) throw new StockConflictError('El pedido no tiene reservas activas para despachar')

  for (const reservation of reservations) {
    const locked = await tx.$queryRaw<Array<{ id: string; productoId: string; cajas: number; sueltos: number; unidadesPorCaja: number }>>(Prisma.sql`
      SELECT lote.id, lote."productoId", lote.cajas, lote.sueltos, producto."unidadesPorCaja"
      FROM "ale_bet"."Lote" AS lote
      JOIN "ale_bet"."Producto" AS producto ON producto.id = lote."productoId"
      WHERE lote.id = ${reservation.loteId}
      FOR UPDATE
    `)
    const lot = locked[0]
    if (!lot) throw new StockConflictError('Lote reservado no encontrado')
    const physical = calcularUnidades(lot.cajas, lot.sueltos, lot.unidadesPorCaja)
    if (physical < reservation.cantidad) throw new StockConflictError('El stock físico es menor que la reserva a consumir')

    const remaining = physical - reservation.cantidad
    await tx.lote.update({
      where: { id: lot.id },
      data: { ...descomponerUnidades(remaining, lot.unidadesPorCaja), activo: remaining > 0 },
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
      },
    })
  }
}
