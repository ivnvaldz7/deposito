import jwt from 'jsonwebtoken'

export interface JwtPayload {
  sub: string
  email: string
  name?: string
  isPlatformAdmin?: boolean
  apps: Record<
    string,
    {
      rol: string
      activo: boolean
    }
  >
}

export interface RefreshTokenPayload {
  sub: string
  type: 'refresh'
  iat: number
}

function getJwtSecret(): string {
  const secret = process.env.PLATFORM_JWT_SECRET

  if (!secret) {
    throw new Error('PLATFORM_JWT_SECRET no está definido')
  }

  return secret
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '15m' })
}

// Backward compatibility — existing callers use signToken with 7d expiry
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' })
}

export function signRefreshToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: 'refresh' as const },
    getJwtSecret(),
    { expiresIn: '7d' }
  )
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret())

    if (typeof decoded !== 'object' || !decoded) {
      return null
    }

    const { sub, email, name, isPlatformAdmin, apps } = decoded as JwtPayload

    if (!sub || !email || !apps) {
      return null
    }

    return {
      sub,
      email,
      name: name ?? '',
      isPlatformAdmin: isPlatformAdmin ?? false,
      apps,
    }
  } catch {
    return null
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret())

    if (typeof decoded !== 'object' || !decoded) {
      return null
    }

    const { sub, type, iat } = decoded as RefreshTokenPayload

    if (!sub || type !== 'refresh') {
      return null
    }

    return { sub, type, iat: iat ?? Math.floor(Date.now() / 1000) }
  } catch {
    return null
  }
}

// Backward compatibility aliases
export const verifyToken = verifyAccessToken

export function decodeToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.decode(token)

    if (typeof decoded !== 'object' || !decoded) {
      return null
    }

    const { sub, email, name, isPlatformAdmin, apps } = decoded as JwtPayload

    if (!sub || !email || !apps) {
      return null
    }

    return {
      sub,
      email,
      name: name ?? '',
      isPlatformAdmin: isPlatformAdmin ?? false,
      apps,
    }
  } catch {
    return null
  }
}
