import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { requireRole } from '../middleware/require-role'

const router = Router()

const editRoleSchema = z.object({
  role: z.enum(['encargado', 'observador', 'solicitante']),
})

// GET /api/users — listar todos (solo encargado)
router.get(
  '/',
  authenticate,
  requireRole('encargado'),
  async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      const users = await prisma.user.findMany({
        select: { id: true, email: true, name: true, role: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      })
      res.json(users)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// PUT /api/users/:id — editar rol (solo encargado)
router.put(
  '/:id',
  authenticate,
  requireRole('encargado'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    const result = editRoleSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    try {
      const user = await prisma.user.update({
        where: { id },
        data: { role: result.data.role },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      })
      res.json(user)
    } catch {
      res.status(404).json({ message: 'Usuario no encontrado' })
    }
  }
)

// DELETE /api/users/:id — eliminar usuario (solo encargado, no puede borrarse a sí mismo)
router.delete(
  '/:id',
  authenticate,
  requireRole('encargado'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    if (req.user?.id === id) {
      res.status(400).json({ message: 'No podés eliminar tu propia cuenta' })
      return
    }

    try {
      await prisma.user.delete({ where: { id } })
      res.status(204).send()
    } catch {
      res.status(404).json({ message: 'Usuario no encontrado' })
    }
  }
)

export default router
