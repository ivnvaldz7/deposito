import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

type EstadoPedido = 'PENDIENTE' | 'EN_ARMADO' | 'COMPLETADO' | 'CANCELADO'

const mocks = vi.hoisted(() => {
  let pedidoCounter = 1

  const state = {
    pedidos: [] as Array<{
      id: string
      numero: string
      clienteId: string
      vendedorId: string
      armadorId: string | null
      estado: EstadoPedido
      createdAt: Date
      updatedAt: Date
      cliente: { id: string; nombre: string }
      items: Array<{
        id: string
        pedidoId: string
        productoId: string
        cantidad: number
        completado: boolean
        producto: { id: string; nombre: string; sku: string }
      }>
    }>,
    lotes: [] as Array<{
      id: string
      productoId: string
      cajas: number
      sueltos: number
      activo: boolean
      fechaVencimiento: Date
    }>,
    movimientos: [] as Array<Record<string, unknown>>,
  }

  const prisma: Record<string, any> = {}

  const clonePedido = (pedido: (typeof state.pedidos)[number]) => ({
    ...pedido,
    cliente: { ...pedido.cliente },
    items: pedido.items.map((item) => ({
      ...item,
      producto: { ...item.producto },
    })),
  })

  prisma.pedido = {
    findMany: vi.fn(async ({ where }: any) => {
      const pedidos = state.pedidos.filter((pedido) => {
        if (where?.vendedorId && pedido.vendedorId !== where.vendedorId) return false
        if (where?.estado && pedido.estado !== where.estado) return false
        return true
      })
      return pedidos.map(clonePedido)
    }),
    create: vi.fn(async ({ data }: any) => {
      const pedido = {
        id: `pedido-${pedidoCounter++}`,
        numero: data.numero,
        clienteId: data.clienteId,
        vendedorId: data.vendedorId,
        armadorId: null,
        estado: 'PENDIENTE' as EstadoPedido,
        createdAt: new Date(),
        updatedAt: new Date(),
        cliente: { id: data.clienteId, nombre: 'Cliente Test' },
        items: data.items.create.map((item: any, index: number) => ({
          id: `item-${pedidoCounter}-${index}`,
          pedidoId: `pedido-${pedidoCounter - 1}`,
          productoId: item.productoId,
          cantidad: item.cantidad,
          completado: false,
          producto: {
            id: item.productoId,
            nombre: item.productoId === 'prod-1' ? 'Amantina Premium' : 'Complefusel',
            sku: item.productoId === 'prod-1' ? 'AM' : 'CF',
          },
        })),
      }
      state.pedidos.push(pedido)
      return clonePedido(pedido)
    }),
    findUnique: vi.fn(async ({ where, include }: any) => {
      const pedido = state.pedidos.find((entry) => entry.id === where.id) ?? null
      if (!pedido) return null
      if (include?.items) return clonePedido(pedido)
      return {
        id: pedido.id,
        numero: pedido.numero,
        clienteId: pedido.clienteId,
        vendedorId: pedido.vendedorId,
        armadorId: pedido.armadorId,
        estado: pedido.estado,
        createdAt: pedido.createdAt,
        updatedAt: pedido.updatedAt,
      }
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: any) => {
      const pedido = state.pedidos.find((entry) => entry.id === where.id)
      if (!pedido) throw new Error('Pedido no encontrado')
      return clonePedido(pedido)
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const pedido = state.pedidos.find((entry) => entry.id === where.id)
      if (!pedido) throw new Error('Pedido no encontrado')
      Object.assign(pedido, data, { updatedAt: new Date() })
      return clonePedido(pedido)
    }),
  }

  prisma.itemPedido = {
    update: vi.fn(async ({ where, data }: any) => {
      for (const pedido of state.pedidos) {
        const item = pedido.items.find((entry) => entry.id === where.id)
        if (item) {
          Object.assign(item, data)
          return { ...item, producto: { ...item.producto } }
        }
      }
      throw new Error('Item no encontrado')
    }),
  }

  prisma.lote = {
    findMany: vi.fn(async ({ where }: any) =>
      state.lotes
        .filter((lote) => lote.productoId === where.productoId && lote.activo === where.activo)
        .sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime())
        .map((lote) => ({ ...lote }))),
    update: vi.fn(async ({ where, data }: any) => {
      const lote = state.lotes.find((entry) => entry.id === where.id)
      if (!lote) throw new Error('Lote no encontrado')
      Object.assign(lote, data)
      return { ...lote }
    }),
  }

  prisma.movimientoStock = {
    create: vi.fn(async ({ data }: any) => {
      state.movimientos.push(data)
      return data
    }),
  }

  prisma.$transaction = vi.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma)
  )

  function reset() {
    pedidoCounter = 1
    state.pedidos.length = 0
    state.lotes.length = 0
    state.movimientos.length = 0
    Object.values(prisma).forEach((value) => {
      if (value && typeof value === 'object') {
        Object.values(value).forEach((fn) => {
          if (typeof fn === 'function' && 'mockClear' in fn) {
            ;(fn as { mockClear: () => void }).mockClear()
          }
        })
      }
    })
  }

  return { prisma, state, reset }
})

