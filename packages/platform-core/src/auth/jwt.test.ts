import jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it } from 'vitest'
import { decodeToken, signToken, verifyToken, type JwtPayload } from './jwt'

const payload: JwtPayload = {
  sub: 'user_123',
  email: 'user@example.com',
  apps: {
    deposito: {
      rol: 'admin',
      activo: true,
    },
  },
}

describe('jwt', () => {
  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = 'un-string-largo-y-random-minimo-32-chars'
  })

  it('signToken genera un string', () => {
    const token = signToken(payload)
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('verifyToken devuelve el payload correcto con token válido', () => {
    const token = signToken(payload)
    const verified = verifyToken(token)

    expect(verified).toEqual(payload)
  })

  it('verifyToken devuelve null con token inválido', () => {
    expect(verifyToken('token-invalido')).toBeNull()
  })

  it('verifyToken devuelve null con token expirado', () => {
    const token = jwt.sign(payload, process.env.PLATFORM_JWT_SECRET!, {
      expiresIn: -1,
    })

    expect(verifyToken(token)).toBeNull()
  })

  it('decodeToken devuelve el payload sin verificar firma', () => {
    const token = signToken(payload)
    expect(decodeToken(token)).toEqual(payload)
  })
})
