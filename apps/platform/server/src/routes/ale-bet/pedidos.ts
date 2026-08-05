import { Router, type Response } from 'express'
import crypto from 'crypto'
import { z } from 'zod'
import { Prisma, platformDb as prisma } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { eventBus, getAppAccess } from '@platform/core'
import { requireApp } from '../../middlewares/require-app'
import { acquireIdempotencyRecord, calculateFingerprint, completeIdempotencyRecord, getSingleIdempotencyKey, toPersistableResponseBody } from '../../utils/idempotency'
import { canCancelOrder, canConfirmDispatch, canEditOrder, canTransitionOrder, canVendorCancelDirectly, type OrderState } from './order-workflow'
import { consumeActiveReservations, releaseActiveReservations, reserveFefo, StockConflictError } from './reservas-service'
import { sseManager } from './sse-manager'

const router = Router()
const itemSchema = z.object({ productoId: z.string().min(1), cantidad: z.number().int().positive() })
const createSchema = z.object({ clienteId: z.string().min(1), items: z.array(itemSchema).min(1) })
const editSchema = createSchema.extend({ expectedVersion: z.number().int().positive() })
const versionSchema = z.object({ expectedVersion: z.number().int().positive() })
const cancelSchema = versionSchema.extend({ motivo: z.string().trim().min(3).max(500).optional() })

class ConflictError extends Error {}
class NotFoundError extends Error {}
class ForbiddenError extends Error {}

function orderNumber(): string {
  return `P-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

function state(value: OrderState): OrderState {
  return value
}

function actorRole(user: JwtPayload): string | undefined {
  return getAppAccess(user, 'ale-bet')?.rol
}

function assertOwnerOrAdmin(pedido: { vendedorId: string }, user: JwtPayload): void {
  if (actorRole(user) !== 'admin' && pedido.vendedorId !== user.sub) throw new ForbiddenError('Solo el vendedor propietario puede operar el pedido')
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

async function audit(tx: Prisma.TransactionClient, pedidoId: string, actorId: string, accion: string, anterior?: unknown, nuevo?: unknown, motivo?: string): Promise<void> {
  await tx.pedidoAuditoria.create({
    data: { pedidoId, actorId, accion, motivo, anterior: anterior === undefined ? undefined : asJson(anterior), nuevo: nuevo === undefined ? undefined : asJson(nuevo) },
  })
}

async function lockOrder(tx: Prisma.TransactionClient, pedidoId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "ale_bet"."Pedido" WHERE id = ${pedidoId} FOR UPDATE`)
  const pedido = await tx.pedido.findUnique({
    where: { id: pedidoId },
    include: { cliente: true, items: { include: { producto: true } } },
  })
  if (!pedido) throw new NotFoundError('Pedido no encontrado')
  return pedido
}

function assertVersion(pedido: { version: number }, expectedVersion: number): void {
  if (pedido.version !== expectedVersion) throw new ConflictError('La versión del pedido cambió; actualizá antes de reintentar')
}

async function invalidateRemitos(tx: Prisma.TransactionClient, pedidoId: string, actorId: string, motivo: string): Promise<void> {
  await tx.remito.updateMany({
    where: { pedidoId, estado: 'VIGENTE' },
    data: { estado: 'INVALIDADO', invalidadoAt: new Date(), invalidadoPor: actorId, motivoInvalidacion: motivo },
  })
}

