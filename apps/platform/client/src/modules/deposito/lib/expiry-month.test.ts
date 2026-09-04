import { describe, expect, it } from 'vitest'
import { formatExpiryMonth, validateExpirySelection } from './expiry-month'

describe('expiry month UI contract', () => {
  it('formats stored UTC dates without exposing the technical day', () => {
    expect(formatExpiryMonth('2027-10-31T00:00:00.000Z')).toBe('10/2027')
    expect(formatExpiryMonth(null)).toBe('—')
  })

  it('uses Buenos Aires calendar month at UTC boundary', () => {
    const instant = new Date('2026-09-01T01:30:00.000Z')
    expect(validateExpirySelection('08', '2026', instant)).toBeNull()
    expect(validateExpirySelection('07', '2026', instant)).toContain('anterior')
  })

  it('rejects incomplete values and accepts the current month', () => {
    expect(validateExpirySelection('08', '202', new Date('2026-08-13T12:00:00Z'))).toContain('válidos')
    expect(validateExpirySelection('13', '2027', new Date('2026-08-13T12:00:00Z'))).toContain('válidos')
    expect(validateExpirySelection('08', '2026', new Date('2026-08-13T12:00:00Z'))).toBeNull()
  })
})
