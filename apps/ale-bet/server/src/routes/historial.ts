import { Router } from 'express'
import ExcelJS from 'exceljs'
import { prisma } from '../lib/prisma'
import { authenticate, requireApp, type AuthRequest } from '../middleware/auth'
import { type EstadoPedido, type Prisma } from '@prisma/client'

const router = Router()

const ESTADOS_PEDIDO = ['PENDIENTE', 'APROBADO', 'EN_ARMADO', 'COMPLETADO', 'CANCELADO'] as const

type HistorialPedidoRow = Prisma.PedidoGetPayload<{
  include: {
    cliente: true
    items: {
      include: {
        producto: true
      }
    }
  }
}>

interface HistorialPedidoResponse {
  id: string
  numero: string
  estado: EstadoPedido
  createdAt: Date
  clienteNombre: string
  vendedorNombre: string
  armadorNombre: string | null
  items: Array<{
    productoNombre: string
    cantidad: number
  }>
}

function isEstadoPedido(value: string): value is EstadoPedido {
  return ESTADOS_PEDIDO.includes(value as (typeof ESTADOS_PEDIDO)[number])
}

function parseDateFilter(value: unknown, endOfDay = false): Date | null | 'invalid' {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  const trimmed = value.trim()
  const hasTime = trimmed.includes('T')
  const parsed = new Date(hasTime ? trimmed : `${trimmed}T00:00:00`)

  if (Number.isNaN(parsed.getTime())) {
    return 'invalid'
  }

  if (!hasTime && endOfDay) {
    parsed.setHours(23, 59, 59, 999)
  }

  return parsed
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

function buildHistorialWhere(req: AuthRequest): Prisma.PedidoWhereInput | { error: string } {
  const { user } = req

  if (!user) {
    return { error: 'No autenticado' }
  }

  const desde = parseDateFilter(req.query.desde)
  if (desde === 'invalid') {
    return { error: 'Parámetro "desde" inválido' }
  }

  const hasta = parseDateFilter(req.query.hasta, true)
  if (hasta === 'invalid') {
    return { error: 'Parámetro "hasta" inválido' }
  }

  const estadoValue = typeof req.query.estado === 'string' ? req.query.estado : undefined
  if (estadoValue && !isEstadoPedido(estadoValue)) {
    return { error: 'Parámetro "estado" inválido' }
  }
  const estado = estadoValue && isEstadoPedido(estadoValue) ? estadoValue : undefined

  const vendedorId = typeof req.query.vendedorId === 'string' ? req.query.vendedorId : undefined
  const clienteId = typeof req.query.clienteId === 'string' ? req.query.clienteId : undefined

  const where: Prisma.PedidoWhereInput = {}

  if (desde || hasta) {
    where.createdAt = {}

    if (desde) {
      where.createdAt.gte = desde
    }

    if (hasta) {
      where.createdAt.lte = hasta
    }
  }

  if (clienteId) {
    where.clienteId = clienteId
  }

  if (estado) {
    where.estado = estado
  }

  if (user.rol === 'vendedor') {
    where.vendedorId = user.id
  } else if (vendedorId) {
    where.vendedorId = vendedorId
  }

  return where
}

async function loadHistorialPedidos(where: Prisma.PedidoWhereInput): Promise<HistorialPedidoResponse[]> {
  const pedidos = await prisma.pedido.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
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

  const userIds = new Set<string>()

  for (const pedido of pedidos) {
    userIds.add(pedido.vendedorId)

    if (pedido.armadorId) {
      userIds.add(pedido.armadorId)
    }
  }

  const userMap = await getPlatformUserNames([...userIds])

  return pedidos.map((pedido: HistorialPedidoRow) => ({
    id: pedido.id,
    numero: pedido.numero,
    estado: pedido.estado,
    createdAt: pedido.createdAt,
    clienteNombre: pedido.cliente.nombre,
    vendedorNombre: userMap.get(pedido.vendedorId) ?? 'Sin vendedor',
    armadorNombre: pedido.armadorId ? (userMap.get(pedido.armadorId) ?? 'Sin armador') : null,
    items: pedido.items.map((item) => ({
      productoNombre: item.producto.nombre,
      cantidad: item.cantidad,
    })),
  }))
}

function buildProductosCell(items: HistorialPedidoResponse['items']): string {
  return items.map((item) => `${item.productoNombre} x${item.cantidad}`).join(', ')
}

router.get('/', authenticate, requireApp('ale_bet', ['admin', 'vendedor']), async (req, res) => {
  const authReq = req as AuthRequest
  const where = buildHistorialWhere(authReq)

  if ('error' in where) {
    res.status(400).json({ error: where.error })
    return
  }

  res.json(await loadHistorialPedidos(where))
})

router.get('/export', authenticate, requireApp('ale_bet', ['admin', 'vendedor']), async (req, res) => {
  const authReq = req as AuthRequest
  const where = buildHistorialWhere(authReq)

  if ('error' in where) {
    res.status(400).json({ error: where.error })
    return
  }

  const pedidos = await loadHistorialPedidos(where)
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Historial')
  const isVendedor = authReq.user?.rol === 'vendedor'

  const columns = isVendedor
    ? [
        { header: 'Número de pedido', key: 'numero', width: 22 },
        { header: 'Cliente', key: 'clienteNombre', width: 28 },
        { header: 'Productos', key: 'productos', width: 48 },
        { header: 'Fecha', key: 'createdAt', width: 22 },
        { header: 'Armador', key: 'armadorNombre', width: 24 },
        { header: 'Estado', key: 'estado', width: 18 },
      ]
    : [
        { header: 'Número de pedido', key: 'numero', width: 22 },
        { header: 'Cliente', key: 'clienteNombre', width: 28 },
        { header: 'Productos', key: 'productos', width: 48 },
        { header: 'Fecha', key: 'createdAt', width: 22 },
        { header: 'Vendedor', key: 'vendedorNombre', width: 24 },
        { header: 'Armador', key: 'armadorNombre', width: 24 },
        { header: 'Estado', key: 'estado', width: 18 },
      ]

  worksheet.columns = columns
  worksheet.getRow(1).font = { bold: true }

  for (const pedido of pedidos) {
    const row = {
      numero: pedido.numero,
      clienteNombre: pedido.clienteNombre,
      productos: buildProductosCell(pedido.items),
      createdAt: new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(pedido.createdAt)),
      vendedorNombre: pedido.vendedorNombre,
      armadorNombre: pedido.armadorNombre ?? '—',
      estado: pedido.estado,
    }

    worksheet.addRow(row)
  }

  const fileBuffer = await workbook.xlsx.writeBuffer()
  const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer)

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="historial-pedidos.xlsx"'
  )
  res.send(buffer)
})

export default router
