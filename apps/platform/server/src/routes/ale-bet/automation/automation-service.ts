import crypto from 'node:crypto'
import { Prisma, platformDb as prisma } from '@platform/db'
import { descomponerUnidades } from '../constants'
import { allocateAvailability, orderEligibleLots } from '../inventory-service'
import { reserveFefo, StockConflictError } from '../reservas-service'
import type { ParsedOrder, ParsedOrderLine } from './contracts'
import { interpretOrder } from './interpreter'

export class AutomationConflictError extends Error {}
export class AutomationNotFoundError extends Error {}

type DraftLineInput = { productId: string; cajas?: number; unidades?: number; mode?: 'BOXES' | 'UNITS' | 'MIXED' }
type DraftEditInput = { clienteId: string; lines: DraftLineInput[] }

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue }
function parsed(value: Prisma.JsonValue): ParsedOrder { return JSON.parse(JSON.stringify(value)) as ParsedOrder }
function orderNumber(): string { return `P-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}` }

async function audit(tx: Prisma.TransactionClient, pedidoId: string, actorId: string, accion: string, nuevo: unknown): Promise<void> {
  await tx.pedidoAuditoria.create({ data: { pedidoId, actorId, accion, nuevo: json(nuevo) } })
}

function assertQuantity(value: number | undefined, field: string): number {
  const normalized = value ?? 0
  if (!Number.isInteger(normalized) || normalized < 0) throw new AutomationConflictError(`${field} debe ser un entero no negativo`)
  return normalized
}

export async function interpretAndPersistDraft(originalText: string, actorId: string) {
  const [products, customers] = await Promise.all([
    prisma.producto.findMany({ where: { activo: true }, select: { id: true, nombre: true, sku: true, unidadesPorCaja: true } }),
    prisma.cliente.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
  ])
  const proposal = interpretOrder(originalText, products, customers)
  return prisma.orderInterpretationDraft.create({
    data: { originalText, proposedSnapshot: json(proposal), estado: proposal.requiresReview ? 'DRAFT' : 'READY', createdBy: actorId },
  })
}

function effectiveSnapshot(draft: { proposedSnapshot: Prisma.JsonValue; editedSnapshot: Prisma.JsonValue | null }): ParsedOrder {
  return parsed(draft.editedSnapshot ?? draft.proposedSnapshot)
}

