import { Request,  Router, Response  } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { Mercado, Prisma } from '@platform/db'
import { extractDbConstraintViolation, isKnownInventoryConflict } from '../../utils/db-errors'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../../middlewares/require-permission'
import { sseManager } from '../lib/sse-manager'
import { isStockBajo } from '../lib/stock-status'
import { eventBus } from '@platform/core'
import { resolveUniqueFrascoCandidate } from './shared/frasco-inventory-resolution'
import { descontarStockOrden, OrdenStockError } from '../services/orden-stock-service'
import { syncDepositoStockSheetsAfterCommit } from '../services/stock-sheets-projection'

const router = Router()

const MERCADOS = Object.values(Mercado) as [Mercado, ...Mercado[]]
const ESTADOS_ARCHIVABLES = ['aprobada', 'rechazada'] as const
const DIAS_VISIBLES_ORDEN_CONFIRMADA = 7
const ORDEN_QUANTITY_PRECISION = 1e-9

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

const agregarItemsSchema = z.object({ items: z.array(ordenItemSchema).min(1).max(30) })

const actualizarCantidadSchema = z.object({ cantidad: z.number().finite().positive() })

const aprobarOrdenSchema = z.object({
  loteIdPreferido: z.string().uuid().optional(),
}).optional().transform((data) => data ?? {})

const rechazarSchema = z.object({ motivoRechazo: z.string().trim().max(500).optional() }).optional().transform((data) => data ?? {})

function isSolicitante(req: Request): boolean {
  return req.user?.apps.deposito?.rol === 'solicitante'
}

function validarItems(items: Array<z.infer<typeof ordenItemSchema>>): string | null {
  const seen = new Set<string>()
  for (const item of items) {
    if ((item.categoria === 'estuche' || item.categoria === 'etiqueta') && !item.mercado) {
      return 'El campo mercado es obligatorio para estuches y etiquetas'
    }
    if ((item.categoria === 'droga' || item.categoria === 'frasco') && item.mercado) {
      return 'El mercado solo aplica a estuches y etiquetas'
    }
    const duplicateKey = `${item.productoId}:${item.mercado ?? ''}`
    if (seen.has(duplicateKey)) return 'No repitas el mismo producto dentro de una solicitud'
    seen.add(duplicateKey)
  }
  return null
}

function asegurarOrdenEditable(
  orden: { solicitanteId: string; estado: string; cantidadEntregada?: number | null },
  solicitanteId: string,
): void {
  if (orden.solicitanteId !== solicitanteId) throw new Error('HTTP_403: Solo quien creó la solicitud puede modificarla')
  if (orden.estado !== 'solicitada' || (orden.cantidadEntregada ?? 0) > 0) {
    throw new Error('HTTP_409: Solo se pueden modificar productos pendientes sin entrega')
  }
}

function responderErrorEdicion(error: unknown, res: Response): void {
  const message = error instanceof Error ? error.message : ''
  if (message.startsWith('HTTP_403: ')) res.status(403).json({ message: message.slice(10) })
  else if (message.startsWith('HTTP_404: ')) res.status(404).json({ message: message.slice(10) })
  else if (message.startsWith('HTTP_409: ')) res.status(409).json({ message: message.slice(10) })
  else res.status(500).json({ message: 'Error interno del servidor' })
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
    const validationError = validarItems(items)
    if (validationError) {
      res.status(400).json({ message: validationError })
      return
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

// ─── POST /api/ordenes/:id/items — agregar líneas a una solicitud pendiente ──

router.post(
  '/:id/items',
  authenticate,
  requirePermission('deposito', 'ordenes.create'),
  async (req: Request, res: Response): Promise<void> => {
    const result = agregarItemsSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }
    const validationError = validarItems(result.data.items)
    if (validationError) {
      res.status(400).json({ message: validationError })
      return
    }

    const products = await Promise.all(result.data.items.map((item) => prisma.depositoProducto.findUnique({ where: { id: item.productoId } })))
    for (let index = 0; index < result.data.items.length; index += 1) {
      const product = products[index]
      if (!product || !product.activo || product.categoria !== result.data.items[index]!.categoria) {
        res.status(400).json({ message: 'Elegí productos activos de la categoría correspondiente' })
        return
      }
    }

    const id = req.params['id'] as string
    try {
      const added = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM deposito.ordenes_produccion WHERE id = ${id} FOR UPDATE`
        const base = await tx.ordenProduccion.findUnique({ where: { id } })
        if (!base) throw new Error('HTTP_404: Orden no encontrada')
        asegurarOrdenEditable(base, req.depositoUser!.id)

        const grupoId = base.grupoId ?? randomUUID()
        if (!base.grupoId) await tx.ordenProduccion.update({ where: { id }, data: { grupoId } })
        const existentes = await tx.ordenProduccion.findMany({ where: { grupoId } })
        const existingKeys = new Set(existentes.map((orden) => `${orden.productoId}:${orden.mercado ?? ''}`))
        for (const item of result.data.items) {
          const key = `${item.productoId}:${item.mercado ?? ''}`
          if (existingKeys.has(key)) throw new Error('HTTP_409: Ese producto ya está incluido en la solicitud')
          existingKeys.add(key)
        }

        const ordenes = []
        for (const [index, item] of result.data.items.entries()) {
          ordenes.push(await tx.ordenProduccion.create({
            data: {
              solicitanteId: base.solicitanteId,
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
        return { grupoId, ordenes }
      })
      res.status(201).json(added)
    } catch (error) {
      responderErrorEdicion(error, res)
    }
  },
)

// ─── PATCH /api/ordenes/:id — corregir cantidad antes de una entrega ─────────

router.patch(
  '/:id',
  authenticate,
  requirePermission('deposito', 'ordenes.create'),
  async (req: Request, res: Response): Promise<void> => {
    const result = actualizarCantidadSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Cantidad inválida' })
      return
    }
    const id = req.params['id'] as string
    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM deposito.ordenes_produccion WHERE id = ${id} FOR UPDATE`
        const orden = await tx.ordenProduccion.findUnique({ where: { id } })
        if (!orden) throw new Error('HTTP_404: Orden no encontrada')
        asegurarOrdenEditable(orden, req.depositoUser!.id)
        if (orden.categoria !== 'droga' && !Number.isInteger(result.data.cantidad)) {
          throw new Error('HTTP_409: La cantidad debe ser entera para materiales de empaque')
        }
        return tx.ordenProduccion.update({
          where: { id },
          data: { cantidad: result.data.cantidad },
          include: {
            solicitante: { select: { id: true, name: true, role: true } },
            aprobador: { select: { id: true, name: true } },
          },
        })
      })
      res.json(updated)
    } catch (error) {
      responderErrorEdicion(error, res)
    }
  },
)

