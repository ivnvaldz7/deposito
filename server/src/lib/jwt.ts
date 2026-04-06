import jwt from 'jsonwebtoken'

export interface JwtPayload {
  sub: string
  role: string
  name: string
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
const JWT_EXPIRES_IN = '7d'

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload
}
