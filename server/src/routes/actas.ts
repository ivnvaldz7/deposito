import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { CondicionEmbalaje, Mercado } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { requireRole } from '../middleware/require-role'
import { sseManager } from '../lib/sse-manager'
import { generarLote } from '../lib/lote-generator'

const router = Router()

// ─── Schemas ──────────────────────────────────────────────────────────────────

const crearActaSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  notas: z.string().max(500).optional(),
})

const MERCADOS = Object.values(Mercado) as [Mercado, ...Mercado[]]
const CONDICIONES_EMBALAJE = Object.values(CondicionEmbalaje) as [
  CondicionEmbalaje,
  ...CondicionEmbalaje[],
]

const agregarItemSchema = z
  .object({
    categoria: z.enum(['droga', 'estuche', 'etiqueta', 'frasco']),
    productoNombre: z.string().min(2).max(100),
    lote: z.string().trim().max(50).optional(),
    vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    temperaturaTransporte: z.string().trim().max(50).optional(),
    condicionEmbalaje: z.enum(CONDICIONES_EMBALAJE).optional(),
    observacionesCalidad: z.string().trim().max(1000).optional(),
    aprobadoCalidad: z.boolean().optional(),
    cantidadIngresada: z.number().int().positive(),
    mercado: z.enum(MERCADOS).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.categoria === 'droga' && !data.lote?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El lote es obligatorio para drogas',
        path: ['lote'],
      })
    }
  })

const distribuirSchema = z.object({
  cantidad: z.number().int().positive(),
  loteId: z.string().uuid().optional(),       // override FIFO manual — id of InventarioDroga record
  justificacion: z.string().max(300).optional(), // requerido cuando se usa override
})

// ─── GET /api/actas — listar (auth) ──────────────────────────────────────────

router.get('/', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const actas = await prisma.acta.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true } },
        _count: { select: { items: true } },
        items: {
          select: {
            lote: true,
            productoNombre: true,
            temperaturaTransporte: true,
            condicionEmbalaje: true,
            observacionesCalidad: true,
            aprobadoCalidad: true,
          },
          orderBy: { createdAt: 'asc' as const },
        },
      },
    })
    res.json(actas)
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// ─── POST /api/actas — crear (encargado) ─────────────────────────────────────

