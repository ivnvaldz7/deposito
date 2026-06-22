import type { NextFunction, Request, Response } from 'express'
import { verifyAccessToken } from '@platform/core'

export function requireApp(app: string, roles?: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
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

    const appAccess = payload.apps[app]

    if (!appAccess || appAccess.activo !== true) {
      res.status(403).json({ error: 'No tiene acceso a esta aplicación' })
      return
    }

    if (roles && roles.length > 0 && !roles.includes(appAccess.rol)) {
      res.status(403).json({ error: 'Rol insuficiente para esta acción' })
      return
    }

    req.user = payload
    next()
  }
}
