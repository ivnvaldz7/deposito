import { describe, expect, it } from 'vitest'
import { comparePassword, hashPassword } from './password'

describe('password', () => {
  it('hashPassword genera hash distinto al input', async () => {
    const plain = 'super-secret-password'
    const hashed = await hashPassword(plain)

    expect(hashed).not.toBe(plain)
    expect(hashed.length).toBeGreaterThan(plain.length)
  })

  it('comparePassword retorna true con password correcto', async () => {
    const plain = 'super-secret-password'
    const hashed = await hashPassword(plain)

    await expect(comparePassword(plain, hashed)).resolves.toBe(true)
  })

  it('comparePassword retorna false con password incorrecto', async () => {
    const hashed = await hashPassword('super-secret-password')

    await expect(comparePassword('otro-password', hashed)).resolves.toBe(false)
  })
})
