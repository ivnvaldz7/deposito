import { describe, it, expect } from 'vitest'
import { getSingleIdempotencyKey, canonicalizeJson, calculateFingerprint, toPersistableResponseBody } from '../../utils/idempotency'

describe('Idempotency Utils', () => {
  describe('getSingleIdempotencyKey', () => {
    it('returns undefined si no hay headers', () => {
      expect(getSingleIdempotencyKey([])).toBeUndefined()
    })

    it('returns key válida con un solo header', () => {
      expect(getSingleIdempotencyKey(['Idempotency-Key', 'abcd'])).toBe('abcd')
    })

    it('lanza 400 con duplicados misma capitalización', () => {
      expect(() => getSingleIdempotencyKey(['Idempotency-Key', 'a', 'Idempotency-Key', 'b'])).toThrowError(/Múltiples headers/)
    })

    it('lanza 400 con duplicados diferente capitalización', () => {
      expect(() => getSingleIdempotencyKey(['idempotency-key', 'a', 'IDEMPOTENCY-KEY', 'b'])).toThrowError(/Múltiples headers/)
    })

    it('lanza 400 si header está vacío', () => {
      expect(() => getSingleIdempotencyKey(['Idempotency-Key', '   '])).toThrowError(/Idempotency-Key no puede estar vacío/)
    })

    it('acepta 255 caracteres', () => {
      const key = 'a'.repeat(255)
      expect(getSingleIdempotencyKey(['Idempotency-Key', key])).toBe(key)
    })

    it('lanza 400 si 256 caracteres', () => {
      const key = 'a'.repeat(256)
      expect(() => getSingleIdempotencyKey(['Idempotency-Key', key])).toThrowError(/superar los 255 caracteres/)
    })
  })

  describe('canonicalizeJson & calculateFingerprint', () => {
    it('Mismo hash para obj{a:1,b:2} vs {b:2,a:1}', () => {
      const h1 = calculateFingerprint('POST', 'test', '1', { a: 1, b: 2 })
      const h2 = calculateFingerprint('POST', 'test', '1', { b: 2, a: 1 })
      expect(h1).toEqual(h2)
    })

    it('Falla si el método del fingerprint no es POST', () => {
      // Se exige explícitamente usar POST para la idempotencia de ordenes
      const h1 = calculateFingerprint('POST', 'deposito.orden.ejecutar', '1', {})
      const h2 = calculateFingerprint('PUT', 'deposito.orden.ejecutar', '1', {})
      expect(h1).not.toEqual(h2)
    })

    it('Hash diferente para Pedido A vs pedido B', () => {
      const h1 = calculateFingerprint('POST', 'test', 'A', { a: 1 })
      const h2 = calculateFingerprint('POST', 'test', 'B', { a: 1 })
      expect(h1).not.toEqual(h2)
    })

    it('Hash diferente para Body diferente', () => {
      const h1 = calculateFingerprint('POST', 'test', '1', { a: 1 })
      const h2 = calculateFingerprint('POST', 'test', '1', { a: 2 })
      expect(h1).not.toEqual(h2)
    })

    it('Hash diferente para Arrays invertidos', () => {
      const h1 = calculateFingerprint('POST', 'test', '1', [1, 2])
      const h2 = calculateFingerprint('POST', 'test', '1', [2, 1])
      expect(h1).not.toEqual(h2)
    })

    it('Valor no serializable Rechazado', () => {
      expect(() => canonicalizeJson(undefined)).toThrowError(/Valor no serializable/)
      expect(() => canonicalizeJson({ a: undefined })).toThrowError(/Valor no serializable/)
      expect(() => canonicalizeJson([undefined])).toThrowError(/Valor no serializable/)
      expect(() => canonicalizeJson({ a: { b: undefined } })).toThrowError(/Valor no serializable/)
      expect(() => canonicalizeJson(() => {})).toThrowError(/Valor no serializable/)
      expect(() => canonicalizeJson(Symbol('x'))).toThrowError(/Valor no serializable/)
      expect(() => canonicalizeJson(NaN)).toThrowError(/numérico no serializable/)
      class NotPlain {}
      expect(() => canonicalizeJson(new NotPlain())).toThrowError(/objetos planos/)
    })

    it('Ciclos rechazados explícitamente', () => {
      const obj: Record<string, unknown> = {}
      obj.self = obj
      expect(() => canonicalizeJson(obj)).toThrowError(/JSON_CYCLIC_REFERENCE/)

      const arr: unknown[] = []
      arr.push(arr)
      expect(() => canonicalizeJson(arr)).toThrowError(/JSON_CYCLIC_REFERENCE/)
    })

    it('Normalización de ausente y null', () => {
      // Handler is expected to pass {} if req.body is undefined.
      // But if it passes undefined, our calculateFingerprint will throw via canonicalizeJson.
      expect(() => calculateFingerprint('POST', 'test', '1', undefined)).toThrowError(/Valor no serializable/)

      const hEmpty = calculateFingerprint('POST', 'test', '1', {})
      const hNull = calculateFingerprint('POST', 'test', '1', null)
      const hString = calculateFingerprint('POST', 'test', '1', "")
      const hArray = calculateFingerprint('POST', 'test', '1', [])

      expect(hEmpty).not.toEqual(hNull)
      expect(hEmpty).not.toEqual(hString)
      expect(hEmpty).not.toEqual(hArray)
    })
  })

  describe('toPersistableResponseBody', () => {
    it('Retorna objeto intacto si es válido y no tiene secretos', () => {
      const dto = { success: true, mysecretdata: 'ok', legitimate_token_field: 'yes' }
      const res = toPersistableResponseBody(dto)
      expect(res).toEqual(dto)
    })

    it('Falla en caso de clave prohibida ignorando mayúsculas/minúsculas', () => {
      const variants = [
        'passwordHash',
        'passwordhash',
        'PASSWORDHASH',
        'refreshToken',
        'RefreshToken',
        'TOKEN',
        'secret'
      ]

      for (const variant of variants) {
        const dto = { success: true, [variant]: 'abc' }
        expect(() => toPersistableResponseBody(dto)).toThrowError(/clave prohibida/)
      }
    })
  })
})
