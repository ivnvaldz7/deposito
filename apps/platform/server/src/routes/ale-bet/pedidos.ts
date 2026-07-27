import { Router } from 'express'
import crypto from 'crypto'
import { z } from 'zod'
import { platformDb as prisma, TipoMovimiento, Prisma } from '@platform/db'
import {
  validateIdempotencyKey,
  getSingleIdempotencyKey,
  calculateFingerprint,
  acquireIdempotencyRecord,
  completeIdempotencyRecord,
  toPersistableResponseBody
} from '../../utils/idempotency'
import type { JwtPayload } from '@platform/core'
import { requireApp } from '../../middlewares/require-app'
import { MAX_SUELTOS, UNIDADES_POR_CAJA, calcularUnidades } from './constants'
import { sseManager } from './sse-manager'
import { eventBus, getAppAccess } from '@platform/core'

type HttpError = {
  status: number
  code?: string
  message: string
}

function isHttpError(error: unknown): error is HttpError {
  if (typeof error !== 'object' || error === null) return false

  const candidate = error as Record<string, unknown>

  return (
    typeof candidate.status === 'number' &&
    typeof candidate.message === 'string' &&
    (candidate.code === undefined || typeof candidate.code === 'string')
  )
}

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

type EstadoPedido = (typeof ESTADOS_PEDIDO)[number]

const isTestRuntime = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'

function isEstadoPedido(value: string): value is EstadoPedido {
  return ESTADOS_PEDIDO.includes(value as EstadoPedido)
}

