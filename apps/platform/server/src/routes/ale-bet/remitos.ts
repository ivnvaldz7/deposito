import { Router } from 'express'
import crypto from 'crypto'
import PDFDocument from 'pdfkit'
import { z } from 'zod'
import { Prisma, platformDb as prisma } from '@platform/db'
import { getAppAccess, type JwtPayload } from '@platform/core'
import { requireApp } from '../../middlewares/require-app'
import { acquireIdempotencyRecord, calculateFingerprint, completeIdempotencyRecord, getSingleIdempotencyKey, toPersistableResponseBody } from '../../utils/idempotency'
import { canEmitRemito, canReadRemitoPdf } from './order-workflow'
import { renderRemitoPdf } from './remito-pdf'

const router = Router()
const emitSchema = z.object({ expectedVersion: z.number().int().positive(), transportistaId: z.string().min(1).optional(), transporteOcasional: z.object({ nombre: z.string().trim().min(2), direccion: z.string().trim().min(2) }).optional() }).refine((data) => Boolean(data.transportistaId) !== Boolean(data.transporteOcasional), { message: 'Seleccione un transportista habitual u ocasional' })
const invalidateSchema = z.object({ motivo: z.string().trim().min(3).max(500) })

function number(): string { return `R-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}` }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue }
function role(user: JwtPayload): string | undefined { return getAppAccess(user, 'ale-bet')?.rol }

async function emitRemito(user: JwtPayload, pedidoId: string, payload: z.infer<typeof emitSchema>, rawHeaders: string[], method: string) {
  const key = getSingleIdempotencyKey(rawHeaders)
  const work = async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "ale_bet"."Pedido" WHERE id = ${pedidoId} FOR UPDATE`)
    const pedido = await tx.pedido.findUnique({ where: { id: pedidoId }, include: { cliente: true, items: { include: { producto: true } } } })
    if (!pedido) throw new Error('NOT_FOUND')
    if (pedido.version !== payload.expectedVersion) throw new Error('VERSION_CONFLICT')
    if (!canEmitRemito(pedido.estado)) throw new Error('STATE_CONFLICT')
    const transportista = payload.transportistaId ? await tx.transportista.findUnique({ where: { id: payload.transportistaId } }) : null
    if (payload.transportistaId && (!transportista || !transportista.activo)) throw new Error('TRANSPORTISTA_CONFLICT')
    const transporte = transportista ?? payload.transporteOcasional
    if (!transporte) throw new Error('TRANSPORTE_REQUIRED')
    await tx.remito.updateMany({ where: { pedidoId: pedido.id, estado: 'VIGENTE' }, data: { estado: 'INVALIDADO', invalidadoAt: new Date(), invalidadoPor: user.sub, motivoInvalidacion: 'Reemitido' } })
    const created = await tx.remito.create({ data: { pedidoId: pedido.id, numero: number(), transportistaId: transportista?.id, transporteNombre: transporte.nombre, transporteDireccion: transporte.direccion, clienteSnapshot: json(pedido.cliente), transporteSnapshot: json(transporte), itemsSnapshot: json(pedido.items.map((item) => ({ productoId: item.productoId, nombre: item.producto.nombre, cantidad: item.cantidad }))), createdBy: user.sub } })
    await tx.pedido.update({ where: { id: pedido.id }, data: { version: { increment: 1 } } })
    await tx.pedidoAuditoria.create({ data: { pedidoId: pedido.id, actorId: user.sub, accion: 'REMITO_EMITIDO', nuevo: json({ remitoId: created.id, numero: created.numero }) } })
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

router.post('/:id/remitos', requireApp('ale-bet', ['admin', 'facturacion']), async (req, res) => {
  const parsed = emitSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() }); return }
  const user = req.user as JwtPayload
  try {
    const result = await emitRemito(user, String(req.params.id), parsed.data, req.rawHeaders, req.method)
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true')
    res.status(result.replayed ? 200 : 201).json(result.body)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'NOT_FOUND') { res.status(404).json({ error: 'Pedido no encontrado' }); return }
    if (message === 'VERSION_CONFLICT') { res.status(409).json({ error: 'La versión del pedido cambió; actualizá antes de reintentar' }); return }
    if (message === 'STATE_CONFLICT') { res.status(409).json({ error: 'Solo se puede emitir remito para un pedido APROBADO, EN_ARMADO o PREPARADO' }); return }
    if (message === 'TRANSPORTISTA_CONFLICT') { res.status(409).json({ error: 'Transportista no disponible' }); return }
    if (message === 'TRANSPORTE_REQUIRED') { res.status(400).json({ error: 'Transporte requerido' }); return }
    throw error
  }
})

router.put('/:id/remitos/:remitoId/anular', requireApp('ale-bet', ['admin', 'facturacion']), async (req, res) => {
  const parsed = invalidateSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Motivo inválido' }); return }
  const user = req.user as JwtPayload
  const existing = await prisma.remito.findFirst({ where: { id: String(req.params.remitoId), pedidoId: String(req.params.id) } })
  if (!existing) { res.status(404).json({ error: 'Remito no encontrado' }); return }
  const remito = await prisma.remito.update({ where: { id: existing.id }, data: { estado: 'INVALIDADO', invalidadoAt: new Date(), invalidadoPor: user.sub, motivoInvalidacion: parsed.data.motivo } })
  res.json(remito)
})

router.get('/:id/remito.pdf', requireApp('ale-bet'), async (req, res) => {
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
  })
  doc.end()
})
export default router
