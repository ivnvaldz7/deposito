import { Router } from 'express'
import PDFDocument from 'pdfkit'
import { z } from 'zod'
import { Prisma, platformDb as prisma } from '@platform/db'
import { getAppAccess, type JwtPayload } from '@platform/core'
import { requirePermission } from '../../middlewares/require-permission'
import { acquireIdempotencyRecord, calculateFingerprint, completeIdempotencyRecord, getSingleIdempotencyKey, toPersistableResponseBody } from '../../utils/idempotency'
import { canEmitRemito, canReadRemitoPdf } from './order-workflow'
import { renderRemitoPdf } from './remito-pdf'
import { RemitoConfigurationConflict, takeNextRemitoNumber } from './remito-config-service'
import { getOrderAvailability, transferInternal } from './inventory-service'
import { consumeActiveReservations, reserveSelectedLots, StockConflictError } from './reservas-service'
import { syncStockProjectionAfterCommit } from './stock-projection/direct-sync'

const router = Router()
const remitoItemSchema = z.object({ productoId: z.string().min(1), cantidad: z.number().int().positive() })
const emitSchema = z.object({ expectedVersion: z.number().int().positive(), items: z.array(remitoItemSchema).min(1).optional(), transportistaId: z.string().min(1).optional(), transporteOcasional: z.object({ nombre: z.string().trim().min(2), direccion: z.string().trim().min(2) }).optional() }).refine((data) => !(data.transportistaId && data.transporteOcasional), { message: 'Seleccione un transportista habitual u ocasional' })
const invalidateSchema = z.object({ motivo: z.string().trim().min(3).max(500) })
const discountSchema = z.object({
  expectedVersion: z.number().int().positive(),
  transferencias: z.array(z.object({ productoId: z.string().min(1), loteId: z.string().min(1), origen: z.literal('ACONDICIONADO'), destino: z.literal('DEPOSITO'), cantidad: z.number().int().positive() })).default([]),
  selecciones: z.array(z.object({ itemPedidoId: z.string().min(1), productoId: z.string().min(1), loteId: z.string().min(1), cantidad: z.number().int().positive() })).min(1),
})

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue }
function role(user: JwtPayload): string | undefined { return getAppAccess(user, 'ale-bet')?.rol }
function canApproveDiscount(user: JwtPayload): boolean { return role(user) === 'admin' || role(user) === 'encargado' }
function snapshotItems(value: Prisma.JsonValue): Array<{ productoId: string; nombre: string; cantidad: number }> {
  return Array.isArray(value) ? value.filter((item): item is { productoId: string; nombre: string; cantidad: number } => Boolean(item && typeof item === 'object' && typeof (item as any).productoId === 'string' && typeof (item as any).cantidad === 'number')) : []
}
function consolidate(items: Array<{ productoId: string; cantidad: number }>) {
  const totals = new Map<string, number>()
  for (const item of items) totals.set(item.productoId, (totals.get(item.productoId) ?? 0) + item.cantidad)
  return [...totals.entries()].map(([productoId, cantidad]) => ({ productoId, cantidad }))
}

