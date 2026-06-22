import type { NextFunction, Request, Response } from 'express'
import { verifyAccessToken, type JwtPayload } from '@platform/core'

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

function getBearerToken(headerValue?: string): string | null {
  if (!headerValue || !headerValue.startsWith('Bearer ')) {
    return null
  }

  const token = headerValue.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

export function verifyToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = getBearerToken(req.headers.authorization)

  if (!token) {
    res.status(401).json({ error: 'Token requerido' })
    return
  }

  const payload = verifyAccessToken(token)

  if (!payload) {
    res.status(401).json({ error: 'Token inválido o expirado' })
    return
  }

  req.user = payload
  next()
}
