import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/require-role'

const router = Router()

const crearFrascoSchema = z.object({
  articulo: z.string().min(2).max(150),
  unidadesPorCaja: z.number().int().positive(),
  cantidadCajas: z.number().int().min(0),
})

const editarFrascoSchema = z
  .object({
    articulo: z.string().min(2).max(150).optional(),
    unidadesPorCaja: z.number().int().positive().optional(),
    cantidadCajas: z.number().int().min(0).optional(),
  })
  .refine(
    (d) => d.articulo !== undefined || d.unidadesPorCaja !== undefined || d.cantidadCajas !== undefined,
    { message: 'Al menos un campo requerido' }
  )

// GET /api/frascos
router.get('/', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const frascos = await prisma.inventarioFrasco.findMany({
      orderBy: { articulo: 'asc' },
    })
    res.json(frascos)
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/frascos
router.post(
  '/',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const result = crearFrascoSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { articulo, unidadesPorCaja, cantidadCajas } = result.data

    try {
      const existing = await prisma.inventarioFrasco.findUnique({ where: { articulo } })
      if (existing) {
        res.status(409).json({ message: 'Ya existe ese artículo' })
        return
      }

      const frasco = await prisma.inventarioFrasco.create({
        data: {
          articulo,
          unidadesPorCaja,
          cantidadCajas,
          total: unidadesPorCaja * cantidadCajas,
        },
      })
      res.status(201).json(frasco)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// PUT /api/frascos/:id
router.put(
  '/:id',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    const result = editarFrascoSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { articulo, unidadesPorCaja, cantidadCajas } = result.data

    try {
      const existing = await prisma.inventarioFrasco.findUnique({ where: { id } })
      if (!existing) { res.status(404).json({ message: 'Frasco no encontrado' }); return }

      if (articulo !== undefined && articulo !== existing.articulo) {
        const conflict = await prisma.inventarioFrasco.findFirst({
          where: { articulo, NOT: { id } },
        })
        if (conflict) {
          res.status(409).json({ message: 'Ya existe un frasco con ese artículo' })
          return
        }
      }

      const newUnidades = unidadesPorCaja ?? existing.unidadesPorCaja
      const newCajas = cantidadCajas ?? existing.cantidadCajas

      const frasco = await prisma.inventarioFrasco.update({
        where: { id },
        data: {
          ...(articulo !== undefined ? { articulo } : {}),
          ...(unidadesPorCaja !== undefined ? { unidadesPorCaja } : {}),
          ...(cantidadCajas !== undefined ? { cantidadCajas } : {}),
          total: newUnidades * newCajas,
        },
      })
      res.json(frasco)
    } catch {
      res.status(404).json({ message: 'Frasco no encontrado' })
    }
  }
)

// DELETE /api/frascos/:id
router.delete(
  '/:id',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string
    try {
      await prisma.inventarioFrasco.delete({ where: { id } })
      res.status(204).send()
    } catch {
      res.status(404).json({ message: 'Frasco no encontrado' })
    }
  }
)

export default router
