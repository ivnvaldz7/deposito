import { EstadoProductoCatalogo, Mercado } from '@platform/db'
import { Request, Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/require-role'
import { sseManager } from '../lib/sse-manager'
import { eventBus } from '@platform/core'
import { generarLote } from '../lib/lote-generator'
import { validateIngresoCatalogo } from '../services/ingreso-catalogo-rules'

const router = Router()
const mercados = Object.values(Mercado) as [Mercado, ...Mercado[]]

const crearIngresoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  productoId: z.string().uuid(),
  lote: z.string().trim().min(1).max(50).optional(),
  vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mercado: z.enum(mercados).optional(),
  cantidad: z.number().int().positive().optional(),
  cantidadCajas: z.number().int().positive().optional(),
  unidadesPorCaja: z.number().int().positive().optional(),
  observaciones: z.string().max(500).optional(),
})

function invalid(res: Response, message: string) { res.status(400).json({ message }) }

router.post('/', authenticate, requireRole('encargado'), async (req: Request, res: Response): Promise<void> => {
  const result = crearIngresoSchema.safeParse(req.body)
  if (!result.success) { res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() }); return }
  const data = result.data
  const producto = await prisma.depositoProducto.findUnique({ where: { id: data.productoId } })
  if (!producto) { invalid(res, 'Producto no encontrado en el catálogo'); return }
  if (producto.estado !== EstadoProductoCatalogo.ACTIVO) { res.status(409).json({ message: 'El producto debe estar activo para registrar ingresos' }); return }

  const materialConMercado = producto.categoria === 'etiqueta' || producto.categoria === 'estuche'
  try {
    validateIngresoCatalogo({
      categoria: producto.categoria,
      estado: producto.estado,
      mercadosHabilitados: producto.mercadosHabilitados,
      mercado: data.mercado,
      cantidad: data.cantidad,
      cantidadCajas: data.cantidadCajas,
      unidadesPorCaja: data.unidadesPorCaja,
      lote: data.lote,
      vencimiento: data.vencimiento,
    })
  } catch (error) {
    invalid(res, error instanceof Error ? error.message : 'Datos de ingreso inválidos')
    return
  }

  const loteFinal = producto.categoria === 'droga' ? data.lote!.trim() : await generarLote()
  const cantidad = producto.categoria === 'frasco' ? data.cantidadCajas! * data.unidadesPorCaja! : data.cantidad!
  try {
    const currentUser = await prisma.user.findUnique({ where: { id: req.depositoUser!.id }, select: { id: true, name: true } })
    if (!currentUser) { res.status(401).json({ message: 'La sesión es inválida. Volvé a iniciar sesión.' }); return }
    const acta = await prisma.$transaction(async (tx) => {
      const actaRecord = await tx.acta.create({ data: { fecha: new Date(`${data.fecha}T00:00:00.000Z`), notas: data.observaciones ?? null, createdBy: currentUser.id } })
      const item = await tx.actaItem.create({
        data: { actaId: actaRecord.id, productoId: producto.id, categoria: producto.categoria, productoNombre: producto.nombreCompleto, lote: loteFinal, vencimiento: data.vencimiento ? new Date(`${data.vencimiento}T00:00:00.000Z`) : null, mercado: materialConMercado ? data.mercado : null, cantidadIngresada: cantidad, cantidadDistribuida: cantidad },
      })
      if (producto.categoria === 'droga') {
        const existing = await tx.inventarioDroga.findFirst({ where: { productoId: producto.id, lote: loteFinal } })
        if (existing) await tx.inventarioDroga.update({ where: { id: existing.id }, data: { cantidad: { increment: cantidad } } })
        else await tx.inventarioDroga.create({ data: { productoId: producto.id, nombre: producto.nombreCompleto, lote: loteFinal, vencimiento: data.vencimiento ? new Date(`${data.vencimiento}T00:00:00.000Z`) : null, cantidad } })
      } else if (producto.categoria === 'estuche') {
        const existing = await tx.inventarioEstuche.findUnique({ where: { productoId_mercado: { productoId: producto.id, mercado: data.mercado! } } })
        if (!existing) throw new Error('Falta el inventario inicial del mercado habilitado')
        await tx.inventarioEstuche.update({ where: { id: existing.id }, data: { cantidad: { increment: cantidad } } })
      } else if (producto.categoria === 'etiqueta') {
        const existing = await tx.inventarioEtiqueta.findUnique({ where: { productoId_mercado: { productoId: producto.id, mercado: data.mercado! } } })
        if (!existing) throw new Error('Falta el inventario inicial del mercado habilitado')
        await tx.inventarioEtiqueta.update({ where: { id: existing.id }, data: { cantidad: { increment: cantidad } } })
      } else {
        const existing = await tx.inventarioFrasco.findUnique({ where: { productoId: producto.id } })
        if (existing) {
          if (existing.unidadesPorCaja !== data.unidadesPorCaja) throw new Error('unidadesPorCaja debe coincidir con el inventario físico existente')
          await tx.inventarioFrasco.update({ where: { id: existing.id }, data: { cantidadCajas: { increment: data.cantidadCajas! }, total: { increment: cantidad } } })
        } else await tx.inventarioFrasco.create({ data: { productoId: producto.id, articulo: producto.nombreCompleto, unidadesPorCaja: data.unidadesPorCaja!, cantidadCajas: data.cantidadCajas!, total: cantidad } })
      }
      await tx.acta.update({ where: { id: actaRecord.id }, data: { estado: 'completada' } })
      await tx.movimiento.create({ data: { tipo: 'ingreso_acta', categoria: producto.categoria, productoNombre: producto.nombreCompleto, lote: producto.categoria === 'droga' ? loteFinal : null, cantidad, referenciaId: item.id, referenciaTipo: 'acta_item', createdBy: currentUser.id } })
      return actaRecord
    })
    sseManager.broadcastGlobal({ tipo: 'ingreso_creado', mensaje: `Nuevo ingreso de ${producto.nombreCompleto} por ${currentUser.name}`, datos: { actaId: acta.id, fecha: data.fecha, producto: producto.nombreCompleto, cantidad }, timestamp: new Date().toISOString() })
    eventBus.emit({ app: 'deposito', tipo: 'ingreso_creado', titulo: 'Ingreso registrado', mensaje: `${producto.nombreCompleto} — ${cantidad} uds — ${currentUser.name}`, link: `/deposito/actas/${acta.id}`, timestamp: new Date().toISOString() })
    res.status(201).json(acta)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

export default router
