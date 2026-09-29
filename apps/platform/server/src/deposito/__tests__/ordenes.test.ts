import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

vi.mock('@platform/db', () => ({
  Prisma: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values }) },
  Mercado: {
    argentina: 'argentina',
    colombia: 'colombia',
    mexico: 'mexico',
    ecuador: 'ecuador',
    bolivia: 'bolivia',
    paraguay: 'paraguay',
    no_exportable: 'no_exportable',
  },
  default: {},
}))

type Mercado = 'argentina' | 'colombia' | 'mexico' | 'ecuador' | 'bolivia' | 'paraguay' | 'no_exportable'
type EstadoOrden = 'solicitada' | 'aprobada' | 'ejecutada' | 'completada' | 'rechazada'

const mocks = vi.hoisted(() => {
  let idCounter = 1

  const state = {
    catalogCategory: 'estuche' as 'estuche' | 'droga' | 'frasco' | 'etiqueta',
    ordenes: [] as Array<{
      id: string
      solicitanteId: string
      aprobadoPor: string | null
      productoId: string | null
      categoria: 'estuche' | 'droga' | 'frasco' | 'etiqueta'
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
    inventarioEtiquetas: [] as Array<{ id: string; productoId: string | null; articulo: string; mercado: Mercado; cantidad: number }>,
    inventarioFrascos: [] as Array<{ id: string; productoId: string | null; articulo: string; unidadesPorCaja: number; cantidadCajas: number; total: number }>,
    inventarioDrogas: [] as Array<{ id: string; productoId: string | null; nombre: string; lote: string | null; cantidad: number; vencimiento?: Date | null }>,
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
    findUniqueOrThrow: vi.fn(async ({ where, include }: any) => {
      const orden = state.ordenes.find((row) => row.id === where.id)
      if (!orden) throw new Error('Orden no encontrada')
      return include ? includeOrden(orden) : orden
    }),
    findMany: vi.fn(async ({ where, include }: any) => {
      const filtered = state.ordenes.filter((orden) => {
        const clauses = where?.AND ?? [where ?? {}]
        for (const clause of clauses) {
          if (clause.solicitanteId && orden.solicitanteId !== clause.solicitanteId) return false
          if (typeof clause.estado === 'string' && orden.estado !== clause.estado) return false
          if (clause.estado?.in && !clause.estado.in.includes(orden.estado)) return false
          if (clause.updatedAt?.lt && !(orden.updatedAt < clause.updatedAt.lt)) return false
          if (clause.NOT?.AND) {
            const isOldTerminal = clause.NOT.AND.every((condition: any) => {
              if (condition.estado?.in) return condition.estado.in.includes(orden.estado)
              if (condition.updatedAt?.lt) return orden.updatedAt < condition.updatedAt.lt
              return false
            })
            if (isOldTerminal) return false
          }
        }
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
    updateMany: vi.fn(async ({ where, data }: any) => {
      let count = 0
      for (const orden of state.ordenes) {
        if (where.id && orden.id !== where.id) continue
        if (where.estado && orden.estado !== where.estado) continue
        Object.assign(orden, data, { updatedAt: new Date() })
        count++
      }
      return { count }
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
    updateMany: vi.fn(async ({ where, data }: any) => {
      let count = 0
      for (const row of state.inventarioEstuches) {
        if (row.id === where.id) {
          if (where.cantidad?.gte !== undefined && row.cantidad < where.cantidad.gte) continue
          if (data.cantidad?.decrement) row.cantidad -= data.cantidad.decrement
          count++
        }
      }
      return { count }
    }),
  }

  prisma.inventarioDroga = {
    findMany: vi.fn(async () => []),
    aggregate: vi.fn(async () => ({ _sum: { cantidad: 0 } })),
    update: vi.fn(async ({ where, data }: any) => {
      const row = state.inventarioDrogas.find((item) => item.id === where.id)
      if (row) row.cantidad = data.cantidad
      return row
    }),
    delete: vi.fn(async ({ where }: any) => {
      const index = state.inventarioDrogas.findIndex((item) => item.id === where.id)
      if (index < 0) throw new Error('Lote no encontrado')
      return state.inventarioDrogas.splice(index, 1)[0]
    }),
  }

  prisma.inventarioEtiqueta = {
    findFirst: vi.fn(async ({ where }: any) => state.inventarioEtiquetas.find((row) => row.productoId === where.productoId && row.mercado === where.mercado) ?? null),
    findMany: vi.fn(async ({ where }: any) => state.inventarioEtiquetas.filter((row) => row.mercado === where.mercado)),
    findUnique: vi.fn(async () => null),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const row = state.inventarioEtiquetas.find((item) => item.id === where.id)
      if (!row || row.cantidad < where.cantidad.gte) return { count: 0 }
      row.cantidad -= data.cantidad.decrement
      return { count: 1 }
    }),
  }

  prisma.inventarioFrasco = {
    findFirst: vi.fn(async ({ where }: any) => state.inventarioFrascos.find((row) => row.productoId === where.productoId) ?? null),
    findMany: vi.fn(async () => state.inventarioFrascos),
    findUnique: vi.fn(async () => null),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const row = state.inventarioFrascos.find((item) => item.id === where.id)
      if (!row || row.total < where.total.gte) return { count: 0 }
      row.total = data.total
      row.cantidadCajas = data.cantidadCajas
      return { count: 1 }
    }),
  }

  prisma.movimiento = {
    create: vi.fn(async ({ data }: any) => {
      state.movimientos.push(data)
      return data
    }),
  }

  prisma.depositoProducto = {
    findUnique: vi.fn(async ({ where }: any) => where.id ? ({ id: where.id, activo: true, categoria: state.catalogCategory, nombreCompleto: 'AMANTINA 500 ML' }) : null),
  }

  prisma.$transaction = vi.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma))
  prisma.$queryRaw = vi.fn(async (query: { text?: string }) => {
    if (query.text?.includes('inventario_drogas')) return state.inventarioDrogas.filter((row) => row.cantidad > 0).sort((left, right) => Number(left.lote === 'APERTURA-SIN-LOTE') - Number(right.lote === 'APERTURA-SIN-LOTE') || Number(left.vencimiento == null) - Number(right.vencimiento == null) || (left.vencimiento?.getTime() ?? 0) - (right.vencimiento?.getTime() ?? 0) || left.id.localeCompare(right.id))
    if (query.text?.includes('inventario_frascos')) return state.inventarioFrascos.map(({ id, total, unidadesPorCaja }) => ({ id, total, unidadesPorCaja }))
    return []
  })

  function reset() {
    idCounter = 1
    state.ordenes.length = 0
    state.catalogCategory = 'estuche'
    state.inventarioEstuches.length = 0
    state.inventarioEtiquetas.length = 0
    state.inventarioFrascos.length = 0
    state.inventarioDrogas.length = 0
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
    req.depositoUser = {
      id: req.header('x-test-user-id') ?? 'solicitante-1',
      role,
      name: req.header('x-test-user-name') ?? 'Usuario Test',
    }
    req.user = { sub: req.depositoUser.id, apps: { deposito: { rol: role, activo: true } } }
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
  const productId = '00000000-0000-4000-8000-000000000001'

  beforeEach(() => {
    mocks.reset()
  })

  it('crea, aprueba y ejecuta una orden verificando stock y movimiento', async () => {
    mocks.state.inventarioEstuches.push({
      id: 'est-1',
      productoId: productId,
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
        productoId: productId,
        mercado: 'argentina',
        cantidad: 3,
        urgencia: 'normal',
      })

    expect(created.status).toBe(201)

    const approved = await request(app)
      .post(`/api/ordenes/${created.body.id}/aprobar`)
      .set('x-test-role', 'encargado')
      .set('x-test-user-id', 'enc-1')

    expect(approved.status).toBe(200)

    expect(mocks.state.inventarioEstuches[0]?.cantidad).toBe(7)
    expect(mocks.state.movimientos).toHaveLength(1)
    expect(mocks.state.movimientos[0]?.cantidad).toBe(-3)
    expect(mocks.state.ordenes[0]?.estado).toBe('aprobada')
    const duplicateApproval = await request(app)
      .post(`/api/ordenes/${created.body.id}/aprobar`)
      .set('x-test-role', 'encargado')
      .set('x-test-user-id', 'enc-1')
    expect(duplicateApproval.status).toBe(409)
    expect(mocks.state.inventarioEstuches[0]?.cantidad).toBe(7)
    expect(mocks.state.movimientos).toHaveLength(1)
  })

  it('rechaza ejecutar con stock insuficiente', async () => {
    mocks.state.inventarioEstuches.push({
      id: 'est-1',
      productoId: productId,
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
        productoId: productId,
        mercado: 'argentina',
        cantidad: 3,
        urgencia: 'normal',
      })

    const insufficientApproval = await request(app)
      .post(`/api/ordenes/${created.body.id}/aprobar`)
      .set('x-test-role', 'encargado')
      .set('x-test-user-id', 'enc-1')
    expect(insufficientApproval.status).toBe(409)
    expect(insufficientApproval.body.message).toContain('Stock insuficiente')
    expect(mocks.state.inventarioEstuches[0]?.cantidad).toBe(2)
    expect(mocks.state.movimientos).toHaveLength(0)
    expect(mocks.state.ordenes[0]?.estado).toBe('solicitada')

  })

  it('no permite rechazar una orden ya aprobada', async () => {
    mocks.state.inventarioEstuches.push({
      id: 'est-1',
      productoId: productId,
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
        productoId: productId,
        mercado: 'argentina',
        cantidad: 1,
        urgencia: 'normal',
      })

    await request(app)
      .post(`/api/ordenes/${created.body.id}/aprobar`)
      .set('x-test-role', 'encargado')
      .set('x-test-user-id', 'enc-1')

    const rejected = await request(app)
      .put(`/api/ordenes/${created.body.id}/rechazar`)
      .set('x-test-role', 'encargado')
      .set('x-test-user-id', 'enc-1')
      .send({ motivoRechazo: 'Ya no corresponde' })

    expect(rejected.status).toBe(409)
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

  it('crea una solicitud por categoría usando el ID real del catálogo, incluso sin inventario', async () => {
    const inputs = [
      { categoria: 'droga', cantidad: 1.25 },
      { categoria: 'frasco', cantidad: 24 },
      { categoria: 'estuche', cantidad: 12, mercado: 'argentina' },
      { categoria: 'etiqueta', cantidad: 12, mercado: 'mexico' },
    ] as const
    for (const input of inputs) {
      mocks.state.catalogCategory = input.categoria
      const response = await request(app)
        .post('/api/ordenes')
        .set('x-test-role', 'solicitante')
        .set('x-test-user-id', 'sol-1')
        .send({ ...input, productoId: productId, urgencia: 'normal' })
      expect(response.status).toBe(201)
      expect(response.body.productoId).toBe(productId)
      expect(response.body.cantidad).toBe(input.cantidad)
      expect(response.body.estado).toBe('solicitada')
    }
    expect(mocks.state.inventarioEstuches).toHaveLength(0)
    expect(mocks.state.inventarioEtiquetas).toHaveLength(0)
    expect(mocks.state.inventarioFrascos).toHaveLength(0)
    expect(mocks.state.inventarioDrogas).toHaveLength(0)
  })

  it('exige mercado para estuche/etiqueta y lo rechaza para droga/frasco', async () => {
    mocks.state.catalogCategory = 'estuche'
    const missingMarket = await request(app).post('/api/ordenes').set('x-test-role', 'solicitante').send({ categoria: 'estuche', productoId: productId, cantidad: 1 })
    expect(missingMarket.status).toBe(400)
    mocks.state.catalogCategory = 'droga'
    const unexpectedMarket = await request(app).post('/api/ordenes').set('x-test-role', 'solicitante').send({ categoria: 'droga', productoId: productId, mercado: 'argentina', cantidad: 1 })
    expect(unexpectedMarket.status).toBe(400)
    expect(mocks.state.ordenes).toHaveLength(0)
  })

  it('aprueba una droga con FIFO fraccionario y registra movimiento por lote', async () => {
    mocks.state.catalogCategory = 'droga'
    mocks.state.inventarioDrogas.push(
      { id: 'lot-a', productoId: productId, nombre: 'AMANTINA 500 ML', lote: 'A', cantidad: 1 },
      { id: 'lot-b', productoId: productId, nombre: 'AMANTINA 500 ML', lote: 'B', cantidad: 2 },
    )
    const created = await request(app).post('/api/ordenes').set('x-test-role', 'solicitante').send({ categoria: 'droga', productoId: productId, cantidad: 1.5 })
    const approved = await request(app).post(`/api/ordenes/${created.body.id}/aprobar`).set('x-test-role', 'encargado')
    expect(approved.status).toBe(200)
    expect(mocks.state.inventarioDrogas.map((lot) => lot.cantidad)).toEqual([1.5])
    expect(mocks.state.movimientos.map((movement) => movement.cantidad)).toEqual([-1, -0.5])
    expect(mocks.state.ordenes[0]?.estado).toBe('aprobada')
    expect(mocks.prisma.$queryRaw.mock.calls.some(([query]: [{ text?: string }]) => query.text?.includes('ORDER BY CASE') && query.text.includes('vencimiento ASC, id ASC'))).toBe(true)
  })

  it('consumes dated drug lots before APERTURA-SIN-LOTE and deletes the opening lot when exhausted', async () => {
    mocks.state.catalogCategory = 'droga'
    mocks.state.inventarioDrogas.push(
      { id: 'a-opening', productoId: '00000000-0000-4000-8000-000000000001', nombre: 'AMANTINA 500 ML', lote: 'APERTURA-SIN-LOTE', cantidad: 4, vencimiento: null },
      { id: 'z-dated', productoId: '00000000-0000-4000-8000-000000000001', nombre: 'AMANTINA 500 ML', lote: 'REAL-1', cantidad: 2, vencimiento: new Date('2027-01-01T00:00:00Z') },
      { id: 'b-unknown', productoId: '00000000-0000-4000-8000-000000000001', nombre: 'AMANTINA 500 ML', lote: 'REAL-2', cantidad: 1, vencimiento: null },
    )
    const created = await request(app).post('/api/ordenes').set('x-test-role', 'solicitante').send({ categoria: 'droga', productoId: '00000000-0000-4000-8000-000000000001', cantidad: 7 })
    const approved = await request(app).post(`/api/ordenes/${created.body.id}/aprobar`).set('x-test-role', 'encargado')
    expect(approved.status).toBe(200)
    expect(mocks.state.inventarioDrogas).toHaveLength(0)
    expect(mocks.state.movimientos.map((movement) => movement.lote)).toEqual(['REAL-1', 'REAL-2', 'APERTURA-SIN-LOTE'])
    expect(mocks.state.movimientos.map((movement) => movement.cantidad)).toEqual([-2, -1, -4])
    const sql = mocks.prisma.$queryRaw.mock.calls.find(([query]: [{ text?: string }]) => query.text?.includes('inventario_drogas'))?.[0].text
    expect(sql).toContain("CASE WHEN lote = 'APERTURA-SIN-LOTE' THEN 1 ELSE 0 END")
    expect(mocks.state.ordenes[0]?.estado).toBe('aprobada')
  })

  it('no permite aprobar una orden ya rechazada', async () => {
    mocks.state.catalogCategory = 'estuche'
    const created = await request(app).post('/api/ordenes').set('x-test-role', 'solicitante').send({ categoria: 'estuche', productoId: productId, mercado: 'argentina', cantidad: 1 })
    const rejected = await request(app).put(`/api/ordenes/${created.body.id}/rechazar`).set('x-test-role', 'encargado')
    const approval = await request(app).post(`/api/ordenes/${created.body.id}/aprobar`).set('x-test-role', 'encargado')
    expect(rejected.status).toBe(200)
    expect(approval.status).toBe(409)
    expect(mocks.state.movimientos).toHaveLength(0)
  })

  it('rechaza sin motivo y no toca inventario ni movimientos', async () => {
    mocks.state.inventarioEstuches.push({ id: 'est-r', productoId: productId, articulo: 'AMANTINA 500 ML', mercado: 'argentina', cantidad: 9 })
    const created = await request(app).post('/api/ordenes').set('x-test-role', 'solicitante').send({ categoria: 'estuche', productoId: productId, mercado: 'argentina', cantidad: 2 })
    const rejected = await request(app).put(`/api/ordenes/${created.body.id}/rechazar`).set('x-test-role', 'encargado')
    expect(rejected.status).toBe(200)
    expect(rejected.body.estado).toBe('rechazada')
    expect(rejected.body.motivoRechazo).toBeNull()
    expect(mocks.state.inventarioEstuches[0]?.cantidad).toBe(9)
    expect(mocks.state.movimientos).toHaveLength(0)
  })

  it('aprueba frascos en unidades con cajas parciales y etiqueta por producto+mercado', async () => {
    mocks.state.catalogCategory = 'frasco'
    mocks.state.inventarioFrascos.push({ id: 'f-1', productoId: productId, articulo: 'AMANTINA 500 ML', unidadesPorCaja: 12, cantidadCajas: 2, total: 24 })
    const createdFrasco = await request(app).post('/api/ordenes').set('x-test-role', 'solicitante').send({ categoria: 'frasco', productoId: productId, cantidad: 5 })
    const approvedFrasco = await request(app).post(`/api/ordenes/${createdFrasco.body.id}/aprobar`).set('x-test-role', 'encargado')
    expect(approvedFrasco.status).toBe(200)
    expect(mocks.state.inventarioFrascos[0]?.total).toBe(19)
    expect(mocks.state.inventarioFrascos[0]?.cantidadCajas).toBe(1)

    mocks.state.catalogCategory = 'etiqueta'
    mocks.state.inventarioEtiquetas.push({ id: 'e-1', productoId: productId, articulo: 'AMANTINA 500 ML', mercado: 'argentina', cantidad: 20 })
    const createdLabel = await request(app).post('/api/ordenes').set('x-test-role', 'solicitante').send({ categoria: 'etiqueta', productoId: productId, mercado: 'argentina', cantidad: 6 })
    const approvedLabel = await request(app).post(`/api/ordenes/${createdLabel.body.id}/aprobar`).set('x-test-role', 'encargado')
    expect(approvedLabel.status).toBe(200)
    expect(mocks.state.inventarioEtiquetas[0]?.cantidad).toBe(14)
    expect(mocks.state.movimientos.map((movement) => movement.cantidad)).toEqual([-5, -6])
  })

  it('bloquea el detalle de una orden ajena antes de devolverla', async () => {
    mocks.state.ordenes.push({
      id: 'orden-ajena',
      solicitanteId: 'sol-2',
      aprobadoPor: null,
      productoId: productId,
      categoria: 'estuche',
      productoNombre: 'OLIVITASAN 500 ML',
      mercado: 'argentina',
      cantidad: 2,
      urgencia: 'normal',
      estado: 'solicitada',
      motivoRechazo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await request(app)
      .get('/api/ordenes/orden-ajena')
      .set('x-test-role', 'solicitante')
      .set('x-test-user-id', 'sol-1')

    expect(res.status).toBe(403)
    expect(res.body).toEqual({ message: 'No autorizado' })
  })

  it('ejecuta ordenes.read antes de consultar el listado', async () => {
    const res = await request(app)
      .get('/api/ordenes')
      .set('x-test-role', 'rol-desconocido')
      .set('x-test-user-id', 'unknown-1')

    expect(res.status).toBe(403)
    expect(mocks.prisma.ordenProduccion.findMany).not.toHaveBeenCalled()
  })

  it('keeps approved and rejected orders in the archive after seven days', async () => {
    mocks.state.ordenes.push({
      id: 'orden-antigua', solicitanteId: 'solicitante-1', aprobadoPor: 'encargado-1', productoId: null,
      categoria: 'estuche', productoNombre: 'ESTUCHE HISTÓRICO', mercado: 'argentina', cantidad: 2,
      urgencia: 'normal', estado: 'aprobada', motivoRechazo: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })

    const active = await request(app).get('/api/ordenes').set('x-test-role', 'encargado')
    const archived = await request(app).get('/api/ordenes?archivadas=true').set('x-test-role', 'encargado')

    expect(active.body.map((orden: { id: string }) => orden.id)).not.toContain('orden-antigua')
    expect(archived.body.map((orden: { id: string }) => orden.id)).toContain('orden-antigua')
  })

  it('ejecuta ordenes.read antes de consultar el detalle', async () => {
    const res = await request(app)
      .get('/api/ordenes/orden-ajena')
      .set('x-test-role', 'rol-desconocido')
      .set('x-test-user-id', 'unknown-1')

    expect(res.status).toBe(403)
    expect(mocks.prisma.ordenProduccion.findUnique).not.toHaveBeenCalled()
  })
})
