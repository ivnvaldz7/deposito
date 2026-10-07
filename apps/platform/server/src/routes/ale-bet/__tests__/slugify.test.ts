import { describe, expect, it } from 'vitest'
import { slugify } from '../slugify'

describe('slugify (ALEBET-FACT-02 R5 filename sanitizer)', () => {
  it('normalizes accents and ñ to ASCII base characters', () => {
    expect(slugify('Ñandú')).toBe('nandu')
    expect(slugify('ÁÉÍÓÚ')).toBe('aeiou')
  })

  it('slugifies a full company name with spaces, dots and symbols', () => {
    expect(slugify('Veterinaria Oeste S.A.')).toBe('veterinaria-oeste-s-a')
  })

  it('collapses runs of invalid characters into a single dash', () => {
    expect(slugify('Cliente  &  Hijos')).toBe('cliente-hijos')
  })

  it('trims leading and trailing dashes', () => {
    expect(slugify(' -Cliente- ')).toBe('cliente')
    expect(slugify('...Vet...')).toBe('vet')
  })

  it('is empty-safe', () => {
    expect(slugify('')).toBe('')
    expect(slugify('   ')).toBe('')
    expect(slugify('!!!')).toBe('')
  })
})
