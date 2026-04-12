import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole } from '../middleware/auth'
import { calcularUnidades } from '../lib/constants'

const router = Router()

router.get('/', authenticate, requireRole('admin'), async (_req, res) => {
  const [productos, movimientos] = await Promise.all([
    prisma.producto.findMany({
      include: {
        lotes: {
          where: { activo: true },
          orderBy: { fechaVencimiento: 'asc' },
        },
      },
      orderBy: {
        nombre: 'asc',
      },
    }),
    prisma.movimientoStock.findMany({
      take: 20,
      orderBy: {
        createdAt: 'desc',
      },
    }),
  ])

  res.json({
    productos: productos.map((producto) => {
      const stock = producto.lotes.reduce(
        (total, lote) => total + calcularUnidades(lote.cajas, lote.sueltos),
        0
      )

      return {
        ...producto,
        stock,
        stockBajo: stock < producto.stockMinimo,
      }
    }),
    movimientos,
  })
})

router.get('/movimientos', authenticate, requireRole('admin'), async (_req, res) => {
  const movimientos = await prisma.movimientoStock.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  })

  res.json(movimientos)
})

export default router
