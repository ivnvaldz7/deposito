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
