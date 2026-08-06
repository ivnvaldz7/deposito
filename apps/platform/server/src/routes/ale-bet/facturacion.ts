import { Router } from 'express'
import { platformDb as prisma } from '@platform/db'
import { requireApp } from '../../middlewares/require-app'
import { descomponerUnidades } from './unidades-por-caja'

const router = Router()

// Only FACTURACION and ADMIN can access billing reports.
const ALLOWED_ROLES = ['admin', 'facturacion']

interface ProductoAgregado {
  productoId: string
  nombre: string
  sku: string
  unidadesPorCaja: number
  cajas: number
  sueltos: number
  unidades: number
}

interface ResumenMes {
  month: number
  pedidosDespachados: number
  productosDistintos: number
  unidadesTotales: number
  productos: ProductoAgregado[]
}

interface ReporteMensual {
  modo: 'mensual'
  clienteId: string
  year: number
  month: number
  pedidosDespachados: number
  productosDistintos: number
  unidadesTotales: number
  productos: ProductoAgregado[]
}

interface ReporteAnual {
  modo: 'anual'
  clienteId: string
  year: number
  pedidosDespachados: number
  productosDistintos: number
  unidadesTotales: number
  productos: ProductoAgregado[]
  meses: ResumenMes[]
}

/**
 * Aggregate dispatched order items by product.
 *
 * Returns one entry per distinct product with summed units decomposed into
 * cajas and sueltos using the product's current unidadesPorCaja value.
 */
function agregarPorProducto(
  items: Array<{
    productoId: string
    cantidad: number
    producto: { nombre: string; sku: string; unidadesPorCaja: number }
  }>,
): ProductoAgregado[] {
  const map = new Map<
    string,
    { nombre: string; sku: string; unidadesPorCaja: number; unidades: number }
  >()

  for (const item of items) {
    const existing = map.get(item.productoId)
    if (existing) {
      existing.unidades += item.cantidad
    } else {
      map.set(item.productoId, {
        nombre: item.producto.nombre,
        sku: item.producto.sku,
        unidadesPorCaja: item.producto.unidadesPorCaja,
        unidades: item.cantidad,
      })
    }
  }

  return Array.from(map.entries()).map(([productoId, data]) => {
    const { cajas, sueltos } = descomponerUnidades(data.unidades, data.unidadesPorCaja)
    return {
      productoId,
      nombre: data.nombre,
      sku: data.sku,
      unidadesPorCaja: data.unidadesPorCaja,
      cajas,
      sueltos,
      unidades: data.unidades,
    }
  })
}

/**
 * GET /api/ale-bet/facturacion/ventas
 *
 * Required query params: clienteId, year
 * Optional query param:  month (1-12) — when present returns a monthly report;
 *                        when absent returns an annual report.
 *
 * A VENTA is defined as a Pedido in DESPACHADO state.
 * The dispatch date is taken from Pedido.despachadoAt (the real historical
 * timestamp set at dispatch time, NOT createdAt).
 *
 * Product name, SKU, and unidadesPorCaja are read from the live Producto
 * record via ItemPedido.producto join. No ale_bet product-change audit table
 * exists, so this is the best available historical source.
 *
 * Access: FACTURACION + ADMIN only.
 * 403 for: vendedor, armador, encargado_deposito, any other role.
 */
