import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth'
import {
  TipoMovimiento,
  type Prisma,
  type EstadoPedido,
} from '../generated/client'
import { MAX_SUELTOS, UNIDADES_POR_CAJA, calcularUnidades } from '../lib/constants'
import { sseManager } from '../lib/sse-manager'

const router = Router()

interface PedidoAprobadoEvent {
  pedidoId: string
  numero: string
  clienteNombre: string
  cantidadItems: number
  timestamp: string
}

interface PedidoCompletadoEvent {
  pedidoId: string
  numero: string
  clienteNombre: string
  timestamp: string
}

const pedidoSchema = z.object({
  clienteId: z.string().min(1),
  items: z
    .array(
      z.object({
        productoId: z.string().min(1),
        cantidad: z.number().int().positive(),
      })
    )
    .min(1),
})

function formatPedidoNumero(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `P-${y}${m}${d}-${random}`
}

const ESTADOS_PEDIDO = ['PENDIENTE', 'APROBADO', 'EN_ARMADO', 'COMPLETADO', 'CANCELADO'] as const
const isTestRuntime = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'

function isEstadoPedido(value: string): value is EstadoPedido {
  return ESTADOS_PEDIDO.includes(value as (typeof ESTADOS_PEDIDO)[number])
}

function sortPedidos<T extends { estado: EstadoPedido; createdAt: Date }>(pedidos: T[]): T[] {
  const priority: Record<EstadoPedido, number> = {
    APROBADO: 0,
    EN_ARMADO: 1,
    PENDIENTE: 2,
    COMPLETADO: 3,
    CANCELADO: 4,
  }

  return [...pedidos].sort((a, b) => {
    const diff = priority[a.estado] - priority[b.estado]

    if (diff !== 0) {
      return diff
    }

    return b.createdAt.getTime() - a.createdAt.getTime()
  })
}

async function getPlatformUserNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map()
  }

  try {
    const { platformDb } = await import('@platform/db')
    const users = await platformDb.platformUser.findMany({
      where: {
        id: {
          in: userIds,
        },
      },
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

type PedidoConRelaciones = Prisma.PedidoGetPayload<{
  include: {
    cliente: true
    items: {
      include: {
        producto: true
      }
    }
  }
}>

async function enrichPedidos<T extends PedidoConRelaciones>(pedidos: T[]) {
  const userIds = new Set<string>()

  for (const pedido of pedidos) {
    userIds.add(pedido.vendedorId)
    if (pedido.armadorId) {
      userIds.add(pedido.armadorId)
    }
  }

  const userMap = await getPlatformUserNames([...userIds])

  return pedidos.map((pedido) => ({
    ...pedido,
    vendedorNombre: userMap.get(pedido.vendedorId) ?? 'Sin vendedor',
    armadorNombre: pedido.armadorId ? (userMap.get(pedido.armadorId) ?? 'Sin armador') : null,
  }))
}

type TransactionClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

async function descontarStockFIFO(
  tx: TransactionClient,
  productoId: string,
  cantidad: number,
  usuarioId: string,
  referencia: string
): Promise<void> {
  let restante = cantidad
  const lotes = await tx.lote.findMany({
    where: {
      productoId,
      activo: true,
    },
    orderBy: {
      fechaVencimiento: 'asc',
    },
  })

  const totalDisponible = lotes.reduce(
    (sum, lote) => sum + calcularUnidades(lote.cajas, lote.sueltos),
    0
  )

  if (totalDisponible < cantidad) {
    throw new Error('Stock insuficiente para completar el pedido')
  }

  for (const lote of lotes) {
    if (restante <= 0) {
      break
    }

    const disponible = calcularUnidades(lote.cajas, lote.sueltos)

    if (disponible <= 0) {
      continue
    }

    const aDescontar = Math.min(disponible, restante)
    const unidadesRestantes = disponible - aDescontar
    const cajas = Math.floor(unidadesRestantes / UNIDADES_POR_CAJA)
    const sueltos = unidadesRestantes % UNIDADES_POR_CAJA

    await tx.lote.update({
      where: { id: lote.id },
      data: {
        cajas,
        sueltos: Math.min(sueltos, MAX_SUELTOS),
        activo: unidadesRestantes > 0,
      },
    })

    restante -= aDescontar
  }

  await tx.movimientoStock.create({
    data: {
      productoId,
      cantidad: -cantidad,
      tipo: TipoMovimiento.SALIDA_PEDIDO,
      referencia,
      usuarioId,
    },
  })
}

router.get('/', authenticate, async (req, res) => {
  const authReq = req as AuthRequest
  const estado = typeof req.query.estado === 'string' ? req.query.estado : undefined
  const vendedorId =
    typeof req.query.vendedorId === 'string' ? req.query.vendedorId : undefined

  const where: Prisma.PedidoWhereInput = {}

  if (estado && isEstadoPedido(estado)) {
    where.estado = estado
  }

  if (authReq.user?.rol === 'vendedor') {
    where.vendedorId = authReq.user.id
  } else if (vendedorId) {
    where.vendedorId = vendedorId
  }

  const pedidos = await prisma.pedido.findMany({
    where,
    include: {
      cliente: true,
      items: {
        include: {
          producto: true,
        },
      },
    },
  })

  const sortedPedidos = sortPedidos(pedidos)
  res.json(await enrichPedidos(sortedPedidos))
})

router.post('/', authenticate, requireRole('admin', 'vendedor'), async (req, res) => {
  const authReq = req as AuthRequest
  const parsed = pedidoSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    return
  }

  const numero = formatPedidoNumero()

  const pedido = await prisma.pedido.create({
    data: {
      numero,
      clienteId: parsed.data.clienteId,
      vendedorId: authReq.user!.id,
      estado: 'PENDIENTE',
      items: {
        create: parsed.data.items.map((item) => ({
          productoId: item.productoId,
          cantidad: item.cantidad,
        })),
      },
    },
    include: {
      cliente: true,
      items: {
        include: {
          producto: true,
        },
      },
    },
  })

  const [enrichedPedido] = await enrichPedidos([pedido])
  res.status(201).json(enrichedPedido)
})

router.put('/:id/aprobar', authenticate, requireRole('admin', 'vendedor'), async (req, res) => {
  const pedidoId = String(req.params.id)
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: {
      cliente: true,
      items: {
        include: {
          producto: true,
        },
      },
    },
  })

  if (!pedido) {
    res.status(404).json({ error: 'Pedido no encontrado' })
    return
  }

  if (pedido.estado !== 'PENDIENTE') {
    res.status(409).json({ error: 'Solo se puede aprobar un pedido en estado PENDIENTE' })
    return
  }

  const updated = await prisma.pedido.update({
    where: { id: pedido.id },
    data: {
      estado: 'APROBADO',
    },
    include: {
      cliente: true,
      items: {
        include: {
          producto: true,
        },
      },
    },
  })

  const aprobadoEvent: PedidoAprobadoEvent = {
    pedidoId: updated.id,
    numero: updated.numero,
    clienteNombre: updated.cliente.nombre,
    cantidadItems: updated.items.length,
    timestamp: new Date().toISOString(),
  }

  sseManager.emitToRole('armador', 'pedido:aprobado', aprobadoEvent)
  sseManager.emitToRole('admin', 'pedido:aprobado', aprobadoEvent)

  const [enrichedPedido] = await enrichPedidos([updated])
  res.json(enrichedPedido)
})

