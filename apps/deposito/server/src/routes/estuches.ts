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
    conflict: 'Ya existe ese artículo para ese mercado',
    notFound: 'Estuche no encontrado',
  },
  operations: {
    buildWhere: (mercado): Prisma.InventarioEstucheWhereInput => (
      mercado ? { mercado } : {}
    ),
    findMany: ({ where, orderBy }) =>
      prisma.inventarioEstuche.findMany({ where, orderBy }),
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
  },
})

export default router