export async function applyDraftEdit(id: string, expectedVersion: number, input: DraftEditInput) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "ale_bet"."OrderInterpretationDraft" WHERE id = ${id} FOR UPDATE`)
    const draft = await tx.orderInterpretationDraft.findUnique({ where: { id } })
    if (!draft) throw new AutomationNotFoundError('Borrador de interpretación no encontrado')
    if (draft.estado === 'CONFIRMED' || draft.estado === 'CANCELLED') throw new AutomationConflictError('El borrador ya no puede editarse')
    if (draft.version !== expectedVersion) throw new AutomationConflictError('La versión del borrador cambió; actualizá antes de reintentar')
    const [customer, products] = await Promise.all([
      tx.cliente.findFirst({ where: { id: input.clienteId, activo: true } }),
      tx.producto.findMany({ where: { id: { in: input.lines.map((line) => line.productId) }, activo: true } }),
    ])
    if (!customer) throw new AutomationConflictError('El cliente no existe o está inactivo')
    if (products.length !== new Set(input.lines.map((line) => line.productId)).size) throw new AutomationConflictError('Uno o más productos no existen o están inactivos')
    const source = effectiveSnapshot(draft)
    const lines: ParsedOrderLine[] = input.lines.map((line, index) => {
      const product = products.find((entry) => entry.id === line.productId)
      if (!product) throw new AutomationConflictError('Producto inválido')
      const cajas = assertQuantity(line.cajas, 'cajas')
      const unidades = assertQuantity(line.unidades, 'unidades')
      const totalUnits = cajas * product.unidadesPorCaja + unidades
      if (totalUnits <= 0) throw new AutomationConflictError('Cada línea debe solicitar al menos una unidad')
      const normalized = descomponerUnidades(totalUnits, product.unidadesPorCaja)
      const mode = line.mode ?? (cajas > 0 && unidades > 0 ? 'MIXED' : cajas > 0 ? 'BOXES' : 'UNITS')
      return {
        originalText: source.lines[index]?.originalText ?? `${product.nombre}: ${totalUnits}`,
        productCandidate: { productId: product.id, nombre: product.nombre, confidence: 1 },
        alternatives: [], confidence: 1, requiresReview: false, warnings: [],
        quantity: { originalExpression: `${cajas} cajas + ${unidades} unidades`, mode, explicitBoxes: cajas || null, explicitUnits: unidades || null, totalUnits, normalizedBoxes: normalized.cajas, normalizedLooseUnits: normalized.sueltos },
      }
    })
    const edited: ParsedOrder = { originalText: draft.originalText, customerCandidate: { customerId: customer.id, nombre: customer.nombre, confidence: 1 }, customerAlternatives: [], customerConfidence: 1, lines, requiresReview: false, warnings: [] }
    return tx.orderInterpretationDraft.update({ where: { id }, data: { editedSnapshot: json(edited), estado: 'READY', version: { increment: 1 } } })
  })
}

export async function getDraftAvailability(snapshot: ParsedOrder) {
  const products = snapshot.lines.flatMap((line) => line.productCandidate && line.quantity.totalUnits ? [{ productId: line.productCandidate.productId, requested: line.quantity.totalUnits }] : [])
  const requested = new Map<string, number>()
  for (const line of products) requested.set(line.productId, (requested.get(line.productId) ?? 0) + line.requested)
  const ids = [...requested.keys()]
  if (ids.length === 0) return []
  const [balances, reservations] = await Promise.all([
    prisma.saldoStock.findMany({ where: { productoId: { in: ids }, ubicacion: { codigo: 'DEPOSITO' } }, include: { lote: true } }),
    prisma.reservaStock.groupBy({ by: ['loteId', 'ubicacionId'], where: { estado: 'ACTIVA', loteId: { in: (await prisma.lote.findMany({ where: { productoId: { in: ids } }, select: { id: true } })).map((lot) => lot.id) } }, _sum: { cantidad: true } }),
  ])
  const reserved = new Map(reservations.map((row) => [`${row.loteId}:${row.ubicacionId}`, row._sum.cantidad ?? 0]))
  return ids.sort().map((productId) => {
    const lots = balances.filter((balance) => balance.productoId === productId).map((balance) => ({ id: balance.loteId, activo: balance.lote.activo, fechaVencimiento: balance.lote.fechaVencimiento, fechaProduccion: balance.lote.fechaProduccion, createdAt: balance.lote.createdAt, cantidad: Math.max(0, balance.cantidad - (reserved.get(`${balance.loteId}:${balance.ubicacionId}`) ?? 0)) }))
    const result = allocateAvailability({ requested: requested.get(productId) ?? 1, now: new Date(), deposito: orderEligibleLots(lots, new Date()), acondicionado: [] })
    return { productId, requestedUnits: requested.get(productId), availableUnits: result.stockDeposito, status: result.status }
  })
}

export async function getDraft(id: string) {
  const draft = await prisma.orderInterpretationDraft.findUnique({ where: { id } })
  if (!draft) throw new AutomationNotFoundError('Borrador de interpretación no encontrado')
  return { draft, effectiveSnapshot: effectiveSnapshot(draft), availability: await getDraftAvailability(effectiveSnapshot(draft)) }
}

function consolidate(snapshot: ParsedOrder): Array<{ productId: string; cantidad: number }> {
  const result = new Map<string, number>()
  for (const line of snapshot.lines) {
    if (!line.productCandidate || !line.quantity.totalUnits || line.requiresReview) throw new AutomationConflictError('El borrador contiene líneas sin resolver')
    result.set(line.productCandidate.productId, (result.get(line.productCandidate.productId) ?? 0) + line.quantity.totalUnits)
  }
  return [...result.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([productId, cantidad]) => ({ productId, cantidad }))
}

export async function confirmDraftInTransaction(tx: Prisma.TransactionClient, input: { draftId: string; expectedVersion: number; actorId: string }) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "ale_bet"."OrderInterpretationDraft" WHERE id = ${input.draftId} FOR UPDATE`)
  const draft = await tx.orderInterpretationDraft.findUnique({ where: { id: input.draftId } })
  if (!draft) throw new AutomationNotFoundError('Borrador de interpretación no encontrado')
  if (draft.estado !== 'READY') throw new AutomationConflictError('El borrador debe estar READY antes de confirmar')
  if (draft.version !== input.expectedVersion) throw new AutomationConflictError('La versión del borrador cambió; actualizá antes de confirmar')
  const snapshot = effectiveSnapshot(draft)
  if (!snapshot.customerCandidate || snapshot.requiresReview) throw new AutomationConflictError('Cliente o líneas pendientes de revisión')
  const items = consolidate(snapshot)
  const [customer, products] = await Promise.all([
    tx.cliente.findFirst({ where: { id: snapshot.customerCandidate.customerId, activo: true, estado: 'VALIDADO' } }),
    tx.producto.findMany({ where: { id: { in: items.map((item) => item.productId) }, activo: true } }),
  ])
  if (!customer) throw new AutomationConflictError('El cliente no existe, está inactivo o pendiente de validación')
  if (products.length !== items.length) throw new AutomationConflictError('Uno o más productos no existen o están inactivos')
  const pedido = await tx.pedido.create({ data: { numero: orderNumber(), clienteId: customer.id, vendedorId: input.actorId, estado: 'BORRADOR', items: { create: items.map((item) => ({ producto: { connect: { id: item.productId } }, cantidad: item.cantidad })) } }, include: { cliente: true, items: { include: { producto: true } } } })
  await audit(tx, pedido.id, input.actorId, 'BORRADOR_CREADO_AUTOMATION', { draftId: draft.id, items })
  const { getOrderAvailability, transferInternal } = await import('../inventory-service')
  const availability = await getOrderAvailability(tx, pedido)
  if (availability.status === 'INSUFICIENTE') throw new StockConflictError('Stock insuficiente para aprobar el pedido')
  for (const transfer of availability.transferencias) await transferInternal(tx, { ...transfer, actorId: input.actorId, idempotencyKey: `automation:${draft.id}:${transfer.loteId}` })
  await reserveFefo(tx, pedido.id, pedido.items)
  const approved = await tx.pedido.update({ where: { id: pedido.id }, data: { estado: 'APROBADO', aprobadoAt: new Date(), version: { increment: 1 } }, include: { cliente: true, items: { include: { producto: true } } } })
  await audit(tx, approved.id, input.actorId, 'PEDIDO_APROBADO_AUTOMATION', { draftId: draft.id, estado: approved.estado })
  await tx.orderInterpretationDraft.update({ where: { id: draft.id }, data: { estado: 'CONFIRMED', confirmedBy: input.actorId, pedidoId: approved.id, version: { increment: 1 } } })
  await tx.stockProjectionOutbox.createMany({ data: items.map((item) => ({ productId: item.productId, causeType: 'PEDIDO_APROBADO', causeId: approved.id, estado: 'PENDING' })), skipDuplicates: true })
  return { draftId: draft.id, pedido: approved, syncStatus: 'PENDING' as const }
}
