import crypto from 'node:crypto'
import { Prisma, platformDb as prisma } from '@platform/db'
import { descomponerUnidades } from '../constants'
import { getProductAvailability } from '../inventory-service'
import { consumeActiveReservations, reserveFefo, StockConflictError } from '../reservas-service'
import type { MatchProduct, MatchCustomer, ParsedOrder, ParsedOrderLine } from './contracts'
import { hasStrongMismatch, interpretOrder, normalizeForMatch, presentationMismatch } from './interpreter'

export class AutomationConflictError extends Error {}
export class AutomationNotFoundError extends Error {}

type DraftLineEdit = {
  lineId: string
  productId?: string
  cajas?: number
  unidades?: number
  mode?: 'BOXES' | 'UNITS' | 'MIXED'
  rememberAlias?: boolean
}
// Kept only for an internal, untracked diagnostic caller. HTTP accepts the
// semantic `line` edit exclusively, so a client can never submit a destructive
// replacement snapshot.
type LegacyDraftLineInput = { productId: string; cajas?: number; unidades?: number; mode?: 'BOXES' | 'UNITS' | 'MIXED'; rememberAlias?: boolean }
type DraftEditInput = { clienteId?: string; rememberClientAlias?: boolean; line?: DraftLineEdit; lines?: LegacyDraftLineInput[] }

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

export async function interpretAndPersistDraft(originalText: string, actorId: string, inspectCatalog?: (products: MatchProduct[]) => void) {
  const [products, customers, productAliases, clientAliases] = await Promise.all([
    prisma.producto.findMany({ where: { activo: true }, select: { id: true, nombre: true, sku: true, unidadesPorCaja: true } }),
    prisma.cliente.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
    prisma.productAlias.findMany(),
    prisma.clientAlias.findMany()
  ])
  const mappedProducts: MatchProduct[] = products.map((p) => ({
    ...p,
    aliases: productAliases.flatMap((alias) => {
      if (alias.productId !== p.id) return []
      if (hasStrongMismatch(alias.alias, p.nombre)) {
        console.warn(`[automation] Ignorando ProductAlias inconsistente ${alias.id} para producto ${p.id}`)
        return []
      }
      return [alias.alias]
    })
  }))
  const mappedCustomers: MatchCustomer[] = customers.map((c) => ({
    ...c,
    aliases: clientAliases.filter((a) => a.clientId === c.id).map((a) => a.alias)
  }))
  const proposal = interpretOrder(originalText, mappedProducts, mappedCustomers)
  inspectCatalog?.(mappedProducts)
  return prisma.orderInterpretationDraft.create({
    data: { originalText, proposedSnapshot: json(proposal), estado: proposal.requiresReview ? 'DRAFT' : 'READY', createdBy: actorId },
  })
}

function effectiveSnapshot(draft: { proposedSnapshot: Prisma.JsonValue; editedSnapshot: Prisma.JsonValue | null }): ParsedOrder {
  const snapshot = parsed(draft.editedSnapshot ?? draft.proposedSnapshot)
  return {
    ...snapshot,
    lines: snapshot.lines.map((line, index) => ({
      ...line,
      // Existing drafts predate lineId. The original text plus its source
      // position remains stable because partial edits never remove/reorder lines.
      lineId: line.lineId ?? `line-${crypto.createHash('sha256').update(`${index}\u0000${line.originalText}`).digest('hex').slice(0, 16)}`,
    })),
  }
}

function refreshReviewState(snapshot: ParsedOrder): ParsedOrder {
  return {
    ...snapshot,
    requiresReview: snapshot.warnings.length > 0 || snapshot.lines.some((line) => line.requiresReview || line.warnings.length > 0 || !line.productCandidate),
  }
}

