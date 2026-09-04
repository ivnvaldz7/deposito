import { describe, it, expect } from 'vitest'
import { getDrugLotStatus, getDrugStatusDescription } from '../drug-status'

describe('getDrugLotStatus', () => {
  const today = new Date('2026-08-18T12:00:00Z')

  it('returns "sin_informacion" if no lote', () => {
    expect(getDrugLotStatus({ lote: null, vencimiento: '2028-01-01' }, today)).toBe('sin_informacion')
  })

  it('returns "vencido" if vencimiento is past, ignoring reanalisis', () => {
    expect(getDrugLotStatus({
      lote: 'L1',
      vencimiento: '2026-08-17',
      reanalisis: '2027-01-01',
    }, today)).toBe('vencido')
  })

  it('returns "sin_informacion" if no reanalisis and not vencido', () => {
    expect(getDrugLotStatus({
      lote: 'L1',
      vencimiento: '2028-08-17',
    }, today)).toBe('sin_informacion')
  })

  it('returns "reanalisis_requerido" if reanalisis is past and not vencido', () => {
    expect(getDrugLotStatus({
      lote: 'L1',
      vencimiento: '2028-08-17',
      reanalisis: '2026-08-17',
    }, today)).toBe('reanalisis_requerido')
  })

  it('returns "reanalisis_proximo" if reanalisis is within 30 days', () => {
    expect(getDrugLotStatus({
      lote: 'L1',
      vencimiento: '2028-08-17',
      reanalisis: '2026-09-17', // exactly 30 days
    }, today)).toBe('reanalisis_proximo')
  })

  it('returns "reanalizar_pronto" if reanalisis is between 31 and 90 days', () => {
    expect(getDrugLotStatus({
      lote: 'L1',
      vencimiento: '2028-08-17',
      reanalisis: '2026-10-18', // ~60 days
    }, today)).toBe('reanalizar_pronto')
  })

  it('returns "en_seguimiento" if reanalisis is between 91 and 180 days', () => {
    expect(getDrugLotStatus({
      lote: 'L1',
      vencimiento: '2028-08-17',
      reanalisis: '2027-02-14', // ~180 days
    }, today)).toBe('en_seguimiento')
  })

  it('returns "optimo" if reanalisis is more than 180 days', () => {
    expect(getDrugLotStatus({
      lote: 'L1',
      vencimiento: '2028-08-17',
      reanalisis: '2027-02-15', // > 180 days
    }, today)).toBe('optimo')
  })
})
