import { Request,  Router, Response  } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { Mercado } from '@platform/db'
import { extractDbConstraintViolation, isKnownInventoryConflict } from '../../utils/db-errors'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../../middlewares/require-permission'
import { sseManager } from '../lib/sse-manager'
import { isStockBajo } from '../lib/stock-status'
import { eventBus } from '@platform/core'
import { resolveUniqueFrascoCandidate } from './shared/frasco-inventory-resolution'
import { descontarStockOrden, OrdenStockError } from '../services/orden-stock-service'

const router = Router()

const MERCADOS = Object.values(Mercado) as [Mercado, ...Mercado[]]
const ESTADOS_ARCHIVABLES = ['aprobada', 'rechazada'] as const
const DIAS_VISIBLES_ORDEN_CONFIRMADA = 7

function archiveCutoff(): Date {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - DIAS_VISIBLES_ORDEN_CONFIRMADA)
  return cutoff
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ordenItemSchema = z.object({
  categoria: z.enum(['droga', 'estuche', 'etiqueta', 'frasco']),
  productoId: z.string().uuid(),
  mercado: z.enum(MERCADOS).optional(),
  cantidad: z.number().finite().positive(),
})
  .refine((data) => data.categoria === 'droga' || Number.isInteger(data.cantidad), { message: 'La cantidad debe ser entera para materiales de empaque', path: ['cantidad'] })

const crearOrdenSchema = z.union([
  ordenItemSchema,
  z.object({ items: z.array(ordenItemSchema).min(1).max(30) }),
])

const rechazarSchema = z.object({ motivoRechazo: z.string().trim().max(500).optional() }).optional().transform((data) => data ?? {})

function isSolicitante(req: Request): boolean {
  return req.user?.apps.deposito?.rol === 'solicitante'
}

// Helper: verifica si el stock bajó del threshold después de un egreso
async function checkStockBajo(
  categoria: string,
  productoNombre: string,
  mercado: Mercado | null,
  productoId: string | null,
): Promise<number | null> {
  try {
    const stockMinimo = productoId
      ? (await prisma.depositoProducto.findUnique({ where: { id: productoId }, select: { stockMinimo: true } }))?.stockMinimo
      : null
    if (stockMinimo == null) return null

    if (categoria === 'droga') {
      // Sumar total de todos los lotes del producto
      const agg = await prisma.inventarioDroga.aggregate({
        where: { nombre: productoNombre },
        _sum: { cantidad: true },
      })
      const total = agg._sum.cantidad ?? 0
      if (isStockBajo(total, stockMinimo)) return total
    } else if (categoria === 'estuche' && mercado) {
      const e = await prisma.inventarioEstuche.findUnique({
        where: { articulo_mercado: { articulo: productoNombre, mercado } },
      })
      if (e && isStockBajo(e.cantidad, stockMinimo)) return e.cantidad
    } else if (categoria === 'etiqueta' && mercado) {
      const e = await prisma.inventarioEtiqueta.findUnique({
        where: { articulo_mercado: { articulo: productoNombre, mercado } },
      })
      if (e && isStockBajo(e.cantidad, stockMinimo)) return e.cantidad
    } else if (categoria === 'frasco') {
      const f = productoId
        ? await prisma.inventarioFrasco.findUnique({ where: { productoId } })
        : resolveUniqueFrascoCandidate(productoNombre, await prisma.inventarioFrasco.findMany())
      if (f && isStockBajo(f.cantidadCajas, stockMinimo)) return f.cantidadCajas
    }
  } catch { /* no crítico */ }
  return null
}

// ─── POST /api/ordenes — crear (solicitante o encargado) ─────────────────────

