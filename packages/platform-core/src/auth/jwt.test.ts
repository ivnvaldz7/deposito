import jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  decodeToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type JwtPayload,
  type RefreshTokenPayload,
} from './jwt'

const payload: JwtPayload = {
  sub: 'user_123',
  email: 'user@example.com',
  name: 'Test User',
  isPlatformAdmin: false,
  apps: {
    deposito: {
      rol: 'admin',
      activo: true,
    },
  },
}

describe('signAccessToken', () => {
  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = 'un-string-largo-y-random-minimo-32-chars'
  })

  it('genera un string token válido', () => {
    const token = signAccessToken(payload)
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('codifica sub, email, name, isPlatformAdmin y apps en el payload', () => {
    const token = signAccessToken(payload)
    const decoded = jwt.decode(token) as jwt.JwtPayload | null
    expect(decoded).not.toBeNull()
    expect(decoded!.sub).toBe('user_123')
    expect(decoded!.email).toBe('user@example.com')
    expect(decoded!.name).toBe('Test User')
    expect(decoded!.isPlatformAdmin).toBe(false)
    expect(decoded!.apps).toEqual(payload.apps)
  })

  it('expira en 15 minutos', () => {
    const token = signAccessToken(payload)
    const decoded = jwt.decode(token) as jwt.JwtPayload | null
    expect(decoded).not.toBeNull()
    const exp = decoded!.exp!
    const iat = decoded!.iat!
    // 15 min = 900 seconds
    expect(exp - iat).toBeCloseTo(900, -1) // allow small tolerance
  })
})

describe('verifyAccessToken', () => {
  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = 'un-string-largo-y-random-minimo-32-chars'
  })

  it('devuelve el payload correcto con token válido', () => {
    const token = signAccessToken(payload)
    const verified = verifyAccessToken(token)
    expect(verified).toEqual(payload)
  })

  it('devuelve null con token inválido', () => {
    expect(verifyAccessToken('token-invalido')).toBeNull()
  })

  it('devuelve null con token expirado', () => {
    const token = jwt.sign(payload, process.env.PLATFORM_JWT_SECRET!, {
      expiresIn: -1,
    })
    expect(verifyAccessToken(token)).toBeNull()
  })

  it('devuelve null si falta sub', () => {
    const { sub: _, ...noSub } = payload
    const token = jwt.sign(noSub, process.env.PLATFORM_JWT_SECRET!, { expiresIn: '15m' })
    expect(verifyAccessToken(token)).toBeNull()
  })
})

describe('signRefreshToken', () => {
  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = 'un-string-largo-y-random-minimo-32-chars'
  })

  it('genera un string token válido', () => {
    const token = signRefreshToken('user_123')
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('codifica sub y type=refresh en el payload', () => {
    const token = signRefreshToken('user_123')
    const decoded = jwt.decode(token) as jwt.JwtPayload | null
    expect(decoded).not.toBeNull()
    expect(decoded!.sub).toBe('user_123')
    expect(decoded!.type).toBe('refresh')
  })

  it('expira en 7 días', () => {
    const token = signRefreshToken('user_123')
    const decoded = jwt.decode(token) as jwt.JwtPayload | null
    expect(decoded).not.toBeNull()
    const exp = decoded!.exp!
    const iat = decoded!.iat!
    // 7 days = 604800 seconds
    expect(exp - iat).toBeCloseTo(604800, -2)
  })
})

describe('verifyRefreshToken', () => {
  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = 'un-string-largo-y-random-minimo-32-chars'
  })

  it('devuelve el payload correcto con token válido', () => {
    const token = signRefreshToken('user_123')
    const verified = verifyRefreshToken(token)
    expect(verified).not.toBeNull()
    expect(verified!.sub).toBe('user_123')
    expect(verified!.type).toBe('refresh')
  })

  it('devuelve null con token inválido', () => {
    expect(verifyRefreshToken('token-invalido')).toBeNull()
  })

  it('devuelve null con token expirado', () => {
    const token = jwt.sign(
      { sub: 'user_123', type: 'refresh' },
      process.env.PLATFORM_JWT_SECRET!,
      { expiresIn: -1 }
    )
    expect(verifyRefreshToken(token)).toBeNull()
  })

  it('devuelve null si el type no es refresh', () => {
    const token = signAccessToken(payload)
    expect(verifyRefreshToken(token)).toBeNull()
  })
})

describe('decodeToken', () => {
  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = 'un-string-largo-y-random-minimo-32-chars'
  })

  it('devuelve el payload sin verificar firma', () => {
    const token = signAccessToken(payload)
    expect(decodeToken(token)).toEqual(payload)
  })

  it('devuelve null con token inválido', () => {
    expect(decodeToken('')).toBeNull()
  })

  it('devuelve null si falta sub', () => {
    const { sub: _, ...noSub } = payload
    const token = jwt.sign(noSub, process.env.PLATFORM_JWT_SECRET!, { expiresIn: '15m' })
    expect(decodeToken(token)).toBeNull()
  })
})
