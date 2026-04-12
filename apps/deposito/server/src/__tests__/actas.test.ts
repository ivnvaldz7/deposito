import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

type Categoria = 'droga' | 'estuche' | 'etiqueta' | 'frasco'
type Mercado = 'argentina' | 'colombia' | 'mexico' | 'ecuador' | 'bolivia' | 'paraguay' | 'no_exportable'
type EstadoActa = 'pendiente' | 'parcial' | 'completada'

const mocks = vi.hoisted(() => {
  let idCounter = 1

  const state = {
    actas: [] as Array<{ id: string; fecha: Date; notas: string | null; createdBy: string; estado: EstadoActa; createdAt: Date; updatedAt: Date }>,
    items: [] as Array<{
      id: string
      actaId: string
      productoId: string | null
      categoria: Categoria
      productoNombre: string
      lote: string
      vencimiento: Date | null
      temperaturaTransporte: string | null
      condicionEmbalaje: 'bueno' | 'regular' | 'malo' | null
      observacionesCalidad: string | null
      aprobadoCalidad: boolean
      cantidadIngresada: number
      cantidadDistribuida: number
      mercado: Mercado | null
      createdAt: Date
    }>,
    inventarioDrogas: [] as Array<{ id: string; productoId: string | null; nombre: string; lote: string | null; vencimiento: Date | null; cantidad: number }>,
    inventarioEstuches: [] as Array<{ id: string; productoId: string | null; articulo: string; mercado: Mercado; cantidad: number }>,
    movimientos: [] as Array<Record<string, unknown>>,
  }

  const nextId = (prefix: string) => `${prefix}-${idCounter++}`

  const prisma: Record<string, any> = {}

  prisma.acta = {
    create: vi.fn(async ({ data }: any) => {
      const acta = {
        id: nextId('acta'),
        fecha: data.fecha,
        notas: data.notas ?? null,
        createdBy: data.createdBy,
        estado: 'pendiente' as EstadoActa,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      state.actas.push(acta)
      return acta
    }),
    findUnique: vi.fn(async ({ where, include }: any) => {
      const acta = state.actas.find((row) => row.id === where.id) ?? null
      if (!acta) return null
      if (include?.items || include?.user) {
        return {
          ...acta,
          user: { name: 'Encargado' },
          items: state.items.filter((item) => item.actaId === acta.id),
        }
      }
      return acta
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const acta = state.actas.find((row) => row.id === where.id)
      if (!acta) throw new Error('Acta no encontrada')
      Object.assign(acta, data, { updatedAt: new Date() })
      return acta
    }),
    findMany: vi.fn(async () => state.actas),
  }

  prisma.actaItem = {
    create: vi.fn(async ({ data }: any) => {
      const item = {
        id: nextId('item'),
        actaId: data.actaId,
        productoId: data.productoId ?? null,
        categoria: data.categoria,
        productoNombre: data.productoNombre,
        lote: data.lote,
        vencimiento: data.vencimiento ?? null,
        temperaturaTransporte: data.temperaturaTransporte ?? null,
        condicionEmbalaje: data.condicionEmbalaje ?? null,
        observacionesCalidad: data.observacionesCalidad ?? null,
        aprobadoCalidad: data.aprobadoCalidad ?? false,
        cantidadIngresada: data.cantidadIngresada,
        cantidadDistribuida: 0,
        mercado: data.mercado ?? null,
        createdAt: new Date(),
      }
      state.items.push(item)
      return item
    }),
    findUnique: vi.fn(async ({ where }: any) => state.items.find((row) => row.id === where.id) ?? null),
    findMany: vi.fn(async ({ where }: any) => state.items.filter((row) => row.actaId === where.actaId)),
    update: vi.fn(async ({ where, data }: any) => {
      const item = state.items.find((row) => row.id === where.id)
      if (!item) throw new Error('Item no encontrado')
      if (data.cantidadDistribuida?.increment) {
        item.cantidadDistribuida += data.cantidadDistribuida.increment
      }
      if (typeof data.aprobadoCalidad === 'boolean') {
        item.aprobadoCalidad = data.aprobadoCalidad
      }
      return item
    }),
  }

  prisma.inventarioDroga = {
    findFirst: vi.fn(async ({ where }: any) =>
      state.inventarioDrogas.find((row) =>
        (where.productoId == null || row.productoId === where.productoId) &&
        (where.lote == null || row.lote === where.lote)
      ) ?? null),
    findMany: vi.fn(async ({ where }: any = {}) =>
      state.inventarioDrogas.filter((row) => (where?.lote == null ? true : row.lote === where.lote))),
    update: vi.fn(async ({ where, data }: any) => {
      const row = state.inventarioDrogas.find((inv) => inv.id === where.id)
      if (!row) throw new Error('Droga no encontrada')
      if (data.cantidad?.increment) row.cantidad += data.cantidad.increment
      if (Object.prototype.hasOwnProperty.call(data, 'vencimiento')) row.vencimiento = data.vencimiento
      return row
    }),
    create: vi.fn(async ({ data }: any) => {
      const row = {
        id: nextId('droga'),
        productoId: data.productoId ?? null,
        nombre: data.nombre,
        lote: data.lote ?? null,
        vencimiento: data.vencimiento ?? null,
        cantidad: data.cantidad,
      }
      state.inventarioDrogas.push(row)
      return row
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
    update: vi.fn(async ({ where, data }: any) => {
      const row = state.inventarioEstuches.find((inv) => inv.id === where.id)
      if (!row) throw new Error('Estuche no encontrado')
      if (data.cantidad?.increment) row.cantidad += data.cantidad.increment
      return row
    }),
  }

  prisma.inventarioEtiqueta = {
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    update: vi.fn(),
  }

  prisma.inventarioFrasco = {
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    update: vi.fn(),
  }

  prisma.movimiento = {
    create: vi.fn(async ({ data }: any) => {
      state.movimientos.push(data)
      return data
    }),
  }

  prisma.producto = {
    findUnique: vi.fn(async () => null),
  }

  prisma.user = {
    findUnique: vi.fn(async ({ where }: any) => ({
      id: where.id,
      name: 'Encargado',
    })),
  }

  prisma.$transaction = vi.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma))

  function reset() {
    idCounter = 1
    state.actas.length = 0
    state.items.length = 0
    state.inventarioDrogas.length = 0
    state.inventarioEstuches.length = 0
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
      id: req.header('x-test-user-id') ?? 'user-1',
      role,
      name: req.header('x-test-user-name') ?? 'Usuario Test',
    }
    next()
  },
}))
vi.mock('../lib/sse-manager', () => ({
  sseManager: {
    broadcastGlobal: vi.fn(),
    broadcastToRoles: vi.fn(),
    broadcastToUser: vi.fn(),
  },
}))
vi.mock('../lib/lote-generator', () => ({
  generarLote: vi.fn(async (categoria: string) => `${categoria.toUpperCase().slice(0, 3)}-0001`),
}))

