import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCatalogoCanonico } from '../../prisma/seed'
import { createTestApp } from './helpers/create-test-app'

const baseCatalog = buildCatalogoCanonico().map((producto, index) => ({
  id: `producto-${index + 1}`,
  nombreBase: producto.nombre,
  volumen: null,
  unidad: null,
  variante: null,
  categoria: producto.categoria,
  nombreCompleto: producto.nombre,
  activo: true,
}))

const mocks = vi.hoisted(() => {
  const state = {
    productos: [] as Array<{
      id: string
      nombreBase: string
      volumen: null
      unidad: string | null
      variante: string | null
      categoria: 'droga' | 'estuche' | 'etiqueta' | 'frasco'
      nombreCompleto: string
      activo: boolean
    }>,
  }

  const prisma = {
    producto: {
      findMany: vi.fn(async ({ where }: any) =>
        state.productos.filter((producto) => {
          if (where?.activo != null && producto.activo !== where.activo) return false
          if (where?.categoria && producto.categoria !== where.categoria) return false
          if (where?.nombreCompleto?.contains) {
            return producto.nombreCompleto.includes(where.nombreCompleto.contains)
          }
          return true
        })),
      findUnique: vi.fn(async ({ where }: any) =>
        state.productos.find((producto) =>
          producto.nombreCompleto === where.nombreCompleto_categoria.nombreCompleto &&
          producto.categoria === where.nombreCompleto_categoria.categoria
        ) ?? null),
      create: vi.fn(async ({ data }: any) => {
        const producto = {
          id: `producto-${state.productos.length + 1}`,
          nombreBase: data.nombreBase,
          volumen: data.volumen ?? null,
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
    state.productos = baseCatalog.map((producto) => ({ ...producto }))
    prisma.producto.findMany.mockClear()
    prisma.producto.findUnique.mockClear()
    prisma.producto.create.mockClear()
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
        volumen: null,
        unidad: null,
        variante: null,
        categoria: duplicate!.categoria,
        nombreCompleto: duplicate!.nombreCompleto,
      })

    expect(res.status).toBe(409)
  })

  it('el seed canónico contiene 174 productos', () => {
    expect(buildCatalogoCanonico()).toHaveLength(174)
  })
})
