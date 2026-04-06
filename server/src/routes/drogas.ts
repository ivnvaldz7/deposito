import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/require-role'

const router = Router()

const crearDrogaSchema = z.object({
  nombre: z.string().min(2).max(100),
  cantidad: z.number().int().min(0),
})

const editarDrogaSchema = z
  .object({
    nombre: z.string().min(2).max(100).optional(),
    cantidad: z.number().int().min(0).optional(),
  })
  .refine((d) => d.nombre !== undefined || d.cantidad !== undefined, {
    message: 'Al menos un campo requerido',
  })

// GET /api/drogas — listar todas (auth required)
router.get('/', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const drogas = await prisma.inventarioDroga.findMany({
      orderBy: { nombre: 'asc' },
    })
    res.json(drogas)
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/drogas — crear nueva (encargado)
router.post(
  '/',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const result = crearDrogaSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { nombre, cantidad } = result.data

    try {
      const existing = await prisma.inventarioDroga.findUnique({ where: { nombre } })
      if (existing) {
        res.status(409).json({ message: 'Ya existe una droga con ese nombre' })
        return
      }

      const droga = await prisma.inventarioDroga.create({
        data: { nombre, cantidad },
      })
      res.status(201).json(droga)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// PUT /api/drogas/:id — editar nombre y/o cantidad (encargado)
router.put(
  '/:id',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    const result = editarDrogaSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { nombre, cantidad } = result.data

    try {
      if (nombre) {
        const conflict = await prisma.inventarioDroga.findFirst({
          where: { nombre, NOT: { id } },
        })
        if (conflict) {
          res.status(409).json({ message: 'Ya existe una droga con ese nombre' })
          return
        }
      }

      const droga = await prisma.inventarioDroga.update({
        where: { id },
        data: {
          ...(nombre !== undefined ? { nombre } : {}),
          ...(cantidad !== undefined ? { cantidad } : {}),
        },
      })
      res.json(droga)
    } catch {
      res.status(404).json({ message: 'Droga no encontrada' })
    }
  }
)

// DELETE /api/drogas/:id — eliminar (encargado)
router.delete(
  '/:id',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    try {
      await prisma.inventarioDroga.delete({ where: { id } })
      res.status(204).send()
    } catch {
      res.status(404).json({ message: 'Droga no encontrada' })
    }
  }
)

export default router
