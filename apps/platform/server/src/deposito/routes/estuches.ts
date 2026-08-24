import { Router } from 'express'
import type { Prisma } from '@platform/db'
import { prisma } from '../lib/prisma'
import {
  registerMercadoInventoryRoutes,
} from './shared/mercado-inventory-helpers'

const router = Router()

registerMercadoInventoryRoutes({
  router,
  messages: {
    conflict: 'Ya existe ese artículo para ese mercado',
    notFound: 'Estuche no encontrado',
    quantityLocked: 'La cantidad de un estuche con movimientos solo puede cambiar mediante un ingreso o ajuste auditado',
  },
  permissions: { read: 'estuches.read', manage: 'estuches.manage' },
  operations: {
    buildWhere: (mercado): Prisma.InventarioEstucheWhereInput => (
      mercado ? { mercado } : {}
    ),
    findMany: async ({ where, orderBy }) => {
      const mercado = where.mercado
      const [productos, inventario] = await Promise.all([
        prisma.depositoProducto.findMany({ where: { categoria: 'estuche', activo: true }, orderBy: { nombreCompleto: 'asc' } }),
        prisma.inventarioEstuche.findMany({ where, orderBy }),
      ])
      const byProductMarket = new Map(inventario.filter((row) => row.productoId).map((row) => [`${row.productoId}:${row.mercado}`, row]))
      return productos.flatMap((producto) => {
        const mercados = producto.mercadosHabilitados.length > 0 ? producto.mercadosHabilitados : producto.mercado ? [producto.mercado] : []
        return mercados.filter((m) => !mercado || m === mercado).map((m) => byProductMarket.get(`${producto.id}:${m}`) ?? ({ id: producto.id, productoId: producto.id, articulo: producto.nombreCompleto, mercado: m, cantidad: 0, updatedAt: producto.updatedAt }))
      })
    },
    findByComposite: (articulo, mercado) =>
      prisma.inventarioEstuche.findUnique({
        where: { articulo_mercado: { articulo, mercado } },
      }),
    findById: (id) =>
      prisma.inventarioEstuche.findUnique({ where: { id } }),
    findConflict: (articulo, mercado, id) =>
      prisma.inventarioEstuche.findFirst({
        where: { articulo, mercado, NOT: { id } },
      }),
    create: (data) =>
      prisma.inventarioEstuche.create({ data }),
    update: (id, data) =>
      prisma.inventarioEstuche.update({ where: { id }, data }),
    delete: async (id) => {
      await prisma.inventarioEstuche.delete({ where: { id } })
    },
    canUpdateCantidad: async (estuche) => (
      !estuche.productoId || await prisma.movimiento.count({ where: { productoId: estuche.productoId } }) === 0
    ),
  },

})

export default router
