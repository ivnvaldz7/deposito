import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  registerMercadoInventoryRoutes,
} from './shared/mercado-inventory-helpers'

const router = Router()

registerMercadoInventoryRoutes({
  router,
  messages: {
    conflict: 'Ya existe esa etiqueta para ese mercado',
    notFound: 'Etiqueta no encontrada',
  },
  operations: {
    buildWhere: (mercado): Prisma.InventarioEtiquetaWhereInput => (
      mercado ? { mercado } : {}
    ),
    findMany: ({ where, orderBy }) =>
      prisma.inventarioEtiqueta.findMany({ where, orderBy }),
    findByComposite: (articulo, mercado) =>
      prisma.inventarioEtiqueta.findUnique({
        where: { articulo_mercado: { articulo, mercado } },
      }),
    findById: (id) =>
      prisma.inventarioEtiqueta.findUnique({ where: { id } }),
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
