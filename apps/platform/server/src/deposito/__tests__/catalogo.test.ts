import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

vi.mock('@platform/db', () => ({
  Categoria: {
    droga: 'droga',
    estuche: 'estuche',
    etiqueta: 'etiqueta',
    frasco: 'frasco',
  },
  Prisma: {
    Decimal: class Decimal {
      value: number
      constructor(v: number) { this.value = v }
      toString() { return String(this.value) }
      toNumber() { return this.value }
    },
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string
      constructor(message: string, opts: { code: string }) {
        super(message)
        this.code = opts.code
      }
    },
  },
  default: {},
}))

interface Producto {
  id: string
  nombreBase: string
  volumen: number | null
  unidad: string | null
  variante: string | null
  categoria: 'droga' | 'estuche' | 'etiqueta' | 'frasco'
  nombreCompleto: string
  activo: boolean
}

const MOCK_PRODUCTOS: Producto[] = [
  { id: 'prod-1', nombreBase: 'ACIDO ACETILSALICILICO', volumen: 500, unidad: 'MG', variante: null, categoria: 'droga', nombreCompleto: 'ACIDO ACETILSALICILICO 500 MG', activo: true },
  { id: 'prod-2', nombreBase: 'IBUPROFENO', volumen: 400, unidad: 'MG', variante: null, categoria: 'droga', nombreCompleto: 'IBUPROFENO 400 MG', activo: true },
  { id: 'prod-3', nombreBase: 'ESTUCHE BASICO', volumen: null, unidad: null, variante: null, categoria: 'estuche', nombreCompleto: 'ESTUCHE BASICO', activo: true },
  { id: 'prod-4', nombreBase: 'ESTUCHE PREMIUM', volumen: 1, unidad: 'L', variante: 'VIDRIO', categoria: 'estuche', nombreCompleto: 'ESTUCHE PREMIUM 1 L VIDRIO', activo: true },
  { id: 'prod-5', nombreBase: 'ETIQUETA 10x5', volumen: null, unidad: null, variante: null, categoria: 'etiqueta', nombreCompleto: 'ETIQUETA 10x5', activo: true },
  { id: 'prod-6', nombreBase: 'ETIQUETA 15x8', volumen: null, unidad: null, variante: null, categoria: 'etiqueta', nombreCompleto: 'ETIQUETA 15x8', activo: true },
  { id: 'prod-7', nombreBase: 'FRASCO 100 ML', volumen: 100, unidad: 'ML', variante: null, categoria: 'frasco', nombreCompleto: 'FRASCO 100 ML', activo: true },
  { id: 'prod-8', nombreBase: 'FRASCO 250 ML', volumen: 250, unidad: 'ML', variante: null, categoria: 'frasco', nombreCompleto: 'FRASCO 250 ML', activo: true },
  { id: 'prod-9', nombreBase: 'PARACETAMOL', volumen: 500, unidad: 'MG', variante: null, categoria: 'droga', nombreCompleto: 'PARACETAMOL 500 MG', activo: false },
]

const mocks = vi.hoisted(() => {
  const state = {
    productos: [] as Producto[],
  }

  const prisma = {
    depositoProducto: {
      findMany: vi.fn(async ({ where }: any) =>
        state.productos.filter((producto) => {
          if (where?.activo != null && producto.activo !== where.activo) return false
          if (where?.categoria && producto.categoria !== where.categoria) return false
          if (where?.nombreCompleto?.contains) {
            return producto.nombreCompleto.toLowerCase().includes(where.nombreCompleto.contains.toLowerCase())
          }
          return true
        })),
      findUnique: vi.fn(async ({ where }: any) =>
        state.productos.find((p) =>
          p.nombreCompleto === where.nombreCompleto_categoria?.nombreCompleto &&
          p.categoria === where.nombreCompleto_categoria?.categoria
        ) ?? null),
      create: vi.fn(async ({ data }: any) => {
        const producto: Producto = {
          id: `producto-${state.productos.length + 1}`,
          nombreBase: data.nombreBase,
          volumen: data.volumen?.toNumber() ?? null,
          unidad: data.unidad ?? null,
          variante: data.variante ?? null,
          categoria: data.categoria,
          nombreCompleto: data.nombreCompleto,
          activo: true,
        }
        state.productos.push(producto)
        return producto
      }),
    },
  }

  function reset() {
    state.productos = MOCK_PRODUCTOS.map((p) => ({ ...p }))
    prisma.depositoProducto.findMany.mockClear()
    prisma.depositoProducto.findUnique.mockClear()
    prisma.depositoProducto.create.mockClear()
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
      id: req.header('x-test-user-id') ?? 'enc-1',
      role,
      name: 'Usuario Test',
    }
    next()
  },
}))

import productosRouter from '../routes/productos'

describe('Catálogo de productos', () => {
  const app = createTestApp('/api/productos', productosRouter)

  beforeEach(() => {
    mocks.reset()
  })

  it('GET /api/productos con filtro categoria devuelve solo esa categoría', async () => {
    const res = await request(app)
      .get('/api/productos?categoria=frasco')
      .set('x-test-role', 'encargado')

    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body.every((producto: any) => producto.categoria === 'frasco')).toBe(true)
  })

  it('POST /api/productos duplicado rechaza', async () => {
    const duplicate = mocks.state.productos.find((producto) => producto.categoria === 'frasco')
    expect(duplicate).toBeTruthy()

    const res = await request(app)
      .post('/api/productos')
      .set('x-test-role', 'encargado')
      .send({
        nombreBase: duplicate!.nombreBase,
        volumen: duplicate!.volumen,
        unidad: duplicate!.unidad,
        variante: duplicate!.variante,
        categoria: duplicate!.categoria,
        nombreCompleto: duplicate!.nombreCompleto,
      })

    expect(res.status).toBe(409)
  })

  it('el mock contiene 9 productos de prueba', () => {
    expect(mocks.state.productos).toHaveLength(9)
  })
})
