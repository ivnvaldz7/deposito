import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../../middlewares/require-permission'

const router = Router()
const cantidadSchema = z.object({ cantidad: z.number().int().min(0) })

// These records are catalog-backed. Products are created in /productos and the
// dedicated sheet only manages their unit count.
router.get('/', authenticate, requirePermission('deposito', 'productos_catalogo.read'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const [productos, inventario] = await Promise.all([
      prisma.depositoProducto.findMany({ where: { categoria: 'material_empaque', activo: true }, orderBy: { nombreCompleto: 'asc' } }),
      prisma.inventarioMaterialEmpaque.findMany({ orderBy: { articulo: 'asc' } }),
    ])
    const byProduct = new Map(inventario.filter((row) => row.productoId).map((row) => [row.productoId!, row]))
    res.json(productos.map((producto) => ({
      ...(byProduct.get(producto.id) ?? {
        id: producto.id, productoId: producto.id, articulo: producto.nombreCompleto, cantidad: 0, updatedAt: producto.updatedAt,
      }),
      stockMinimo: producto.stockMinimo,
    })))
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

router.patch('/:id', authenticate, requirePermission('deposito', 'productos_catalogo.manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = cantidadSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: 'Datos inválidos', errors: parsed.error.flatten() }); return }
  try {
    const updated = await prisma.inventarioMaterialEmpaque.update({ where: { id: String(req.params.id) }, data: { cantidad: parsed.data.cantidad } })
    res.json(updated)
  } catch {
    res.status(404).json({ message: 'Material de empaque no encontrado' })
  }
})

export default router
