import { describe, expect, it } from 'vitest'
import { findClosestMatches } from '../fuzzy-search'

describe('findClosestMatches', () => {
  it('returns the closest match when a product name contains a small typo', () => {
    const result = findClosestMatches(['COMPLEJO 500 ML', 'AMANTINA 100 ML'], 'compbejo', (name) => name)

    expect(result).toEqual({ matches: ['COMPLEJO 500 ML'], isApproximate: true })
  })

  it('keeps direct matches ahead of approximate ones', () => {
    const result = findClosestMatches(['COMPLEJO 500 ML', 'COMPLEJO PREMIUM'], 'complejo', (name) => name)

    expect(result).toEqual({ matches: ['COMPLEJO 500 ML', 'COMPLEJO PREMIUM'], isApproximate: false })
  })

  it('ignores accents, punctuation and word separators', () => {
    const result = findClosestMatches(['CÓNICO-CRISTAL / 300 ML'], 'conico cristal 300', (name) => name)

    expect(result).toEqual({ matches: ['CÓNICO-CRISTAL / 300 ML'], isApproximate: false })
  })
  it('matches reordered terms with a typo and a partially typed word', () => {
    const result = findClosestMatches(['COMPLEJO PREMIUM 500 ML', 'AMANTINA 100 ML'], 'prem compljo 500', (name) => name)
    expect(result.matches).toEqual(['COMPLEJO PREMIUM 500 ML'])
  })

  it('does not match a long typed term to an unrelated short word', () => {
    expect(findClosestMatches(['FRASCO 1 L'], 'litros', (name) => name).matches).toEqual([])
  })
})
