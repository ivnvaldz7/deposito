import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type EstadoPedido = 'PENDIENTE' | 'APROBADO' | 'EN_ARMADO' | 'COMPLETADO' | 'CANCELADO'

const mocks = vi.hoisted(() => {
  let pedidoCounter = 1
  let loteCounter = 1

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

  const cloneProducto = (
    producto: (typeof state.productos)[number],
    options?: { includeLotes?: boolean; activeOnly?: boolean }
  ) => {
    const lotes = options?.includeLotes
      ? state.lotes
          .filter((lote) => lote.productoId === producto.id && (!options.activeOnly || lote.activo))
          .sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime())
          .map((lote) => ({ ...lote }))
      : undefined

    return {
      ...producto,
      ...(lotes ? { lotes } : {}),
    }
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
    findMany: vi.fn(async ({ include, orderBy }: any = {}) => {
      const productos = state.productos
        .map((producto) =>
          cloneProducto(producto, {
            includeLotes: Boolean(include?.lotes),
            activeOnly: include?.lotes?.where?.activo === true,
          })
        )
        .sort((a, b) =>
          orderBy?.nombre === 'asc' ? a.nombre.localeCompare(b.nombre) : 0
        )
      return productos
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      const producto = state.productos.find((entry) => entry.id === where.id) ?? null
      return producto ? cloneProducto(producto) : null
    }),
  }

  prisma.pedido = {
    create: vi.fn(async ({ data }: any) => {
      const pedidoId = `pedido-${pedidoCounter++}`
      const pedido = {
        id: pedidoId,
        numero: data.numero,
        clienteId: data.clienteId,
        vendedorId: data.vendedorId,
        armadorId: null,
        estado: 'PENDIENTE' as EstadoPedido,
        createdAt: new Date(),
        updatedAt: new Date(),
        cliente: { id: data.clienteId, nombre: 'Cliente Test' },
        items: data.items.create.map((item: any, index: number) => {
          const producto = state.productos.find((entry) => entry.id === item.productoId)

          return {
            id: `item-${pedidoId}-${index + 1}`,
            pedidoId,
            productoId: item.productoId,
            cantidad: item.cantidad,
            completado: false,
            producto: {
              id: item.productoId,
              nombre: producto?.nombre ?? `Producto ${item.productoId}`,
              sku: producto?.sku ?? item.productoId.toUpperCase(),
            },
          }
        }),
      }

      state.pedidos.push(pedido)
      return clonePedido(pedido)
    }),
    findUnique: vi.fn(async ({ where, include }: any) => {
      const pedido = state.pedidos.find((entry) => entry.id === where.id) ?? null
      if (!pedido) return null
      if (include?.items || include?.cliente) {
        return clonePedido(pedido)
      }

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
        if (!item) continue
        Object.assign(item, data)
        return { ...item, producto: { ...item.producto } }
      }

      throw new Error('Item no encontrado')
    }),
  }

  prisma.lote = {
    count: vi.fn(async ({ where }: any) =>
      state.lotes.filter((lote) => lote.productoId === where.productoId).length
    ),
    create: vi.fn(async ({ data }: any) => {
      const duplicate = state.lotes.find(
        (lote) => lote.productoId === data.productoId && lote.numero === data.numero
      )

      if (duplicate) {
        const error = new Error('Unique constraint failed')
        Object.assign(error, { code: 'P2002' })
        throw error
      }

      const lote = {
        id: `lote-${loteCounter++}`,
        numero: data.numero,
        productoId: data.productoId,
        cajas: data.cajas,
        sueltos: data.sueltos,
        activo: true,
        fechaProduccion: data.fechaProduccion,
        fechaVencimiento: data.fechaVencimiento,
        createdAt: new Date(),
      }

      state.lotes.push(lote)
      return { ...lote }
    }),
    findMany: vi.fn(async ({ where }: any = {}) =>
      state.lotes
        .filter((lote) => {
          if (where?.productoId && lote.productoId !== where.productoId) return false
          if (typeof where?.activo === 'boolean' && lote.activo !== where.activo) return false
          return true
        })
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
    findMany: vi.fn(async ({ take, orderBy }: any = {}) => {
      const movimientos = [...state.movimientos].sort((a, b) =>
        orderBy?.createdAt === 'desc'
          ? b.createdAt.getTime() - a.createdAt.getTime()
          : a.createdAt.getTime() - b.createdAt.getTime()
      )

      return typeof take === 'number' ? movimientos.slice(0, take) : movimientos
    }),
    create: vi.fn(async ({ data }: any) => {
      const movimiento = { ...data, createdAt: new Date() }
      state.movimientos.push(movimiento)
      return movimiento
    }),
  }

  prisma.$transaction = vi.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma)
  )

  function reset() {
    pedidoCounter = 1
    loteCounter = 1
    state.productos.length = 0
    state.pedidos.length = 0
    state.lotes.length = 0
    state.movimientos.length = 0

    state.productos.push(
      {
        id: 'prod-1',
        nombre: 'Amantina Premium',
        sku: 'AM',
        stockMinimo: 10,
        activo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'prod-2',
        nombre: 'Complefusel',
        sku: 'CF',
        stockMinimo: 5,
        activo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    )

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

describe('Stock Ale-Bet', () => {
  const app = express()
  app.use(express.json())
  app.use('/api/pedidos', pedidosRouter)
  app.use('/api/productos', productosRouter)
  app.use('/api/stock', stockRouter)

  beforeEach(() => {
    mocks.reset()
  })

  it('stock total suma cajas y sueltos de lotes activos', async () => {
    mocks.state.lotes.push(
      {
        id: 'lote-1',
        numero: 'AM0001',
        productoId: 'prod-1',
        cajas: 2,
        sueltos: 4,
        activo: true,
        fechaProduccion: new Date('2026-01-10'),
        fechaVencimiento: new Date('2028-01-10'),
        createdAt: new Date(),
      },
      {
        id: 'lote-2',
        numero: 'AM0002',
        productoId: 'prod-1',
        cajas: 1,
        sueltos: 3,
        activo: true,
        fechaProduccion: new Date('2026-02-10'),
        fechaVencimiento: new Date('2028-02-10'),
        createdAt: new Date(),
      },
      {
        id: 'lote-3',
        numero: 'AM0003',
        productoId: 'prod-1',
        cajas: 5,
        sueltos: 0,
        activo: false,
        fechaProduccion: new Date('2025-01-10'),
        fechaVencimiento: new Date('2027-01-10'),
        createdAt: new Date(),
      }
    )

    const res = await request(app).get('/api/stock').set('x-test-rol', 'admin')

    expect(res.status).toBe(200)
    expect(res.body.productos).toHaveLength(2)
    expect(res.body.productos[0].id).toBe('prod-1')
    expect(res.body.productos[0].stock).toBe(52)
    expect(res.body.productos[0].stockBajo).toBe(false)
  })

  it('al completar pedido descuenta stock FIFO y continúa en el siguiente lote al agotar el primero', async () => {
    mocks.state.lotes.push(
      {
        id: 'lote-1',
        numero: 'AM0001',
        productoId: 'prod-1',
        cajas: 0,
        sueltos: 5,
        activo: true,
        fechaProduccion: new Date('2026-01-10'),
        fechaVencimiento: new Date('2028-01-10'),
        createdAt: new Date(),
      },
      {
        id: 'lote-2',
        numero: 'AM0002',
        productoId: 'prod-1',
        cajas: 1,
        sueltos: 0,
        activo: true,
        fechaProduccion: new Date('2026-02-10'),
        fechaVencimiento: new Date('2028-02-10'),
        createdAt: new Date(),
      }
    )

    const creado = await request(app)
      .post('/api/pedidos')
      .set('x-test-rol', 'vendedor')
      .set('x-test-user-id', 'vend-1')
      .send({
        clienteId: 'cliente-1',
        items: [{ productoId: 'prod-1', cantidad: 8 }],
      })

    const aprobado = await request(app)
      .put(`/api/pedidos/${creado.body.id}/aprobar`)
      .set('x-test-rol', 'vendedor')
      .set('x-test-user-id', 'vend-1')

    const tomado = await request(app)
      .put(`/api/pedidos/${creado.body.id}/tomar`)
      .set('x-test-rol', 'armador')
      .set('x-test-user-id', 'arm-1')

    const completado = await request(app)
      .put(`/api/pedidos/${creado.body.id}/items/${creado.body.items[0].id}/completar`)
      .set('x-test-rol', 'armador')
      .set('x-test-user-id', 'arm-1')

    expect(aprobado.status).toBe(200)
    expect(tomado.status).toBe(200)
    expect(completado.status).toBe(200)
    expect(completado.body.estado).toBe('COMPLETADO')
    expect(mocks.state.lotes[0]).toMatchObject({ id: 'lote-1', sueltos: 0, activo: false })
    expect(mocks.state.lotes[1]).toMatchObject({ id: 'lote-2', cajas: 0, sueltos: 12, activo: true })
    expect(mocks.state.movimientos).toHaveLength(1)
    expect(mocks.state.movimientos[0]?.cantidad).toBe(-8)
  })

  it('rechaza crear lote con sueltos por encima del máximo permitido', async () => {
    const res = await request(app)
      .post('/api/productos/prod-1/lotes')
      .set('x-test-rol', 'admin')
      .set('x-test-user-id', 'admin-1')
      .send({
        numero: 'AM0099',
        cajas: 1,
        sueltos: 15,
        fechaProduccion: '2026-04-10T00:00:00.000Z',
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Datos inválidos')
  })

  it('rechaza número de lote duplicado para el mismo producto', async () => {
    mocks.state.lotes.push({
      id: 'lote-1',
      numero: 'AM0001',
      productoId: 'prod-1',
      cajas: 1,
      sueltos: 0,
      activo: true,
      fechaProduccion: new Date('2026-01-10'),
      fechaVencimiento: new Date('2028-01-10'),
      createdAt: new Date(),
    })

    const res = await request(app)
      .post('/api/productos/prod-1/lotes')
      .set('x-test-rol', 'admin')
      .set('x-test-user-id', 'admin-1')
      .send({
        numero: 'AM0001',
        cajas: 1,
        sueltos: 0,
        fechaProduccion: '2026-04-10T00:00:00.000Z',
      })

    expect(res.status).toBe(409)
    expect(res.body.error).toContain('Ya existe un lote')
  })

  it('permite reutilizar número de lote en productos distintos', async () => {
    mocks.state.lotes.push({
      id: 'lote-1',
      numero: 'LOTE-42',
      productoId: 'prod-1',
      cajas: 1,
      sueltos: 0,
      activo: true,
      fechaProduccion: new Date('2026-01-10'),
      fechaVencimiento: new Date('2028-01-10'),
      createdAt: new Date(),
    })

    const res = await request(app)
      .post('/api/productos/prod-2/lotes')
      .set('x-test-rol', 'admin')
      .set('x-test-user-id', 'admin-1')
      .send({
        numero: 'LOTE-42',
        cajas: 0,
        sueltos: 7,
        fechaProduccion: '2026-04-10T00:00:00.000Z',
      })

    expect(res.status).toBe(201)
    expect(res.body.numero).toBe('LOTE-42')
    expect(mocks.state.lotes).toHaveLength(2)
    expect(mocks.state.lotes[1]?.productoId).toBe('prod-2')
  })
})
