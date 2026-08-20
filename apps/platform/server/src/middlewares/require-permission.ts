import { type Request, type Response, type NextFunction } from 'express'
import {
  hasPermission,
  type Permission,
  type AppPermissionKey,
  verifyAccessToken
} from '@platform/core'

export function requirePermission(app: AppPermissionKey, permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Si ya existe req.user por un auth global/anterior, lo usamos.
    // Sino, lo resolvemos del token.
    let payload = req.user || undefined

    if (!payload) {
      const token = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice('Bearer '.length).trim()
        : null

      if (!token) {
        res.status(401).json({ error: 'Token requerido' })
        return
      }

      const verified = verifyAccessToken(token)
      if (!verified) {
        res.status(401).json({ error: 'Token inválido o expirado' })
        return
      }
      
      payload = verified
      req.user = payload
    }

    if (!hasPermission(payload, app, permission)) {
      res.status(403).json({ error: 'Permiso insuficiente' })
      return
    }

    next()
  }
}
