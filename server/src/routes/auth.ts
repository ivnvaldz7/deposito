import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { signRefreshToken, signToken, verifyRefreshToken } from '../lib/jwt'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/require-role'

const router = Router()
const REFRESH_COOKIE_NAME = 'deposito_refresh_token'
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

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

function getCookieValue(req: Request, name: string): string | null {
  const raw = req.headers.cookie
  if (!raw) return null

  for (const part of raw.split(';')) {
    const [cookieName, ...rest] = part.trim().split('=')
    if (cookieName === name) {
      return decodeURIComponent(rest.join('='))
    }
  }

  return null
}

function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: '/api/auth',
  })
}

function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  })
}

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
  } catch (error) {
    console.error(error)
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
    const refreshToken = signRefreshToken(user.id)
    setRefreshTokenCookie(res, refreshToken)
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const refreshToken = getCookieValue(req, REFRESH_COOKIE_NAME)

  if (!refreshToken) {
    res.status(401).json({ message: 'Refresh token requerido' })
    return
  }

  try {
    const payload = verifyRefreshToken(refreshToken)
    if (payload.type !== 'refresh') {
      clearRefreshTokenCookie(res)
      res.status(401).json({ message: 'Refresh token inválido' })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true },
    })

    if (!user) {
      clearRefreshTokenCookie(res)
      res.status(401).json({ message: 'Usuario no encontrado para refresh token' })
      return
    }

    const accessToken = signToken({ sub: user.id, role: user.role, name: user.name })
    const rotatedRefreshToken = signRefreshToken(user.id)
    setRefreshTokenCookie(res, rotatedRefreshToken)

    res.json({
      token: accessToken,
      user,
    })
  } catch (error) {
    console.error(error)
    clearRefreshTokenCookie(res)
    res.status(401).json({ message: 'Refresh token inválido o expirado' })
  }
})

// POST /api/auth/logout
router.post('/logout', async (_req: Request, res: Response): Promise<void> => {
  clearRefreshTokenCookie(res)
  res.status(204).send()
})

export default router