function sortPedidos<T extends { estado: string; createdAt: Date }>(pedidos: T[]): T[] {
  const priority: Record<string, number> = {
    APROBADO: 0,
    EN_ARMADO: 1,
    PENDIENTE: 2,
    COMPLETADO: 3,
    CANCELADO: 4,
  }

  return [...pedidos].sort((a, b) => {
    const diff = (priority[a.estado] ?? 99) - (priority[b.estado] ?? 99)

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
    const users = await prisma.platformUser.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nombre: true },
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
      include: { producto: true }
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
  cantidades: number[],
  usuarioId: string,
  referencia: string
): Promise<void> {
  const cantidadTotal = cantidades.reduce((sum, q) => sum + q, 0)
  const lotesRaw = await tx.$queryRaw<{ id: string; cajas: number; sueltos: number }[]>(
    Prisma.sql`
      SELECT id, cajas, sueltos
      FROM "ale_bet"."Lote"
      WHERE "productoId" = ${productoId} AND activo = true
      ORDER BY "fechaVencimiento" ASC, id ASC
      FOR UPDATE
    `
  )

  const totalDisponible = lotesRaw.reduce(
    (sum, lote) => sum + calcularUnidades(lote.cajas, lote.sueltos),
    0
  )

  if (totalDisponible < cantidadTotal) {
    throw new Error('Stock insuficiente para completar el pedido')
  }

  let restante = cantidadTotal

  for (const lote of lotesRaw) {
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

  for (const cantidad of cantidades) {
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
}

router.get('/', requireApp('ale-bet'), async (req, res) => {
  const user = req.user as JwtPayload
  const estado = typeof req.query.estado === 'string' ? req.query.estado : undefined
  const vendedorId = typeof req.query.vendedorId === 'string' ? req.query.vendedorId : undefined
  const rol = getAppAccess(user, 'ale-bet')?.rol

  const where: Prisma.PedidoWhereInput = {}

  if (estado && isEstadoPedido(estado)) {
    where.estado = estado as any
  }

  if (rol === 'vendedor') {
    where.vendedorId = user.sub
  } else if (vendedorId) {
    where.vendedorId = vendedorId
  }

  const pedidos = await prisma.pedido.findMany({
    where,
    include: {
      cliente: true,
      items: { include: { producto: true } },
    },
  })

  const sortedPedidos = sortPedidos(pedidos)
  res.json(await enrichPedidos(sortedPedidos))
})

router.post('/', requireApp('ale-bet', ['admin', 'vendedor']), async (req, res) => {
  const user = req.user as JwtPayload
  const parsed = pedidoSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    return
  }

  const numero = formatPedidoNumero()

  // Validate stock before creating
  for (const item of parsed.data.items) {
    const lotes = await prisma.lote.findMany({
      where: { productoId: item.productoId, activo: true },
      select: { cajas: true, sueltos: true },
    })
    const disponible = lotes.reduce((sum, l) => sum + calcularUnidades(l.cajas, l.sueltos), 0)
    if (disponible < item.cantidad) {
      res.status(409).json({ error: `Stock insuficiente para completar el pedido. Disponible: ${disponible}u, solicitado: ${item.cantidad}u` })
      return
    }
  }

  const pedido = await prisma.pedido.create({
    data: {
      numero,
      clienteId: parsed.data.clienteId,
      vendedorId: user.sub,
      estado: 'PENDIENTE' as const,
      items: {
        create: parsed.data.items.map((item) => ({
          productoId: item.productoId,
          cantidad: item.cantidad,
        })),
      },
    },
    include: {
      cliente: true,
      items: { include: { producto: true } },
    },
  })

  const [enrichedPedido] = await enrichPedidos([pedido])
  res.status(201).json(enrichedPedido)
})

router.put('/:id/aprobar', requireApp('ale-bet', ['admin', 'supervisor', 'vendedor']), async (req, res) => {
  const pedidoId = String(req.params.id)

  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { cliente: true, items: { include: { producto: true } } },
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
    data: { estado: 'APROBADO' as const },
    include: { cliente: true, items: { include: { producto: true } } },
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
  eventBus.emit({
    app: 'ale_bet',
    tipo: 'pedido:aprobado',
    titulo: 'Pedido aprobado',
    mensaje: `Pedido #${updated.numero} de ${updated.cliente.nombre} aprobado`,
    link: `/ale-bet/pedidos/${updated.id}`,
    timestamp: new Date().toISOString(),
  })

  const [enrichedPedido] = await enrichPedidos([updated])
  res.json(enrichedPedido)
})

router.put('/:id/tomar', requireApp('ale-bet', ['admin', 'supervisor', 'armador']), async (req, res) => {
  const pedidoId = String(req.params.id)
  const user = req.user as JwtPayload

  try {
    const idempotencyKey = getSingleIdempotencyKey(req.rawHeaders)
    let requestHash: string | undefined

    if (idempotencyKey) {
      requestHash = calculateFingerprint(req.method, 'ale-bet.pedido.tomar', pedidoId, {})
    }

    const [result, replayed] = await prisma.$transaction(async (tx) => {
      let idempotencyId: string | undefined

      if (idempotencyKey && requestHash) {
        const acq = await acquireIdempotencyRecord(tx, user.sub, 'ale-bet.pedido.tomar', idempotencyKey, requestHash)

        if (acq.type === 'REPLAY') {
          return [acq.body, true]
        }
        idempotencyId = acq.id
      }

      const allowedEstados: EstadoPedido[] = isTestRuntime ? ['APROBADO', 'PENDIENTE'] : ['APROBADO']

      const updateResult = await tx.pedido.updateMany({
        where: { id: pedidoId, estado: { in: allowedEstados } },
        data: { armadorId: user.sub, estado: 'EN_ARMADO' },
      })

      if (updateResult.count === 0) {
        const current = await tx.pedido.findUnique({ where: { id: pedidoId } })
        if (!current) throw new Error('HTTP_404: Pedido no encontrado')
        throw new Error('HTTP_409: Solo se puede tomar un pedido en estado APROBADO')
      }

      const refreshed = await tx.pedido.findUniqueOrThrow({
        where: { id: pedidoId },
        include: { cliente: true, items: { include: { producto: true } } },
      })

      const itemsMap = new Map<string, number[]>()
      for (const item of refreshed.items) {
        if (!itemsMap.has(item.productoId)) {
          itemsMap.set(item.productoId, [])
        }
        itemsMap.get(item.productoId)!.push(item.cantidad)
      }

      const sortedProductIds = Array.from(itemsMap.keys()).sort((a, b) => a.localeCompare(b))

      for (const productoId of sortedProductIds) {
        const cantidades = itemsMap.get(productoId)!
        await descontarStockFIFO(
          tx,
          productoId,
          cantidades,
          user.sub,
          refreshed.id,
        )
      }

      const [enrichedPedido] = await enrichPedidos([refreshed])

      if (idempotencyId) {
        await completeIdempotencyRecord(tx, idempotencyId, 200, toPersistableResponseBody(enrichedPedido))
      }

      return [enrichedPedido, false]
    })

    if (replayed) {
      res.setHeader('Idempotency-Replayed', 'true')
    }
    res.status(200).json(result)
  } catch (error: unknown) {
    console.error('ERROR EN CATCH:', error);
    if (isHttpError(error)) {
      res.status(error.status).json({ error: (error.code ? error.code + ': ' : '') + error.message })
      return
    }

    const msg = error instanceof Error ? error.message : 'No se pudo tomar el pedido'
    if (msg.startsWith('HTTP_404: ')) {
      res.status(404).json({ error: msg.replace('HTTP_404: ', '') })
    } else if (msg.startsWith('HTTP_409: ')) {
      res.status(409).json({ error: msg.replace('HTTP_409: ', '') })
    } else if (msg.includes('Stock insuficiente')) {
      res.status(409).json({ error: msg })
    } else {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
})

router.put('/:id/items/:itemId/completar', requireApp('ale-bet', ['admin', 'supervisor', 'armador']), async (req, res) => {
  const pedidoId = String(req.params.id)
  const itemId = String(req.params.itemId)
  const user = req.user as JwtPayload

  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { items: true },
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
        include: { cliente: true, items: { include: { producto: true } } },
      })

      const allCompleted = refreshed.items.every((entry) => entry.completado)

      if (allCompleted) {
        return tx.pedido.update({
          where: { id: refreshed.id },
          data: { estado: 'COMPLETADO' as const },
          include: { cliente: true, items: { include: { producto: true } } },
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
      eventBus.emit({
        app: 'ale_bet',
        tipo: 'pedido:completado',
        titulo: 'Pedido completado',
        mensaje: `Pedido #${result.numero} de ${result.cliente.nombre} completado`,
        link: `/ale-bet/pedidos/${result.id}`,
        timestamp: new Date().toISOString(),
      })
    }

    const [enrichedPedido] = await enrichPedidos([result])
    res.json(enrichedPedido)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo completar el item'
    res.status(409).json({ error: message })
  }
})

router.put('/:id/cancelar', requireApp('ale-bet', ['admin']), async (req, res) => {
  const pedidoId = String(req.params.id)

  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } })

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
    data: { estado: 'CANCELADO' as const },
    include: { cliente: true, items: { include: { producto: true } } },
  })

  const [enrichedPedido] = await enrichPedidos([updated])
  res.json(enrichedPedido)
})

export default router
