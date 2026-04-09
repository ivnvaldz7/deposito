import { Router, Response } from 'express'
import { z } from 'zod'
import { Mercado } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { requireRole } from '../middleware/require-role'
import { sseManager, STOCK_BAJO_THRESHOLD, STOCK_BAJO_FRASCOS_THRESHOLD } from '../lib/sse-manager'

const router = Router()

const MERCADOS = Object.values(Mercado) as [Mercado, ...Mercado[]]

// ─── Schemas ──────────────────────────────────────────────────────────────────

const crearOrdenSchema = z.object({
  categoria: z.enum(['droga', 'estuche', 'etiqueta', 'frasco']),
  productoNombre: z.string().min(2).max(200),
  mercado: z.enum(MERCADOS).optional(),
  cantidad: z.number().int().positive(),
  urgencia: z.enum(['normal', 'urgente']).default('normal'),
})

const rechazarSchema = z.object({
  motivoRechazo: z.string().min(5).max(500),
})

// Estados finales que no permiten más transiciones
const ESTADOS_FINALES = ['completada', 'rechazada'] as const

// Helper: verifica si el stock bajó del threshold después de un egreso
async function checkStockBajo(
  categoria: string,
  productoNombre: string,
  mercado: Mercado | null
): Promise<number | null> {
  try {
    if (categoria === 'droga') {
      // Sumar total de todos los lotes del producto
      const agg = await prisma.inventarioDroga.aggregate({
        where: { nombre: productoNombre },
        _sum: { cantidad: true },
      })
      const total = agg._sum.cantidad ?? 0
      if (total < STOCK_BAJO_THRESHOLD) return total
    } else if (categoria === 'estuche' && mercado) {
      const e = await prisma.inventarioEstuche.findUnique({
        where: { articulo_mercado: { articulo: productoNombre, mercado } },
      })
      if (e && e.cantidad < STOCK_BAJO_THRESHOLD) return e.cantidad
    } else if (categoria === 'etiqueta' && mercado) {
      const e = await prisma.inventarioEtiqueta.findUnique({
        where: { articulo_mercado: { articulo: productoNombre, mercado } },
      })
      if (e && e.cantidad < STOCK_BAJO_THRESHOLD) return e.cantidad
    } else if (categoria === 'frasco') {
      const f = await prisma.inventarioFrasco.findUnique({ where: { articulo: productoNombre } })
      if (f && f.cantidadCajas < STOCK_BAJO_FRASCOS_THRESHOLD) return f.cantidadCajas
    }
  } catch { /* no crítico */ }
  return null
}

// ─── POST /api/ordenes — crear (solicitante o encargado) ─────────────────────

