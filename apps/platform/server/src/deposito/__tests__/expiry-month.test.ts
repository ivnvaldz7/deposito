import { describe, expect, it } from 'vitest'
import { parseExpiryMonth } from '../services/expiry-month'

describe('parseExpiryMonth', () => {
  it('normalizes a valid month to its UTC month end', () => {
    expect(parseExpiryMonth('2027-08', new Date('2026-08-13T00:00:00Z'))).toEqual(new Date('2027-08-31T00:00:00.000Z'))
    expect(parseExpiryMonth('2027-12', new Date('2026-08-13T00:00:00Z'))).toEqual(new Date('2027-12-31T00:00:00.000Z'))
  })

  it('handles leap and non-leap February', () => {
    expect(parseExpiryMonth('2028-02', new Date('2026-08-13T00:00:00Z'))).toEqual(new Date('2028-02-29T00:00:00.000Z'))
    expect(parseExpiryMonth('2027-02', new Date('2026-08-13T00:00:00Z'))).toEqual(new Date('2027-02-28T00:00:00.000Z'))
  })

  it.each(['2027-00', '2027-13', '027-08', 'abcd-08', '2027-aa', ''])('rejects invalid month value %j', (value) => {
    expect(() => parseExpiryMonth(value, new Date('2026-08-13T00:00:00Z'))).toThrow('Vencimiento inválido')
  })

  it('rejects a prior month and accepts the current month', () => {
    expect(() => parseExpiryMonth('2026-07', new Date('2026-08-13T00:00:00Z'))).toThrow('no puede ser anterior')
    expect(parseExpiryMonth('2026-08', new Date('2026-08-13T00:00:00Z'))).toEqual(new Date('2026-08-31T00:00:00.000Z'))
  })

  it('uses the Buenos Aires month at a UTC month boundary', () => {
    const instant = new Date('2026-09-01T01:30:00.000Z')
    expect(parseExpiryMonth('2026-08', instant)).toEqual(new Date('2026-08-31T00:00:00.000Z'))
    expect(() => parseExpiryMonth('2026-07', instant)).toThrow('no puede ser anterior')
  })
})
