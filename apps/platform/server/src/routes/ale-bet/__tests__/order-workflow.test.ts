import { describe, expect, it } from 'vitest'
import {
  canCancelOrder,
  canConfirmDispatch,
  canEditOrder,
  canEmitRemito,
  canReadRemitoPdf,
  canTransitionOrder,
  canVendorCancelDirectly,
} from '../order-workflow'

describe('ALEBET-01 order workflow', () => {
  it('allows only the approved operational transitions', () => {
    expect(canTransitionOrder('BORRADOR', 'APROBADO')).toBe(true)
    expect(canTransitionOrder('APROBADO', 'EN_ARMADO')).toBe(true)
    expect(canTransitionOrder('EN_ARMADO', 'PREPARADO')).toBe(true)
    expect(canTransitionOrder('PREPARADO', 'DESPACHADO')).toBe(true)
    expect(canTransitionOrder('EN_ARMADO', 'DESPACHADO')).toBe(false)
  })

  it('keeps approved edits and cancellation rules explicit', () => {
    expect(canEditOrder('BORRADOR')).toBe(true)
    expect(canEditOrder('APROBADO')).toBe(true)
    expect(canEditOrder('EN_ARMADO')).toBe(false)
    expect(canCancelOrder('APROBADO')).toBe(true)
    expect(canCancelOrder('DESPACHADO')).toBe(false)
  })

  it('requires prepared status and a valid remito for dispatch', () => {
    expect(canConfirmDispatch('PREPARADO', true)).toBe(true)
    expect(canConfirmDispatch('PREPARADO', false)).toBe(false)
    expect(canConfirmDispatch('EN_ARMADO', true)).toBe(false)
  })

  it('keeps remito issuance and direct vendor cancellation within their operational states', () => {
    expect(canEmitRemito('BORRADOR')).toBe(false)
    expect(canEmitRemito('APROBADO')).toBe(true)
    expect(canVendorCancelDirectly('APROBADO')).toBe(true)
    expect(canVendorCancelDirectly('EN_ARMADO')).toBe(false)
    expect(canVendorCancelDirectly('PREPARADO')).toBe(false)
  })

  it('limits vendor remito PDFs to their own orders', () => {
    expect(canReadRemitoPdf('vendedor', 'seller-a', 'seller-a')).toBe(true)
    expect(canReadRemitoPdf('vendedor', 'seller-a', 'seller-b')).toBe(false)
    expect(canReadRemitoPdf('facturacion', 'seller-a', 'billing-a')).toBe(true)
  })
})
