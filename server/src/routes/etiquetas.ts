import { Router, Request, Response } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/require-role'
import {
  crearMercadoInventorySchema,
  editarMercadoInventorySchema,
  resolveMercadoQuery,
  getMercadoInventoryOrderBy,
} from './shared/mercado-inventory-helpers'

const router = Router()

// GET /api/etiquetas
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { mercado } = req.query

  const where: Prisma.InventarioEtiquetaWhereInput = {}
  const mercadoValue = resolveMercadoQuery(mercado)
  if (mercadoValue) {
    where.mercado = mercadoValue
  }

  try {
    const etiquetas = await prisma.inventarioEtiqueta.findMany({
      where,
      orderBy: getMercadoInventoryOrderBy(),
    })
    res.json(etiquetas)
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/etiquetas
router.post(
  '/',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const result = crearMercadoInventorySchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { articulo, mercado, cantidad } = result.data

    try {
      const existing = await prisma.inventarioEtiqueta.findUnique({
        where: { articulo_mercado: { articulo, mercado } },
      })
      if (existing) {
        res.status(409).json({ message: 'Ya existe esa etiqueta para ese mercado' })
        return
      }

      const etiqueta = await prisma.inventarioEtiqueta.create({
        data: { articulo, mercado, cantidad },
      })
      res.status(201).json(etiqueta)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// PUT /api/etiquetas/:id
router.put(
  '/:id',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    const result = editarMercadoInventorySchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { articulo, mercado, cantidad } = result.data

    try {
      const existing = await prisma.inventarioEtiqueta.findUnique({ where: { id } })
      if (!existing) { res.status(404).json({ message: 'Etiqueta no encontrada' }); return }

      const newArticulo = articulo ?? existing.articulo
      const newMercado = mercado ?? existing.mercado

      if (articulo !== undefined || mercado !== undefined) {
        const conflict = await prisma.inventarioEtiqueta.findFirst({
          where: { articulo: newArticulo, mercado: newMercado, NOT: { id } },
        })
        if (conflict) {
          res.status(409).json({ message: 'Ya existe esa etiqueta para ese mercado' })
          return
        }
      }

      const etiqueta = await prisma.inventarioEtiqueta.update({
        where: { id },
        data: {
          ...(articulo !== undefined ? { articulo } : {}),
          ...(mercado !== undefined ? { mercado } : {}),
          ...(cantidad !== undefined ? { cantidad } : {}),
        },
      })
      res.json(etiqueta)
    } catch {
      res.status(404).json({ message: 'Etiqueta no encontrada' })
    }
  }
)

// DELETE /api/etiquetas/:id
router.delete(
  '/:id',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string
    try {
      await prisma.inventarioEtiqueta.delete({ where: { id } })
      res.status(204).send()
    } catch {
      res.status(404).json({ message: 'Etiqueta no encontrada' })
    }
  }
)

export default router
