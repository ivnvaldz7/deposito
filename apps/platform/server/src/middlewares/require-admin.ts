import type { NextFunction, Request, Response } from 'express'
import { platformDb } from '@platform/db'
import { getUserById, verifyAccessToken } from '@platform/core'

export async function requirePlatformAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length).trim()
    : null

  if (!token) {
    res.status(401).json({ error: 'Token requerido' })
    return
  }

  const payload = verifyAccessToken(token)

  if (!payload) {
    res.status(401).json({ error: 'Token inválido o expirado' })
    return
  }

  const user = await getUserById(platformDb as Parameters<typeof getUserById>[0], payload.sub)

  if (!user || user.isPlatformAdmin !== true) {
    res.status(403).json({ error: 'Se requieren permisos de administrador' })
    return
  }

  req.user = payload
  next()
}
