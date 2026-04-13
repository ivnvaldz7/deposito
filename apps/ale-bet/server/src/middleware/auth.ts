import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { verifyToken as verifyPlatformToken } from '@platform/core'

export interface AuthenticatedUser {
  id: string
  email: string
  rol: string
}

type PlatformAppName = 'ale_bet'

export interface AuthRequest extends Request {
  user?: AuthenticatedUser
}

function getBearerToken(headerValue?: string): string | null {
  if (!headerValue || !headerValue.startsWith('Bearer ')) {
    return null
  }

  const token = headerValue.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

export const authenticate: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = getBearerToken(req.header('Authorization'))

  if (!token) {
    res.status(401).json({ error: 'Token requerido' })
    return
  }

  const payload = verifyPlatformToken(token)

  if (!payload) {
    res.status(401).json({ error: 'Token inválido' })
    return
  }

  const access = payload.apps.ale_bet

  if (!access || access.activo !== true) {
    res.status(403).json({ error: 'No tiene acceso a Ale-Bet' })
    return
  }

  ;(req as AuthRequest).user = {
    id: payload.sub,
    email: payload.email,
    rol: access.rol,
  }

  next()
}

export function requireRole(...roles: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest

    if (!authReq.user) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    if (!roles.includes(authReq.user.rol)) {
      res.status(403).json({ error: 'No autorizado' })
      return
    }

    next()
  }
}

export function requireApp(app: PlatformAppName, roles: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest

    if (!authReq.user) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    if (app !== 'ale_bet') {
      res.status(403).json({ error: 'Aplicación no autorizada' })
      return
    }

    if (!roles.includes(authReq.user.rol)) {
      res.status(403).json({ error: 'No autorizado' })
      return
    }

    next()
  }
}
