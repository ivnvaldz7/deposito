import { describe, expect, it } from 'vitest'
import { suggestedLotPrefix } from '../lot-prefix'

describe('suggestedLotPrefix', () => {
  it('uses the agreed prefixes for Olivitasan products', () => {
    expect(suggestedLotPrefix('OLIVITASAN')).toBe('OL')
    expect(suggestedLotPrefix('OLIVITASAN PLUS 500 ML')).toBe('PL')
  })

  it('falls back to the first two letters for other products', () => {
    expect(suggestedLotPrefix('Aminoácidos 1 L')).toBe('AM')
  })
})
