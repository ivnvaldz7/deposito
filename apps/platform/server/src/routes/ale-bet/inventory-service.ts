import crypto from 'node:crypto'
import { Prisma, TipoMovimiento } from '@platform/db'
import { evaluateLotLifecycle } from './product-stock-admin-service'
import { markStockProjectionDirty } from './stock-projection/outbox'

export type StockLocationCode = 'DEPOSITO' | 'ACONDICIONADO'
export type AvailabilityStatus = 'DISPONIBLE' | 'DISPONIBLE_CON_TRANSFERENCIA' | 'INSUFICIENTE'

export type EligibleLot = {
  id: string
  numero?: string
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

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function orderEligibleLots(lots: EligibleLot[], now: Date): EligibleLot[] {
  return lots
    .filter((lot) => lot.activo && lot.cantidad > 0 && (!lot.fechaVencimiento || utcDay(lot.fechaVencimiento) >= utcDay(now)))
    .slice()
    .sort((left, right) => {
      // Operational dispatch follows the lot sequence, not FEFO. Numeric
      // comparison keeps PL0614 before PL0617 (and L9 before L10).
      const lotNumber = (left.numero ?? '').localeCompare(right.numero ?? '', 'es', {
        numeric: true,
        sensitivity: 'base',
      })
      if (lotNumber !== 0) return lotNumber
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
  lotes: Array<{
    itemPedidoId: string
    productoId: string
    loteId: string
    numero: string
    fechaVencimiento: Date | null
    ubicacion: StockLocationCode
    disponible: number
    vencido: boolean
  }>
  transferencias: Array<{ productoId: string; loteId: string; origen: 'ACONDICIONADO'; destino: 'DEPOSITO'; cantidad: number }>
  shortfall: number
  fingerprint: string
}

// Shared by Automation preview and order confirmation. Read balances and active
// reservations once, then apply the same location and lot-sequence rules.
export async function getProductAvailability(
  tx: Prisma.TransactionClient,
  requests: Array<{ productoId: string; cantidad: number }>,
  excludedItemIds: string[] = [],
) {
  const productIds = [...new Set(requests.map((item) => item.productoId))]
  const [balances, reservations] = await Promise.all([
    tx.saldoStock.findMany({ where: { productoId: { in: productIds } }, include: { lote: true, ubicacion: true } }),
    tx.reservaStock.groupBy({
      by: ['loteId', 'ubicacionId'],
      where: {
        estado: 'ACTIVA', lote: { productoId: { in: productIds } },
        ...(excludedItemIds.length ? { OR: [{ itemPedidoId: null }, { itemPedidoId: { notIn: excludedItemIds } }] } : {}),
      },
      _sum: { cantidad: true },
    }),
  ])
  const reserved = new Map(reservations.map((row) => [`${row.loteId}:${row.ubicacionId}`, row._sum.cantidad ?? 0]))
  const now = new Date()
  return new Map(requests.map((item) => {
    const lots = (codigo: StockLocationCode): EligibleLot[] => balances
      .filter((balance) => balance.productoId === item.productoId && balance.ubicacion.codigo === codigo)
      .map((balance) => ({ ...balance.lote, cantidad: Math.max(0, balance.cantidad - (reserved.get(`${balance.loteId}:${balance.ubicacionId}`) ?? 0)) }))
    return [item.productoId, allocateAvailability({ requested: item.cantidad, now, deposito: lots('DEPOSITO'), acondicionado: lots('ACONDICIONADO') })]
  }))
}

export async function getOrderAvailability(
  tx: Prisma.TransactionClient,
  pedido: { id: string; items: Array<{ id: string; productoId: string }> },
  requestedItems?: Array<{ id: string; productoId: string; cantidad: number }>,
): Promise<OrderAvailability> {
  const itemIds = pedido.items.map((item) => item.id)
  const items = requestedItems ?? await tx.itemPedido.findMany({ where: { id: { in: itemIds } }, select: { id: true, productoId: true, cantidad: true } })
  const allocations: OrderAvailability['allocations'] = []
  const transferencias: OrderAvailability['transferencias'] = []
  let stockTotal = 0
  let stockDeposito = 0
  let stockAcondicionado = 0
  let shortfall = 0
  let overall: AvailabilityStatus = 'DISPONIBLE'

  // A pedido can historically contain repeated products. Availability must
  // consume the shared lot pool once per product, never once per repeated line.
  const consolidatedItems = [...items.reduce((grouped, item) => {
    const current = grouped.get(item.productoId)
    if (current) current.cantidad += item.cantidad
    else grouped.set(item.productoId, { ...item })
    return grouped
  }, new Map<string, { id: string; productoId: string; cantidad: number }>()).values()]
    .sort((left, right) => left.productoId.localeCompare(right.productoId))

  const availability = await getProductAvailability(tx, consolidatedItems, itemIds)
  const [balances, reservations] = await Promise.all([
    tx.saldoStock.findMany({ where: { productoId: { in: consolidatedItems.map((item) => item.productoId) } }, include: { lote: true, ubicacion: true } }),
    tx.reservaStock.groupBy({
      by: ['loteId', 'ubicacionId'],
      where: { estado: 'ACTIVA', lote: { productoId: { in: consolidatedItems.map((item) => item.productoId) } }, OR: [{ itemPedidoId: null }, { itemPedidoId: { notIn: itemIds } }] },
      _sum: { cantidad: true },
    }),
  ])
  const reserved = new Map(reservations.map((row) => [`${row.loteId}:${row.ubicacionId}`, row._sum.cantidad ?? 0]))
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const lotes: OrderAvailability['lotes'] = []
  for (const item of consolidatedItems) {
    const result = availability.get(item.productoId)!
    stockTotal += result.stockTotal
    stockDeposito += result.stockDeposito
    stockAcondicionado += result.stockAcondicionado
    shortfall += result.shortfall
    if (result.status === 'INSUFICIENTE') overall = 'INSUFICIENTE'
    else if (result.status === 'DISPONIBLE_CON_TRANSFERENCIA' && overall === 'DISPONIBLE') overall = 'DISPONIBLE_CON_TRANSFERENCIA'
    // Keep an allocation attached to the actual item rows, even for old
    // orders that contain the same product more than once.
    const productItems = items.filter((candidate) => candidate.productoId === item.productoId)
    const remainingByItem = new Map(productItems.map((productItem) => [productItem.id, productItem.cantidad]))
    let allocationIndex = 0
    let availableInAllocation = result.allocations[0]?.cantidad ?? 0
    for (const productItem of productItems) {
      let pending = productItem.cantidad
      while (pending > 0) {
        const allocation = result.allocations[allocationIndex]
        if (!allocation) break
        const cantidad = Math.min(pending, availableInAllocation)
        allocations.push({ itemPedidoId: productItem.id, productoId: item.productoId, loteId: allocation.loteId, cantidad })
        remainingByItem.set(productItem.id, (remainingByItem.get(productItem.id) ?? 0) - cantidad)
        pending -= cantidad
        availableInAllocation -= cantidad
        if (availableInAllocation === 0) {
          allocationIndex += 1
          availableInAllocation = result.allocations[allocationIndex]?.cantidad ?? 0
        }
      }
    }
    transferencias.push(...result.transferencias.map((transfer) => ({ productoId: item.productoId, loteId: transfer.loteId, origen: 'ACONDICIONADO' as const, destino: 'DEPOSITO' as const, cantidad: transfer.cantidad })))
    let transferIndex = 0
    let availableInTransfer = result.transferencias[0]?.cantidad ?? 0
    for (const productItem of productItems) {
      let pending = remainingByItem.get(productItem.id) ?? 0
      while (pending > 0) {
        const transfer = result.transferencias[transferIndex]
        if (!transfer) break
        const cantidad = Math.min(pending, availableInTransfer)
        allocations.push({ itemPedidoId: productItem.id, productoId: item.productoId, loteId: transfer.loteId, cantidad })
        pending -= cantidad
        availableInTransfer -= cantidad
        if (availableInTransfer === 0) {
          transferIndex += 1
          availableInTransfer = result.transferencias[transferIndex]?.cantidad ?? 0
        }
      }
    }
    for (const balance of balances.filter((candidate) => candidate.productoId === item.productoId && (candidate.ubicacion.codigo === 'DEPOSITO' || candidate.ubicacion.codigo === 'ACONDICIONADO'))) {
      const vencido = Boolean(balance.lote.fechaVencimiento && Date.UTC(balance.lote.fechaVencimiento.getUTCFullYear(), balance.lote.fechaVencimiento.getUTCMonth(), balance.lote.fechaVencimiento.getUTCDate()) < today)
      for (const productItem of productItems) {
        lotes.push({
          itemPedidoId: productItem.id,
          productoId: item.productoId,
          loteId: balance.loteId,
          numero: balance.lote.numero,
          fechaVencimiento: balance.lote.fechaVencimiento,
          ubicacion: balance.ubicacion.codigo as StockLocationCode,
          disponible: Math.max(0, balance.cantidad - (reserved.get(`${balance.loteId}:${balance.ubicacionId}`) ?? 0)),
          vencido,
        })
      }
    }
  }
  const fingerprint = fingerprintAvailability({ pedidoId: pedido.id, allocations: allocations.map(({ loteId, cantidad }) => ({ loteId, cantidad })), transferencias: transferencias.map(({ loteId, cantidad }) => ({ loteId, cantidad })) })
  return { status: overall, stockTotal, stockDeposito, stockAcondicionado, stockDisponiblePedido: stockTotal, allocations, lotes, transferencias, shortfall, fingerprint }
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
    skipOutbox?: boolean
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
  if (!input.skipOutbox) {
    await markStockProjectionDirty(tx, {
      productId: input.productoId,
      causeType: 'TRANSFER',
      causeId: input.idempotencyKey,
    })
  }
  return { movimientoId: movement.id }
}
