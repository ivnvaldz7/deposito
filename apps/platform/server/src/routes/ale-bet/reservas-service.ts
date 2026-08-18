import { Prisma, TipoMovimiento } from '@platform/db'
import { calcularUnidades, descomponerUnidades } from './constants'
import { evaluateLotLifecycle } from './product-stock-admin-service'

type TransactionClient = Prisma.TransactionClient

type ReservationInput = Array<{ id: string; productoId: string; cantidad: number }>

type LockedLot = {
  id: string
  cantidad: number
  cajas: number
  sueltos: number
  unidadesPorCaja: number
  reservado: number
}

export class StockConflictError extends Error {}

async function lockLots(tx: TransactionClient, productoId: string): Promise<LockedLot[]> {
  return tx.$queryRaw<LockedLot[]>(Prisma.sql`
    SELECT lote.id, saldo.cantidad, lote.cajas, lote.sueltos, producto."unidadesPorCaja",
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
    ORDER BY lote."fechaVencimiento" ASC, lote.id ASC
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
    const lots = await lockLots(tx, productoId)
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

export async function consumeActiveReservations(tx: TransactionClient, pedidoId: string, actorId: string): Promise<void> {
  const reservations = await tx.reservaStock.findMany({
    where: { pedidoId, estado: 'ACTIVA' },
    orderBy: [{ loteId: 'asc' }, { ubicacionId: 'asc' }, { id: 'asc' }],
  })
  if (reservations.length === 0) throw new StockConflictError('El pedido no tiene reservas activas para despachar')

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
  }
}
