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
  const authHeader = req.headers.authorization
  const token = getBearerToken(authHeader)

  if (!token) {
    console.log('[verify-token] No token found in header:', authHeader ? authHeader.substring(0, 30) : '(no header)')
    res.status(401).json({ error: 'Token requerido' })
    return
  }

  const payload = verifyAccessToken(token)

  if (!payload) {
    console.log('[verify-token] verifyAccessToken returned null for token:', token.substring(0, 30) + '...')
    res.status(401).json({ error: 'Token inválido o expirado' })
    return
  }

  console.log('[verify-token] Token verified for:', payload.email)
  req.user = payload
  next()
}