// ─── DELETE /api/ordenes/:id — quitar línea pendiente sin entrega ────────────

router.delete(
  '/:id',
  authenticate,
  requirePermission('deposito', 'ordenes.create'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM deposito.ordenes_produccion WHERE id = ${id} FOR UPDATE`
        const orden = await tx.ordenProduccion.findUnique({ where: { id } })
        if (!orden) throw new Error('HTTP_404: Orden no encontrada')
        asegurarOrdenEditable(orden, req.depositoUser!.id)
        await tx.ordenProduccion.delete({ where: { id } })
      })
      res.status(204).send()
    } catch (error) {
      responderErrorEdicion(error, res)
    }
  },
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
  '/:id/lotes-disponibles',
  authenticate,
  requirePermission('deposito', 'ordenes.read'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    try {
      const orden = await prisma.ordenProduccion.findUnique({ where: { id } })
      if (!orden) {
        res.status(404).json({ message: 'Orden no encontrada' })
        return
      }
      if (isSolicitante(req) && orden.solicitanteId !== req.depositoUser!.id) {
        res.status(403).json({ message: 'No autorizado' })
        return
      }
      if (orden.categoria !== 'droga') {
        res.json([])
        return
      }

      const where = orden.productoId
        ? Prisma.sql`producto_id = ${orden.productoId}`
        : Prisma.sql`nombre = ${orden.productoNombre}`
      const lotes = await prisma.$queryRaw<Array<{ id: string; lote: string | null; vencimiento: Date | null; cantidad: number }>>(Prisma.sql`
        SELECT id, lote, vencimiento, cantidad
        FROM deposito.inventario_drogas
        WHERE ${where} AND cantidad > 0
        ORDER BY CASE WHEN lote = 'APERTURA-SIN-LOTE' THEN 1 ELSE 0 END, CASE WHEN vencimiento IS NULL THEN 1 ELSE 0 END, vencimiento ASC, id ASC
      `)
      res.json(lotes)
    } catch {
      res.status(500).json({ message: 'No se pudieron cargar los lotes disponibles' })
    }
  },
)

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
    const body = aprobarOrdenSchema.safeParse(req.body)
    if (!body.success) {
      res.status(400).json({ message: 'Lote seleccionado inválido' })
      return
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM deposito.ordenes_produccion WHERE id = ${id} FOR UPDATE`
        const orden = await tx.ordenProduccion.findUnique({ where: { id } })
        if (!orden) throw new Error('HTTP_404: Orden no encontrada')
        if (orden.estado !== 'solicitada') throw new Error(`HTTP_409: La orden ya está en estado "${orden.estado}"`)

        const cantidadEntregadaAnterior = orden.cantidadEntregada ?? 0
        const pendienteAnterior = Math.max(0, orden.cantidad - cantidadEntregadaAnterior)
        const { cantidadDescontada } = await descontarStockOrden(
          tx,
          { ...orden, cantidad: pendienteAnterior, loteIdPreferido: body.data.loteIdPreferido },
          req.depositoUser!.id,
        )
        const cantidadEntregada = Number((cantidadEntregadaAnterior + cantidadDescontada).toFixed(9))
        const pendiente = Math.max(0, Number((orden.cantidad - cantidadEntregada).toFixed(9)))
        const completamenteEntregada = pendiente <= ORDEN_QUANTITY_PRECISION
        const transition = await tx.ordenProduccion.updateMany({
          where: { id, estado: 'solicitada' },
          data: {
            estado: completamenteEntregada ? 'aprobada' : 'solicitada',
            cantidadEntregada,
            ...(cantidadDescontada > 0 ? { aprobadoPor: req.depositoUser!.id } : {}),
          },
        })
        if (transition.count !== 1) throw new Error('HTTP_409: La orden ya fue procesada')
        const ordenActualizada = await tx.ordenProduccion.findUnique({
          where: { id },
          include: {
            solicitante: { select: { id: true, name: true, role: true } },
            aprobador: { select: { id: true, name: true } },
          },
        })
        return { orden: ordenActualizada, cantidadDescontada, cantidadEntregada, pendiente }
      })
      if (!updated.orden) throw new Error('HTTP_404: Orden no encontrada')

      if (updated.cantidadDescontada > 0 && (updated.orden.categoria === 'estuche' || updated.orden.categoria === 'etiqueta' || updated.orden.categoria === 'frasco')) {
        void syncDepositoStockSheetsAfterCommit()
      }

      const timestamp = new Date().toISOString()
      sseManager.broadcastGlobal({
        tipo: 'stock_actualizado',
        mensaje: updated.cantidadDescontada > 0
          ? `Stock de ${updated.orden.productoNombre} actualizado (−${updated.cantidadDescontada})`
          : `Sin stock disponible: ${updated.orden.productoNombre}`,
        datos: { producto: updated.orden.productoNombre, productoId: updated.orden.productoId, categoria: updated.orden.categoria, mercado: updated.orden.mercado, cantidad: -updated.cantidadDescontada, tipo: 'egreso', entregada: updated.cantidadEntregada, pendiente: updated.pendiente },
        timestamp,
      })
      eventBus.emit({
        app: 'deposito',
        tipo: 'stock_actualizado',
        titulo: 'Stock actualizado',
        mensaje: updated.cantidadDescontada > 0
          ? `Stock de ${updated.orden.productoNombre} actualizado (−${updated.cantidadDescontada})`
          : `Sin stock disponible: ${updated.orden.productoNombre}`,
        timestamp,
      })
      const stockBajo = updated.cantidadDescontada > 0
        ? await checkStockBajo(updated.orden.categoria, updated.orden.productoNombre, updated.orden.mercado, updated.orden.productoId)
        : null
      if (stockBajo !== null) {
        sseManager.broadcastGlobal({
          tipo: 'stock_bajo',
          mensaje: `Stock bajo: ${updated.orden.productoNombre} (${stockBajo} restantes)`,
          datos: { producto: updated.orden.productoNombre, categoria: updated.orden.categoria, cantidad: stockBajo },
          timestamp,
        })
        eventBus.emit({
          app: 'deposito',
          tipo: 'stock_bajo',
          titulo: 'Stock bajo',
          mensaje: `Stock bajo: ${updated.orden.productoNombre} (${stockBajo} restantes)`,
          link: '/deposito/drogas',
          timestamp,
        })
      }

      sseManager.broadcastToUser(
        {
          tipo: 'orden_actualizada',
          mensaje: updated.pendiente > 0
            ? `Tu orden de ${updated.orden.productoNombre} recibió una entrega parcial; quedan ${updated.pendiente}`
            : `Tu orden de ${updated.orden.productoNombre} fue aprobada`,
          datos: { ordenId: updated.orden.id, producto: updated.orden.productoNombre, estado: updated.orden.estado, aprobadoPor: req.depositoUser!.name, entregada: updated.cantidadEntregada, pendiente: updated.pendiente },
          timestamp: new Date().toISOString(),
        },
        updated.orden.solicitanteId
      )
      eventBus.emit({
        app: 'deposito',
        tipo: 'orden_actualizada',
        titulo: updated.pendiente > 0 ? 'Entrega parcial de orden' : 'Orden aprobada',
        mensaje: updated.pendiente > 0
          ? `Orden de ${updated.orden.productoNombre}: entregado ${updated.cantidadEntregada}, pendiente ${updated.pendiente}`
          : `Orden de ${updated.orden.productoNombre} aprobada`,
        userId: updated.orden.solicitanteId,
        link: `/deposito/ordenes/${updated.orden.id}`,
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