import actasRouter from '../routes/actas'

describe('Actas críticas', () => {
  const app = createTestApp('/api/actas', actasRouter)

  beforeEach(() => {
    mocks.reset()
  })

  it('crea acta, agrega item droga, distribuye todo y actualiza stock', async () => {
    const createActa = await request(app)
      .post('/api/actas')
      .set('x-test-role', 'encargado')
      .send({ fecha: '2026-04-11' })

    expect(createActa.status).toBe(201)

    const createItem = await request(app)
      .post(`/api/actas/${createActa.body.id}/items`)
      .set('x-test-role', 'encargado')
      .send({
        categoria: 'droga',
        productoNombre: 'ATP',
        lote: 'ATP-001',
        vencimiento: '2026-12-31',
        cantidadIngresada: 10,
      })

    expect(createItem.status).toBe(201)

    const distribute = await request(app)
      .post(`/api/actas/${createActa.body.id}/items/${createItem.body.id}/distribuir`)
      .set('x-test-role', 'encargado')
      .send({ cantidad: 10 })

    expect(distribute.status).toBe(200)
    expect(mocks.state.inventarioDrogas).toHaveLength(1)
    expect(mocks.state.inventarioDrogas[0]?.cantidad).toBe(10)
    expect(mocks.state.actas[0]?.estado).toBe('completada')
  })

  it('crea acta, agrega item estuche con mercado, distribuye parcial y verifica cantidades', async () => {
    mocks.state.inventarioEstuches.push({
      id: 'est-1',
      productoId: null,
      articulo: 'AMANTINA 500 ML',
      mercado: 'argentina',
      cantidad: 5,
    })

    const acta = await request(app)
      .post('/api/actas')
      .set('x-test-role', 'encargado')
      .send({ fecha: '2026-04-11' })

    const item = await request(app)
      .post(`/api/actas/${acta.body.id}/items`)
      .set('x-test-role', 'encargado')
      .send({
        categoria: 'estuche',
        productoNombre: 'AMANTINA 500 ML',
        cantidadIngresada: 10,
        mercado: 'argentina',
      })

    const distribute = await request(app)
      .post(`/api/actas/${acta.body.id}/items/${item.body.id}/distribuir`)
      .set('x-test-role', 'encargado')
      .send({ cantidad: 4 })

    expect(distribute.status).toBe(200)
    expect(mocks.state.inventarioEstuches[0]?.cantidad).toBe(9)
    expect(mocks.state.items[0]?.cantidadDistribuida).toBe(4)
    expect(mocks.state.actas[0]?.estado).toBe('parcial')
  })

  it('rechaza distribuir más de lo ingresado', async () => {
    const acta = await request(app)
      .post('/api/actas')
      .set('x-test-role', 'encargado')
      .send({ fecha: '2026-04-11' })

    const item = await request(app)
      .post(`/api/actas/${acta.body.id}/items`)
      .set('x-test-role', 'encargado')
      .send({
        categoria: 'droga',
        productoNombre: 'ATP',
        lote: 'ATP-001',
        vencimiento: '2026-12-31',
        cantidadIngresada: 5,
      })

    const distribute = await request(app)
      .post(`/api/actas/${acta.body.id}/items/${item.body.id}/distribuir`)
      .set('x-test-role', 'encargado')
      .send({ cantidad: 6 })

    expect(distribute.status).toBe(400)
    expect(distribute.body.message).toContain('Cantidad excede')
  })

  it('rechaza distribuir en acta completada', async () => {
    mocks.state.inventarioEstuches.push({
      id: 'est-1',
      productoId: null,
      articulo: 'AMANTINA 500 ML',
      mercado: 'argentina',
      cantidad: 5,
    })

    const acta = await request(app)
      .post('/api/actas')
      .set('x-test-role', 'encargado')
      .send({ fecha: '2026-04-11' })

    const item = await request(app)
      .post(`/api/actas/${acta.body.id}/items`)
      .set('x-test-role', 'encargado')
      .send({
        categoria: 'estuche',
        productoNombre: 'AMANTINA 500 ML',
        cantidadIngresada: 5,
        mercado: 'argentina',
      })

    mocks.state.actas[0]!.estado = 'completada'

    const distribute = await request(app)
      .post(`/api/actas/${acta.body.id}/items/${item.body.id}/distribuir`)
      .set('x-test-role', 'encargado')
      .send({ cantidad: 1 })

    expect(distribute.status).toBe(400)
    expect(distribute.body.message).toContain('acta completada')
  })

  it('rechaza distribuir item sin producto en inventario', async () => {
    const acta = await request(app)
      .post('/api/actas')
      .set('x-test-role', 'encargado')
      .send({ fecha: '2026-04-11' })

    const item = await request(app)
      .post(`/api/actas/${acta.body.id}/items`)
      .set('x-test-role', 'encargado')
      .send({
        categoria: 'estuche',
        productoNombre: 'PRODUCTO INEXISTENTE',
        cantidadIngresada: 3,
        mercado: 'argentina',
      })

    const distribute = await request(app)
      .post(`/api/actas/${acta.body.id}/items/${item.body.id}/distribuir`)
      .set('x-test-role', 'encargado')
      .send({ cantidad: 1 })

    expect(distribute.status).toBe(400)
    expect(distribute.body.message).toContain('inventario de estuche')
  })
})
