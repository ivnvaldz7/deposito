import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const role = req.header('x-test-role')
    if (!role) {
      res.status(401).json({ message: 'No autenticado' })
      return
    }
    req.depositoUser = {
      id: req.header('x-test-user-id') ?? 'enc-1',
      role,
      name: 'Usuario Test',
    }
    next()
  },
}))

vi.mock('../lib/sse-manager', () => ({
  sseManager: { broadcast: vi.fn(), broadcastGlobal: vi.fn(), addClient: vi.fn(), removeClient: vi.fn() },
  STOCK_BAJO_THRESHOLD: 10,
  STOCK_BAJO_FRASCOS_THRESHOLD: 5,
}))

interface DrogaMock {
  id: string
  nombre: string
  lote: string | null
  vencimiento: Date | null
  cantidad: number
}

interface EstucheMock {
  id: string
  articulo: string
  mercado: string
  cantidad: number
}

interface EtiquetaMock {
  id: string
  articulo: string
  mercado: string
  cantidad: number
}

interface FrascoMock {
  id: string
  articulo: string
  cantidadCajas: number
  unidadesPorCaja: number
  total: number
}

interface MovimientoMock {
  id: string
  tipo: string
  productoNombre: string
  cantidad: number
  createdAt: Date
  user: { name: string }
}

const prismaMock = vi.hoisted(() => {
  let idCounter = 1
  const state: {
    drogas: DrogaMock[]
    estuches: EstucheMock[]
    etiquetas: EtiquetaMock[]
    frascos: FrascoMock[]
    movimientos: MovimientoMock[]
  } = {
    drogas: [],
    estuches: [],
    etiquetas: [],
    frascos: [],
    movimientos: [],
  }

  function reset() {
    idCounter = 1
    state.drogas.length = 0
    state.estuches.length = 0
    state.etiquetas.length = 0
    state.frascos.length = 0
    state.movimientos.length = 0
  }

  function sortBy(result: any[], orderBy: Record<string, string>) {
    const entries = Object.entries(orderBy)
    result.sort((a: any, b: any) => {
      for (const [field, dir] of entries) {
        const aVal = a[field]
        const bVal = b[field]
        let cmp: number
        if (aVal instanceof Date && bVal instanceof Date) {
          cmp = aVal.getTime() - bVal.getTime()
        } else if (typeof aVal === 'string' && typeof bVal === 'string') {
          cmp = aVal.localeCompare(bVal)
        } else {
          cmp = (aVal as number) - (bVal as number)
        }
        if (cmp !== 0) return dir === 'asc' ? cmp : -cmp
      }
      return 0
    })
  }

  return {
    state,
    reset,
    inventarioDroga: {
      count: vi.fn(async ({ where }: any = {}) => {
        if (!where) return state.drogas.length
        if (typeof where.cantidad === 'object' && where.cantidad?.gt != null) {
          return state.drogas.filter((d) => d.cantidad > where.cantidad.gt).length
        }
        if (where.cantidad === 0) return state.drogas.filter((d) => d.cantidad === 0).length
        return state.drogas.length
      }),
      findMany: vi.fn(async ({ where, orderBy }: any = {}) => {
        let result = [...state.drogas]
        if (where) {
          if (where.cantidad) {
            if (typeof where.cantidad === 'object') {
              if (where.cantidad.gt != null) result = result.filter((d) => d.cantidad > where.cantidad.gt)
              if (where.cantidad.lt != null) result = result.filter((d) => d.cantidad < where.cantidad.lt)
            }
          }
          if (where.vencimiento?.lte) {
            result = result.filter((d) => d.vencimiento && d.vencimiento <= where.vencimiento.lte)
          }
        }
        if (orderBy) sortBy(result, orderBy)
        return result
      }),
    },
    inventarioEstuche: {
      count: vi.fn(async ({ where }: any = {}) => {
        if (!where) return state.estuches.length
        if (where.cantidad === 0) return state.estuches.filter((e) => e.cantidad === 0).length
        return state.estuches.length
      }),
      findMany: vi.fn(async ({ where, orderBy }: any = {}) => {
        let result = [...state.estuches]
        if (where?.cantidad?.lt != null) result = result.filter((e) => e.cantidad < where.cantidad.lt)
        if (orderBy) sortBy(result, orderBy)
        return result
      }),
    },
    inventarioEtiqueta: {
      count: vi.fn(async ({ where }: any = {}) => {
        if (!where) return state.etiquetas.length
        if (where.cantidad === 0) return state.etiquetas.filter((e) => e.cantidad === 0).length
        return state.etiquetas.length
      }),
      findMany: vi.fn(async ({ where, orderBy }: any = {}) => {
        let result = [...state.etiquetas]
        if (where?.cantidad?.lt != null) result = result.filter((e) => e.cantidad < where.cantidad.lt)
        if (orderBy) sortBy(result, orderBy)
        return result
      }),
    },
    inventarioFrasco: {
      count: vi.fn(async ({ where }: any = {}) => {
        if (!where) return state.frascos.length
        if (where.cantidadCajas === 0) return state.frascos.filter((f) => f.cantidadCajas === 0).length
        return state.frascos.length
      }),
      findMany: vi.fn(async ({ where, orderBy }: any = {}) => {
        let result = [...state.frascos]
        if (where?.cantidadCajas?.lt != null) result = result.filter((f) => f.cantidadCajas < where.cantidadCajas.lt)
        if (orderBy) sortBy(result, orderBy)
        return result
      }),
    },
    movimiento: {
      count: vi.fn(async ({ where }: any = {}) => {
        if (!where?.createdAt?.gte) return state.movimientos.length
        return state.movimientos.filter((m) => m.createdAt >= where.createdAt.gte).length
      }),
      findMany: vi.fn(async ({ take, orderBy, include }: any = {}) => {
        let result = [...state.movimientos]
        if (orderBy?.createdAt === 'desc') {
          result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        }
        if (take) result = result.slice(0, take)
        if (include?.user?.select) {
          result = result.map((m) => ({ ...m, user: { name: m.user.name } }))
        }
        return result
      }),
    },
  }
})

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }))

