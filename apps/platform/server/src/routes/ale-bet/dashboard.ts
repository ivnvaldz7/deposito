import { Router } from 'express'
import { platformDb as prisma } from '@platform/db'
import { getAppAccess, type JwtPayload } from '@platform/core'
import { requirePermission } from '../../middlewares/require-permission'
import { aggregateProductAvailability } from './stock-aggregation'

const router = Router()

async function getPlatformUserNames(): Promise<Map<string, string>> {
  try {
    const users = await prisma.platformUser.findMany({
      select: { id: true, nombre: true },
    })

    return new Map(users.map((user) => [user.id, user.nombre]))
  } catch {
    return new Map()
  }
}

router.get('/', requirePermission('ale-bet', 'dashboard.read'), async (req, res) => {
  const isArmador = Boolean(req.user && getAppAccess(req.user as JwtPayload, 'ale-bet')?.rol === 'armador')
  // La pantalla logística general es la cola documental de Automation. Armador
  // conserva su cola manual y nunca recibe pedidos Automation.
  const operationalVisibility = isArmador
    ? { origen: 'MANUAL' as const }
    : { origen: 'AUTOMATION' as const, estado: { not: 'CANCELADO' as const }, remitos: { none: { estado: 'VIGENTE' as const } } }

  const [productos, pedidosHoy, pendientesTomar, preparados, enArmado, pedidosRecientes, users] = await Promise.all([
    prisma.producto.findMany({
      where: { activo: true },
      include: {
        lotes: {
          where: { activo: true },
          include: {
            saldos: { include: { ubicacion: { select: { codigo: true } } } },
            reservas: { where: { estado: 'ACTIVA' }, select: { cantidad: true } },
          },
        },
      },
    }),
    prisma.pedido.count({
      where: {
        ...operationalVisibility,
      },
    }),
    isArmador ? prisma.pedido.count({ where: { estado: 'APROBADO', origen: 'MANUAL' } }) : Promise.resolve(0),
    isArmador ? prisma.pedido.count({ where: { estado: 'PREPARADO', origen: 'MANUAL' } }) : Promise.resolve(0),
    isArmador ? prisma.pedido.count({ where: { estado: 'EN_ARMADO', origen: 'MANUAL' } }) : Promise.resolve(0),
    prisma.pedido.findMany({
      where: operationalVisibility,
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        cliente: true,
        items: true,
      },
    }),
    getPlatformUserNames(),
  ])

  const userMap = users

  const stockCritico = productos.filter((producto) => aggregateProductAvailability(producto).stockBajo).length

  res.json({
    stockCritico,
    pedidosHoy,
    pendientesRemito: isArmador ? 0 : pedidosHoy,
    enArmado,
    pendientesTomar,
    preparados,
    esperandoProduccion: 0, // BACKEND PENDIENTE: schema actual no soporta ItemPedido.estado = ESPERA_PRODUCCION
    totalProductos: productos.length,
    pedidosRecientes: pedidosRecientes.map((pedido) => ({
      id: pedido.id,
      numero: pedido.numero,
      estado: pedido.estado,
      origen: pedido.origen,
      clienteNombre: pedido.cliente.nombre,
      vendedorNombre: pedido.origen === 'AUTOMATION' ? 'Automation' : userMap.get(pedido.vendedorId ?? '') ?? 'Sin vendedor',
      armadorNombre: pedido.armadorId ? (userMap.get(pedido.armadorId) ?? 'Sin armador') : null,
      cantidadItems: pedido.items.length,
      createdAt: pedido.createdAt,
    })),
  })
})

export default router
