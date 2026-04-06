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

// GET /api/estuches
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { mercado } = req.query

  const where: Prisma.InventarioEstucheWhereInput = {}
  const mercadoValue = resolveMercadoQuery(mercado)
  if (mercadoValue) {
    where.mercado = mercadoValue
  }

  try {
    const estuches = await prisma.inventarioEstuche.findMany({
      where,
      orderBy: getMercadoInventoryOrderBy(),
    })
    res.json(estuches)
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/estuches
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
      const existing = await prisma.inventarioEstuche.findUnique({
        where: { articulo_mercado: { articulo, mercado } },
      })
      if (existing) {
        res.status(409).json({ message: 'Ya existe ese artículo para ese mercado' })
        return
      }

      const estuche = await prisma.inventarioEstuche.create({
        data: { articulo, mercado, cantidad },
      })
      res.status(201).json(estuche)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// PUT /api/estuches/:id
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
      const existing = await prisma.inventarioEstuche.findUnique({ where: { id } })
      if (!existing) { res.status(404).json({ message: 'Estuche no encontrado' }); return }

      const newArticulo = articulo ?? existing.articulo
      const newMercado = mercado ?? existing.mercado

      if (articulo !== undefined || mercado !== undefined) {
        const conflict = await prisma.inventarioEstuche.findFirst({
          where: { articulo: newArticulo, mercado: newMercado, NOT: { id } },
        })
        if (conflict) {
          res.status(409).json({ message: 'Ya existe ese artículo para ese mercado' })
          return
        }
      }

      const estuche = await prisma.inventarioEstuche.update({
        where: { id },
        data: {
          ...(articulo !== undefined ? { articulo } : {}),
          ...(mercado !== undefined ? { mercado } : {}),
          ...(cantidad !== undefined ? { cantidad } : {}),
        },
      })
      res.json(estuche)
    } catch {
      res.status(404).json({ message: 'Estuche no encontrado' })
    }
  }
)

// DELETE /api/estuches/:id
router.delete(
  '/:id',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string
    try {
      await prisma.inventarioEstuche.delete({ where: { id } })
      res.status(204).send()
    } catch {
      res.status(404).json({ message: 'Estuche no encontrado' })
    }
  }
)

export default router