async function idem<T>(
  user: JwtPayload,
  scope: string,
  entityId: string,
  method: string,
  body: unknown,
  rawHeaders: string[],
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<{ body: T | Prisma.JsonValue; replayed: boolean }> {
  const key = getSingleIdempotencyKey(rawHeaders)
  if (!key) return { body: await prisma.$transaction(work), replayed: false }
  const fingerprint = calculateFingerprint(method, scope, entityId, body)
  return prisma.$transaction(async (tx) => {
    const acquired = await acquireIdempotencyRecord(tx, user.sub, scope, key, fingerprint)
    if (acquired.type === 'REPLAY') return { body: acquired.body, replayed: true }
    const result = await work(tx)
    await completeIdempotencyRecord(tx, acquired.id, 200, toPersistableResponseBody(result))
    return { body: result, replayed: false }
  })
}

type AuthorizedIdempotency =
  | { replayed: false; recordId?: string }
  | { replayed: true; body: Prisma.JsonValue }

/**
 * Acquire idempotency only after the caller has locked the pedido and verified
 * its actor/state. This prevents a stored response from bypassing assignment
 * authorization. A replay is tied to the complete request fingerprint, which
 * includes expectedVersion; the version from the original request therefore
 * remains part of the replay contract even after the mutation increments it.
 */
async function acquireAuthorizedIdempotency(
  tx: Prisma.TransactionClient,
  user: JwtPayload,
  scope: string,
  entityId: string,
  method: string,
  body: unknown,
  rawHeaders: string[],
): Promise<AuthorizedIdempotency> {
  const key = getSingleIdempotencyKey(rawHeaders)
  if (!key) return { replayed: false }
  const acquired = await acquireIdempotencyRecord(
    tx,
    user.sub,
    scope,
    key,
    calculateFingerprint(method, scope, entityId, body),
  )
  if (acquired.type === 'REPLAY') return { replayed: true, body: acquired.body }
  return { replayed: false, recordId: acquired.id }
}

async function completeAuthorizedIdempotency(
  tx: Prisma.TransactionClient,
  acquisition: AuthorizedIdempotency,
  body: unknown,
): Promise<void> {
  if (!acquisition.replayed && acquisition.recordId) {
    await completeIdempotencyRecord(tx, acquisition.recordId, 200, toPersistableResponseBody(body))
  }
}

function errorResponse(error: unknown, res: Response): void {
  if (error instanceof NotFoundError) { res.status(404).json({ error: error.message }); return }
  if (error instanceof ForbiddenError) { res.status(403).json({ error: error.message }); return }
  if (error instanceof ConflictError || error instanceof StockConflictError) { res.status(409).json({ error: error.message }); return }
  throw error
}

router.get('/', requireApp('ale-bet'), async (req, res) => {
  const user = req.user as JwtPayload
  const role = actorRole(user)
  const requestedState = typeof req.query.estado === 'string' ? req.query.estado : undefined
  const where: Prisma.PedidoWhereInput = {}
  if (requestedState && ['BORRADOR', 'APROBADO', 'EN_ARMADO', 'PREPARADO', 'DESPACHADO', 'CANCELADO'].includes(requestedState)) where.estado = requestedState as OrderState
  if (role === 'vendedor') where.vendedorId = user.sub
  const pedidos = await prisma.pedido.findMany({ where, include: { cliente: true, items: { include: { producto: true } }, remitos: { where: { estado: 'VIGENTE' } } }, orderBy: { createdAt: 'desc' } })
  res.json(pedidos)
})

router.get('/:id', requireApp('ale-bet'), async (req, res) => {
  const pedido = await prisma.pedido.findUnique({ where: { id: String(req.params.id) }, include: { cliente: true, items: { include: { producto: true, reservas: true } }, reservas: true, remitos: true, auditorias: { orderBy: { createdAt: 'desc' } } } })
  if (!pedido) { res.status(404).json({ error: 'Pedido no encontrado' }); return }
  const user = req.user as JwtPayload
  if (actorRole(user) === 'vendedor' && pedido.vendedorId !== user.sub) { res.status(403).json({ error: 'No puede consultar este pedido' }); return }
  res.json(pedido)
})

router.post('/', requireApp('ale-bet', ['admin', 'vendedor']), async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() }); return }
  const user = req.user as JwtPayload
  const cliente = await prisma.cliente.findUnique({ where: { id: parsed.data.clienteId } })
  if (!cliente) { res.status(404).json({ error: 'Cliente no encontrado' }); return }
  const pedido = await prisma.$transaction(async (tx) => {
    const created = await tx.pedido.create({ data: { numero: orderNumber(), clienteId: cliente.id, vendedorId: user.sub, estado: 'BORRADOR', items: { create: parsed.data.items } }, include: { cliente: true, items: { include: { producto: true } } } })
    await audit(tx, created.id, user.sub, 'BORRADOR_CREADO', undefined, { clienteId: created.clienteId, items: parsed.data.items })
    return created
  })
  res.status(201).json(pedido)
})

