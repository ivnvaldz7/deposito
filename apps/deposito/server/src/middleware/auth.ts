/*
// DEPRECATED: reemplazado por platform-core en Tarea 5
// Conservar hasta confirmar que el nuevo auth funciona en producción
import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../lib/jwt'

export interface AuthRequest extends Request {
  user?: {
    id: string
    role: string
    name: string
  }
}

export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Token requerido' })
    return
  }

  const token = authHeader.slice(7)

  try {
    const payload = verifyToken(token)
    req.user = { id: payload.sub, role: payload.role, name: payload.name }
    next()
  } catch {
    res.status(401).json({ message: 'Token inválido o expirado' })
  }
}
*/

import { Request, Response, NextFunction } from 'express'
import { verifyToken as verifyPlatformToken } from '@platform/core'
import { prisma } from '../lib/prisma'

export interface AuthRequest extends Request {
  user?: {
    id: string
    role: string
    name: string
    email: string
  }
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Token requerido' })
    return
  }

  const token = authHeader.slice(7)
  const payload = verifyPlatformToken(token)

  if (!payload) {
    res.status(401).json({ message: 'Token inválido o expirado' })
    return
  }

  const depositoAccess = payload.apps.deposito

  if (!depositoAccess || depositoAccess.activo !== true) {
    res.status(403).json({ message: 'No tiene acceso a Depósito' })
    return
  }

  const depositoUser = await prisma.user.findFirst({
    where: {
      OR: [
        { platformUserId: payload.sub },
        { email: payload.email },
      ],
    },
  })

  if (!depositoUser) {
    res.status(401).json({ message: 'Usuario de Depósito no encontrado' })
    return
  }

  req.user = {
    id: depositoUser.id,
    role: depositoUser.role,
    name: depositoUser.name,
    email: depositoUser.email,
  }

  next()
}
