import { Router, type Request } from 'express'
import ExcelJS from 'exceljs'
import { platformDb as prisma, type Prisma } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { requireApp } from '../../middlewares/require-app'

const router = Router()

const ESTADOS_PEDIDO = ['PENDIENTE', 'APROBADO', 'EN_ARMADO', 'COMPLETADO', 'CANCELADO'] as const

type EstadoPedido = (typeof ESTADOS_PEDIDO)[number]

interface HistorialPedidoResponse {
  id: string
  numero: string
  estado: EstadoPedido
  createdAt: Date
  clienteNombre: string
  vendedorNombre: string
  armadorNombre: string | null
  items: Array<{ productoNombre: string; cantidad: number }>
}

function isEstadoPedido(value: string): value is EstadoPedido {
  return ESTADOS_PEDIDO.includes(value as EstadoPedido)
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
    const users = await prisma.platformUser.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nombre: true },
    })

    return new Map(users.map((user) => [user.id, user.nombre]))
  } catch {
    return new Map()
  }
}

function buildHistorialWhere(req: Request, user: JwtPayload): Prisma.PedidoWhereInput | { error: string } {
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
  const rol = user.apps['ale_bet']?.rol

  const where: Prisma.PedidoWhereInput = {}

  if (desde || hasta) {
    where.createdAt = {}
    if (desde) where.createdAt.gte = desde
    if (hasta) where.createdAt.lte = hasta
  }

  if (clienteId) {
    where.clienteId = clienteId
  }

  if (estado) {
    where.estado = estado as any
  }

  if (rol === 'vendedor') {
    where.vendedorId = user.sub
  } else if (vendedorId) {
    where.vendedorId = vendedorId
  }

  return where
}

async function loadHistorialPedidos(where: Prisma.PedidoWhereInput): Promise<HistorialPedidoResponse[]> {
  const pedidos = await prisma.pedido.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      cliente: true,
      items: { include: { producto: true } },
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

  return pedidos.map((pedido) => ({
    id: pedido.id,
    numero: pedido.numero,
    estado: pedido.estado as EstadoPedido,
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

router.get('/', requireApp('ale_bet', ['admin', 'vendedor']), async (req, res) => {
  const user = req.user as JwtPayload
  const where = buildHistorialWhere(req, user)

  if ('error' in where) {
    res.status(400).json({ error: where.error })
    return
  }

  res.json(await loadHistorialPedidos(where))
})

router.get('/export', requireApp('ale_bet', ['admin', 'vendedor']), async (req, res) => {
  const user = req.user as JwtPayload
  const where = buildHistorialWhere(req, user)

  if ('error' in where) {
    res.status(400).json({ error: where.error })
    return
  }

  const pedidos = await loadHistorialPedidos(where)
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Historial')
  const isVendedor = user.apps['ale_bet']?.rol === 'vendedor'

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
