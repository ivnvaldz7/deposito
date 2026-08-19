import crypto from 'node:crypto'
import { Prisma, TipoMovimiento } from '@platform/db'
import { evaluateLotLifecycle } from './product-stock-admin-service'

export type StockLocationCode = 'DEPOSITO' | 'ACONDICIONADO'
export type AvailabilityStatus = 'DISPONIBLE' | 'DISPONIBLE_CON_TRANSFERENCIA' | 'INSUFICIENTE'

export type EligibleLot = {
  id: string
  activo: boolean
  fechaVencimiento: Date | null
  fechaProduccion: Date | null
  createdAt: Date
  cantidad: number
}

export type Availability = {
  status: AvailabilityStatus
  stockDeposito: number
  stockAcondicionado: number
  stockTotal: number
  stockDisponiblePedido: number
  allocations: Array<{ loteId: string; cantidad: number }>
  transferencias: Array<{ loteId: string; cantidad: number }>
  shortfall: number
}

export class InventoryConflictError extends Error {}

function compareDates(left: Date | null, right: Date | null): number {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  return left.getTime() - right.getTime()
}

export function orderEligibleLots(lots: EligibleLot[], now: Date): EligibleLot[] {
  return lots
    .filter((lot) => lot.activo && lot.cantidad > 0 && (!lot.fechaVencimiento || lot.fechaVencimiento >= now))
    .slice()
    .sort((left, right) => {
      const expiration = compareDates(left.fechaVencimiento, right.fechaVencimiento)
      if (expiration !== 0) return expiration
      const production = compareDates(left.fechaProduccion, right.fechaProduccion)
      if (production !== 0) return production
      const ingress = left.createdAt.getTime() - right.createdAt.getTime()
      return ingress !== 0 ? ingress : left.id.localeCompare(right.id)
    })
}

function allocate(lots: EligibleLot[], quantity: number): Array<{ loteId: string; cantidad: number }> {
  const allocations: Array<{ loteId: string; cantidad: number }> = []
  let pending = quantity
  for (const lot of lots) {
    if (pending === 0) break
    const cantidad = Math.min(lot.cantidad, pending)
    allocations.push({ loteId: lot.id, cantidad })
    pending -= cantidad
  }
  return allocations
}

function sum(lots: EligibleLot[]): number {
  return lots.reduce((total, lot) => total + lot.cantidad, 0)
}

export function assertTransferQuantity(cantidad: number): void {
  if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error('Transfer quantity must be a positive integer')
}

export function allocateAvailability(input: {
  requested: number
  now: Date
  deposito: EligibleLot[]
  acondicionado: EligibleLot[]
}): Availability {
  assertTransferQuantity(input.requested)
  const deposito = orderEligibleLots(input.deposito, input.now)
  const acondicionado = orderEligibleLots(input.acondicionado, input.now)
  const stockDeposito = sum(deposito)
  const stockAcondicionado = sum(acondicionado)
  const allocations = allocate(deposito, Math.min(input.requested, stockDeposito))
  const missing = Math.max(0, input.requested - stockDeposito)
  const transferencias = allocate(acondicionado, Math.min(missing, stockAcondicionado))
  const covered = stockDeposito + stockAcondicionado >= input.requested
  const status: AvailabilityStatus = stockDeposito >= input.requested
    ? 'DISPONIBLE'
    : covered ? 'DISPONIBLE_CON_TRANSFERENCIA' : 'INSUFICIENTE'

  return {
    status,
    stockDeposito,
    stockAcondicionado,
    stockTotal: stockDeposito + stockAcondicionado,
    stockDisponiblePedido: stockDeposito + stockAcondicionado,
    allocations,
    transferencias: status === 'DISPONIBLE_CON_TRANSFERENCIA' ? transferencias : [],
    shortfall: Math.max(0, input.requested - stockDeposito - stockAcondicionado),
  }
}

