/*
// DEPRECATED: reemplazado por platform-core en Tarea 5
// Conservar hasta confirmar que el nuevo auth funciona en producción
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
*/

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { comparePassword, getUserByEmail, getUserById, signToken } from '@platform/core'
import { platformDb } from '@platform/db'
import { prisma } from '../lib/prisma'
import { signRefreshToken, verifyRefreshToken } from '../lib/jwt'

const router = Router()
const REFRESH_COOKIE_NAME = 'deposito_refresh_token'
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

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

type DepositoRole = 'encargado' | 'observador' | 'solicitante'

interface DepositoAuthUser {
  id: string
  email: string
  name: string
  role: DepositoRole
  nombre: string
  rol: DepositoRole
}

async function ensureDepositoUser(
  platformUser: {
    id: string
    email: string
    nombre: string
    password: string
  },
  role: DepositoRole
): Promise<DepositoAuthUser> {
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { platformUserId: platformUser.id },
        { email: platformUser.email },
      ],
    },
  })

  const depositoUser = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          email: platformUser.email,
          name: platformUser.nombre,
          role,
          platformUserId: platformUser.id,
        },
      })
    : await prisma.user.create({
        data: {
          email: platformUser.email,
          name: platformUser.nombre,
          role,
          passwordHash: platformUser.password,
          platformUserId: platformUser.id,
        },
      })

  return {
    id: depositoUser.id,
    email: depositoUser.email,
    name: depositoUser.name,
    role: depositoUser.role,
    nombre: depositoUser.name,
    rol: depositoUser.role,
  }
}

// POST /api/auth/register
router.post('/register', async (_req: Request, res: Response): Promise<void> => {
  res.status(403).json({
    error: 'El registro está deshabilitado. Los usuarios se crean desde el panel de administración.',
  })
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
    const platformUser = await getUserByEmail(platformDb, email)
    if (!platformUser || !platformUser.activo) {
      res.status(401).json({ message: 'Email o contraseña incorrectos' })
      return
    }

    const valid = await comparePassword(password, platformUser.password)
    if (!valid) {
      res.status(401).json({ message: 'Email o contraseña incorrectos' })
      return
    }

    const apps = platformUser.appAccess.reduce<Record<string, { rol: string; activo: boolean }>>(
      (acc, access) => {
        acc[access.app] = {
          rol: access.rol,
          activo: access.activo,
        }

        return acc
      },
      {}
    )

    const depositoAccess = apps.deposito

    if (!depositoAccess || depositoAccess.activo !== true) {
      res.status(403).json({ message: 'No tiene acceso a Depósito' })
      return
    }

    const depositoUser = await ensureDepositoUser(
      {
        id: platformUser.id,
        email: platformUser.email,
        nombre: platformUser.nombre,
        password: platformUser.password,
      },
      depositoAccess.rol as DepositoRole
    )

    const token = signToken({
      sub: platformUser.id,
      email: platformUser.email,
      apps,
    })
    const refreshToken = signRefreshToken(platformUser.id)

    setRefreshTokenCookie(res, refreshToken)
    res.json({
      token,
      user: depositoUser,
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

    const platformUser = await getUserById(platformDb, payload.sub)

    if (!platformUser || !platformUser.activo) {
      clearRefreshTokenCookie(res)
      res.status(401).json({ message: 'Usuario no encontrado para refresh token' })
      return
    }

    const apps = platformUser.appAccess.reduce<Record<string, { rol: string; activo: boolean }>>(
      (acc, access) => {
        acc[access.app] = {
          rol: access.rol,
          activo: access.activo,
        }

        return acc
      },
      {}
    )

    const depositoAccess = apps.deposito

    if (!depositoAccess || depositoAccess.activo !== true) {
      clearRefreshTokenCookie(res)
      res.status(401).json({ message: 'Usuario no encontrado para refresh token' })
      return
    }

    const depositoUser = await ensureDepositoUser(
      {
        id: platformUser.id,
        email: platformUser.email,
        nombre: platformUser.nombre,
        password: platformUser.password,
      },
      depositoAccess.rol as DepositoRole
    )

    const accessToken = signToken({
      sub: platformUser.id,
      email: platformUser.email,
      apps,
    })
    const rotatedRefreshToken = signRefreshToken(platformUser.id)

    setRefreshTokenCookie(res, rotatedRefreshToken)

    res.json({
      token: accessToken,
      user: depositoUser,
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
