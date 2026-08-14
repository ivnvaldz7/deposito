import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'

vi.mock('@platform/db', () => ({
  Prisma: { sql: () => undefined },
  TipoMovimiento: { TRANSFERENCIA_INTERNA: 'TRANSFERENCIA_INTERNA' },
}))
import {
  allocateAvailability,
  assertTransferQuantity,
  fingerprintAvailability,
  orderEligibleLots,
} from '../inventory-service'

describe('inventory location service', () => {
  it('orders valid expirations by FEFO before lots without expiration', () => {
    const ordered = orderEligibleLots([
      { id: 'no-expiry', activo: true, fechaVencimiento: null, fechaProduccion: new Date('2025-01-02'), createdAt: new Date('2025-01-02'), cantidad: 2 },
      { id: 'later', activo: true, fechaVencimiento: new Date('2027-05-01'), fechaProduccion: null, createdAt: new Date('2025-01-03'), cantidad: 2 },
      { id: 'first', activo: true, fechaVencimiento: new Date('2027-01-01'), fechaProduccion: null, createdAt: new Date('2025-01-01'), cantidad: 2 },
    ], new Date('2026-01-01'))

    expect(ordered.map((lot) => lot.id)).toEqual(['first', 'later', 'no-expiry'])
  })

  it('excludes inactive and expired lots and allocates a deterministic transfer shortfall', () => {
    const availability = allocateAvailability({
      requested: 7,
      now: new Date('2026-01-01'),
      deposito: [
        { id: 'expired', activo: true, fechaVencimiento: new Date('2025-12-31'), fechaProduccion: null, createdAt: new Date('2025-01-01'), cantidad: 10 },
        { id: 'deposito', activo: true, fechaVencimiento: null, fechaProduccion: new Date('2025-01-01'), createdAt: new Date('2025-01-01'), cantidad: 3 },
      ],
      acondicionado: [
        { id: 'inactive', activo: false, fechaVencimiento: null, fechaProduccion: null, createdAt: new Date('2025-01-01'), cantidad: 10 },
        { id: 'acondicionado', activo: true, fechaVencimiento: null, fechaProduccion: new Date('2025-02-01'), createdAt: new Date('2025-02-01'), cantidad: 4 },
      ],
    })

    expect(availability.status).toBe('DISPONIBLE_CON_TRANSFERENCIA')
    expect(availability.stockDeposito).toBe(3)
    expect(availability.transferencias).toEqual([{ loteId: 'acondicionado', cantidad: 4 }])
    expect(availability.shortfall).toBe(0)
  })

  it('rejects zero and negative transfer quantities and fingerprints equivalent previews identically', () => {
    expect(() => assertTransferQuantity(0)).toThrow('positive')
    expect(() => assertTransferQuantity(-1)).toThrow('positive')
    expect(fingerprintAvailability({ pedidoId: 'p1', allocations: [{ loteId: 'l1', cantidad: 2 }], transferencias: [] }))
      .toBe(fingerprintAvailability({ pedidoId: 'p1', allocations: [{ loteId: 'l1', cantidad: 2 }], transferencias: [] }))
  })
})