router.patch('/:id', requireApp('ale-bet', ['admin', 'vendedor']), async (req, res) => {
  const parsed = editSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() }); return }
  const user = req.user as JwtPayload
  try {
    const result = await idem(user, 'ale-bet.pedido.editar', String(req.params.id), req.method, parsed.data, req.rawHeaders, async (tx) => {
      const pedido = await lockOrder(tx, String(req.params.id)); assertOwnerOrAdmin(pedido, user); assertVersion(pedido, parsed.data.expectedVersion)
      if (!canEditOrder(state(pedido.estado))) throw new ConflictError('Solo se puede editar un pedido BORRADOR o APROBADO')
      const cliente = await tx.cliente.findUnique({ where: { id: parsed.data.clienteId } }); if (!cliente) throw new NotFoundError('Cliente no encontrado')
      if (pedido.estado === 'APROBADO') await releaseActiveReservations(tx, pedido.id)
      await tx.itemPedido.deleteMany({ where: { pedidoId: pedido.id } })
      const updated = await tx.pedido.update({ where: { id: pedido.id }, data: { clienteId: cliente.id, version: { increment: 1 }, items: { create: parsed.data.items } }, include: { cliente: true, items: { include: { producto: true } } } })
      if (updated.estado === 'APROBADO') await reserveFefo(tx, updated.id, updated.items)
      await invalidateRemitos(tx, updated.id, user.sub, 'Pedido editado')
      await audit(tx, updated.id, user.sub, 'PEDIDO_EDITADO', { clienteId: pedido.clienteId, items: pedido.items }, { clienteId: updated.clienteId, items: updated.items })
      return updated
    })
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true')
    res.json(result.body)
  } catch (error) { errorResponse(error, res) }
})

router.put('/:id/aprobar', requireApp('ale-bet', ['admin', 'vendedor']), async (req, res) => {
  const parsed = versionSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'expectedVersion es requerido' }); return }
  const user = req.user as JwtPayload
  try {
    const result = await idem(user, 'ale-bet.pedido.aprobar', String(req.params.id), req.method, parsed.data, req.rawHeaders, async (tx) => {
      const pedido = await lockOrder(tx, String(req.params.id)); assertOwnerOrAdmin(pedido, user); assertVersion(pedido, parsed.data.expectedVersion)
      if (pedido.estado !== 'BORRADOR') throw new ConflictError('Solo se puede aprobar un pedido BORRADOR')
      if (pedido.cliente.estado !== 'VALIDADO') throw new ConflictError('El cliente está PENDIENTE_CLIENTE y debe validarse antes de aprobar')
      await reserveFefo(tx, pedido.id, pedido.items)
      const updated = await tx.pedido.update({ where: { id: pedido.id }, data: { estado: 'APROBADO', aprobadoAt: new Date(), version: { increment: 1 } }, include: { cliente: true, items: { include: { producto: true } } } })
      await audit(tx, updated.id, user.sub, 'PEDIDO_APROBADO', { estado: pedido.estado }, { estado: updated.estado })
      return updated
    })
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true')
    res.json(result.body)
    if (!result.replayed) sseManager.emitToRole('armador', 'pedido:aprobado', { pedidoId: String(req.params.id), timestamp: new Date().toISOString() })
  } catch (error) { errorResponse(error, res) }
})