vi.mock('../lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const rol = req.header('x-test-rol')
    if (!rol) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }
    req.user = {
      id: req.header('x-test-user-id') ?? 'user-1',
      email: req.header('x-test-email') ?? 'test@alebet.com',
      rol,
    }
    next()
  },
  requireRole:
    (...roles: string[]) =>
    (req: any, res: any, next: any) => {
      if (!roles.includes(req.user?.rol)) {
        res.status(403).json({ error: 'No autorizado' })
        return
      }
      next()
    },
}))
vi.mock('../generated/client', () => ({
  EstadoPedido: {
    PENDIENTE: 'PENDIENTE',
    EN_ARMADO: 'EN_ARMADO',
    COMPLETADO: 'COMPLETADO',
    CANCELADO: 'CANCELADO',
  },
  TipoMovimiento: {
    ENTRADA_MANUAL: 'ENTRADA_MANUAL',
    SALIDA_PEDIDO: 'SALIDA_PEDIDO',
    AJUSTE: 'AJUSTE',
  },
}))

import pedidosRouter from '../routes/pedidos'

describe('Pedidos Ale-Bet', () => {
  const app = createTestApp('/api/pedidos', pedidosRouter)

  beforeEach(() => {
    mocks.reset()
  })

  it('vendedor crea pedido y solo ve sus pedidos', async () => {
    const created = await request(app)
      .post('/api/pedidos')
      .set('x-test-rol', 'vendedor')
      .set('x-test-user-id', 'vend-1')
      .send({
        clienteId: 'cliente-1',
        items: [
          { productoId: 'prod-1', cantidad: 4 },
          { productoId: 'prod-2', cantidad: 2 },
        ],
      })

    expect(created.status).toBe(201)
    expect(created.body.vendedorId).toBe('vend-1')
    expect(created.body.estado).toBe('PENDIENTE')

    mocks.state.pedidos.push({
      id: 'pedido-ajeno',
      numero: 'P-20260412-9999',
      clienteId: 'cliente-2',
      vendedorId: 'vend-2',
      armadorId: null,
      estado: 'PENDIENTE',
      createdAt: new Date(),
      updatedAt: new Date(),
      cliente: { id: 'cliente-2', nombre: 'Otro Cliente' },
      items: [],
    })

    const listed = await request(app)
      .get('/api/pedidos')
      .set('x-test-rol', 'vendedor')
      .set('x-test-user-id', 'vend-1')

    expect(listed.status).toBe(200)
    expect(listed.body).toHaveLength(1)
    expect(listed.body[0].vendedorId).toBe('vend-1')
  })

  it('armador toma y completa un pedido descontando stock FIFO', async () => {
    mocks.state.pedidos.push({
      id: 'pedido-1',
      numero: 'P-20260412-0001',
      clienteId: 'cliente-1',
      vendedorId: 'vend-1',
      armadorId: null,
      estado: 'PENDIENTE',
      createdAt: new Date(),
      updatedAt: new Date(),
      cliente: { id: 'cliente-1', nombre: 'Cliente Test' },
      items: [
        {
          id: 'item-1',
          pedidoId: 'pedido-1',
          productoId: 'prod-1',
          cantidad: 8,
          completado: false,
          producto: { id: 'prod-1', nombre: 'Amantina Premium', sku: 'AM' },
        },
      ],
    })
    mocks.state.lotes.push(
      {
        id: 'lote-1',
        productoId: 'prod-1',
        cajas: 0,
        sueltos: 5,
        activo: true,
        fechaVencimiento: new Date('2026-05-01'),
      },
      {
        id: 'lote-2',
        productoId: 'prod-1',
        cajas: 1,
        sueltos: 0,
        activo: true,
        fechaVencimiento: new Date('2026-06-01'),
      }
    )

    const tomado = await request(app)
      .put('/api/pedidos/pedido-1/tomar')
      .set('x-test-rol', 'armador')
      .set('x-test-user-id', 'arm-1')

    expect(tomado.status).toBe(200)
    expect(tomado.body.estado).toBe('EN_ARMADO')
    expect(tomado.body.armadorId).toBe('arm-1')

    const completed = await request(app)
      .put('/api/pedidos/pedido-1/items/item-1/completar')
      .set('x-test-rol', 'armador')
      .set('x-test-user-id', 'arm-1')

    expect(completed.status).toBe(200)
    expect(completed.body.estado).toBe('COMPLETADO')
    expect(mocks.state.movimientos).toHaveLength(1)
    expect(mocks.state.movimientos[0]?.cantidad).toBe(-8)
    expect(mocks.state.lotes[0]?.activo).toBe(false)
    expect(mocks.state.lotes[0]?.sueltos).toBe(0)
    expect(mocks.state.lotes[1]?.cajas).toBe(0)
    expect(mocks.state.lotes[1]?.sueltos).toBe(12)
  })
})
