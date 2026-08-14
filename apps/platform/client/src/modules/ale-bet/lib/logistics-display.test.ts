import { describe, expect, it } from 'vitest'
import { displayBusinessSku, formatOptionalDate, matchesFunctionalProductSearch } from './logistics-display'

describe('logistics technical metadata presentation', () => {
  it('hides only technical logistics SKUs', () => {
    expect(displayBusinessSku('LOG-0123456789ABCDEF')).toBe('—')
    expect(displayBusinessSku('SKU-001')).toBe('SKU-001')
  })

  it('does not use a technical SKU for functional filtering', () => {
    const product = { nombre: 'AMANTINA 500 ML', sku: 'LOG-0123456789ABCDEF' }
    expect(matchesFunctionalProductSearch(product, 'amantina')).toBe(true)
    expect(matchesFunctionalProductSearch(product, '012345')).toBe(false)
    expect(matchesFunctionalProductSearch({ nombre: 'Normal', sku: 'SKU-001' }, 'sku-001')).toBe(true)
  })

  it('renders unknown dates without constructing the Unix epoch', () => {
    expect(formatOptionalDate(null)).toBe('—')
    expect(formatOptionalDate('2028-01-15T00:00:00.000Z')).toMatch(/15\/1\/2028|15\/01\/2028/)
  })
})
