import jwt from 'jsonwebtoken'

export interface JwtPayload {
  sub: string
  role: string
  name: string
}

export interface RefreshTokenPayload {
  sub: string
  type: 'refresh'
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    console.error('❌ JWT_SECRET no configurado. Agregalo a server/.env')
    process.exit(1)
  }
  return secret
}

const JWT_SECRET = getJwtSecret()
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET ?? JWT_SECRET
const ACCESS_TOKEN_EXPIRES_IN = '15m'
const REFRESH_TOKEN_EXPIRES_IN = '30d'

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN })
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' satisfies RefreshTokenPayload['type'] }, REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, REFRESH_TOKEN_SECRET) as RefreshTokenPayload
}