router.post(
  '/',
  authenticate,
  requireRole('solicitante', 'encargado'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const result = crearOrdenSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { categoria, productoNombre, mercado, cantidad, urgencia } = result.data

    if ((categoria === 'estuche' || categoria === 'etiqueta') && !mercado) {
      res.status(400).json({ message: 'El campo mercado es obligatorio para estuches y etiquetas' })
      return
    }

    try {
      const orden = await prisma.ordenProduccion.create({
        data: {
          solicitanteId: req.user!.id,
          categoria,
          productoNombre,
          mercado: mercado ?? null,
          cantidad,
          urgencia,
        },
        include: {
          solicitante: { select: { id: true, name: true, role: true } },
          aprobador: { select: { id: true, name: true } },
        },
      })

      sseManager.broadcastToRoles(
        {
          tipo: 'orden_creada',
          mensaje: `Nueva orden${urgencia === 'urgente' ? ' URGENTE' : ''}: ${productoNombre} (×${cantidad}) — ${req.user!.name}`,
          datos: {
            ordenId: orden.id,
            producto: productoNombre,
            cantidad,
            urgencia,
            solicitante: req.user!.name,
          },
          timestamp: new Date().toISOString(),
        },
        ['encargado']
      )

      res.status(201).json(orden)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// ─── GET /api/ordenes — listar (auth) ────────────────────────────────────────

router.get(
  '/',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { estado } = req.query

    const estadoFilter = typeof estado === 'string' ? estado : undefined

    // Solicitante solo ve sus propias órdenes
    const roleFilter =
      req.user?.role === 'solicitante'
        ? { solicitanteId: req.user.id }
        : {}

    const estadoWhere = estadoFilter ? { estado: estadoFilter as never } : {}

    try {
      const ordenes = await prisma.ordenProduccion.findMany({
        where: { ...roleFilter, ...estadoWhere },
        orderBy: [{ urgencia: 'desc' }, { createdAt: 'desc' }],
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
  async (req: AuthRequest, res: Response): Promise<void> => {
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
      if (req.user?.role === 'solicitante' && orden.solicitanteId !== req.user.id) {
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

router.put(
  '/:id/aprobar',
  authenticate,
  requireRole('encargado'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    try {
      const orden = await prisma.ordenProduccion.findUnique({ where: { id } })
      if (!orden) {
        res.status(404).json({ message: 'Orden no encontrada' })
        return
      }
      if ((ESTADOS_FINALES as readonly string[]).includes(orden.estado)) {
        res.status(409).json({ message: `No se puede aprobar una orden en estado "${orden.estado}"` })
        return
      }
      if (orden.estado !== 'solicitada') {
        res.status(409).json({ message: `La orden ya está en estado "${orden.estado}"` })
        return
      }

      const updated = await prisma.ordenProduccion.update({
        where: { id },
        data: { estado: 'aprobada', aprobadoPor: req.user!.id },
        include: {
          solicitante: { select: { id: true, name: true, role: true } },
          aprobador: { select: { id: true, name: true } },
        },
      })

      sseManager.broadcastToUser(
        {
          tipo: 'orden_actualizada',
          mensaje: `Tu orden de ${updated.productoNombre} fue aprobada`,
          datos: { ordenId: updated.id, producto: updated.productoNombre, estado: 'aprobada', aprobadoPor: req.user!.name },
          timestamp: new Date().toISOString(),
        },
        updated.solicitanteId
      )

      res.json(updated)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// ─── PUT /api/ordenes/:id/ejecutar — descuenta inventario, crea movimiento ───

router.put(
  '/:id/ejecutar',
  authenticate,
  requireRole('encargado'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    try {
      const orden = await prisma.ordenProduccion.findUnique({ where: { id } })
      if (!orden) {
        res.status(404).json({ message: 'Orden no encontrada' })
        return
      }
      if ((ESTADOS_FINALES as readonly string[]).includes(orden.estado)) {
        res.status(409).json({ message: `No se puede ejecutar una orden en estado "${orden.estado}"` })
        return
      }
      if (orden.estado !== 'aprobada') {
        res.status(409).json({ message: 'La orden debe estar aprobada antes de ejecutarse' })
        return
      }

      const updated = await prisma.$transaction(async (tx) => {
        const { categoria, productoNombre, mercado, cantidad } = orden

        if (categoria === 'droga') {
          // FIFO: descontar empezando por el lote con vencimiento más próximo
          const lotes = await tx.inventarioDroga.findMany({
            where: { nombre: productoNombre, cantidad: { gt: 0 } },
          })

          // Ordenar en app: vencimiento no-null ASC primero, luego null (sin vencimiento)
          const sorted = [...lotes].sort((a, b) => {
            if (!a.vencimiento && !b.vencimiento) return 0
            if (!a.vencimiento) return 1
            if (!b.vencimiento) return -1
            return new Date(a.vencimiento).getTime() - new Date(b.vencimiento).getTime()
          })

          const totalDisponible = sorted.reduce((s, l) => s + l.cantidad, 0)
          if (totalDisponible < cantidad) {
            throw new Error(`Stock insuficiente de "${productoNombre}" (disponible: ${totalDisponible})`)
          }

          let restante = cantidad
          const lotesMov: { lote: string | null; decrementado: number }[] = []
          for (const lote of sorted) {
            if (restante <= 0) break
            const tomar = Math.min(lote.cantidad, restante)
            await tx.inventarioDroga.update({
              where: { id: lote.id },
              data: { cantidad: { decrement: tomar } },
            })
            lotesMov.push({ lote: lote.lote, decrementado: tomar })
            restante -= tomar
          }

          // Crear un movimiento por lote usado
          for (const { lote: loteUsado, decrementado } of lotesMov) {
            await tx.movimiento.create({
              data: {
                tipo: 'egreso_orden',
                categoria,
                productoNombre,
                lote: loteUsado,
                cantidad: -decrementado,
                referenciaId: orden.id,
                referenciaTipo: 'orden',
                createdBy: req.user!.id,
              },
            })
          }
        } else if (categoria === 'estuche') {
          if (!mercado) throw new Error('El campo mercado es obligatorio para estuches')
          const estuche = await tx.inventarioEstuche.findUnique({
            where: { articulo_mercado: { articulo: productoNombre, mercado } },
          })
          if (!estuche) throw new Error('Producto no encontrado en inventario de estuches')
          if (estuche.cantidad < cantidad) throw new Error(`Stock insuficiente (disponible: ${estuche.cantidad})`)
          await tx.inventarioEstuche.update({
            where: { articulo_mercado: { articulo: productoNombre, mercado } },
            data: { cantidad: { decrement: cantidad } },
          })
        } else if (categoria === 'etiqueta') {
          if (!mercado) throw new Error('El campo mercado es obligatorio para etiquetas')
          const etiqueta = await tx.inventarioEtiqueta.findUnique({
            where: { articulo_mercado: { articulo: productoNombre, mercado } },
          })
          if (!etiqueta) throw new Error('Producto no encontrado en inventario de etiquetas')
          if (etiqueta.cantidad < cantidad) throw new Error(`Stock insuficiente (disponible: ${etiqueta.cantidad})`)
          await tx.inventarioEtiqueta.update({
            where: { articulo_mercado: { articulo: productoNombre, mercado } },
            data: { cantidad: { decrement: cantidad } },
          })
        } else if (categoria === 'frasco') {
          const frasco = await tx.inventarioFrasco.findUnique({ where: { articulo: productoNombre } })
          if (!frasco) throw new Error('Producto no encontrado en inventario de frascos')
          if (frasco.cantidadCajas < cantidad) throw new Error(`Stock insuficiente (disponible: ${frasco.cantidadCajas} cajas)`)
          const nuevasCajas = frasco.cantidadCajas - cantidad
          await tx.inventarioFrasco.update({
            where: { articulo: productoNombre },
            data: { cantidadCajas: nuevasCajas, total: nuevasCajas * frasco.unidadesPorCaja },
          })
        }

        // Movimiento de auditoría para categorías no-droga (drogas crean movimientos en el loop FIFO)
        if (categoria !== 'droga') {
          await tx.movimiento.create({
            data: {
              tipo: 'egreso_orden',
              categoria,
              productoNombre,
              cantidad: -cantidad,
              referenciaId: orden.id,
              referenciaTipo: 'orden',
              createdBy: req.user!.id,
            },
          })
        }

        return tx.ordenProduccion.update({
          where: { id },
          data: { estado: 'ejecutada' },
          include: {
            solicitante: { select: { id: true, name: true, role: true } },
            aprobador: { select: { id: true, name: true } },
          },
        })
      })

      const ts = new Date().toISOString()

      sseManager.broadcastGlobal({
        tipo: 'stock_actualizado',
        mensaje: `Stock de ${orden.productoNombre} actualizado (−${orden.cantidad})`,
        datos: { producto: orden.productoNombre, categoria: orden.categoria, cantidad: orden.cantidad, tipo: 'egreso' },
        timestamp: ts,
      })

      sseManager.broadcastToUser(
        {
          tipo: 'orden_actualizada',
          mensaje: `Tu orden de ${orden.productoNombre} fue ejecutada`,
          datos: { ordenId: updated.id, producto: orden.productoNombre, estado: 'ejecutada' },
          timestamp: ts,
        },
        updated.solicitanteId
      )

      const nuevoStock = await checkStockBajo(orden.categoria, orden.productoNombre, orden.mercado)
      if (nuevoStock !== null) {
        sseManager.broadcastGlobal({
          tipo: 'stock_bajo',
          mensaje: `Stock bajo: ${orden.productoNombre} (${nuevoStock} restantes)`,
          datos: { producto: orden.productoNombre, categoria: orden.categoria, cantidad: nuevoStock },
          timestamp: ts,
        })
      }

      res.json(updated)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error interno del servidor'
      res.status(400).json({ message: msg })
    }
  }
)

// ─── PUT /api/ordenes/:id/rechazar — solo encargado, requiere motivo ──────────

router.put(
  '/:id/rechazar',
  authenticate,
  requireRole('encargado'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    const result = rechazarSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'El motivo de rechazo es obligatorio (mínimo 5 caracteres)' })
      return
    }

    try {
      const orden = await prisma.ordenProduccion.findUnique({ where: { id } })
      if (!orden) {
        res.status(404).json({ message: 'Orden no encontrada' })
        return
      }
      if (orden.estado !== 'solicitada' && orden.estado !== 'aprobada') {
        res.status(400).json({ message: 'No se puede rechazar una orden ya ejecutada' })
        return
      }

      const updated = await prisma.ordenProduccion.update({
        where: { id },
        data: {
          estado: 'rechazada',
          motivoRechazo: result.data.motivoRechazo,
          aprobadoPor: req.user!.id,
        },
        include: {
          solicitante: { select: { id: true, name: true, role: true } },
          aprobador: { select: { id: true, name: true } },
        },
      })

      sseManager.broadcastToUser(
        {
          tipo: 'orden_actualizada',
          mensaje: `Tu orden de ${updated.productoNombre} fue rechazada`,
          datos: { ordenId: updated.id, producto: updated.productoNombre, estado: 'rechazada', motivo: updated.motivoRechazo },
          timestamp: new Date().toISOString(),
        },
        updated.solicitanteId
      )

      res.json(updated)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// ─── PUT /api/ordenes/:id/completar — de ejecutada a completada ──────────────

router.put(
  '/:id/completar',
  authenticate,
  requireRole('encargado'),
  async (req: AuthRequest, res: Response): Promise<void> => {
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

      res.json(updated)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

export default router
