import crypto from 'crypto'
import { Router, type Response } from 'express'
import { z } from 'zod'
import { Prisma, platformDb as prisma } from '@platform/db'
import { getAppAccess, type JwtPayload } from '@platform/core'
import { requirePermission } from '../../middlewares/require-permission'
import { acquireIdempotencyRecord, calculateFingerprint, completeIdempotencyRecord, getSingleIdempotencyKey, toPersistableResponseBody } from '../../utils/idempotency'
import { consumeActiveReservations, reserveSelectedLots, StockConflictError } from './reservas-service'
import { getOrderAvailability, transferInternal } from './inventory-service'
import { RemitoConfigurationConflict, takeNextRemitoNumber } from './remito-config-service'
import { syncStockProjectionAfterCommit } from './stock-projection/direct-sync'

const router = Router()
const itemSchema = z.object({ productoId: z.string().min(1), cantidad: z.number().int().positive() })
const clientSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  contacto: z.string().trim().min(1).max(120).optional(),
  referencia: z.string().trim().min(1).max(120).optional(),
  direccion: z.string().trim().max(200).optional(),
  localidad: z.string().trim().max(120).optional(),
  provincia: z.string().trim().max(120).optional(),
  cuit: z.string().trim().max(30).optional(),
  condicionIva: z.string().trim().max(80).optional(),
  condicionVenta: z.string().trim().max(80).optional(),
  transportistaPredeterminadoId: z.string().min(1).optional().nullable(),
})
const transportSchema = z.object({ nombre: z.string().trim().min(2).max(160), direccion: z.string().trim().min(2).max(240) })
const createSchema = z.object({
  clienteId: z.string().min(1).optional(),
  clienteNuevo: clientSchema.optional(),
  items: z.array(itemSchema).min(1),
  transportistaId: z.string().min(1).optional(),
  transporteOcasional: transportSchema.optional(),
}).superRefine((data, context) => {
  if (Boolean(data.clienteId) === Boolean(data.clienteNuevo)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Seleccione un cliente existente o cargue uno nuevo' })
  if (data.transportistaId && data.transporteOcasional) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Seleccione un único tipo de transporte' })
})
const approveSchema = z.object({
  expectedVersion: z.number().int().positive(),
  selecciones: z.array(z.object({
    itemPedidoId: z.string().min(1), productoId: z.string().min(1), loteId: z.string().min(1), cantidad: z.number().int().positive(),
  })).min(1),
  transferencias: z.array(z.object({ productoId: z.string().min(1), loteId: z.string().min(1), origen: z.literal('ACONDICIONADO'), destino: z.literal('DEPOSITO'), cantidad: z.number().int().positive() })).default([]),
})

class ConflictError extends Error {}
class NotFoundError extends Error {}
class ForbiddenError extends Error {}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function actorRole(user: JwtPayload): string | undefined {
  return getAppAccess(user, 'ale-bet')?.rol
}

function backingNumber(): string {
  return `RM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

function consolidateItems(items: Array<{ productoId: string; cantidad: number }>): Array<{ productoId: string; cantidad: number }> {
  const quantities = new Map<string, number>()
  for (const item of items) quantities.set(item.productoId, (quantities.get(item.productoId) ?? 0) + item.cantidad)
  return [...quantities.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([productoId, cantidad]) => ({ productoId, cantidad }))
}

function respondError(error: unknown, res: Response): void {
  if (error instanceof NotFoundError) { res.status(404).json({ error: error.message }); return }
  if (error instanceof ForbiddenError) { res.status(403).json({ error: error.message }); return }
  if (error instanceof ConflictError || error instanceof StockConflictError || error instanceof RemitoConfigurationConflict) { res.status(409).json({ error: error.message }); return }
  throw error
}

router.get('/', requirePermission('ale-bet', 'pedidos.read'), async (_req, res) => {
  const pedidos = await prisma.pedido.findMany({
    where: { esRemitoManual: true },
    include: { cliente: true, items: { include: { producto: true } }, remitos: { where: { estado: 'VIGENTE' } } },
    orderBy: { createdAt: 'desc' },
  })
  res.json(pedidos)
})

router.post('/', requirePermission('ale-bet', 'remitos.create'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() }); return }
  const user = req.user as JwtPayload
  const idempotencyKey = getSingleIdempotencyKey(req.rawHeaders)
  const work = async (tx: Prisma.TransactionClient) => {
    const items = consolidateItems(parsed.data.items)
    const products = await tx.producto.findMany({ where: { id: { in: items.map((item) => item.productoId) }, activo: true } })
    if (products.length !== items.length) throw new ConflictError('Uno o más productos no existen o están inactivos')

    let cliente
    if (parsed.data.clienteNuevo) {
      const defaultTransportId = parsed.data.clienteNuevo.transportistaPredeterminadoId
      if (defaultTransportId) {
        const defaultTransport = await tx.transportista.findFirst({ where: { id: defaultTransportId, activo: true }, select: { id: true } })
        if (!defaultTransport) throw new ConflictError('El transportista predeterminado no está disponible')
      }
      cliente = await tx.cliente.create({ data: { ...parsed.data.clienteNuevo, estado: 'VALIDADO' } })
    } else {
      cliente = await tx.cliente.findUnique({ where: { id: parsed.data.clienteId } })
      if (!cliente || !cliente.activo) throw new NotFoundError('Cliente no disponible')
    }

    const transportistaId = parsed.data.transportistaId ?? (!parsed.data.transporteOcasional ? cliente.transportistaPredeterminadoId : undefined)
    const transportista = transportistaId ? await tx.transportista.findUnique({ where: { id: transportistaId } }) : null
    if (transportistaId && (!transportista || !transportista.activo)) throw new ConflictError('Transportista no disponible')
    const directAddress = cliente.direccion?.trim()
    const transporte = transportista ?? parsed.data.transporteOcasional ?? (directAddress
      ? { nombre: 'ENTREGA DIRECTA AL CLIENTE', direccion: directAddress }
      : undefined)
    if (!transporte) throw new ConflictError('Seleccioná un transporte o cargá el domicilio del cliente para entrega directa')

    const pedido = await tx.pedido.create({
      data: {
        numero: backingNumber(),
        clienteId: cliente.id,
        origen: 'MANUAL',
        esRemitoManual: true,
        estado: 'PREPARADO',
        items: { create: items },
      },
      include: { cliente: true, items: { include: { producto: true } } },
    })
    const documentNumber = await takeNextRemitoNumber(tx)
    const remito = await tx.remito.create({
      data: {
        pedidoId: pedido.id,
        numero: documentNumber.numero,
        transportistaId: transportista?.id,
        transporteNombre: transporte.nombre,
        transporteDireccion: transporte.direccion,
        clienteSnapshot: asJson(cliente),
        transporteSnapshot: asJson(transporte),
        itemsSnapshot: asJson(pedido.items.map((item) => ({ productoId: item.productoId, nombre: item.producto.nombre, cantidad: item.cantidad }))),
        caiSnapshot: asJson(documentNumber.caiSnapshot),
        createdBy: user.sub,
      },
    })
    await tx.pedidoAuditoria.create({
      data: {
        pedidoId: pedido.id,
        actorId: user.sub,
        accion: 'REMITO_MANUAL_EMITIDO_PENDIENTE_DESCUENTO',
        nuevo: asJson({ remitoId: remito.id, numero: remito.numero, items }),
      },
    })
    return { pedido: { ...pedido, remitos: [remito] }, remito }
  }

  try {
    if (!idempotencyKey) {
      res.status(201).json(await prisma.$transaction(work))
      return
    }
    const fingerprint = calculateFingerprint(req.method, 'ale-bet.remito.manual.crear', 'manual-remito', parsed.data)
    const result = await prisma.$transaction(async (tx) => {
      const acquired = await acquireIdempotencyRecord(tx, user.sub, 'ale-bet.remito.manual.crear', idempotencyKey, fingerprint)
      if (acquired.type === 'REPLAY') return { body: acquired.body, replayed: true }
      const body = await work(tx)
      await completeIdempotencyRecord(tx, acquired.id, 201, toPersistableResponseBody(body))
      return { body, replayed: false }
    })
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true')
    res.status(result.replayed ? 200 : 201).json(result.body)
  } catch (error) { respondError(error, res) }
})

router.post('/:pedidoId/aprobar-descuento', requirePermission('ale-bet', 'pedidos.dispatch'), async (req, res) => {
  const parsed = approveSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'expectedVersion es requerido' }); return }
  const user = req.user as JwtPayload
  if (!['admin', 'encargado'].includes(actorRole(user) ?? '')) { res.status(403).json({ error: 'Solo administrador o encargado puede aprobar el descuento' }); return }
  const idempotencyKey = getSingleIdempotencyKey(req.rawHeaders)
  const pedidoId = String(req.params.pedidoId)
  const work = async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "ale_bet"."Pedido" WHERE id = ${pedidoId} FOR UPDATE`)
    const pedido = await tx.pedido.findUnique({ where: { id: pedidoId }, include: { cliente: true, items: { include: { producto: true } } } })
    if (!pedido) throw new NotFoundError('Remito manual no encontrado')
    if (!pedido.esRemitoManual) throw new ConflictError('El pedido no corresponde a un remito manual')
    if (pedido.version !== parsed.data.expectedVersion) throw new ConflictError('La versión del remito cambió; actualizá antes de aprobar')
    if (pedido.estado !== 'PREPARADO') throw new ConflictError('El remito no está pendiente de descuento')
    const remito = await tx.remito.findFirst({ where: { pedidoId: pedido.id, estado: 'VIGENTE' } })
    if (!remito) throw new ConflictError('El remito debe estar vigente para descontar stock')
    const availability = await getOrderAvailability(tx, pedido)
    if (availability.status === 'INSUFICIENTE') throw new StockConflictError('Stock insuficiente para descontar el remito')
    if (JSON.stringify(availability.transferencias) !== JSON.stringify(parsed.data.transferencias)) {
      throw new ConflictError('Las transferencias no coinciden con la disponibilidad vigente')
    }
    for (const transfer of parsed.data.transferencias) {
      await transferInternal(tx, { ...transfer, actorId: user.sub, idempotencyKey: `remito-manual:${pedido.id}:${transfer.loteId}`, skipOutbox: true })
    }
    // Revalidate and reserve the lots expressly selected by the approver.
    await reserveSelectedLots(tx, pedido.id, pedido.items, parsed.data.selecciones)
    await consumeActiveReservations(tx, pedido.id, user.sub)
    const updated = await tx.pedido.update({
      where: { id: pedido.id },
      data: { estado: 'DESPACHADO', despachadoAt: new Date(), version: { increment: 1 } },
      include: { cliente: true, items: { include: { producto: true } }, remitos: true },
    })
    await tx.pedidoAuditoria.create({
      data: { pedidoId: updated.id, actorId: user.sub, accion: 'REMITO_MANUAL_STOCK_DESCONTADO', anterior: asJson({ estado: pedido.estado }), nuevo: asJson({ estado: updated.estado }) },
    })
    return updated
  }
  try {
    if (!idempotencyKey) {
      const updated = await prisma.$transaction(work)
      await syncStockProjectionAfterCommit()
      res.json(updated)
      return
    }
    const fingerprint = calculateFingerprint(req.method, 'ale-bet.remito.manual.aprobar-descuento', pedidoId, parsed.data)
    const result = await prisma.$transaction(async (tx) => {
      const acquired = await acquireIdempotencyRecord(tx, user.sub, 'ale-bet.remito.manual.aprobar-descuento', idempotencyKey, fingerprint)
      if (acquired.type === 'REPLAY') return { body: acquired.body, replayed: true }
      const body = await work(tx)
      await completeIdempotencyRecord(tx, acquired.id, 200, toPersistableResponseBody(body))
      return { body, replayed: false }
    })
    if (!result.replayed) await syncStockProjectionAfterCommit()
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true')
    res.json(result.body)
  } catch (error) { respondError(error, res) }
})

export default router
