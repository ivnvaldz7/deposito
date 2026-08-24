import { describe, expect, it } from 'vitest'
import { getStockStatus } from './stock-status'

describe('getStockStatus', () => {
  it('does not classify zero as low when minimum is not configured', () => expect(getStockStatus(0, null)).toBe('sin_configurar'))
  it('classifies equal and lower quantities as low', () => { expect(getStockStatus(5, 5)).toBe('bajo'); expect(getStockStatus(4, 5)).toBe('bajo') })
  it('classifies quantities above minimum as normal', () => expect(getStockStatus(6, 5)).toBe('normal'))
})
