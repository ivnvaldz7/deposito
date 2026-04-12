import jwt from 'jsonwebtoken'

export interface JwtPayload {
  sub: string
  email: string
  apps: Record<
    string,
    {
      rol: string
      activo: boolean
    }
  >
}

function getJwtSecret(): string {
  const secret = process.env.PLATFORM_JWT_SECRET

  if (!secret) {
    throw new Error('PLATFORM_JWT_SECRET no está definido')
  }

  return secret
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' })
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret())

    if (typeof decoded !== 'object' || !decoded) {
      return null
    }

    const { sub, email, apps } = decoded as JwtPayload

    if (!sub || !email || !apps) {
      return null
    }

    return { sub, email, apps }
  } catch {
    return null
  }
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.decode(token)

    if (typeof decoded !== 'object' || !decoded) {
      return null
    }

    const { sub, email, apps } = decoded as JwtPayload

    if (!sub || !email || !apps) {
      return null
    }

    return { sub, email, apps }
  } catch {
    return null
  }
}