import dashboardRouter from '../routes/dashboard'

describe('Dashboard', () => {
  const app = createTestApp('/api/dashboard', dashboardRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.reset()
  })

  describe('GET /api/dashboard/stats', () => {
    it('devuelve estructura completa con todos los campos', async () => {
      prismaMock.state.drogas.push(
        { id: 'd-1', nombre: 'IBUPROFENO', lote: null, vencimiento: null, cantidad: 50 },
        { id: 'd-2', nombre: 'ACETAMINOFEN', lote: null, vencimiento: null, cantidad: 0 },
      )
      prismaMock.state.estuches.push({ id: 'e-1', articulo: 'ESTUCHE A', mercado: 'argentina', cantidad: 10 })
      prismaMock.state.etiquetas.push({ id: 't-1', articulo: 'ETIQUETA A', mercado: 'argentina', cantidad: 5 })
      prismaMock.state.frascos.push({ id: 'f-1', articulo: 'FRASCO A', cantidadCajas: 10, unidadesPorCaja: 10, total: 100 })
      prismaMock.state.movimientos.push({
        id: 'm-1',
        tipo: 'ingreso_acta',
        productoNombre: 'IBUPROFENO',
        cantidad: 50,
        createdAt: new Date(),
        user: { name: 'Usuario Test' },
      })

      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('totalDrogas')
      expect(res.body).toHaveProperty('drogasEnStock')
      expect(res.body).toHaveProperty('drogasSinStock')
      expect(res.body).toHaveProperty('totalEstuches')
      expect(res.body).toHaveProperty('estuchesSinStock')
      expect(res.body).toHaveProperty('totalEtiquetas')
      expect(res.body).toHaveProperty('etiquetasSinStock')
      expect(res.body).toHaveProperty('totalFrascos')
      expect(res.body).toHaveProperty('frascosSinStock')
      expect(res.body).toHaveProperty('movimientosHoy')
      expect(res.body).toHaveProperty('ultimosMovimientos')
      expect(res.body).toHaveProperty('stockBajo')
      expect(res.body).toHaveProperty('stockBajoEstuches')
      expect(res.body).toHaveProperty('stockBajoEtiquetas')
      expect(res.body).toHaveProperty('stockBajoFrascos')
      expect(res.body).toHaveProperty('porVencer')
      expect(res.body.totalDrogas).toBe(2)
      expect(res.body.drogasEnStock).toBe(1)
      expect(res.body.drogasSinStock).toBe(1)
    })

    it('stock bajo detecta droga con cantidad < 10', async () => {
      prismaMock.state.drogas.push(
        { id: 'd-1', nombre: 'BAJO STOCK', lote: null, vencimiento: null, cantidad: 3 },
        { id: 'd-2', nombre: 'STOCK OK', lote: null, vencimiento: null, cantidad: 50 },
        { id: 'd-3', nombre: 'SIN STOCK', lote: null, vencimiento: null, cantidad: 0 },
      )

      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body.stockBajo).toHaveLength(1)
      expect(res.body.stockBajo[0].nombre).toBe('BAJO STOCK')
    })

    it('próximos a vencer devuelve items con vencimiento en ≤ 30 días', async () => {
      const futureDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() + days)
        return d
      }

      prismaMock.state.drogas.push(
        { id: 'd-1', nombre: 'VENCE PRONTO', lote: 'L001', vencimiento: futureDate(10), cantidad: 50 },
        { id: 'd-2', nombre: 'VENCE LEJOS', lote: 'L002', vencimiento: futureDate(60), cantidad: 50 },
        { id: 'd-3', nombre: 'SIN STOCK', lote: 'L003', vencimiento: futureDate(5), cantidad: 0 },
      )

      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('x-test-role', 'observador')

      expect(res.status).toBe(200)
      expect(res.body.porVencer).toHaveLength(1)
      expect(res.body.porVencer[0].nombre).toBe('VENCE PRONTO')
    })

    it('devuelve 401 sin auth', async () => {
      const res = await request(app).get('/api/dashboard/stats')
      expect(res.status).toBe(401)
    })
  })
})