router.post(
  '/',
  authenticate,
  requirePermission('deposito', 'ordenes.create'),
  async (req: Request, res: Response): Promise<void> => {
    const result = crearOrdenSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const isMultiorden = 'items' in result.data
    const items = 'items' in result.data ? result.data.items : [result.data]
    const seen = new Set<string>()
    for (const item of items) {
      if ((item.categoria === 'estuche' || item.categoria === 'etiqueta') && !item.mercado) {
        res.status(400).json({ message: 'El campo mercado es obligatorio para estuches y etiquetas' })
        return
      }
      if ((item.categoria === 'droga' || item.categoria === 'frasco') && item.mercado) {
        res.status(400).json({ message: 'El mercado solo aplica a estuches y etiquetas' })
        return
      }
      const duplicateKey = `${item.productoId}:${item.mercado ?? ''}`
      if (seen.has(duplicateKey)) {
        res.status(400).json({ message: 'No repitas el mismo producto dentro de una solicitud' })
        return
      }
      seen.add(duplicateKey)
    }

    const products = await Promise.all(items.map(async (item) => {
      try {
        return await prisma.depositoProducto.findUnique({ where: { id: item.productoId } })
      } catch {
        return null
      }
    }))
    for (let index = 0; index < items.length; index += 1) {
      const product = products[index]
      if (!product || !product.activo || product.categoria !== items[index]!.categoria) {
        res.status(400).json({ message: 'Elegí productos activos de la categoría correspondiente' })
        return
      }
    }

    try {
      const grupoId = randomUUID()
      const ordenes = await prisma.$transaction(async (tx) => {
        const created = []
        for (const [index, item] of items.entries()) {
          created.push(await tx.ordenProduccion.create({
          data: {
            solicitanteId: req.depositoUser!.id,
            grupoId,
            productoId: item.productoId,
            categoria: item.categoria,
            productoNombre: products[index]!.nombreCompleto,
            mercado: item.mercado ?? null,
            cantidad: item.cantidad,
          },
          include: {
            solicitante: { select: { id: true, name: true, role: true } },
            aprobador: { select: { id: true, name: true } },
          },
          }))
        }
        return created
      })

      const productSummary = ordenes.map((orden) => `${orden.productoNombre} (×${orden.cantidad})`).join(', ')
      const plural = ordenes.length === 1 ? 'producto' : 'productos'
      const notification = {
        tipo: 'orden_creada',
        mensaje: `Nueva solicitud: ${ordenes.length} ${plural} — ${req.depositoUser!.name}`,
        datos: {
          grupoId,
          ordenIds: ordenes.map((orden) => orden.id),
          cantidadProductos: ordenes.length,
          solicitante: req.depositoUser!.name,
        },
        timestamp: new Date().toISOString(),
      }
      sseManager.broadcastToRoles(notification, ['encargado'])
      eventBus.emit({
        app: 'deposito',
        tipo: 'orden_creada',
        titulo: 'Solicitud de producción',
        mensaje: `Nueva solicitud: ${productSummary}`,
        link: `/deposito/ordenes/${ordenes[0]!.id}`,
        timestamp: new Date().toISOString(),
      })

      res.status(201).json(isMultiorden ? { grupoId, ordenes } : ordenes[0])
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// ─── GET /api/ordenes — listar (auth) ────────────────────────────────────────

router.get(
  '/',
  authenticate,
  requirePermission('deposito', 'ordenes.read'),
  async (req: Request, res: Response): Promise<void> => {
    const { estado, archivadas } = req.query

    const estadoFilter = typeof estado === 'string' ? estado : undefined
    const includeArchived = archivadas === 'true'

    // Solicitante solo ve sus propias órdenes
    const roleFilter =
      isSolicitante(req) && req.depositoUser
        ? { solicitanteId: req.depositoUser.id }
        : {}

    const estadoWhere = estadoFilter ? { estado: estadoFilter as never } : {}
    const cutoff = archiveCutoff()
    const archiveWhere = includeArchived
      ? { estado: { in: [...ESTADOS_ARCHIVABLES] }, updatedAt: { lt: cutoff } }
      : { NOT: { AND: [{ estado: { in: [...ESTADOS_ARCHIVABLES] } }, { updatedAt: { lt: cutoff } }] } }

    try {
      const ordenes = await prisma.ordenProduccion.findMany({
        where: { AND: [roleFilter, estadoWhere, archiveWhere] },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          solicitante: { select: { id: true, name: true, role: true } },
          aprobador: { select: { id: true, name: true } },
        },
      })
      res.json(ordenes)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// ─── GET /api/ordenes/:id — detalle ──────────────────────────────────────────

router.get(
  '/:id',
  authenticate,
  requirePermission('deposito', 'ordenes.read'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    try {
      const orden = await prisma.ordenProduccion.findUnique({
        where: { id },
        include: {
          solicitante: { select: { id: true, name: true, role: true } },
          aprobador: { select: { id: true, name: true } },
        },
      })

      if (!orden) {
        res.status(404).json({ message: 'Orden no encontrada' })
        return
      }

      // Solicitante solo puede ver sus propias órdenes
      if (isSolicitante(req) && orden.solicitanteId !== req.depositoUser!.id) {
        res.status(403).json({ message: 'No autorizado' })
        return
      }

      res.json(orden)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// ─── PUT /api/ordenes/:id/aprobar — solo encargado ───────────────────────────

router.post(
  '/:id/aprobar',
  authenticate,
  requirePermission('deposito', 'ordenes.approve'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM deposito.ordenes_produccion WHERE id = ${id} FOR UPDATE`
        const orden = await tx.ordenProduccion.findUnique({ where: { id } })
        if (!orden) throw new Error('HTTP_404: Orden no encontrada')
        if (orden.estado !== 'solicitada') throw new Error(`HTTP_409: La orden ya está en estado "${orden.estado}"`)

        await descontarStockOrden(tx, orden, req.depositoUser!.id)
        const transition = await tx.ordenProduccion.updateMany({
          where: { id, estado: 'solicitada' },
          data: { estado: 'aprobada', aprobadoPor: req.depositoUser!.id },
        })
        if (transition.count !== 1) throw new Error('HTTP_409: La orden ya fue procesada')
        return tx.ordenProduccion.findUnique({
          where: { id },
          include: {
            solicitante: { select: { id: true, name: true, role: true } },
            aprobador: { select: { id: true, name: true } },
          },
        })
      })
      if (!updated) throw new Error('HTTP_404: Orden no encontrada')

      const timestamp = new Date().toISOString()
      sseManager.broadcastGlobal({
        tipo: 'stock_actualizado',
        mensaje: `Stock de ${updated.productoNombre} actualizado (−${updated.cantidad})`,
        datos: { producto: updated.productoNombre, productoId: updated.productoId, categoria: updated.categoria, mercado: updated.mercado, cantidad: -updated.cantidad, tipo: 'egreso' },
        timestamp,
      })
      eventBus.emit({
        app: 'deposito',
        tipo: 'stock_actualizado',
        titulo: 'Stock actualizado',
        mensaje: `Stock de ${updated.productoNombre} actualizado (−${updated.cantidad})`,
        timestamp,
      })
      const stockBajo = await checkStockBajo(updated.categoria, updated.productoNombre, updated.mercado, updated.productoId)
      if (stockBajo !== null) {
        sseManager.broadcastGlobal({
          tipo: 'stock_bajo',
          mensaje: `Stock bajo: ${updated.productoNombre} (${stockBajo} restantes)`,
          datos: { producto: updated.productoNombre, categoria: updated.categoria, cantidad: stockBajo },
          timestamp,
        })
        eventBus.emit({
          app: 'deposito',
          tipo: 'stock_bajo',
          titulo: 'Stock bajo',
          mensaje: `Stock bajo: ${updated.productoNombre} (${stockBajo} restantes)`,
          link: '/deposito/drogas',
          timestamp,
        })
      }

      sseManager.broadcastToUser(
        {
          tipo: 'orden_actualizada',
          mensaje: `Tu orden de ${updated.productoNombre} fue aprobada`,
          datos: { ordenId: updated.id, producto: updated.productoNombre, estado: 'aprobada', aprobadoPor: req.depositoUser!.name },
          timestamp: new Date().toISOString(),
        },
        updated.solicitanteId
      )
      eventBus.emit({
        app: 'deposito',
        tipo: 'orden_actualizada',
        titulo: 'Orden aprobada',
        mensaje: `Orden de ${updated.productoNombre} aprobada`,
        userId: updated.solicitanteId,
        link: `/deposito/ordenes/${updated.id}`,
        timestamp: new Date().toISOString(),
      })

      res.json(updated)
    } catch (error) {
      if (error instanceof OrdenStockError) {
        res.status(error.code === 'MERCADO_REQUERIDO' ? 400 : 409).json({ message: error.message, code: error.code })
        return
      }
      const dbErr = extractDbConstraintViolation(error)
      if (dbErr && isKnownInventoryConflict(dbErr.constraintName)) {
        res.status(409).json({ message: 'La operación no puede completarse por una inconsistencia de stock', code: 'INVENTORY_CONSTRAINT_VIOLATION' })
        return
      }
      const message = error instanceof Error ? error.message : ''
      if (message.startsWith('HTTP_404: ')) res.status(404).json({ message: message.slice(10) })
      else if (message.startsWith('HTTP_409: ')) res.status(409).json({ message: message.slice(10) })
      else res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// Legacy execution endpoint is intentionally disabled: approval now performs
// stock deduction atomically in the same transaction.

router.post('/:id/ejecutar', authenticate, requirePermission('deposito', 'ordenes.execute'), (_req, res) => {
  res.status(410).json({ message: 'La ejecución ahora se realiza al aprobar la orden' })
})

// ─── PUT /api/ordenes/:id/rechazar — solo encargado ──────────────────────────

router.put(
  '/:id/rechazar',
  authenticate,
  requirePermission('deposito', 'ordenes.reject'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    const result = rechazarSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Motivo de rechazo inválido' })
      return
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM deposito.ordenes_produccion WHERE id = ${id} FOR UPDATE`
        const orden = await tx.ordenProduccion.findUnique({ where: { id } })
        if (!orden) throw new Error('HTTP_404: Orden no encontrada')
        if (orden.estado !== 'solicitada') throw new Error(`HTTP_409: No se puede rechazar una orden en estado "${orden.estado}"`)
        const transition = await tx.ordenProduccion.updateMany({
          where: { id, estado: 'solicitada' },
          data: { estado: 'rechazada', motivoRechazo: result.data.motivoRechazo ?? null, aprobadoPor: req.depositoUser!.id },
        })
        if (transition.count !== 1) throw new Error('HTTP_409: La orden ya fue procesada')
        return tx.ordenProduccion.findUnique({
          where: { id },
          include: {
            solicitante: { select: { id: true, name: true, role: true } },
            aprobador: { select: { id: true, name: true } },
          },
        })
      })
      if (!updated) throw new Error('HTTP_404: Orden no encontrada')

      sseManager.broadcastToUser(
        {
          tipo: 'orden_actualizada',
          mensaje: `Tu orden de ${updated.productoNombre} fue rechazada`,
          datos: { ordenId: updated.id, producto: updated.productoNombre, estado: 'rechazada', motivo: updated.motivoRechazo },
          timestamp: new Date().toISOString(),
        },
        updated.solicitanteId
      )
      eventBus.emit({
        app: 'deposito',
        tipo: 'orden_actualizada',
        titulo: 'Orden rechazada',
        mensaje: `Orden de ${updated.productoNombre} rechazada`,
        userId: updated.solicitanteId,
        link: `/deposito/ordenes/${updated.id}`,
        timestamp: new Date().toISOString(),
      })

      res.json(updated)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.startsWith('HTTP_404: ')) res.status(404).json({ message: message.slice(10) })
      else if (message.startsWith('HTTP_409: ')) res.status(409).json({ message: message.slice(10) })
      else res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// ─── PUT /api/ordenes/:id/completar — de ejecutada a completada ──────────────

router.put(
  '/:id/completar',
  authenticate,
  requirePermission('deposito', 'ordenes.complete'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    try {
      const orden = await prisma.ordenProduccion.findUnique({ where: { id } })
      if (!orden) {
        res.status(404).json({ message: 'Orden no encontrada' })
        return
      }
      if (orden.estado !== 'ejecutada') {
        res.status(409).json({ message: `Solo se pueden completar órdenes ejecutadas (estado actual: "${orden.estado}")` })
        return
      }

      const updated = await prisma.ordenProduccion.update({
        where: { id },
        data: { estado: 'completada' },
        include: {
          solicitante: { select: { id: true, name: true, role: true } },
          aprobador: { select: { id: true, name: true } },
        },
      })

      sseManager.broadcastToUser(
        {
          tipo: 'orden_actualizada',
          mensaje: `Tu orden de ${updated.productoNombre} fue marcada como completada`,
          datos: { ordenId: updated.id, producto: updated.productoNombre, estado: 'completada' },
          timestamp: new Date().toISOString(),
        },
        updated.solicitanteId
      )
      eventBus.emit({
        app: 'deposito',
        tipo: 'orden_actualizada',
        titulo: 'Orden completada',
        mensaje: `Orden de ${updated.productoNombre} completada`,
        userId: updated.solicitanteId,
        link: `/deposito/ordenes/${updated.id}`,
        timestamp: new Date().toISOString(),
      })

      res.json(updated)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

export default router
