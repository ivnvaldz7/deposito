import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../../middlewares/require-permission'
import { syncDepositoStockSheetsAfterCommit } from '../services/stock-sheets-projection'
import { CatalogoError, CatalogoProductoService } from '../services/catalogo-producto-service'
import { calcularStockFrasco, descomponerTotalFrasco, obtenerUnidadesSueltas } from '../lib/frasco-stock'

const router = Router()
const catalogoService = new CatalogoProductoService(prisma)

const crearFrascoSchema = z.object({
  articulo: z.string().min(2).max(150),
  unidadesPorCaja: z.number().int().positive(),
  cantidadCajas: z.number().int().min(0),
  unidadesSueltas: z.number().int().min(0).optional().default(0),
}).refine((data) => data.unidadesSueltas < data.unidadesPorCaja, {
  message: 'Las unidades sueltas deben ser menores que una caja',
  path: ['unidadesSueltas'],
})

const editarFrascoSchema = z
  .object({
    articulo: z.string().min(2).max(150).optional(),
    unidadesPorCaja: z.number().int().positive().optional(),
    cantidadCajas: z.number().int().min(0).optional(),
    unidadesSueltas: z.number().int().min(0).optional(),
  })
  .refine((data) => data.unidadesPorCaja === undefined || data.unidadesSueltas === undefined || data.unidadesSueltas < data.unidadesPorCaja, {
    message: 'Las unidades sueltas deben ser menores que una caja',
    path: ['unidadesSueltas'],
  })
  .refine(
    (d) => d.articulo !== undefined || d.unidadesPorCaja !== undefined || d.cantidadCajas !== undefined || d.unidadesSueltas !== undefined,
    { message: 'Al menos un campo requerido' }
  )

