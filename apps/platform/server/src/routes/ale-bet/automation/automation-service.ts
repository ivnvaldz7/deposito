import crypto from 'node:crypto'
import { Prisma, TipoReglaTransferenciaProducto, platformDb as prisma } from '@platform/db'
import { descomponerUnidades } from '../constants'
import { getProductAvailability } from '../inventory-service'
import { consumeActiveReservations, reserveFefo, StockConflictError } from '../reservas-service'
import type { InterpretationLineState, MatchProduct, MatchCustomer, ParsedOrder, ParsedOrderLine } from './contracts'
import { hasStrongMismatch, interpretOrder, normalizeForMatch, presentationMismatch } from './interpreter'

export class AutomationConflictError extends Error {}
export class AutomationNotFoundError extends Error {}

type DraftLineEdit = {
  lineId: string
  action?: 'DISCARD' | 'RESTORE'
  productId?: string
  presentationProductId?: string
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

export type PresentationOption = {
  sourceProductId: string
  targetProductId: string
  label: string
  targetProductName: string
}

const PRESENTATION_REQUIRED = 'PRESENTATION_REQUIRED'

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
  const [products, customers, productAliases, clientAliases, presentationRules] = await Promise.all([
    prisma.producto.findMany({ where: { activo: true }, select: { id: true, nombre: true, sku: true, unidadesPorCaja: true } }),
    prisma.cliente.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
    prisma.productAlias.findMany(),
    prisma.clientAlias.findMany(),
    prisma.productoTransferRule.findMany({
      where: { activo: true, tipo: TipoReglaTransferenciaProducto.PRESENTATION, targetProduct: { activo: true } },
      select: { sourceProductId: true },
    }),
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
  const proposal = requirePresentationSelection(
    interpretOrder(originalText, mappedProducts, mappedCustomers),
    new Set(presentationRules.map((rule) => rule.sourceProductId)),
  )
  inspectCatalog?.(mappedProducts)
  return prisma.orderInterpretationDraft.create({
    data: { originalText, proposedSnapshot: json(proposal), estado: proposal.requiresReview || !hasIncludedValidLine(proposal) ? 'DRAFT' : 'READY', createdBy: actorId },
  })
}

function effectiveSnapshot(draft: { proposedSnapshot: Prisma.JsonValue; editedSnapshot: Prisma.JsonValue | null }): ParsedOrder {
  const snapshot = parsed(draft.editedSnapshot ?? draft.proposedSnapshot)
  return {
    ...snapshot,
    lines: snapshot.lines.map((line, index) => {
      const normalized = {
        ...line,
        // Existing drafts predate lineId. The original text plus its source
        // position remains stable because partial edits never remove/reorder lines.
        lineId: line.lineId ?? `line-${crypto.createHash('sha256').update(`${index}\u0000${line.originalText}`).digest('hex').slice(0, 16)}`,
      }
      return { ...normalized, lineState: lineState(normalized) }
    }),
  }
}

function lineState(line: ParsedOrderLine): InterpretationLineState {
  if (line.lineState === 'DISCARDED') return 'DISCARDED'
  return line.requiresReview || line.warnings.length > 0 || !line.productCandidate || !line.quantity.totalUnits
    ? 'NEEDS_REVIEW'
    : 'VALID'
}

function includedLines(snapshot: ParsedOrder): ParsedOrderLine[] {
  return snapshot.lines.filter((line) => lineState(line) !== 'DISCARDED')
}

function hasIncludedValidLine(snapshot: ParsedOrder): boolean {
  return includedLines(snapshot).some((line) => lineState(line) === 'VALID')
}

// Older snapshots (and some imported parser responses) may have copied a
// per-line warning to the order-level warning list.  The source snapshot is
// kept intact for audit/debugging, but those historical copies cannot decide
// whether an active line still needs review: a discarded line is no longer a
// candidate for the order.
const HISTORICAL_LINE_WARNING_CODES = new Set(['PRODUCT_UNRESOLVED', 'QUANTITY_AMBIGUOUS'])

function refreshReviewState(snapshot: ParsedOrder): ParsedOrder {
  return {
    ...snapshot,
    requiresReview:
      snapshot.warnings.some((warning) => !HISTORICAL_LINE_WARNING_CODES.has(warning)) ||
      includedLines(snapshot).some((line) => lineState(line) === 'NEEDS_REVIEW'),
  }
}

function requirePresentationSelection(snapshot: ParsedOrder, sourceProductIds: ReadonlySet<string>): ParsedOrder {
  let requiresReview = snapshot.requiresReview
  const lines = snapshot.lines.map((line) => {
    if (
      line.lineState === 'DISCARDED' ||
      !line.productCandidate ||
      !sourceProductIds.has(line.productCandidate.productId) ||
      line.warnings.includes(PRESENTATION_REQUIRED)
    ) return line

    requiresReview = true
    return {
      ...line,
      requiresReview: true,
      lineState: 'NEEDS_REVIEW' as const,
      warnings: [...line.warnings, PRESENTATION_REQUIRED],
    }
  })
  return { ...snapshot, lines, requiresReview }
}

async function presentationOptionsForSnapshot(
  tx: Prisma.TransactionClient | typeof prisma,
  snapshot: ParsedOrder,
): Promise<PresentationOption[]> {
  const sourceProductIds = [...new Set(snapshot.lines.flatMap((line) => line.productCandidate ? [line.productCandidate.productId] : []))]
  if (sourceProductIds.length === 0) return []

  const rules = await tx.productoTransferRule.findMany({
    where: {
      sourceProductId: { in: sourceProductIds },
      // Una preparación puede conservar el mismo producto ("Normal") o
      // derivarlo a una presentación. Ambas son destinos elegibles cuando
      // el producto tiene una presentación especial configurada.
      tipo: { in: [TipoReglaTransferenciaProducto.SAME_PRODUCT, TipoReglaTransferenciaProducto.PRESENTATION] },
      activo: true,
      targetProduct: { activo: true },
    },
    select: {
      sourceProductId: true,
      targetProductId: true,
      label: true,
      targetProduct: { select: { nombre: true } },
    },
    orderBy: [{ sourceProductId: 'asc' }, { orden: 'asc' }, { label: 'asc' }],
  })
  return rules.map((rule) => ({
    sourceProductId: rule.sourceProductId,
    targetProductId: rule.targetProductId,
    label: rule.label,
    targetProductName: rule.targetProduct.nombre,
  }))
}

async function withPresentationRequirements(
  tx: Prisma.TransactionClient | typeof prisma,
  snapshot: ParsedOrder,
): Promise<{ snapshot: ParsedOrder; presentationOptions: PresentationOption[] }> {
  const presentationOptions = await presentationOptionsForSnapshot(tx, snapshot)
  return {
    snapshot: requirePresentationSelection(snapshot, new Set(presentationOptions.map((option) => option.sourceProductId))),
    presentationOptions,
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
      const lines: ParsedOrderLine[] = [...edited.lines]
      if (input.line.action === 'DISCARD' || input.line.action === 'RESTORE') {
        lines[lineIndex] = input.line.action === 'DISCARD'
          ? {
              ...currentLine,
              lineState: 'DISCARDED',
              discardedWarnings: currentLine.discardedWarnings ?? currentLine.warnings,
              discardedRequiresReview: currentLine.discardedRequiresReview ?? currentLine.requiresReview,
              warnings: [],
              requiresReview: false,
            }
          : {
              ...currentLine,
              lineState: lineState({
                ...currentLine,
                lineState: undefined,
                warnings: currentLine.discardedWarnings ?? currentLine.warnings,
                requiresReview: currentLine.discardedRequiresReview ?? currentLine.requiresReview,
              }),
              warnings: currentLine.discardedWarnings ?? currentLine.warnings,
              requiresReview: currentLine.discardedRequiresReview ?? currentLine.requiresReview,
              discardedWarnings: undefined,
              discardedRequiresReview: undefined,
            }
        edited = { ...edited, lines }
      } else {
      const sourceProductId = currentLine.productCandidate?.productId
      const presentationOptions = sourceProductId
        ? await presentationOptionsForSnapshot(tx, { ...source, lines: [currentLine] })
        : []
      if (presentationOptions.length > 0 && !input.line.presentationProductId) {
        throw new AutomationConflictError('Elegí una presentación antes de continuar con este producto')
      }
      if (input.line.presentationProductId && !presentationOptions.some((option) => option.targetProductId === input.line!.presentationProductId)) {
        throw new AutomationConflictError('La presentación elegida no está configurada para este producto')
      }
      const selectingPresentation = Boolean(input.line.presentationProductId)
      const productId = input.line.presentationProductId ?? input.line.productId ?? currentLine.productCandidate?.productId
      if (!productId) throw new AutomationConflictError('Seleccioná un producto para esta línea')
      const product = await tx.producto.findFirst({ where: { id: productId, activo: true } })
      if (!product) throw new AutomationConflictError('El producto no existe o está inactivo')
      // A presentation changes the SKU, never the number requested by the customer.
      // Rebuild its box/loose representation using the destination's box size.
      const cajas = assertQuantity(selectingPresentation ? 0 : input.line.cajas ?? currentLine.quantity.explicitBoxes ?? 0, 'cajas')
      const unidades = assertQuantity(selectingPresentation ? currentLine.quantity.totalUnits ?? 0 : input.line.unidades ?? currentLine.quantity.explicitUnits ?? 0, 'unidades')
      const totalUnits = cajas * product.unidadesPorCaja + unidades
      if (totalUnits <= 0) throw new AutomationConflictError('Cada línea debe solicitar al menos una unidad')
      const normalized = descomponerUnidades(totalUnits, product.unidadesPorCaja)
      const mode = selectingPresentation ? 'UNITS' : input.line.mode ?? currentLine.quantity.mode ?? (cajas > 0 && unidades > 0 ? 'MIXED' : cajas > 0 ? 'BOXES' : 'UNITS')
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
      lines[lineIndex] = {
        ...currentLine,
        productCandidate: { productId: product.id, nombre: product.nombre, confidence: 1 },
        alternatives: [],
        confidence: 1,
        requiresReview: false,
        warnings: [],
        lineState: 'VALID',
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
    }

    const finalized = refreshReviewState(edited)
    return tx.orderInterpretationDraft.update({ where: { id }, data: { editedSnapshot: json(finalized), estado: finalized.requiresReview || !hasIncludedValidLine(finalized) ? 'DRAFT' : 'READY', version: { increment: 1 } } })
  })
}

export async function getDraftAvailability(snapshot: ParsedOrder) {
  const products = includedLines(snapshot).flatMap((line) => lineState(line) === 'VALID' && line.productCandidate && line.quantity.totalUnits ? [{ productId: line.productCandidate.productId, requested: line.quantity.totalUnits }] : [])
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
  const presentation = await withPresentationRequirements(prisma, effectiveSnapshot(draft))
  return {
    draft,
    effectiveSnapshot: presentation.snapshot,
    presentationOptions: presentation.presentationOptions,
    availability: await getDraftAvailability(presentation.snapshot),
  }
}

function consolidate(snapshot: ParsedOrder): Array<{ productId: string; cantidad: number }> {
  const result = new Map<string, number>()
  for (const line of includedLines(snapshot)) {
    if (lineState(line) !== 'VALID' || !line.productCandidate || !line.quantity.totalUnits) throw new AutomationConflictError('El borrador contiene líneas sin resolver')
    result.set(line.productCandidate.productId, (result.get(line.productCandidate.productId) ?? 0) + line.quantity.totalUnits)
  }
  if (result.size === 0) throw new AutomationConflictError('El pedido debe incluir al menos un producto válido')
  return [...result.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([productId, cantidad]) => ({ productId, cantidad }))
}

export async function confirmDraftInTransaction(tx: Prisma.TransactionClient, input: { draftId: string; expectedVersion: number; actorId: string }) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "ale_bet"."OrderInterpretationDraft" WHERE id = ${input.draftId} FOR UPDATE`)
  const draft = await tx.orderInterpretationDraft.findUnique({ where: { id: input.draftId } })
  if (!draft) throw new AutomationNotFoundError('Borrador de interpretación no encontrado')
  if (draft.estado !== 'READY') throw new AutomationConflictError('El borrador debe estar READY antes de confirmar')
  if (draft.version !== input.expectedVersion) throw new AutomationConflictError('La versión del borrador cambió; actualizá antes de confirmar')
  const presentation = await withPresentationRequirements(tx, effectiveSnapshot(draft))
  const snapshot = presentation.snapshot
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
