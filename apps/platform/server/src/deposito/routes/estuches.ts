import { Router } from 'express'
import type { Prisma } from '@platform/db'
import { prisma } from '../lib/prisma'
import {
  registerMercadoInventoryRoutes,
} from './shared/mercado-inventory-helpers'
import { syncDepositoStockSheetsAfterCommit } from '../services/stock-sheets-projection'

const router = Router()

registerMercadoInventoryRoutes({
  router,
  messages: {
    conflict: 'Ya existe ese artículo para ese mercado',
    notFound: 'Estuche no encontrado',
  },
  permissions: { read: 'estuches.read', manage: 'estuches.manage' },
  afterMutation: syncDepositoStockSheetsAfterCommit,
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
      const byArticuloMarket = new Map(inventario.map((row) => [`${row.articulo}:${row.mercado}`, row]))
      return productos.flatMap((producto) => {
        const mercados = producto.mercadosHabilitados.length > 0 ? producto.mercadosHabilitados : producto.mercado ? [producto.mercado] : []
        return mercados.filter((m) => !mercado || m === mercado).map((m) => byProductMarket.get(`${producto.id}:${m}`) ?? byArticuloMarket.get(`${producto.nombreCompleto}:${m}`) ?? ({ id: producto.id, productoId: producto.id, articulo: producto.nombreCompleto, mercado: m, cantidad: 0, updatedAt: producto.updatedAt }))
      })
    },
    findByComposite: (articulo, mercado) =>
      prisma.inventarioEstuche.findUnique({
        where: { articulo_mercado: { articulo, mercado } },
      }),
    findById: (id) =>
      prisma.inventarioEstuche.findUnique({ where: { id } }),
    findByProductoMercado: (productoId, mercado) =>
      prisma.inventarioEstuche.findUnique({ where: { productoId_mercado: { productoId, mercado } } }),
    findByProductoUnico: async (productoId) => {
      const rows = await prisma.inventarioEstuche.findMany({ where: { productoId }, take: 2 })
      return rows.length === 1 ? rows[0] : null
    },
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
  },

})

export default router