async function emitRemito(user: JwtPayload, pedidoId: string, payload: z.infer<typeof emitSchema>, rawHeaders: string[], method: string) {
  const key = getSingleIdempotencyKey(rawHeaders)
  const work = async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "ale_bet"."Pedido" WHERE id = ${pedidoId} FOR UPDATE`)
    const pedido = await tx.pedido.findUnique({ where: { id: pedidoId }, include: { cliente: true, items: { include: { producto: true } } } })
    if (!pedido) throw new Error('NOT_FOUND')
    if (pedido.version !== payload.expectedVersion) throw new Error('VERSION_CONFLICT')
    if (!canEmitRemito(pedido.estado)) throw new Error('STATE_CONFLICT')
    const transportistaId = payload.transportistaId ?? (!payload.transporteOcasional ? pedido.cliente.transportistaPredeterminadoId : undefined)
    const transportista = transportistaId ? await tx.transportista.findUnique({ where: { id: transportistaId } }) : null
    if (transportistaId && (!transportista || !transportista.activo)) throw new Error('TRANSPORTISTA_CONFLICT')
    const clientAddress = pedido.cliente.direccion?.trim()
    // When neither the selected nor default transporter applies, delivery is
    // direct to the customer's registered address.  The persisted snapshot
    // keeps the document self-contained even if the customer later changes.
    const transporte = transportista ?? payload.transporteOcasional ?? (clientAddress
      ? { nombre: 'ENTREGA DIRECTA AL CLIENTE', direccion: clientAddress }
      : undefined)
    if (!transporte) throw new Error('TRANSPORTE_OR_CLIENT_ADDRESS_REQUIRED')
    const partial = pedido.origen === 'AUTOMATION' && pedido.descuentoPorRemito
    let selectedItems = pedido.items.map((item) => ({ productoId: item.productoId, cantidad: item.cantidad, nombre: item.producto.nombre }))
    if (partial) {
      const requested = consolidate(payload.items ?? [])
      if (requested.length === 0) throw new Error('ITEMS_REQUIRED')
      selectedItems = requested.map((request) => {
        const item = pedido.items.find((candidate) => candidate.productoId === request.productoId)
        if (!item) throw new Error('ITEM_NOT_IN_ORDER')
        const pending = item.cantidad - item.cantidadEntregada
        if (request.cantidad > pending) throw new Error('ITEM_EXCEEDS_PENDING')
        return { productoId: request.productoId, cantidad: request.cantidad, nombre: item.producto.nombre }
      })
    } else {
      await tx.remito.updateMany({ where: { pedidoId: pedido.id, estado: 'VIGENTE' }, data: { estado: 'INVALIDADO', invalidadoAt: new Date(), invalidadoPor: user.sub, motivoInvalidacion: 'Reemitido' } })
    }
    const documentNumber = await takeNextRemitoNumber(tx)
    const created = await tx.remito.create({ data: { pedidoId: pedido.id, numero: documentNumber.numero, transportistaId: transportista?.id, transporteNombre: transporte.nombre, transporteDireccion: transporte.direccion, clienteSnapshot: json(pedido.cliente), transporteSnapshot: json(transporte), itemsSnapshot: json(selectedItems), caiSnapshot: json(documentNumber.caiSnapshot), createdBy: user.sub } })
    if (partial) {
      for (const item of selectedItems) await tx.itemPedido.updateMany({ where: { pedidoId: pedido.id, productoId: item.productoId }, data: { cantidadEntregada: { increment: item.cantidad } } })
      const remaining = pedido.items.some((item) => item.cantidadEntregada + (selectedItems.find((selected) => selected.productoId === item.productoId)?.cantidad ?? 0) < item.cantidad)
      await tx.pedido.update({ where: { id: pedido.id }, data: { estado: remaining ? 'PENDIENTE_PARCIAL' : 'PREPARADO', version: { increment: 1 } } })
    } else await tx.pedido.update({ where: { id: pedido.id }, data: { version: { increment: 1 } } })
    await tx.pedidoAuditoria.create({ data: { pedidoId: pedido.id, actorId: user.sub, accion: partial ? 'REMITO_PARCIAL_EMITIDO' : 'REMITO_EMITIDO', nuevo: json({ remitoId: created.id, numero: created.numero, items: selectedItems }) } })
    return created
  }
  if (!key) return { body: await prisma.$transaction(work), replayed: false }
  const fingerprint = calculateFingerprint(method, 'ale-bet.pedido.remito.emitir', pedidoId, payload)
  return prisma.$transaction(async (tx) => {
    const acquired = await acquireIdempotencyRecord(tx, user.sub, 'ale-bet.pedido.remito.emitir', key, fingerprint)
    if (acquired.type === 'REPLAY') return { body: acquired.body, replayed: true }
    const created = await work(tx)
    await completeIdempotencyRecord(tx, acquired.id, 201, toPersistableResponseBody(created))
    return { body: created, replayed: false }
  })
}

router.post('/:id/remitos', requirePermission('ale-bet', 'remitos.create'), async (req, res) => {
  const parsed = emitSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() }); return }
  const user = req.user as JwtPayload
  try {
    const result = await emitRemito(user, String(req.params.id), parsed.data, req.rawHeaders, req.method)
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true')
    res.status(result.replayed ? 200 : 201).json(result.body)
  } catch (error) {
    if (error instanceof RemitoConfigurationConflict) { res.status(409).json({ error: error.message }); return }
    const message = error instanceof Error ? error.message : ''
    if (message === 'NOT_FOUND') { res.status(404).json({ error: 'Pedido no encontrado' }); return }
    if (message === 'VERSION_CONFLICT') { res.status(409).json({ error: 'La versión del pedido cambió; actualizá antes de reintentar' }); return }
    if (message === 'STATE_CONFLICT') { res.status(409).json({ error: 'El pedido no está disponible para emitir remito' }); return }
    if (message === 'ITEMS_REQUIRED') { res.status(400).json({ error: 'Seleccioná al menos un producto para esta entrega' }); return }
    if (message === 'ITEM_NOT_IN_ORDER') { res.status(400).json({ error: 'Uno de los productos no pertenece al pedido' }); return }
    if (message === 'ITEM_EXCEEDS_PENDING') { res.status(409).json({ error: 'La cantidad supera lo pendiente de entregar' }); return }
    if (message === 'TRANSPORTISTA_CONFLICT') { res.status(409).json({ error: 'Transportista no disponible' }); return }
    if (message === 'TRANSPORTE_OR_CLIENT_ADDRESS_REQUIRED') { res.status(400).json({ error: 'Seleccioná un transporte o cargá el domicilio del cliente para entrega directa' }); return }
    throw error
  }
})

router.put('/:id/remitos/:remitoId/anular', requirePermission('ale-bet', 'remitos.void'), async (req, res) => {
  const parsed = invalidateSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Motivo inválido' }); return }
  const user = req.user as JwtPayload
  const existing = await prisma.remito.findFirst({ where: { id: String(req.params.remitoId), pedidoId: String(req.params.id) }, include: { pedido: { include: { items: true } } } })
  if (!existing) { res.status(404).json({ error: 'Remito no encontrado' }); return }
  if (existing.descuentoAprobadoAt) { res.status(409).json({ error: 'No se puede anular un remito con stock descontado; registrá una devolución' }); return }
  const remito = await prisma.$transaction(async (tx) => {
    // Older remitos (issued before partial deliveries existed) may not have
    // an associated Pedido relation in a degraded/legacy record. They can be
    // invalidated normally; only partial-delivery remitos need to roll back
    // their delivered quantities.
    if (existing.pedido?.descuentoPorRemito) {
      for (const item of snapshotItems(existing.itemsSnapshot)) await tx.itemPedido.updateMany({ where: { pedidoId: existing.pedidoId, productoId: item.productoId }, data: { cantidadEntregada: { decrement: item.cantidad } } })
      await tx.pedido.update({ where: { id: existing.pedidoId }, data: { estado: 'APROBADO', version: { increment: 1 } } })
    }
    return tx.remito.update({ where: { id: existing.id }, data: { estado: 'INVALIDADO', invalidadoAt: new Date(), invalidadoPor: user.sub, motivoInvalidacion: parsed.data.motivo } })
  })
  res.json(remito)
})

/** Availability is intentionally scoped to one issued remito, not the whole
 * order. This lets the warehouse select/correct lots for the delivery that is
 * leaving today while the rest of the order remains pending. */
router.get('/:id/remitos/:remitoId/disponibilidad-stock', requirePermission('ale-bet', 'pedidos.dispatch'), async (req, res) => {
  const remito = await prisma.remito.findFirst({
    where: { id: String(req.params.remitoId), pedidoId: String(req.params.id), estado: 'VIGENTE' },
    include: { pedido: { include: { items: { include: { producto: true } } } } },
  })
  if (!remito || !remito.pedido.descuentoPorRemito) { res.status(404).json({ error: 'Remito parcial no encontrado' }); return }
  if (remito.descuentoAprobadoAt) { res.status(409).json({ error: 'El descuento de este remito ya fue aprobado' }); return }
  const byProduct = new Map(snapshotItems(remito.itemsSnapshot).map((item) => [item.productoId, item.cantidad]))
  const requested = remito.pedido.items
    .filter((item) => byProduct.has(item.productoId))
    .map((item) => ({ id: item.id, productoId: item.productoId, cantidad: byProduct.get(item.productoId)! }))
  try {
    res.json(await prisma.$transaction((tx) => getOrderAvailability(tx, remito.pedido, requested)))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo consultar el stock'
    res.status(409).json({ error: message })
  }
})

router.post('/:id/remitos/:remitoId/aprobar-descuento', requirePermission('ale-bet', 'pedidos.dispatch'), async (req, res) => {
  const parsed = discountSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Selección de lotes inválida', details: parsed.error.flatten() }); return }
  const user = req.user as JwtPayload
  if (!canApproveDiscount(user)) { res.status(403).json({ error: 'Solo Encargado o Admin puede aprobar el descuento de stock' }); return }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const pedidoId = String(req.params.id)
      const remitoId = String(req.params.remitoId)
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "ale_bet"."Pedido" WHERE id = ${pedidoId} FOR UPDATE`)
      const pedido = await tx.pedido.findUnique({ where: { id: pedidoId }, include: { items: { include: { producto: true } } } })
      const remito = await tx.remito.findFirst({ where: { id: remitoId, pedidoId, estado: 'VIGENTE' } })
      if (!pedido || !remito || !pedido.descuentoPorRemito) throw new Error('NOT_FOUND')
      if (pedido.version !== parsed.data.expectedVersion) throw new Error('VERSION_CONFLICT')
      if (remito.descuentoAprobadoAt) throw new Error('ALREADY_APPROVED')
      const requestedByProduct = new Map(snapshotItems(remito.itemsSnapshot).map((item) => [item.productoId, item.cantidad]))
      const remitoItems = pedido.items
        .filter((item) => requestedByProduct.has(item.productoId))
        .map((item) => ({ ...item, cantidad: requestedByProduct.get(item.productoId)! }))
      if (remitoItems.length === 0) throw new Error('INVALID_SNAPSHOT')
      const availability = await getOrderAvailability(tx, pedido, remitoItems)
      if (availability.status === 'INSUFICIENTE') throw new StockConflictError('No hay stock suficiente para descontar este remito')
      const selectionTotals = new Map<string, number>()
      for (const selection of parsed.data.selecciones) {
        const item = remitoItems.find((candidate) => candidate.id === selection.itemPedidoId && candidate.productoId === selection.productoId)
        if (!item) throw new Error('INVALID_SELECTION')
        selectionTotals.set(item.id, (selectionTotals.get(item.id) ?? 0) + selection.cantidad)
      }
      for (const item of remitoItems) if ((selectionTotals.get(item.id) ?? 0) !== item.cantidad) throw new Error('INCOMPLETE_SELECTION')
      const allowedTransfers = new Map(availability.transferencias.map((item) => [`${item.productoId}:${item.loteId}`, item.cantidad]))
      const requestedTransfers = new Map(parsed.data.transferencias.map((item) => [`${item.productoId}:${item.loteId}`, item.cantidad]))
      if (allowedTransfers.size !== requestedTransfers.size || [...allowedTransfers].some(([key, quantity]) => requestedTransfers.get(key) !== quantity)) throw new Error('STALE_TRANSFERS')
      for (const transfer of parsed.data.transferencias) await transferInternal(tx, { ...transfer, actorId: user.sub, idempotencyKey: `remito:${remito.id}:${transfer.loteId}`, skipOutbox: true })
      await reserveSelectedLots(tx, pedido.id, remitoItems, parsed.data.selecciones)
      await consumeActiveReservations(tx, pedido.id, user.sub, { skipOutbox: true, remitoId: remito.id, remitoNumero: remito.numero })
      await tx.remito.update({ where: { id: remito.id }, data: { descuentoAprobadoAt: new Date(), descuentoAprobadoPor: user.sub } })
      const allRemitos = await tx.remito.findMany({ where: { pedidoId: pedido.id, estado: 'VIGENTE' }, select: { descuentoAprobadoAt: true } })
      const allDelivered = pedido.items.every((item) => item.cantidadEntregada >= item.cantidad)
      const allApproved = allRemitos.every((item) => Boolean(item.descuentoAprobadoAt))
      const estado = allDelivered && allApproved ? 'DESPACHADO' : 'PENDIENTE_PARCIAL'
      const updated = await tx.pedido.update({ where: { id: pedido.id }, data: { estado, ...(estado === 'DESPACHADO' ? { despachadoAt: new Date() } : {}), version: { increment: 1 } }, include: { cliente: true, items: { include: { producto: true } }, remitos: true } })
      await tx.pedidoAuditoria.create({ data: { pedidoId: pedido.id, actorId: user.sub, accion: 'REMITO_DESCUENTO_APROBADO', nuevo: json({ remitoId: remito.id, numero: remito.numero, selecciones: parsed.data.selecciones }) } })
      for (const productId of new Set(remitoItems.map((item) => item.productoId))) await tx.stockProjectionOutbox.create({ data: { productId, causeType: 'CONSUMO_PEDIDO', causeId: remito.id, estado: 'PENDING' } })
      return updated
    })
    await syncStockProjectionAfterCommit({ logger: console })
    res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (error instanceof StockConflictError || message === 'VERSION_CONFLICT' || message === 'ALREADY_APPROVED' || message === 'INCOMPLETE_SELECTION' || message === 'STALE_TRANSFERS') { res.status(409).json({ error: error instanceof Error && error.name === 'StockConflictError' ? error.message : 'La disponibilidad cambió; actualizá y volvé a seleccionar los lotes' }); return }
    if (message === 'INVALID_SELECTION' || message === 'INVALID_SNAPSHOT') { res.status(400).json({ error: 'La selección no corresponde a los productos de este remito' }); return }
    if (message === 'NOT_FOUND') { res.status(404).json({ error: 'Remito parcial no encontrado' }); return }
    throw error
  }
})

