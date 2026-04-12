import { verifyToken as verifyJwtToken, type JwtPayload } from './jwt'
import type { PrismaClient } from '@platform/db'
import { getUserById } from '../users/service'

type NextFunction = () => void

interface RequestLike {
  headers?: {
    authorization?: string
    Authorization?: string
  }
  user?: JwtPayload
}

interface ResponseLike {
  status(code: number): ResponseLike
  json(body: unknown): unknown
}

export type RequestHandler = (
  req: RequestLike,
  res: ResponseLike,
  next: NextFunction
) => unknown

type PlatformDb = Pick<PrismaClient, 'platformUser' | 'appAccess'>

function extractBearerToken(req: RequestLike): string | null {
  const header =
    req.headers?.authorization ?? req.headers?.Authorization ?? null

  if (!header?.startsWith('Bearer ')) {
    return null
  }

  return header.slice('Bearer '.length).trim()
}

function respondUnauthorized(res: ResponseLike) {
  return res.status(401).json({ error: 'Token inválido' })
}

export const verifyToken: RequestHandler = (req, res, next) => {
  const token = extractBearerToken(req)

  if (!token) {
    return respondUnauthorized(res)
  }

  const payload = verifyJwtToken(token)

  if (!payload) {
    return respondUnauthorized(res)
  }

  req.user = payload
  next()
}

export function requireApp(app: string, roles?: string[]): RequestHandler {
  return (req, res, next) => {
    const verified = verifyToken(req, res, () => undefined)

    if (!req.user) {
      return verified
    }

    const appAccess = req.user.apps[app]

    if (!appAccess || appAccess.activo !== true) {
      return res.status(401).json({ error: 'No tiene acceso a la app' })
    }

    if (roles && roles.length > 0 && !roles.includes(appAccess.rol)) {
      return res.status(403).json({ error: 'Rol insuficiente' })
    }

    next()
  }
}

export function requirePlatformAdmin(db: PlatformDb): RequestHandler {
  return async (req, res, next) => {
    const verified = verifyToken(req, res, () => undefined)

    if (!req.user) {
      return verified
    }

    const user = await getUserById(db, req.user.sub)

    if (!user || user.isPlatformAdmin !== true) {
      return res.status(403).json({ error: 'Acceso denegado' })
    }

    next()
  }
}
