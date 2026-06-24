import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

type Mercado = 'argentina' | 'colombia' | 'mexico' | 'ecuador' | 'bolivia' | 'paraguay' | 'no_exportable'
type EstadoOrden = 'solicitada' | 'aprobada' | 'ejecutada' | 'completada' | 'rechazada'

const mocks = vi.hoisted(() => {
  let idCounter = 1

  const state = {
    ordenes: [] as Array<{
      id: string
      solicitanteId: string
      aprobadoPor: string | null
      productoId: string | null
      categoria: 'estuche'
      productoNombre: string
      mercado: Mercado | null
      cantidad: number
      urgencia: 'normal' | 'urgente'
      estado: EstadoOrden
      motivoRechazo: string | null
      createdAt: Date
      updatedAt: Date
    }>,
    inventarioEstuches: [] as Array<{ id: string; productoId: string | null; articulo: string; mercado: Mercado; cantidad: number }>,
    inventarioFrascos: [] as Array<{ id: string; productoId: string | null; articulo: string; cantidadCajas: number; unidadesPorCaja: number }>,
    movimientos: [] as Array<Record<string, unknown>>,
  }

  const nextId = (prefix: string) => `${prefix}-${idCounter++}`
  const prisma: Record<string, any> = {}

  const includeOrden = (orden: (typeof state.ordenes)[number]) => ({
    ...orden,
    solicitante: { id: orden.solicitanteId, name: `Solicitante ${orden.solicitanteId}`, role: 'solicitante' },
    aprobador: orden.aprobadoPor ? { id: orden.aprobadoPor, name: 'Encargado' } : null,
  })

  prisma.ordenProduccion = {
    create: vi.fn(async ({ data, include }: any) => {
      const orden = {
        id: nextId('orden'),
        solicitanteId: data.solicitanteId,
        aprobadoPor: null,
        productoId: data.productoId ?? null,
        categoria: data.categoria,
        productoNombre: data.productoNombre,
        mercado: data.mercado ?? null,
        cantidad: data.cantidad,
        urgencia: data.urgencia,
        estado: 'solicitada' as EstadoOrden,
        motivoRechazo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      state.ordenes.push(orden)
      return include ? includeOrden(orden) : orden
    }),
    findUnique: vi.fn(async ({ where, include }: any) => {
      const orden = state.ordenes.find((row) => row.id === where.id) ?? null
      if (!orden) return null
      return include ? includeOrden(orden) : orden
    }),
    findMany: vi.fn(async ({ where, include }: any) => {
      const filtered = state.ordenes.filter((orden) => {
        if (where?.solicitanteId && orden.solicitanteId !== where.solicitanteId) return false
        if (where?.estado && orden.estado !== where.estado) return false
        return true
      })
      return include ? filtered.map(includeOrden) : filtered
    }),
    update: vi.fn(async ({ where, data, include }: any) => {
      const orden = state.ordenes.find((row) => row.id === where.id)
      if (!orden) throw new Error('Orden no encontrada')
      Object.assign(orden, data, { updatedAt: new Date() })
      return include ? includeOrden(orden) : orden
    }),
  }

  prisma.inventarioEstuche = {
    findFirst: vi.fn(async ({ where }: any) =>
      state.inventarioEstuches.find((row) =>
        (where.productoId == null || row.productoId === where.productoId) &&
        row.mercado === where.mercado
      ) ?? null),
    findMany: vi.fn(async ({ where }: any) =>
      state.inventarioEstuches.filter((row) => row.mercado === where.mercado)),
    findUnique: vi.fn(async ({ where }: any) =>
      state.inventarioEstuches.find((row) =>
        row.articulo === where.articulo_mercado.articulo && row.mercado === where.articulo_mercado.mercado
      ) ?? null),
    update: vi.fn(async ({ where, data }: any) => {
      const row = state.inventarioEstuches.find((inv) => inv.id === where.id)
      if (!row) throw new Error('Inventario no encontrado')
      if (data.cantidad?.decrement) row.cantidad -= data.cantidad.decrement
      return row
    }),
  }

  prisma.inventarioDroga = {
    findMany: vi.fn(async () => []),
    aggregate: vi.fn(async () => ({ _sum: { cantidad: 0 } })),
    update: vi.fn(),
  }

  prisma.inventarioEtiqueta = {
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
    update: vi.fn(),
  }

  prisma.inventarioFrasco = {
    findFirst: vi.fn(async ({ where }: any) =>
      state.inventarioFrascos.find((row) =>
        where.productoId == null || row.productoId === where.productoId
      ) ?? null),
    findMany: vi.fn(async () => state.inventarioFrascos),
    findUnique: vi.fn(async ({ where }: any) =>
      state.inventarioFrascos.find((row) => row.articulo === where.articulo) ?? null),
    update: vi.fn(async ({ where, data }: any) => {
      const row = state.inventarioFrascos.find((inv) => inv.id === where.id)
      if (!row) throw new Error('Inventario no encontrado')
      if (data.cantidadCajas !== undefined) {
        row.cantidadCajas = data.cantidadCajas
      }
      return row
    }),
  }

  prisma.movimiento = {
    create: vi.fn(async ({ data }: any) => {
      state.movimientos.push(data)
      return data
    }),
  }

  prisma.depositoProducto = {
    findUnique: vi.fn(async () => null),
  }

  prisma.$transaction = vi.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma))

  function reset() {
    idCounter = 1
    state.ordenes.length = 0
    state.inventarioEstuches.length = 0
    state.inventarioFrascos.length = 0
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
    const role = req.header('x-test-role')
    if (!role) {
      res.status(401).json({ message: 'No autenticado' })
      return
    }
    req.user = {
      id: req.header('x-test-user-id') ?? 'solicitante-1',
      role,
      name: req.header('x-test-user-name') ?? 'Usuario Test',
    }
    next()
  },
}))
vi.mock('../lib/sse-manager', () => ({
  STOCK_BAJO_THRESHOLD: 10,
  STOCK_BAJO_FRASCOS_THRESHOLD: 5,
  sseManager: {
    broadcastGlobal: vi.fn(),
    broadcastToRoles: vi.fn(),
    broadcastToUser: vi.fn(),
  },
}))