export async function applyDraftEdit(id: string, expectedVersion: number, input: DraftEditInput) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "ale_bet"."OrderInterpretationDraft" WHERE id = ${id} FOR UPDATE`)
    const draft = await tx.orderInterpretationDraft.findUnique({ where: { id } })
    if (!draft) throw new AutomationNotFoundError('Borrador de interpretación no encontrado')
    if (draft.estado === 'CONFIRMED' || draft.estado === 'CANCELLED') throw new AutomationConflictError('El borrador ya no puede editarse')
    if (draft.version !== expectedVersion) throw new AutomationConflictError('La versión del borrador cambió; actualizá antes de reintentar')
    const source = effectiveSnapshot(draft)
    let edited = parsed(json(source) as Prisma.JsonValue)

    if (input.clienteId) {
      const customer = await tx.cliente.findFirst({ where: { id: input.clienteId, activo: true } })
      if (!customer) throw new AutomationConflictError('El cliente no existe o está inactivo')
      if (input.rememberClientAlias && source.customerCandidateText) {
        const aliasNormalized = normalizeForMatch(source.customerCandidateText)
        const existing = await tx.clientAlias.findUnique({ where: { aliasNormalized } })
        if (!existing) {
          await tx.clientAlias.create({ data: { alias: source.customerCandidateText, aliasNormalized, clientId: input.clienteId } })
        } else if (existing.clientId !== input.clienteId) {
          throw new AutomationConflictError(`El alias "${source.customerCandidateText}" ya pertenece a otro cliente.`)
        }
      }
      edited = {
        ...edited,
        customerCandidate: { customerId: customer.id, nombre: customer.nombre, confidence: 1 },
        customerAlternatives: [],
        customerConfidence: 1,
        warnings: edited.warnings.filter((warning) => warning !== 'CUSTOMER_UNRESOLVED'),
      }
    }

    if (input.line) {
      const lineIndex = edited.lines.findIndex((line) => line.lineId === input.line?.lineId)
      if (lineIndex < 0) throw new AutomationConflictError('La línea a editar ya no existe; actualizá antes de reintentar')
      const currentLine = edited.lines[lineIndex]!
      const productId = input.line.productId ?? currentLine.productCandidate?.productId
      if (!productId) throw new AutomationConflictError('Seleccioná un producto para esta línea')
      const product = await tx.producto.findFirst({ where: { id: productId, activo: true } })
      if (!product) throw new AutomationConflictError('El producto no existe o está inactivo')
      const cajas = assertQuantity(input.line.cajas ?? currentLine.quantity.explicitBoxes ?? 0, 'cajas')
      const unidades = assertQuantity(input.line.unidades ?? currentLine.quantity.explicitUnits ?? 0, 'unidades')
      const totalUnits = cajas * product.unidadesPorCaja + unidades
      if (totalUnits <= 0) throw new AutomationConflictError('Cada línea debe solicitar al menos una unidad')
      const normalized = descomponerUnidades(totalUnits, product.unidadesPorCaja)
      const mode = input.line.mode ?? currentLine.quantity.mode ?? (cajas > 0 && unidades > 0 ? 'MIXED' : cajas > 0 ? 'BOXES' : 'UNITS')
      const { extractQuantityAndProduct } = await import('./interpreter')
      const parsedLine = extractQuantityAndProduct(currentLine.originalText)
      if (input.line.rememberAlias && parsedLine.productText) {
        const conflictingPresentation = presentationMismatch(parsedLine.productText, product.nombre)
        if (conflictingPresentation) {
          throw new AutomationConflictError(`La presentación ${conflictingPresentation} no coincide con el producto seleccionado: ${product.nombre}.`)
        }
        if (hasStrongMismatch(parsedLine.productText, product.nombre)) {
          throw new AutomationConflictError(`Los identificadores del alias no coinciden con el producto seleccionado: ${product.nombre}.`)
        }
        const aliasNormalized = normalizeForMatch(parsedLine.productText)
        const existing = await tx.productAlias.findUnique({ where: { aliasNormalized } })
        if (!existing) {
          await tx.productAlias.create({ data: { alias: parsedLine.productText, aliasNormalized, productId: product.id } })
        } else if (existing.productId !== product.id) {
          throw new AutomationConflictError(`El alias "${parsedLine.productText}" ya pertenece a otro producto.`)
        }
      }
      const lines: ParsedOrderLine[] = [...edited.lines]
      lines[lineIndex] = {
        ...currentLine,
        productCandidate: { productId: product.id, nombre: product.nombre, confidence: 1 },
        alternatives: [],
        confidence: 1,
        requiresReview: false,
        warnings: [],
        quantity: {
          originalExpression: currentLine.quantity.originalExpression,
          mode,
          explicitBoxes: cajas || null,
          explicitUnits: unidades || null,
          totalUnits,
          normalizedBoxes: normalized.cajas,
          normalizedLooseUnits: normalized.sueltos,
        },
      }
      edited = { ...edited, lines }
    }

    const finalized = refreshReviewState(edited)
    return tx.orderInterpretationDraft.update({ where: { id }, data: { editedSnapshot: json(finalized), estado: finalized.requiresReview ? 'DRAFT' : 'READY', version: { increment: 1 } } })
  })
}

export async function getDraftAvailability(snapshot: ParsedOrder) {
  const products = snapshot.lines.flatMap((line) => line.productCandidate && line.quantity.totalUnits ? [{ productId: line.productCandidate.productId, requested: line.quantity.totalUnits }] : [])
  const requested = new Map<string, number>()
  for (const line of products) requested.set(line.productId, (requested.get(line.productId) ?? 0) + line.requested)
  const ids = [...requested.keys()]
  if (ids.length === 0) return []
  const availability = await getProductAvailability(prisma, ids.map((productoId) => ({ productoId, cantidad: requested.get(productoId)! })))
  return ids.sort().map((productId) => {
    const result = availability.get(productId)!
    return { productId, requestedUnits: requested.get(productId), availableUnits: result.stockDisponiblePedido, status: result.status }
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
  const pedido = await tx.pedido.create({ data: { numero: orderNumber(), clienteId: customer.id, origen: 'AUTOMATION', estado: 'BORRADOR', items: { create: items.map((item) => ({ producto: { connect: { id: item.productId } }, cantidad: item.cantidad })) } }, include: { cliente: true, items: { include: { producto: true } } } })
  await audit(tx, pedido.id, input.actorId, 'BORRADOR_CREADO_AUTOMATION', { draftId: draft.id, items })
  const { getOrderAvailability, transferInternal } = await import('../inventory-service')
  const availability = await getOrderAvailability(tx, pedido)
  if (availability.status === 'INSUFICIENTE') throw new StockConflictError('Stock insuficiente para aprobar el pedido')
  for (const transfer of availability.transferencias) await transferInternal(tx, { ...transfer, actorId: input.actorId, idempotencyKey: `automation:${draft.id}:${transfer.loteId}`, skipOutbox: true })
  await reserveFefo(tx, pedido.id, pedido.items)
  // Reuse the established FEFO reservation path for locks/allocation, then
  // consume it before commit. Automation therefore has no active reservation
  // or deferred Armador stock operation after confirmation.
  await consumeActiveReservations(tx, pedido.id, input.actorId, { skipOutbox: true })
  const approved = await tx.pedido.update({ where: { id: pedido.id }, data: { estado: 'APROBADO', aprobadoAt: new Date(), version: { increment: 1 } }, include: { cliente: true, items: { include: { producto: true } } } })
  await audit(tx, approved.id, input.actorId, 'PEDIDO_APROBADO_AUTOMATION', { draftId: draft.id, estado: approved.estado })
  await tx.orderInterpretationDraft.update({ where: { id: draft.id }, data: { estado: 'CONFIRMED', confirmedBy: input.actorId, pedidoId: approved.id, version: { increment: 1 } } })
  await tx.stockProjectionOutbox.createMany({ data: items.map((item) => ({ productId: item.productId, causeType: 'PEDIDO_APROBADO', causeId: approved.id, estado: 'PENDING' })), skipDuplicates: true })
  return { draftId: draft.id, pedido: approved, syncStatus: 'PENDING' as const }
}
