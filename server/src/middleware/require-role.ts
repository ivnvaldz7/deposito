import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth'

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'No autenticado' })
      return
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: 'No autorizado' })
      return
    }
    next()
  }
}