import ordenesRouter from '../routes/ordenes'

describe('Órdenes de producción críticas', () => {
  const app = createTestApp('/api/ordenes', ordenesRouter)

  beforeEach(() => {
    mocks.reset()
  })

  it('crea, aprueba y ejecuta una orden verificando stock y movimiento', async () => {
    mocks.state.inventarioEstuches.push({
      id: 'est-1',
      productoId: null,
      articulo: 'AMANTINA 500 ML',
      mercado: 'argentina',
      cantidad: 10,
    })

    const created = await request(app)
      .post('/api/ordenes')
      .set('x-test-role', 'solicitante')
      .set('x-test-user-id', 'sol-1')
      .send({
        categoria: 'estuche',
        productoNombre: 'AMANTINA 500 ML',
        mercado: 'argentina',
        cantidad: 3,
        urgencia: 'normal',
      })

    expect(created.status).toBe(201)

    const approved = await request(app)
      .put(`/api/ordenes/${created.body.id}/aprobar`)
      .set('x-test-role', 'encargado')
      .set('x-test-user-id', 'enc-1')

    expect(approved.status).toBe(200)

    const executed = await request(app)
      .put(`/api/ordenes/${created.body.id}/ejecutar`)
      .set('x-test-role', 'encargado')
      .set('x-test-user-id', 'enc-1')

    expect(executed.status).toBe(200)
    expect(mocks.state.inventarioEstuches[0]?.cantidad).toBe(7)
    expect(mocks.state.movimientos).toHaveLength(1)
    expect(mocks.state.movimientos[0]?.cantidad).toBe(-3)
    expect(mocks.state.ordenes[0]?.estado).toBe('ejecutada')
  })

  it('rechaza ejecutar con stock insuficiente', async () => {
    mocks.state.inventarioEstuches.push({
      id: 'est-1',
      productoId: null,
      articulo: 'AMANTINA 500 ML',
      mercado: 'argentina',
      cantidad: 2,
    })

    const created = await request(app)
      .post('/api/ordenes')
      .set('x-test-role', 'solicitante')
      .set('x-test-user-id', 'sol-1')
      .send({
        categoria: 'estuche',
        productoNombre: 'AMANTINA 500 ML',
        mercado: 'argentina',
        cantidad: 3,
        urgencia: 'normal',
      })

    await request(app)
      .put(`/api/ordenes/${created.body.id}/aprobar`)
      .set('x-test-role', 'encargado')
      .set('x-test-user-id', 'enc-1')

    const executed = await request(app)
      .put(`/api/ordenes/${created.body.id}/ejecutar`)
      .set('x-test-role', 'encargado')
      .set('x-test-user-id', 'enc-1')

    expect(executed.status).toBe(400)
    expect(executed.body.message).toContain('Stock insuficiente')
  })

  it('no permite rechazar una orden ya ejecutada', async () => {
    mocks.state.inventarioEstuches.push({
      id: 'est-1',
      productoId: null,
      articulo: 'AMANTINA 500 ML',
      mercado: 'argentina',
      cantidad: 10,
    })

    const created = await request(app)
      .post('/api/ordenes')
      .set('x-test-role', 'solicitante')
      .set('x-test-user-id', 'sol-1')
      .send({
        categoria: 'estuche',
        productoNombre: 'AMANTINA 500 ML',
        mercado: 'argentina',
        cantidad: 1,
        urgencia: 'normal',
      })

    await request(app)
      .put(`/api/ordenes/${created.body.id}/aprobar`)
      .set('x-test-role', 'encargado')
      .set('x-test-user-id', 'enc-1')

    await request(app)
      .put(`/api/ordenes/${created.body.id}/ejecutar`)
      .set('x-test-role', 'encargado')
      .set('x-test-user-id', 'enc-1')

    const rejected = await request(app)
      .put(`/api/ordenes/${created.body.id}/rechazar`)
      .set('x-test-role', 'encargado')
      .set('x-test-user-id', 'enc-1')
      .send({ motivoRechazo: 'Ya no corresponde' })

    expect(rejected.status).toBe(400)
    expect(rejected.body.message).toContain('ya ejecutada')
  })

  it('garantiza que el solicitante solo ve sus órdenes', async () => {
    mocks.state.ordenes.push(
      {
        id: 'orden-1',
        solicitanteId: 'sol-1',
        aprobadoPor: null,
        productoId: null,
        categoria: 'estuche',
        productoNombre: 'AMANTINA 500 ML',
        mercado: 'argentina',
        cantidad: 1,
        urgencia: 'normal',
        estado: 'solicitada',
        motivoRechazo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'orden-2',
        solicitanteId: 'sol-2',
        aprobadoPor: null,
        productoId: null,
        categoria: 'estuche',
        productoNombre: 'OLIVITASAN 500 ML',
        mercado: 'argentina',
        cantidad: 2,
        urgencia: 'normal',
        estado: 'solicitada',
        motivoRechazo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    )

    const res = await request(app)
      .get('/api/ordenes')
      .set('x-test-role', 'solicitante')
      .set('x-test-user-id', 'sol-1')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]?.solicitanteId).toBe('sol-1')
  })

  it('GET /api/ordenes/:id devuelve la orden si es solicitante y le pertenece', async () => {
    mocks.state.ordenes.push({
      id: 'orden-1',
      solicitanteId: 'sol-1',
      aprobadoPor: null,
      productoId: null,
      categoria: 'estuche',
      productoNombre: 'AMANTINA 500 ML',
      mercado: 'argentina',
      cantidad: 1,
      urgencia: 'normal',
      estado: 'solicitada',
      motivoRechazo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await request(app)
      .get('/api/ordenes/orden-1')
      .set('x-test-role', 'solicitante')
      .set('x-test-user-id', 'sol-1')

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('orden-1')
  })

  it('GET /api/ordenes/:id da 403 si es solicitante y no le pertenece', async () => {
    mocks.state.ordenes.push({
      id: 'orden-1',
      solicitanteId: 'sol-2',
      aprobadoPor: null,
      productoId: null,
      categoria: 'estuche',
      productoNombre: 'AMANTINA 500 ML',
      mercado: 'argentina',
      cantidad: 1,
      urgencia: 'normal',
      estado: 'solicitada',
      motivoRechazo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await request(app)
      .get('/api/ordenes/orden-1')
      .set('x-test-role', 'solicitante')
      .set('x-test-user-id', 'sol-1')

    expect(res.status).toBe(403)
  })

  it('ejecutar orden de droga descuenta lotes usando FIFO', async () => {
    mocks.state.ordenes.push({
      id: 'orden-droga-1',
      solicitanteId: 'sol-1',
      aprobadoPor: 'enc-1',
      productoId: null,
      categoria: 'droga',
      productoNombre: 'ACIDO CITRICO',
      mercado: null,
      cantidad: 15,
      urgencia: 'normal',
      estado: 'aprobada',
      motivoRechazo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    mocks.prisma.inventarioDroga.findMany.mockResolvedValue([
      { id: 'lote-a', nombre: 'ACIDO CITRICO', lote: 'A', vencimiento: new Date('2027-01-01'), cantidad: 10 },
      { id: 'lote-b', nombre: 'ACIDO CITRICO', lote: 'B', vencimiento: new Date('2026-06-01'), cantidad: 10 },
    ])

    const res = await request(app)
      .put('/api/ordenes/orden-droga-1/ejecutar')
      .set('x-test-role', 'encargado')
      .set('x-test-user-id', 'enc-1')

    expect(res.status).toBe(200)
    // El lote B tiene vencimiento anterior (2026-06-01 < 2027-01-01), debe usarse primero y descontar sus 10 unidades
    expect(mocks.prisma.inventarioDroga.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'lote-b' },
      data: { cantidad: { decrement: 10 } }
    }))
    // Luego lote A debe descontar las 5 restantes
    expect(mocks.prisma.inventarioDroga.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'lote-a' },
      data: { cantidad: { decrement: 5 } }
    }))
  })

  it('ejecutar orden de frasco actualiza cajas y unidades totales', async () => {
    mocks.state.ordenes.push({
      id: 'orden-frasco-1',
      solicitanteId: 'sol-1',
      aprobadoPor: 'enc-1',
      productoId: null,
      categoria: 'frasco',
      productoNombre: 'FRASCO 100 ML',
      mercado: null,
      cantidad: 2, // 2 cajas
      urgencia: 'normal',
      estado: 'aprobada',
      motivoRechazo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    mocks.state.inventarioFrascos.push({
      id: 'frasco-1',
      productoId: null,
      articulo: 'FRASCO 100 ML',
      cantidadCajas: 10,
      unidadesPorCaja: 100,
    })

    const res = await request(app)
      .put('/api/ordenes/orden-frasco-1/ejecutar')
      .set('x-test-role', 'encargado')
      .set('x-test-user-id', 'enc-1')

    expect(res.status).toBe(200)
    expect(mocks.prisma.inventarioFrasco.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'frasco-1' },
      data: { cantidadCajas: 8, total: 800 }
    }))
  })
})