// GET /api/frascos
router.get('/', authenticate, requirePermission('deposito', 'frascos.read'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const [productos, inventario] = await Promise.all([
      prisma.depositoProducto.findMany({ where: { categoria: 'frasco', activo: true }, orderBy: { nombreCompleto: 'asc' } }),
      prisma.inventarioFrasco.findMany({ orderBy: { articulo: 'asc' } }),
    ])
    const byProduct = new Map(inventario.filter((row) => row.productoId).map((row) => [row.productoId!, row]))
    const frascosDelCatalogo = productos.map((producto) => byProduct.get(producto.id) ?? ({
      id: producto.id, productoId: producto.id, articulo: producto.nombreCompleto,
      unidadesPorCaja: 1, cantidadCajas: 0, unidadesSueltas: 0, total: 0, updatedAt: producto.updatedAt,
    }))
    // No ocultar el inventario histórico creado antes del catálogo centralizado.
    // Mantenerlo visible evita que un frasco existente desaparezca del buscador
    // interno mientras se termina de asociar al producto canónico.
    const frascosHistoricos = inventario.filter((row) => !row.productoId)
    const frascos = [...frascosDelCatalogo, ...frascosHistoricos]
      .sort((a, b) => a.articulo.localeCompare(b.articulo))
    res.json(frascos)
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/frascos
router.post(
  '/',
  authenticate,
  requirePermission('deposito', 'frascos.manage'),
  async (req: Request, res: Response): Promise<void> => {
    const result = crearFrascoSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { articulo, unidadesPorCaja, cantidadCajas, unidadesSueltas } = result.data
    const articuloNormalizado = articulo.trim().replace(/\s+/g, ' ').toUpperCase()
    const stock = calcularStockFrasco({ unidadesPorCaja, cantidadCajas, unidadesSueltas })
    if (!Number.isSafeInteger(stock.total) || stock.total > 2147483647) { res.status(400).json({ message: 'El total de unidades excede el máximo permitido' }); return }

    try {
      const existing = await prisma.inventarioFrasco.findFirst({ where: { articulo: articuloNormalizado } })
      if (existing) {
        res.status(409).json({ message: 'Ya existe ese artículo' })
        return
      }

      // Crear desde esta pantalla debe registrar también el producto canónico:
      // así queda disponible inmediatamente en los selectores por nombre.
      const producto = await catalogoService.createManual({
        nombreBase: articuloNormalizado,
        nombreCompleto: articuloNormalizado,
        categoria: 'frasco',
        presentacion: null,
        mercadosHabilitados: [],
        stockInicialFrasco: stock,
      }, req.depositoUser!.id)
      const frasco = await prisma.inventarioFrasco.findUniqueOrThrow({ where: { productoId: producto.id } })
      res.status(201).json(frasco)
      void syncDepositoStockSheetsAfterCommit()
    } catch (error) {
      if (error instanceof CatalogoError && error.code === 'CONFLICT') {
        res.status(409).json({ message: error.message })
        return
      }
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// PUT /api/frascos/:id
router.put(
  '/:id',
  authenticate,
  requirePermission('deposito', 'frascos.manage'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    const result = editarFrascoSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { articulo, unidadesPorCaja, cantidadCajas, unidadesSueltas } = result.data

    try {
      let existing = await prisma.inventarioFrasco.findUnique({ where: { id } })
      if (!existing) {
        // Las filas creadas antes de centralizar el catálogo se representan con el
        // id del producto. Al primer ajuste se materializa su inventario real.
        const producto = await prisma.depositoProducto.findFirst({
          where: { id, categoria: 'frasco', activo: true },
        })
        if (!producto) { res.status(404).json({ message: 'Frasco no encontrado' }); return }
        existing = await prisma.inventarioFrasco.create({
          data: {
            productoId: producto.id,
            articulo: producto.nombreCompleto,
            unidadesPorCaja: 1,
            cantidadCajas: 0,
            unidadesSueltas: 0,
            total: 0,
          },
        })
      }

      if (articulo !== undefined && articulo !== existing.articulo) {
        const conflict = await prisma.inventarioFrasco.findFirst({
          where: { articulo, NOT: { id: existing.id } },
        })
        if (conflict) {
          res.status(409).json({ message: 'Ya existe un frasco con ese artículo' })
          return
        }
      }

      const newUnidades = unidadesPorCaja ?? existing.unidadesPorCaja
      const unidadesPorCajaCambiaron = unidadesPorCaja !== undefined && unidadesPorCaja !== existing.unidadesPorCaja
      const hasStockEdit = cantidadCajas !== undefined || unidadesSueltas !== undefined
      if (unidadesSueltas !== undefined && unidadesSueltas >= newUnidades) {
        res.status(400).json({ message: 'Las unidades sueltas deben ser menores que una caja' })
        return
      }
      let stock = descomponerTotalFrasco(existing.total, newUnidades)
      if (hasStockEdit) {
        const newCajas = cantidadCajas ?? (unidadesPorCajaCambiaron ? stock.cantidadCajas : existing.cantidadCajas)
        const newSueltas = unidadesSueltas ?? (unidadesPorCajaCambiaron ? 0 : obtenerUnidadesSueltas(existing))
        stock = calcularStockFrasco({ unidadesPorCaja: newUnidades, cantidadCajas: newCajas, unidadesSueltas: newSueltas })
      }

      if (!Number.isSafeInteger(stock.total) || stock.total > 2147483647) { res.status(400).json({ message: 'El total de unidades excede el máximo permitido' }); return }

      const updated = await prisma.inventarioFrasco.updateMany({
        where: { id: existing.id, articulo: existing.articulo, unidadesPorCaja: existing.unidadesPorCaja, cantidadCajas: existing.cantidadCajas, unidadesSueltas: existing.unidadesSueltas, total: existing.total },
        data: {
          ...(articulo !== undefined ? { articulo } : {}),
          ...(unidadesPorCaja !== undefined || hasStockEdit ? {
            unidadesPorCaja: stock.unidadesPorCaja,
            cantidadCajas: stock.cantidadCajas,
            unidadesSueltas: stock.unidadesSueltas,
            total: stock.total,
          } : {}),
        },
      })
      if (updated.count !== 1) { res.status(409).json({ message: 'El stock cambió mientras editabas. Actualizá la pantalla y volvé a intentar.' }); return }
      const frasco = await prisma.inventarioFrasco.findUniqueOrThrow({ where: { id: existing.id } })
      res.json(frasco)
      void syncDepositoStockSheetsAfterCommit()
    } catch {
      res.status(500).json({ message: 'No se pudo actualizar el frasco' })
    }
  }
)

// DELETE /api/frascos/:id
router.delete(
  '/:id',
  authenticate,
  requirePermission('deposito', 'frascos.manage'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string
    try {
      await prisma.inventarioFrasco.delete({ where: { id } })
      res.status(204).send()
      void syncDepositoStockSheetsAfterCommit()
    } catch {
      res.status(404).json({ message: 'Frasco no encontrado' })
    }
  }
)

export default router
