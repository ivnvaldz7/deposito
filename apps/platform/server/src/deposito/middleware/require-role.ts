import { Request,  Response, NextFunction  } from 'express'


export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.depositoUser) {
      res.status(401).json({ message: 'No autenticado' })
      return
    }
    if (!roles.includes(req.depositoUser.role)) {
      res.status(403).json({ message: 'No autorizado' })
      return
    }
    next()
  }
}