router.get(
  '/ventas',
  requireApp('ale-bet', ALLOWED_ROLES),
  async (req, res) => {
    // ── Parameter validation ────────────────────────────────────────────────

    const clienteId = typeof req.query.clienteId === 'string' ? req.query.clienteId.trim() : ''
    if (!clienteId) {
      res.status(400).json({ error: 'El parámetro clienteId es requerido' })
      return
    }

    const yearRaw = typeof req.query.year === 'string' ? req.query.year.trim() : ''
    if (!yearRaw) {
      res.status(400).json({ error: 'El parámetro year es requerido' })
      return
    }

    const year = Number(yearRaw)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      res.status(400).json({ error: 'El parámetro year debe ser un año válido (2000-2100)' })
      return
    }

    const monthRaw = typeof req.query.month === 'string' ? req.query.month.trim() : ''
    let month: number | null = null

    if (monthRaw !== '') {
      month = Number(monthRaw)
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        res.status(400).json({ error: 'El parámetro month debe ser un número entre 1 y 12' })
        return
      }
    }

    // ── Date range (based on despachadoAt) ─────────────────────────────────

    let desde: Date
    let hasta: Date

    if (month !== null) {
      // Monthly: first day of month to first day of next month (UTC)
      desde = new Date(Date.UTC(year, month - 1, 1))
      hasta = new Date(Date.UTC(year, month, 1))
    } else {
      // Annual: first day of year to first day of next year (UTC)
      desde = new Date(Date.UTC(year, 0, 1))
      hasta = new Date(Date.UTC(year + 1, 0, 1))
    }

    // ── Query dispatched orders ─────────────────────────────────────────────
    // Aggregate in the backend: fetch only DESPACHADO pedidos for the client
    // in the requested period, ordered by despachadoAt.

    const pedidos = await prisma.pedido.findMany({
      where: {
        clienteId,
        estado: 'DESPACHADO',
        despachadoAt: {
          gte: desde,
          lt: hasta,
        },
      },
      select: {
        id: true,
        despachadoAt: true,
        items: {
          select: {
            productoId: true,
            cantidad: true,
            producto: {
              select: {
                nombre: true,
                sku: true,
                unidadesPorCaja: true,
              },
            },
          },
        },
      },
      orderBy: { despachadoAt: 'asc' },
    })

    // ── Monthly report ──────────────────────────────────────────────────────

    if (month !== null) {
      const allItems = pedidos.flatMap((p) => p.items)
      const productos = agregarPorProducto(allItems)
      const unidadesTotales = productos.reduce((sum, p) => sum + p.unidades, 0)

      const reporte: ReporteMensual = {
        modo: 'mensual',
        clienteId,
        year,
        month,
        pedidosDespachados: pedidos.length,
        productosDistintos: productos.length,
        unidadesTotales,
        productos,
      }

      res.json(reporte)
      return
    }

    // ── Annual report ───────────────────────────────────────────────────────

    // Build per-month breakdown (only months with sales).
    const mesesMap = new Map<
      number,
      Array<{ productoId: string; cantidad: number; producto: { nombre: string; sku: string; unidadesPorCaja: number } }>
    >()

    for (const pedido of pedidos) {
      // despachadoAt is guaranteed non-null for DESPACHADO orders.
      const despachadoAt = pedido.despachadoAt!
      // Use UTC month to avoid timezone drift.
      const mes = despachadoAt.getUTCMonth() + 1

      const existing = mesesMap.get(mes)
      if (existing) {
        existing.push(...pedido.items)
      } else {
        mesesMap.set(mes, [...pedido.items])
      }
    }

    const meses: ResumenMes[] = []

    for (const [mes, items] of Array.from(mesesMap.entries()).sort(([a], [b]) => a - b)) {
      const productos = agregarPorProducto(items)
      const unidadesTotales = productos.reduce((sum, p) => sum + p.unidades, 0)
      const pedidosEnMes = pedidos.filter((p) => (p.despachadoAt!.getUTCMonth() + 1) === mes)

      meses.push({
        month: mes,
        pedidosDespachados: pedidosEnMes.length,
        productosDistintos: productos.length,
        unidadesTotales,
        productos,
      })
    }

    // Annual totals: aggregate all items from all months.
    const allItems = pedidos.flatMap((p) => p.items)
    const productosAnuales = agregarPorProducto(allItems)
    const unidadesTotalesAnuales = productosAnuales.reduce((sum, p) => sum + p.unidades, 0)

    const reporte: ReporteAnual = {
      modo: 'anual',
      clienteId,
      year,
      pedidosDespachados: pedidos.length,
      productosDistintos: productosAnuales.length,
      unidadesTotales: unidadesTotalesAnuales,
      productos: productosAnuales,
      meses,
    }

    res.json(reporte)
  },
)

export default router
