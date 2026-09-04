import { describe, expect, it } from 'vitest'
import { getStockStatus } from '../lib/stock-status'

describe('stock status policy', () => {
  it('returns critical at or below the configured minimum', () => {
    expect(getStockStatus(80, 100)).toBe('bajo')
    expect(getStockStatus(100, 100)).toBe('bajo')
  })

  it('returns normal only above the configured minimum', () => {
    expect(getStockStatus(101, 100)).toBe('normal')
  })

  it('returns unconfigured for a null minimum', () => {
    expect(getStockStatus(0, null)).toBe('sin_configurar')
  })
})
