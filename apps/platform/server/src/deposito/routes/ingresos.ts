import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/require-role'
import { sseManager } from '../lib/sse-manager'
import { eventBus } from '@platform/core'
import { generarLote } from '../lib/lote-generator'
import { resolveCanonicalProductName } from '../lib/producto-catalogo'

const router = Router()

function normalizeForMatch(str: string): string {
  return resolveCanonicalProductName(str)
}

const crearIngresoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  productoId: z.string().uuid(),
  lote: z.string().trim().max(50).optional(),
  cantidad: z.number().int().positive(),
  observaciones: z.string().max(500).optional(),
})

router.post(
  '/',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const result = crearIngresoSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { fecha, productoId, lote, cantidad, observaciones } = result.data

    try {
      const producto = await prisma.depositoProducto.findUnique({ where: { id: productoId } })
      if (!producto) {
        res.status(400).json({ message: 'Producto no encontrado en el catálogo' })
        return
      }

      const currentUser = await prisma.user.findUnique({
        where: { id: req.depositoUser!.id },
        select: { id: true, name: true },
      })
      if (!currentUser) {
        res.status(401).json({ message: 'La sesión es inválida. Volvé a iniciar sesión.' })
        return
      }

      const result = await prisma.$transaction(async (tx) => {
        // 1. Crear acta
        const acta = await tx.acta.create({
          data: {
            fecha: new Date(fecha + 'T00:00:00.000Z'),
            notas: observaciones ?? null,
            createdBy: currentUser.id,
          },
        })

        // 2. Generar lote (manual para droga, auto para el resto)
        const loteFinal =
          producto.categoria === 'droga'
            ? lote?.trim() ?? ''
            : await generarLote(producto.categoria)

        // 3. Crear item del acta
        const item = await tx.actaItem.create({
          data: {
            actaId: acta.id,
            productoId: producto.id,
            categoria: producto.categoria,
            productoNombre: producto.nombreCompleto,
            lote: loteFinal,
            cantidadIngresada: cantidad,
            cantidadDistribuida: cantidad,
          },
        })

        // 4. Actualizar inventario según categoría
        if (producto.categoria === 'droga') {
          const existing = await tx.inventarioDroga.findFirst({
            where: { productoId: producto.id, lote: loteFinal },
          })
          if (existing) {
            await tx.inventarioDroga.update({
              where: { id: existing.id },
              data: { cantidad: { increment: cantidad } },
            })
          } else {
            await tx.inventarioDroga.create({
              data: {
                productoId: producto.id,
                nombre: producto.nombreCompleto,
                lote: loteFinal,
                cantidad,
              },
            })
          }
        } else if (producto.categoria === 'estuche') {
          const existing = await tx.inventarioEstuche.findFirst({
            where: { productoId: producto.id },
          })
          if (existing) {
            await tx.inventarioEstuche.update({
              where: { id: existing.id },
              data: { cantidad: { increment: cantidad } },
            })
          } else {
            await tx.inventarioEstuche.create({
              data: {
                productoId: producto.id,
                articulo: producto.nombreCompleto,
                mercado: 'argentina' as any,
                cantidad,
              },
            })
          }
        } else if (producto.categoria === 'etiqueta') {
          const existing = await tx.inventarioEtiqueta.findFirst({
            where: { productoId: producto.id },
          })
          if (existing) {
            await tx.inventarioEtiqueta.update({
              where: { id: existing.id },
              data: { cantidad: { increment: cantidad } },
            })
          } else {
            await tx.inventarioEtiqueta.create({
              data: {
                productoId: producto.id,
                articulo: producto.nombreCompleto,
                mercado: 'argentina' as any,
                cantidad,
              },
            })
          }
        } else if (producto.categoria === 'frasco') {
          const existing = await tx.inventarioFrasco.findFirst({
            where: { productoId: producto.id },
          })
          if (existing) {
            await tx.inventarioFrasco.update({
              where: { id: existing.id },
              data: { total: { increment: cantidad } },
            })
          } else {
            await tx.inventarioFrasco.create({
              data: {
                productoId: producto.id,
                articulo: producto.nombreCompleto,
                unidadesPorCaja: 1,
                total: cantidad,
              },
            })
          }
        }

        // 5. Marcar acta como completada
        await tx.acta.update({
          where: { id: acta.id },
          data: { estado: 'completada' },
        })

        // 6. Movimiento de auditoría
        await tx.movimiento.create({
          data: {
            tipo: 'ingreso_acta',
            categoria: producto.categoria,
            productoNombre: producto.nombreCompleto,
            lote: producto.categoria === 'droga' ? loteFinal : null,
            cantidad,
            referenciaId: item.id,
            referenciaTipo: 'acta_item',
            createdBy: currentUser.id,
          },
        })

        return acta
      })

      // Notificaciones
      sseManager.broadcastGlobal({
        tipo: 'ingreso_creado',
        mensaje: `Nuevo ingreso de ${producto.nombreCompleto} por ${currentUser.name}`,
        datos: { actaId: result.id, fecha, producto: producto.nombreCompleto, cantidad },
        timestamp: new Date().toISOString(),
      })
      eventBus.emit({
        app: 'deposito',
        tipo: 'ingreso_creado',
        titulo: 'Ingreso registrado',
        mensaje: `${producto.nombreCompleto} — ${cantidad} uds — ${currentUser.name}`,
        link: `/deposito/actas/${result.id}`,
        timestamp: new Date().toISOString(),
      })

      res.status(201).json(result)
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

export default router
