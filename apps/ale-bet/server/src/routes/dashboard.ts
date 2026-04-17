import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { calcularUnidades } from '../lib/constants'

const router = Router()

async function getPlatformUserNames(): Promise<Map<string, string>> {
  try {
    const { platformDb } = await import('@platform/db')
    const users = await platformDb.platformUser.findMany({
      select: {
        id: true,
        nombre: true,
      },
    })

    return new Map(users.map((user) => [user.id, user.nombre]))
  } catch {
    return new Map()
  }
}

router.get('/', authenticate, async (_req, res) => {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const mañana = new Date(hoy)
  mañana.setDate(mañana.getDate() + 1)

  const [productos, pedidosHoy, enArmado, pedidosRecientes, users] = await Promise.all([
    prisma.producto.findMany({
      include: {
        lotes: {
          where: {
            activo: true,
          },
          select: {
            cajas: true,
            sueltos: true,
          },
        },
      },
    }),
    prisma.pedido.count({
      where: {
        createdAt: {
          gte: hoy,
          lt: mañana,
        },
      },
    }),
    prisma.pedido.count({
      where: {
        estado: 'EN_ARMADO',
      },
    }),
    prisma.pedido.findMany({
      take: 10,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        cliente: true,
        items: true,
      },
    }),
    getPlatformUserNames(),
  ])

  const userMap = users

  const stockCritico = productos.filter((producto) => {
    const stock = producto.lotes.reduce(
      (total, lote) => total + calcularUnidades(lote.cajas, lote.sueltos),
      0
    )

    return stock < producto.stockMinimo
  }).length

  res.json({
    stockCritico,
    pedidosHoy,
    enArmado,
    totalProductos: productos.length,
    pedidosRecientes: pedidosRecientes.map((pedido) => ({
      id: pedido.id,
      numero: pedido.numero,
      estado: pedido.estado,
      clienteNombre: pedido.cliente.nombre,
      vendedorNombre: userMap.get(pedido.vendedorId) ?? 'Sin vendedor',
      armadorNombre: pedido.armadorId ? (userMap.get(pedido.armadorId) ?? 'Sin armador') : null,
      cantidadItems: pedido.items.length,
      createdAt: pedido.createdAt,
    })),
  })
})

export default router