router.get('/:id/remito.pdf', requirePermission('ale-bet', 'remitos.read.pdf'), async (req, res) => {
  const remito = await prisma.remito.findFirst({ where: { pedidoId: String(req.params.id), estado: 'VIGENTE' }, include: { pedido: { select: { vendedorId: true } } } })
  if (!remito) { res.status(404).json({ error: 'Remito vigente no encontrado' }); return }
  const user = req.user as JwtPayload
  if (!canReadRemitoPdf(role(user), remito.pedido.vendedorId, user.sub)) { res.status(403).json({ error: 'No puede descargar el remito de otro vendedor' }); return }
  const doc = new PDFDocument({ size: 'A4', margin: 0 })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${remito.numero}.pdf"`)
  doc.pipe(res)
  renderRemitoPdf(doc, {
    numero: remito.numero,
    fecha: remito.fecha,
    clienteSnapshot: remito.clienteSnapshot,
    transporteSnapshot: remito.transporteSnapshot,
    transporteNombre: remito.transporteNombre,
    transporteDireccion: remito.transporteDireccion,
    itemsSnapshot: remito.itemsSnapshot,
    caiSnapshot: remito.caiSnapshot,
  })
  doc.end()
})

router.get('/:id/remitos/:remitoId/pdf', requirePermission('ale-bet', 'remitos.read.pdf'), async (req, res) => {
  const remito = await prisma.remito.findFirst({ where: { id: String(req.params.remitoId), pedidoId: String(req.params.id) }, include: { pedido: { select: { vendedorId: true } } } })
  if (!remito) { res.status(404).json({ error: 'Remito no encontrado' }); return }
  const user = req.user as JwtPayload
  if (!canReadRemitoPdf(role(user), remito.pedido.vendedorId, user.sub)) { res.status(403).json({ error: 'No puede descargar el remito de otro vendedor' }); return }
  const doc = new PDFDocument({ size: 'A4', margin: 0 })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${remito.numero}.pdf"`)
  doc.pipe(res)
  renderRemitoPdf(doc, { numero: remito.numero, fecha: remito.fecha, clienteSnapshot: remito.clienteSnapshot, transporteSnapshot: remito.transporteSnapshot, transporteNombre: remito.transporteNombre, transporteDireccion: remito.transporteDireccion, itemsSnapshot: remito.itemsSnapshot, caiSnapshot: remito.caiSnapshot })
  doc.end()
})
export default router
