import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type EstadoPedido = 'PENDIENTE' | 'APROBADO' | 'EN_ARMADO' | 'COMPLETADO' | 'CANCELADO'

const mocks = vi.hoisted(() => {
  const state = {
    productos: [] as Array<{
      id: string
      nombre: string
      sku: string
      stockMinimo: number
      activo: boolean
      createdAt: Date
      updatedAt: Date
    }>,
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
      numero: string
      productoId: string
      cajas: number
      sueltos: number
      activo: boolean
      fechaProduccion: Date
      fechaVencimiento: Date
      createdAt: Date
    }>,
    movimientos: [] as Array<Record<string, unknown> & { createdAt: Date }>,
  }

  const clonePedido = (pedido: (typeof state.pedidos)[number]) => ({
    ...pedido,
    cliente: { ...pedido.cliente },
    items: pedido.items.map((item) => ({
      ...item,
      producto: { ...item.producto },
    })),
  })

  const prisma: Record<string, any> = {}

  prisma.producto = {
    findMany: vi.fn(async ({ include }: any = {}) =>
      state.productos.map((producto) => ({
        ...producto,
        ...(include?.lotes
          ? {
              lotes: state.lotes
                .filter((lote) => lote.productoId === producto.id && lote.activo)
                .map((lote) => ({ ...lote })),
            }
          : {}),
      }))),
    create: vi.fn(async ({ data }: any) => ({
      id: 'prod-new',
      activo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    })),
  }

  prisma.pedido = {
    findUnique: vi.fn(async ({ where, include }: any) => {
      const pedido = state.pedidos.find((entry) => entry.id === where.id) ?? null
      if (!pedido) return null
      if (include?.items || include?.cliente) return clonePedido(pedido)
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
    update: vi.fn(async ({ where, data }: any) => {
      const pedido = state.pedidos.find((entry) => entry.id === where.id)
      if (!pedido) throw new Error('Pedido no encontrado')
      Object.assign(pedido, data, { updatedAt: new Date() })
      return clonePedido(pedido)
    }),
  }

  prisma.itemPedido = {
    findFirst: vi.fn(async () => null),
  }

  prisma.movimientoStock = {
    findMany: vi.fn(async () => state.movimientos.map((movimiento) => ({ ...movimiento }))),
  }

  prisma.$transaction = vi.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma)
  )

  function reset() {
    state.productos.length = 0
    state.pedidos.length = 0
    state.lotes.length = 0
    state.movimientos.length = 0

    state.productos.push({
      id: 'prod-1',
      nombre: 'Amantina Premium',
      sku: 'AM',
      stockMinimo: 5,
      activo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    state.pedidos.push({
      id: 'pedido-1',
      numero: 'P-20260416-0001',
      clienteId: 'cliente-1',
      vendedorId: 'vend-1',
      armadorId: null,
      estado: 'APROBADO',
      createdAt: new Date(),
      updatedAt: new Date(),
      cliente: { id: 'cliente-1', nombre: 'Cliente Test' },
      items: [
        {
          id: 'item-1',
          pedidoId: 'pedido-1',
          productoId: 'prod-1',
          cantidad: 3,
          completado: false,
          producto: { id: 'prod-1', nombre: 'Amantina Premium', sku: 'AM' },
        },
      ],
    })

    state.lotes.push({
      id: 'lote-1',
      numero: 'AM0001',
      productoId: 'prod-1',
      cajas: 1,
      sueltos: 5,
      activo: true,
      fechaProduccion: new Date('2026-01-10'),
      fechaVencimiento: new Date('2028-01-10'),
      createdAt: new Date(),
    })

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

  return { prisma, reset }
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
vi.mock('@prisma/client', () => ({
  EstadoPedido: {
    PENDIENTE: 'PENDIENTE',
    APROBADO: 'APROBADO',
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
import productosRouter from '../routes/productos'
import stockRouter from '../routes/stock'

describe('Permisos Ale-Bet', () => {
  const app = express()
  app.use(express.json())
  app.use('/api/pedidos', pedidosRouter)
  app.use('/api/productos', productosRouter)
  app.use('/api/stock', stockRouter)

  beforeEach(() => {
    mocks.reset()
  })

  it('GET /api/productos sin token devuelve 401', async () => {
    const res = await request(app).get('/api/productos')
    expect(res.status).toBe(401)
  })

  it('POST /api/productos con rol vendedor devuelve 403', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('x-test-rol', 'vendedor')
      .send({ nombre: 'Producto Test', sku: 'PT', stockMinimo: 3 })

    expect(res.status).toBe(403)
  })

  it('POST /api/productos con rol armador devuelve 403', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('x-test-rol', 'armador')
      .send({ nombre: 'Producto Test', sku: 'PT', stockMinimo: 3 })

    expect(res.status).toBe(403)
  })

  it('POST /api/productos con rol admin devuelve 201', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('x-test-rol', 'admin')
      .send({ nombre: 'Producto Test', sku: 'PT', stockMinimo: 3 })

    expect(res.status).toBe(201)
  })

  it('PUT /api/pedidos/:id/tomar con rol vendedor devuelve 403', async () => {
    const res = await request(app)
      .put('/api/pedidos/pedido-1/tomar')
      .set('x-test-rol', 'vendedor')
      .set('x-test-user-id', 'vend-1')

    expect(res.status).toBe(403)
  })

  it('PUT /api/pedidos/:id/tomar con rol armador devuelve 200', async () => {
    const res = await request(app)
      .put('/api/pedidos/pedido-1/tomar')
      .set('x-test-rol', 'armador')
      .set('x-test-user-id', 'arm-1')

    expect(res.status).toBe(200)
    expect(res.body.estado).toBe('EN_ARMADO')
  })

  it('PUT /api/pedidos/:id/aprobar con rol armador devuelve 403', async () => {
    const res = await request(app)
      .put('/api/pedidos/pedido-1/aprobar')
      .set('x-test-rol', 'armador')

    expect(res.status).toBe(403)
  })

  it('PUT /api/pedidos/:id/aprobar con rol vendedor devuelve 200', async () => {
    mocks.prisma.pedido.findUnique.mockResolvedValueOnce({
      id: 'pedido-2',
      numero: 'P-20260416-0002',
      clienteId: 'cliente-1',
      vendedorId: 'vend-1',
      armadorId: null,
      estado: 'PENDIENTE',
      createdAt: new Date(),
      updatedAt: new Date(),
      cliente: { id: 'cliente-1', nombre: 'Cliente Test' },
      items: [],
    })

    mocks.prisma.pedido.update.mockResolvedValueOnce({
      id: 'pedido-2',
      numero: 'P-20260416-0002',
      clienteId: 'cliente-1',
      vendedorId: 'vend-1',
      armadorId: null,
      estado: 'APROBADO',
      createdAt: new Date(),
      updatedAt: new Date(),
      cliente: { id: 'cliente-1', nombre: 'Cliente Test' },
      items: [],
    })

    const res = await request(app)
      .put('/api/pedidos/pedido-1/aprobar')
      .set('x-test-rol', 'vendedor')
      .set('x-test-user-id', 'vend-1')

    expect(res.status).toBe(200)
    expect(res.body.estado).toBe('APROBADO')
  })

  it('PUT /api/pedidos/:id/cancelar con rol armador devuelve 403', async () => {
    const res = await request(app)
      .put('/api/pedidos/pedido-1/cancelar')
      .set('x-test-rol', 'armador')

    expect(res.status).toBe(403)
  })

  it('PUT /api/pedidos/:id/cancelar con rol admin devuelve 200', async () => {
    const res = await request(app)
      .put('/api/pedidos/pedido-1/cancelar')
      .set('x-test-rol', 'admin')

    expect(res.status).toBe(200)
    expect(res.body.estado).toBe('CANCELADO')
  })

  it('GET /api/stock con rol vendedor devuelve 403', async () => {
    const res = await request(app).get('/api/stock').set('x-test-rol', 'vendedor')
    expect(res.status).toBe(403)
  })

  it('GET /api/stock con rol admin devuelve 200', async () => {
    const res = await request(app).get('/api/stock').set('x-test-rol', 'admin')
    expect(res.status).toBe(200)
  })
})