router.put('/:id/tomar', requireApp('ale-bet', ['admin', 'armador']), async (req, res) => {
  const parsed = versionSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'expectedVersion es requerido' }); return }
  const user = req.user as JwtPayload
  try {
    const result = await idem(user, 'ale-bet.pedido.tomar', String(req.params.id), req.method, parsed.data, req.rawHeaders, async (tx) => {
      const pedido = await lockOrder(tx, String(req.params.id)); assertVersion(pedido, parsed.data.expectedVersion)
      if (!canTransitionOrder(state(pedido.estado), 'EN_ARMADO')) throw new ConflictError('Solo se puede tomar un pedido APROBADO')
      const updated = await tx.pedido.update({ where: { id: pedido.id }, data: { estado: 'EN_ARMADO', armadorId: user.sub, version: { increment: 1 } }, include: { cliente: true, items: { include: { producto: true } } } })
      await audit(tx, updated.id, user.sub, 'PEDIDO_TOMADO', { estado: pedido.estado }, { estado: updated.estado })
      return updated
    })
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true')
    res.json(result.body)
  } catch (error) { errorResponse(error, res) }
})

router.put('/:id/items/:itemId/completar', requireApp('ale-bet', ['admin', 'armador']), async (req, res) => {
  const parsed = versionSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'expectedVersion es requerido' }); return }
  const user = req.user as JwtPayload
  try {
    const result = await prisma.$transaction(async (tx): Promise<{ body: Prisma.JsonValue | unknown; replayed: boolean }> => {
      const locked = await lockOrder(tx, String(req.params.id))
      if (locked.estado !== 'EN_ARMADO') throw new ConflictError('Solo se pueden completar items de un pedido EN_ARMADO')
      if (actorRole(user) !== 'admin' && locked.armadorId !== user.sub) throw new ForbiddenError('Solo el armador asignado puede completar items')
      const item = locked.items.find((entry) => entry.id === String(req.params.itemId)); if (!item) throw new NotFoundError('Item no encontrado')
      if (item.completado) {
        const acquisition = await acquireAuthorizedIdempotency(tx, user, 'ale-bet.pedido.item.completar', `${locked.id}:${item.id}`, req.method, parsed.data, req.rawHeaders)
        if (acquisition.replayed) return { body: acquisition.body, replayed: true }
        assertVersion(locked, parsed.data.expectedVersion)
        return { body: locked, replayed: false }
      }
      assertVersion(locked, parsed.data.expectedVersion)
      const acquisition = await acquireAuthorizedIdempotency(tx, user, 'ale-bet.pedido.item.completar', `${locked.id}:${item.id}`, req.method, parsed.data, req.rawHeaders)
      if (acquisition.replayed) return { body: acquisition.body, replayed: true }
      await tx.itemPedido.update({ where: { id: item.id }, data: { completado: true } })
      const updated = await tx.pedido.update({ where: { id: locked.id }, data: { version: { increment: 1 } }, include: { cliente: true, items: { include: { producto: true } } } })
      await audit(tx, updated.id, user.sub, 'ITEM_PREPARADO', undefined, { itemId: item.id })
      await completeAuthorizedIdempotency(tx, acquisition, updated)
      return { body: updated, replayed: false }
    })
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true')
    res.json(result.body)
  } catch (error) { errorResponse(error, res) }
})

