import { describe, expect, it } from 'vitest'
import {
  compareProductsByNaturalPresentation,
  parseProductPresentation,
  sortProductsByNaturalPresentation,
} from './natural-product-order'

describe('natural product presentation order', () => {
  it('orders the required ENERGIZANTE presentations and keeps variants together', () => {
    const products = [
      'ENERGIZANTE 500 ML',
      'ENERGIZANTE 100 ML',
      'ENERGIZANTE 250 ML VACAS',
      'ENERGIZANTE 25 ML',
      'ENERGIZANTE 250 ML',
    ]

    expect(sortProductsByNaturalPresentation(products, (product) => product)).toEqual([
      'ENERGIZANTE 25 ML',
      'ENERGIZANTE 100 ML',
      'ENERGIZANTE 250 ML',
      'ENERGIZANTE 250 ML VACAS',
      'ENERGIZANTE 500 ML',
    ])
  })

  it('normalizes compatible volume units', () => {
    expect(compareProductsByNaturalPresentation('PRODUCTO 500 ML', 'PRODUCTO 1 L')).toBeLessThan(0)
    expect(parseProductPresentation('PRODUCTO 1 L')).toMatchObject({ value: 1000, unit: 'ML', dimension: 'volume' })
  })

  it('normalizes compatible weight units without comparing weight to volume', () => {
    const products = ['PRODUCTO 1 KG', 'PRODUCTO 500 GR', 'PRODUCTO 250 GR']
    expect(sortProductsByNaturalPresentation(products, (product) => product)).toEqual([
      'PRODUCTO 250 GR',
      'PRODUCTO 500 GR',
      'PRODUCTO 1 KG',
    ])
    expect(compareProductsByNaturalPresentation('PRODUCTO 1 KG', 'PRODUCTO 1 L')).not.toBe(0)
  })

  it('falls back to stable alphabetical order for names without a presentation', () => {
    const products = [
      { id: 'z', name: 'ZETA' },
      { id: 'a-1', name: 'ALFA' },
      { id: 'a-2', name: 'ALFA' },
    ]

    expect(sortProductsByNaturalPresentation(products, (product) => product.name).map((product) => product.id)).toEqual([
      'a-1',
      'a-2',
      'z',
    ])
  })
})
