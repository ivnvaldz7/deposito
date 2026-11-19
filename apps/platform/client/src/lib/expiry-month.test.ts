import { describe, expect, it } from 'vitest'
import { expiryMonthInputValue, expiryMonthToIso, maskExpiryMonth, parseExpiryMonth } from './expiry-month'

describe('lot expiry input MM/AA', () => {
  it.each([
    ['02/28', '2028-02-29T23:59:59.000Z'],
    ['02/27', '2027-02-28T23:59:59.000Z'],
    ['04/28', '2028-04-30T23:59:59.000Z'],
    ['12/29', '2029-12-31T23:59:59.000Z'],
  ])('stores %s at the UTC end of that month', (input, expected) => {
    expect(expiryMonthToIso(input)).toBe(expected)
    expect(expiryMonthInputValue(expected)).toBe(input)
  })
  it.each(['', '1/28', '00/28', '13/28', '12/2', '12/2028', '12/abc', '12/280'])('rejects malformed input %s', (value) => {
    expect(parseExpiryMonth(value)).toBeNull()
    expect(expiryMonthToIso(value)).toBeNull()
  })
  it('keeps each API contract explicit and handles pasted four-digit years without truncating them', () => {
    expect(parseExpiryMonth('10/28')?.monthValue).toBe('2028-10')
    expect(maskExpiryMonth('1028')).toBe('10/28')
    expect(maskExpiryMonth('10/2028')).toBe('10/28')
    expect(maskExpiryMonth('102028')).toBe('10/28')
    expect(parseExpiryMonth(maskExpiryMonth('10/1928'))).toBeNull()
    expect(parseExpiryMonth(maskExpiryMonth('10/280'))).toBeNull()
    expect(expiryMonthInputValue('2100-10-31')).toBe('2100-10-31')
    expect(expiryMonthToIso(expiryMonthInputValue('2100-10-31'))).toBeNull()
  })
})
