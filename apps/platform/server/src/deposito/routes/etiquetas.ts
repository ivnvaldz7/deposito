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
    conflict: 'Ya existe esa etiqueta para ese mercado',
    notFound: 'Etiqueta no encontrada',
  },
  permissions: { read: 'etiquetas.read', manage: 'etiquetas.manage' },
  afterMutation: syncDepositoStockSheetsAfterCommit,
  operations: {
    buildWhere: (mercado): Prisma.InventarioEtiquetaWhereInput => (
      mercado ? { mercado } : {}
    ),
    findMany: async ({ where, orderBy }) => {
      const mercado = where.mercado
      const [productos, inventario] = await Promise.all([
        prisma.depositoProducto.findMany({ where: { categoria: 'etiqueta', activo: true }, orderBy: { nombreCompleto: 'asc' } }),
        prisma.inventarioEtiqueta.findMany({ where, orderBy }),
      ])
      const byProductMarket = new Map(inventario.filter((row) => row.productoId).map((row) => [`${row.productoId}:${row.mercado}`, row]))
      const byArticuloMarket = new Map(inventario.map((row) => [`${row.articulo}:${row.mercado}`, row]))
      return productos.flatMap((producto) => {
        const mercados = producto.mercadosHabilitados.length > 0 ? producto.mercadosHabilitados : producto.mercado ? [producto.mercado] : []
        return mercados.filter((m) => !mercado || m === mercado).map((m) => byProductMarket.get(`${producto.id}:${m}`) ?? byArticuloMarket.get(`${producto.nombreCompleto}:${m}`) ?? ({ id: producto.id, productoId: producto.id, articulo: producto.nombreCompleto, mercado: m, cantidad: 0, updatedAt: producto.updatedAt }))
      })
    },
    findByComposite: (articulo, mercado) =>
      prisma.inventarioEtiqueta.findUnique({
        where: { articulo_mercado: { articulo, mercado } },
      }),
    findById: (id) =>
      prisma.inventarioEtiqueta.findUnique({ where: { id } }),
    findByProductoMercado: (productoId, mercado) =>
      prisma.inventarioEtiqueta.findUnique({ where: { productoId_mercado: { productoId, mercado } } }),
    findByProductoUnico: async (productoId) => {
      const rows = await prisma.inventarioEtiqueta.findMany({ where: { productoId }, take: 2 })
      return rows.length === 1 ? rows[0] : null
    },
    findConflict: (articulo, mercado, id) =>
      prisma.inventarioEtiqueta.findFirst({
        where: { articulo, mercado, NOT: { id } },
      }),
    create: (data) =>
      prisma.inventarioEtiqueta.create({ data }),
    update: (id, data) =>
      prisma.inventarioEtiqueta.update({ where: { id }, data }),
    delete: async (id) => {
      await prisma.inventarioEtiqueta.delete({ where: { id } })
    },
  },
})

export default router