router.put('/:id/preparar', requireApp('ale-bet', ['admin', 'armador']), async (req, res) => {
  const parsed = versionSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'expectedVersion es requerido' }); return }
  const user = req.user as JwtPayload
  try {
    const result = await prisma.$transaction(async (tx): Promise<{ body: Prisma.JsonValue | unknown; replayed: boolean }> => {
      const locked = await lockOrder(tx, String(req.params.id))
      if (actorRole(user) !== 'admin' && locked.armadorId !== user.sub) throw new ForbiddenError('Solo el armador asignado puede preparar el pedido')
      if (locked.estado === 'PREPARADO') {
        const acquisition = await acquireAuthorizedIdempotency(tx, user, 'ale-bet.pedido.preparar', locked.id, req.method, parsed.data, req.rawHeaders)
        if (acquisition.replayed) return { body: acquisition.body, replayed: true }
        assertVersion(locked, parsed.data.expectedVersion)
        return { body: locked, replayed: false }
      }
      assertVersion(locked, parsed.data.expectedVersion)
      if (!canTransitionOrder(state(locked.estado), 'PREPARADO')) throw new ConflictError('Solo se puede preparar un pedido EN_ARMADO')
      if (!locked.items.every((item) => item.completado)) throw new ConflictError('Todos los items deben estar completados antes de preparar')
      const acquisition = await acquireAuthorizedIdempotency(tx, user, 'ale-bet.pedido.preparar', locked.id, req.method, parsed.data, req.rawHeaders)
      if (acquisition.replayed) return { body: acquisition.body, replayed: true }
      const updated = await tx.pedido.update({ where: { id: locked.id }, data: { estado: 'PREPARADO', preparadoAt: new Date(), version: { increment: 1 } }, include: { cliente: true, items: { include: { producto: true } } } })
      await audit(tx, updated.id, user.sub, 'PEDIDO_PREPARADO', { estado: locked.estado }, { estado: updated.estado })
      await completeAuthorizedIdempotency(tx, acquisition, updated)
      return { body: updated, replayed: false }
    })
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true')
    res.json(result.body)
  } catch (error) { errorResponse(error, res) }
})

router.put('/:id/cancelar', requireApp('ale-bet', ['admin', 'vendedor']), async (req, res) => {
  const parsed = cancelSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() }); return }
  const user = req.user as JwtPayload
  try {
    const response = await idem(user, 'ale-bet.pedido.cancelar', String(req.params.id), req.method, parsed.data, req.rawHeaders, async (tx) => {
      const pedido = await lockOrder(tx, String(req.params.id)); assertOwnerOrAdmin(pedido, user); assertVersion(pedido, parsed.data.expectedVersion)
      if (!canCancelOrder(state(pedido.estado))) throw new ConflictError('No se puede cancelar un pedido DESPACHADO o CANCELADO')
      if (pedido.estado === 'PREPARADO' && actorRole(user) !== 'admin') throw new ForbiddenError('El vendedor no puede cancelar un pedido PREPARADO')
      if (actorRole(user) === 'vendedor' && !canVendorCancelDirectly(state(pedido.estado)) && pedido.estado !== 'EN_ARMADO') throw new ForbiddenError('El vendedor solo puede cancelar directamente pedidos BORRADOR o APROBADO')
      if (!['BORRADOR', 'APROBADO', 'EN_ARMADO', 'PREPARADO'].includes(pedido.estado)) throw new ConflictError('Estado de pedido no cancelable')
      if (pedido.estado === 'BORRADOR') {
        await tx.itemPedido.deleteMany({ where: { pedidoId: pedido.id } })
        await tx.pedido.delete({ where: { id: pedido.id } })
        return { discarded: true, requested: false, pedidoId: pedido.id }
      }
      if (pedido.estado === 'EN_ARMADO') {
        if (!parsed.data.motivo) throw new ConflictError('La solicitud de cancelación EN_ARMADO exige motivo')
        const updated = await tx.pedido.update({ where: { id: pedido.id }, data: { cancelacionSolicitadaAt: new Date(), cancelacionSolicitadaPor: user.sub, motivoCancelacion: parsed.data.motivo, version: { increment: 1 } }, include: { cliente: true, items: { include: { producto: true } } } })
        await audit(tx, updated.id, user.sub, 'CANCELACION_SOLICITADA', undefined, { estado: updated.estado }, parsed.data.motivo)
        return { requested: true, pedido: updated }
      }
      await releaseActiveReservations(tx, pedido.id)
      const updated = await tx.pedido.update({ where: { id: pedido.id }, data: { estado: 'CANCELADO', canceladoAt: new Date(), motivoCancelacion: parsed.data.motivo, version: { increment: 1 } }, include: { cliente: true, items: { include: { producto: true } } } })
      await invalidateRemitos(tx, updated.id, user.sub, 'Pedido cancelado')
      await audit(tx, updated.id, user.sub, 'PEDIDO_CANCELADO', { estado: pedido.estado }, { estado: updated.estado }, parsed.data.motivo)
      return { requested: false, pedido: updated }
    })
    if (response.replayed) res.setHeader('Idempotency-Replayed', 'true')
    res.status((response.body as { requested?: boolean }).requested ? 202 : 200).json(response.body)
  } catch (error) { errorResponse(error, res) }
})

