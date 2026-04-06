import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { signToken } from '../lib/jwt'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/require-role'

const router = Router()

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  role: z.enum(['encargado', 'observador', 'solicitante']).optional().default('observador'),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// POST /api/auth/register — solo encargados autenticados pueden crear usuarios
router.post('/register', authenticate, requireRole('encargado'), async (req: Request, res: Response): Promise<void> => {
  const result = registerSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
    return
  }

  const { email, password, name, role } = result.data

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      res.status(409).json({ message: 'Ya existe un usuario con ese email' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, passwordHash, name, role },
      select: { id: true, email: true, name: true, role: true },
    })

    const token = signToken({ sub: user.id, role: user.role, name: user.name })
    res.status(201).json({ token, user })
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const result = loginSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ message: 'Datos inválidos' })
    return
  }

  const { email, password } = result.data

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      res.status(401).json({ message: 'Email o contraseña incorrectos' })
      return
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      res.status(401).json({ message: 'Email o contraseña incorrectos' })
      return
    }

    const token = signToken({ sub: user.id, role: user.role, name: user.name })
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    })
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

export default router
