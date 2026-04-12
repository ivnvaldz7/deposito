import type { NextFunction, Request, RequestHandler, Response } from 'express'
import {
  requirePlatformAdmin as requirePlatformAdminCore,
  verifyToken,
  type JwtPayload,
} from '@platform/core'
import { platformDb } from '@platform/db'

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

export const verifyTokenMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = getBearerToken(req.header('Authorization'))

  if (!token) {
    res.status(401).json({ error: 'Token inválido' })
    return
  }

  const payload = verifyToken(token)

  if (!payload) {
    res.status(401).json({ error: 'Token inválido' })
    return
  }

  req.user = payload
  next()
}

export const requirePlatformAdmin: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const handler = requirePlatformAdminCore(platformDb)
  return handler(req, res, next)
}