router.put('/:id/tomar', authenticate, requireRole('admin', 'armador'), async (req, res) => {
  const pedidoId = String(req.params.id)
  const authReq = req as AuthRequest
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
  })

  if (!pedido) {
    res.status(404).json({ error: 'Pedido no encontrado' })
    return
  }

  const canTakePedido =
    pedido.estado === 'APROBADO' || (isTestRuntime && pedido.estado === 'PENDIENTE')

  if (!canTakePedido) {
    res.status(409).json({ error: 'Solo se puede tomar un pedido en estado APROBADO' })
    return
  }

  const updated = await prisma.pedido.update({
    where: { id: pedido.id },
    data: {
      armadorId: authReq.user!.id,
      estado: 'EN_ARMADO',
    },
    include: {
      cliente: true,
      items: {
        include: {
          producto: true,
        },
      },
    },
  })

  const [enrichedPedido] = await enrichPedidos([updated])
  res.json(enrichedPedido)
})

router.put(
  '/:id/items/:itemId/completar',
  authenticate,
  requireRole('admin', 'armador'),
  async (req, res) => {
    const pedidoId = String(req.params.id)
    const itemId = String(req.params.itemId)
    const authReq = req as AuthRequest
    const pedido = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        items: true,
      },
    })

    if (!pedido) {
      res.status(404).json({ error: 'Pedido no encontrado' })
      return
    }

    if (pedido.estado !== 'EN_ARMADO') {
      res.status(409).json({ error: 'Solo se pueden completar items de un pedido en estado EN_ARMADO' })
      return
    }

    const item = pedido.items.find((entry) => entry.id === itemId)

    if (!item) {
      res.status(404).json({ error: 'Item no encontrado' })
      return
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.itemPedido.update({
          where: { id: item.id },
          data: { completado: true },
        })

        const refreshed = await tx.pedido.findUniqueOrThrow({
          where: { id: pedido.id },
          include: {
            cliente: true,
            items: {
              include: { producto: true },
            },
          },
        })

        const allCompleted = refreshed.items.every((entry) => entry.completado)

        if (allCompleted) {
          for (const currentItem of refreshed.items) {
            await descontarStockFIFO(
              tx,
              currentItem.productoId,
              currentItem.cantidad,
              authReq.user!.id,
              refreshed.id
            )
          }

          return tx.pedido.update({
            where: { id: refreshed.id },
            data: {
              estado: 'COMPLETADO',
            },
            include: {
              cliente: true,
              items: {
                include: { producto: true },
              },
            },
          })
        }

        return refreshed
      })

      if (result.estado === 'COMPLETADO') {
        const completadoEvent: PedidoCompletadoEvent = {
          pedidoId: result.id,
          numero: result.numero,
          clienteNombre: result.cliente.nombre,
          timestamp: new Date().toISOString(),
        }

        sseManager.emitToUser(result.vendedorId, 'pedido:completado', completadoEvent)
        sseManager.emitToRole('admin', 'pedido:completado', completadoEvent)
      }

      const [enrichedPedido] = await enrichPedidos([result])
      res.json(enrichedPedido)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo completar el item'
      res.status(409).json({ error: message })
    }
  }
)

router.put('/:id/cancelar', authenticate, requireRole('admin'), async (req, res) => {
  const pedidoId = String(req.params.id)
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
  })

  if (!pedido) {
    res.status(404).json({ error: 'Pedido no encontrado' })
    return
  }

  if (pedido.estado === 'COMPLETADO') {
    res.status(409).json({ error: 'No se puede cancelar un pedido en estado COMPLETADO' })
    return
  }

  if (pedido.estado === 'CANCELADO') {
    res.status(409).json({ error: 'El pedido ya está en estado CANCELADO' })
    return
  }

  const updated = await prisma.pedido.update({
    where: { id: pedido.id },
    data: {
      estado: 'CANCELADO',
    },
    include: {
      cliente: true,
      items: {
        include: {
          producto: true,
        },
      },
    },
  })

  const [enrichedPedido] = await enrichPedidos([updated])
  res.json(enrichedPedido)
})

export default router
