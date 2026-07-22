import { Router } from 'express'
import { platformDb as prisma } from '@platform/db'
import { requireApp } from '../../middlewares/require-app'
import { calcularUnidades } from './constants'

const router = Router()

router.get('/', requireApp('ale-bet', ['admin']), async (_req, res) => {
  const [productos, movimientos] = await Promise.all([
    prisma.producto.findMany({
      include: {
        lotes: {
          where: { activo: true },
          orderBy: { fechaVencimiento: 'asc' },
        },
      },
      orderBy: { nombre: 'asc' },
    }),
    prisma.movimientoStock.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
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

router.get('/movimientos', requireApp('ale-bet', ['admin']), async (_req, res) => {
  const movimientos = await prisma.movimientoStock.findMany({
    orderBy: { createdAt: 'desc' },
  })

  res.json(movimientos)
})

export default router