router.put('/:id/confirmar-cancelacion', requireApp('ale-bet', ['admin', 'armador']), async (req, res) => {
  const parsed = cancelSchema.safeParse(req.body)
  if (!parsed.success || !parsed.data.motivo) { res.status(400).json({ error: 'expectedVersion y motivo son requeridos' }); return }
  const user = req.user as JwtPayload
  try {
    const result = await idem(user, 'ale-bet.pedido.confirmar-cancelacion', String(req.params.id), req.method, parsed.data, req.rawHeaders, async (tx) => {
      const pedido = await lockOrder(tx, String(req.params.id)); assertVersion(pedido, parsed.data.expectedVersion)
      if (pedido.estado !== 'EN_ARMADO' || !pedido.cancelacionSolicitadaAt) throw new ConflictError('No hay una solicitud de cancelación EN_ARMADO pendiente')
      await releaseActiveReservations(tx, pedido.id)
      const updated = await tx.pedido.update({ where: { id: pedido.id }, data: { estado: 'CANCELADO', canceladoAt: new Date(), motivoCancelacion: parsed.data.motivo, version: { increment: 1 } }, include: { cliente: true, items: { include: { producto: true } } } })
      await invalidateRemitos(tx, updated.id, user.sub, 'Pedido cancelado durante armado')
      await audit(tx, updated.id, user.sub, 'CANCELACION_CONFIRMADA', { estado: pedido.estado }, { estado: updated.estado }, parsed.data.motivo)
      return updated
    })
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true')
    res.json(result.body)
  } catch (error) { errorResponse(error, res) }
})

router.post('/:id/despachar', requireApp('ale-bet', ['admin', 'armador']), async (req, res) => {
  const parsed = versionSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'expectedVersion es requerido' }); return }
  const user = req.user as JwtPayload
  try {
    const result = await idem(user, 'ale-bet.pedido.despachar', String(req.params.id), req.method, parsed.data, req.rawHeaders, async (tx) => {
      const pedido = await lockOrder(tx, String(req.params.id)); assertVersion(pedido, parsed.data.expectedVersion)
      const remito = await tx.remito.findFirst({ where: { pedidoId: pedido.id, estado: 'VIGENTE' } })
      if (!canConfirmDispatch(state(pedido.estado), Boolean(remito))) throw new ConflictError('Despacho requiere pedido PREPARADO y remito vigente')
      await consumeActiveReservations(tx, pedido.id, user.sub)
      const updated = await tx.pedido.update({ where: { id: pedido.id }, data: { estado: 'DESPACHADO', despachadoAt: new Date(), version: { increment: 1 } }, include: { cliente: true, items: { include: { producto: true } } } })
      await audit(tx, updated.id, user.sub, 'PEDIDO_DESPACHADO', { estado: pedido.estado }, { estado: updated.estado })
      return updated
    })
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true')
    res.json(result.body)
  } catch (error) { errorResponse(error, res) }
})

export default router