export function fingerprintAvailability(input: {
  pedidoId: string
  allocations: Array<{ loteId: string; cantidad: number }>
  transferencias: Array<{ loteId: string; cantidad: number }>
}): string {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

export type OrderAvailability = {
  status: AvailabilityStatus
  stockTotal: number
  stockDeposito: number
  stockAcondicionado: number
  stockDisponiblePedido: number
  allocations: Array<{ itemPedidoId: string; productoId: string; loteId: string; cantidad: number }>
  transferencias: Array<{ productoId: string; loteId: string; origen: 'ACONDICIONADO'; destino: 'DEPOSITO'; cantidad: number }>
  shortfall: number
  fingerprint: string
}

export async function getOrderAvailability(
  tx: Prisma.TransactionClient,
  pedido: { id: string; items: Array<{ id: string; productoId: string }> },
): Promise<OrderAvailability> {
  const itemIds = pedido.items.map((item) => item.id)
  const productIds = [...new Set(pedido.items.map((item) => item.productoId))]
  const [balances, reservations] = await Promise.all([
    tx.saldoStock.findMany({
      where: { productoId: { in: productIds } },
      include: { lote: true, ubicacion: true },
    }),
    tx.reservaStock.groupBy({
      by: ['loteId', 'ubicacionId'],
      where: { estado: 'ACTIVA', itemPedidoId: { notIn: itemIds } },
      _sum: { cantidad: true },
    }),
  ])
  const reservedByBalance = new Map(reservations.map((row) => [`${row.loteId}:${row.ubicacionId}`, row._sum.cantidad ?? 0]))
  const items = await tx.itemPedido.findMany({ where: { id: { in: itemIds } }, select: { id: true, productoId: true, cantidad: true } })
  const allocations: OrderAvailability['allocations'] = []
  const transferencias: OrderAvailability['transferencias'] = []
  let stockTotal = 0
  let stockDeposito = 0
  let stockAcondicionado = 0
  let shortfall = 0
  let overall: AvailabilityStatus = 'DISPONIBLE'

  for (const item of items.slice().sort((left, right) => left.id.localeCompare(right.id))) {
    const asEligible = (codigo: StockLocationCode): EligibleLot[] => balances
      .filter((balance) => balance.productoId === item.productoId && balance.ubicacion.codigo === codigo)
      .map((balance) => ({
        id: balance.loteId,
        activo: balance.lote.activo,
        fechaVencimiento: balance.lote.fechaVencimiento,
        fechaProduccion: balance.lote.fechaProduccion,
        createdAt: balance.lote.createdAt,
        cantidad: Math.max(0, balance.cantidad - (reservedByBalance.get(`${balance.loteId}:${balance.ubicacionId}`) ?? 0)),
      }))
    const result = allocateAvailability({ requested: item.cantidad, now: new Date(), deposito: asEligible('DEPOSITO'), acondicionado: asEligible('ACONDICIONADO') })
    stockTotal += result.stockTotal
    stockDeposito += result.stockDeposito
    stockAcondicionado += result.stockAcondicionado
    shortfall += result.shortfall
    if (result.status === 'INSUFICIENTE') overall = 'INSUFICIENTE'
    else if (result.status === 'DISPONIBLE_CON_TRANSFERENCIA' && overall === 'DISPONIBLE') overall = 'DISPONIBLE_CON_TRANSFERENCIA'
    allocations.push(...result.allocations.map((allocation) => ({ ...allocation, itemPedidoId: item.id, productoId: item.productoId })))
    transferencias.push(...result.transferencias.map((transfer) => ({ productoId: item.productoId, loteId: transfer.loteId, origen: 'ACONDICIONADO' as const, destino: 'DEPOSITO' as const, cantidad: transfer.cantidad })))
  }
  const fingerprint = fingerprintAvailability({ pedidoId: pedido.id, allocations: allocations.map(({ loteId, cantidad }) => ({ loteId, cantidad })), transferencias: transferencias.map(({ loteId, cantidad }) => ({ loteId, cantidad })) })
  return { status: overall, stockTotal, stockDeposito, stockAcondicionado, stockDisponiblePedido: stockTotal, allocations, transferencias, shortfall, fingerprint }
}

export async function transferInternal(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string
    productoId: string
    loteId: string
    origen: StockLocationCode
    destino: StockLocationCode
    cantidad: number
    idempotencyKey: string
  },
): Promise<{ movimientoId: string }> {
  assertTransferQuantity(input.cantidad)
  if (input.origen === input.destino) throw new InventoryConflictError('Source and destination locations must differ')

  const locations = await tx.ubicacionStock.findMany({ where: { codigo: { in: [input.origen, input.destino] } } })
  const origin = locations.find((location) => location.codigo === input.origen)
  const destination = locations.find((location) => location.codigo === input.destino)
  if (!origin || !destination) throw new InventoryConflictError('Stock location not found')

  const lockOrder = [origin.id, destination.id].sort()
  for (const ubicacionId of lockOrder) {
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM "ale_bet"."SaldoStock"
      WHERE "productoId" = ${input.productoId} AND "loteId" = ${input.loteId} AND "ubicacionId" = ${ubicacionId}
      FOR UPDATE
    `)
  }

  const source = await tx.saldoStock.findUnique({
    where: { productoId_loteId_ubicacionId: { productoId: input.productoId, loteId: input.loteId, ubicacionId: origin.id } },
  })
  if (!source) throw new InventoryConflictError('Source balance not found')
  const activeReservations = await tx.reservaStock.aggregate({
    where: { loteId: input.loteId, ubicacionId: origin.id, estado: 'ACTIVA' },
    _sum: { cantidad: true },
  })
  const available = source.cantidad - (activeReservations._sum?.cantidad ?? 0)
  if (available < input.cantidad) throw new InventoryConflictError('Insufficient unreserved source stock')

  await tx.saldoStock.update({ where: { id: source.id }, data: { cantidad: { decrement: input.cantidad } } })
  await tx.saldoStock.upsert({
    where: { productoId_loteId_ubicacionId: { productoId: input.productoId, loteId: input.loteId, ubicacionId: destination.id } },
    create: { productoId: input.productoId, loteId: input.loteId, ubicacionId: destination.id, cantidad: input.cantidad },
    update: { cantidad: { increment: input.cantidad } },
  })
  const movement = await tx.movimientoStock.create({
    data: {
      productoId: input.productoId,
      loteId: input.loteId,
      cantidad: input.cantidad,
      tipo: TipoMovimiento.TRANSFERENCIA_INTERNA,
      referencia: `transfer:${input.origen}:${input.destino}`,
      usuarioId: input.actorId,
      origenUbicacionId: origin.id,
      destinoUbicacionId: destination.id,
      idempotencyKey: input.idempotencyKey,
    },
  })
  await evaluateLotLifecycle(tx, { loteId: input.loteId, productoId: input.productoId })
  return { movimientoId: movement.id }
}