router.post(
  '/',
  authenticate,
  requireRole('encargado'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const result = crearActaSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { fecha, notas } = result.data

    try {
      const acta = await prisma.acta.create({
        data: {
          fecha: new Date(fecha + 'T00:00:00.000Z'),
          notas: notas ?? null,
          createdBy: req.user!.id,
        },
      })

      sseManager.broadcastGlobal({
        tipo: 'ingreso_creado',
        mensaje: `Nuevo acta de ingreso creada por ${req.user!.name}`,
        datos: { actaId: acta.id, fecha, createdBy: req.user!.name },
        timestamp: new Date().toISOString(),
      })

      res.status(201).json(acta)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// ─── GET /api/actas/:id — detalle (auth) ─────────────────────────────────────

router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string

  try {
    const acta = await prisma.acta.findUnique({
      where: { id },
      include: {
        user: { select: { name: true } },
        items: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!acta) {
      res.status(404).json({ message: 'Acta no encontrada' })
      return
    }

    res.json(acta)
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// ─── POST /api/actas/:id/items — agregar item (encargado) ────────────────────

router.post(
  '/:id/items',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const actaId = req.params['id'] as string

    const result = agregarItemSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { categoria, mercado } = result.data
    if ((categoria === 'estuche' || categoria === 'etiqueta') && !mercado) {
      res.status(400).json({ message: 'El campo mercado es obligatorio para estuches y etiquetas' })
      return
    }

    try {
      const actaExists = await prisma.acta.findUnique({ where: { id: actaId } })
      if (!actaExists) {
        res.status(404).json({ message: 'Acta no encontrada' })
        return
      }

      // Drogas: lote manual obligatorio. Resto: autogenerado, ignorar lo que venga del frontend.
      const lote =
        categoria === 'droga'
          ? result.data.lote!.trim()
          : await generarLote(categoria)

      const item = await prisma.actaItem.create({
        data: {
          actaId,
          categoria: result.data.categoria,
          productoNombre: result.data.productoNombre,
          lote,
          vencimiento: result.data.vencimiento
            ? new Date(result.data.vencimiento + 'T00:00:00.000Z')
            : null,
          temperaturaTransporte: result.data.temperaturaTransporte?.trim() || null,
          condicionEmbalaje: result.data.condicionEmbalaje ?? null,
          observacionesCalidad: result.data.observacionesCalidad?.trim() || null,
          aprobadoCalidad: result.data.aprobadoCalidad ?? false,
          cantidadIngresada: result.data.cantidadIngresada,
          mercado: result.data.mercado ?? null,
        },
      })
      res.status(201).json(item)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// ─── POST /api/actas/:id/items/:itemId/distribuir (encargado) ────────────────

router.post(
  '/:id/items/:itemId/distribuir',
  authenticate,
  requireRole('encargado'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const actaId = req.params['id'] as string
    const itemId = req.params['itemId'] as string

    const result = distribuirSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { cantidad } = result.data

    try {
      const { item: updatedItem, acta: updatedActa } = await prisma.$transaction(async (tx) => {
        // 1. Fetch item y validar que pertenece al acta
        const item = await tx.actaItem.findUnique({ where: { id: itemId } })
        if (!item || item.actaId !== actaId) {
          throw new Error('Item no encontrado')
        }

        const restante = item.cantidadIngresada - item.cantidadDistribuida
        if (cantidad > restante) {
          throw new Error(`Cantidad excede lo disponible (restante: ${restante})`)
        }

        // 2. Actualizar inventario según categoría
        if (item.categoria === 'droga') {
          // Upsert en inventario usando (nombre, lote) como clave
          await tx.inventarioDroga.upsert({
            where: { nombre_lote: { nombre: item.productoNombre, lote: item.lote } },
            update: {
              cantidad: { increment: cantidad },
              // Actualizar vencimiento si aún no tenía uno
              ...(item.vencimiento ? { vencimiento: item.vencimiento } : {}),
            },
            create: {
              nombre: item.productoNombre,
              lote: item.lote,
              vencimiento: item.vencimiento,
              cantidad,
            },
          })
        } else if (item.categoria === 'estuche') {
          if (!item.mercado) {
            throw new Error('El item no tiene mercado asignado')
          }
          const existing = await tx.inventarioEstuche.findUnique({
            where: { articulo_mercado: { articulo: item.productoNombre, mercado: item.mercado } },
          })
          if (!existing) {
            throw new Error('Producto no encontrado en inventario de estuche')
          }
          await tx.inventarioEstuche.update({
            where: { articulo_mercado: { articulo: item.productoNombre, mercado: item.mercado } },
            data: { cantidad: { increment: cantidad } },
          })
        } else if (item.categoria === 'etiqueta') {
          if (!item.mercado) {
            throw new Error('El item no tiene mercado asignado')
          }
          const existing = await tx.inventarioEtiqueta.findUnique({
            where: { articulo_mercado: { articulo: item.productoNombre, mercado: item.mercado } },
          })
          if (!existing) {
            throw new Error('Producto no encontrado en inventario de etiqueta')
          }
          await tx.inventarioEtiqueta.update({
            where: { articulo_mercado: { articulo: item.productoNombre, mercado: item.mercado } },
            data: { cantidad: { increment: cantidad } },
          })
        } else if (item.categoria === 'frasco') {
          const frasco = await tx.inventarioFrasco.findUnique({
            where: { articulo: item.productoNombre },
          })
          if (!frasco) {
            throw new Error('Producto no encontrado en inventario de frasco')
          }
          const nuevasCajas = frasco.cantidadCajas + cantidad
          await tx.inventarioFrasco.update({
            where: { articulo: item.productoNombre },
            data: { cantidadCajas: nuevasCajas, total: nuevasCajas * frasco.unidadesPorCaja },
          })
        }

        // 3. Crear movimiento de auditoría
        await tx.movimiento.create({
          data: {
            tipo: 'ingreso_acta',
            categoria: item.categoria,
            productoNombre: item.productoNombre,
            lote: item.categoria === 'droga' ? item.lote : null,
            cantidad,
            referenciaId: itemId,
            referenciaTipo: 'acta_item',
            createdBy: req.user!.id,
          },
        })

        // 4. Actualizar cantidadDistribuida del item
        const item2 = await tx.actaItem.update({
          where: { id: itemId },
          data: { cantidadDistribuida: { increment: cantidad } },
        })

        // 5. Recalcular estado del acta
        const todosItems = await tx.actaItem.findMany({ where: { actaId } })

        const todosCompletos = todosItems.every(
          (i) => i.cantidadDistribuida >= i.cantidadIngresada
        )
        const hayDistribucion = todosItems.some((i) => i.cantidadDistribuida > 0)

        const nuevoEstado = todosCompletos
          ? ('completada' as const)
          : hayDistribucion
          ? ('parcial' as const)
          : ('pendiente' as const)

        const acta2 = await tx.acta.update({
          where: { id: actaId },
          data: { estado: nuevoEstado },
        })

        return { item: item2, acta: acta2 }
      })

      // Emitir stock_actualizado globalmente
      sseManager.broadcastGlobal({
        tipo: 'stock_actualizado',
        mensaje: `Stock de ${updatedItem.productoNombre} actualizado (+${cantidad})`,
        datos: {
          producto: updatedItem.productoNombre,
          categoria: updatedItem.categoria,
          cantidad,
          tipo: 'ingreso',
        },
        timestamp: new Date().toISOString(),
      })

      // Emitir vencimiento_proximo si droga con vencimiento en <30 días
      if (updatedItem.categoria === 'droga' && updatedItem.vencimiento) {
        const diasRestantes = Math.floor(
          (new Date(updatedItem.vencimiento).getTime() - Date.now()) / 86_400_000
        )
        if (diasRestantes <= 30) {
          sseManager.broadcastGlobal({
            tipo: 'vencimiento_proximo',
            mensaje: `"${updatedItem.productoNombre}" (lote ${updatedItem.lote}) vence en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}`,
            datos: {
              producto: updatedItem.productoNombre,
              lote: updatedItem.lote,
              vencimiento: updatedItem.vencimiento,
              diasRestantes,
            },
            timestamp: new Date().toISOString(),
          })
        }
      }

      res.json({ item: updatedItem, acta: updatedActa })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error interno del servidor'
      res.status(400).json({ message: msg })
    }
  }
)

export default router


