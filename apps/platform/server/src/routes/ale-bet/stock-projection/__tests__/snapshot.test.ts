import { describe, expect, it } from 'vitest'
import {
  buildStockProjectionSnapshot,
  type StockProjectionSource,
} from '../snapshot'

const DEPOSITO = { id: 'location-deposito', codigo: 'DEPOSITO', activo: true }
const ACONDICIONADO = { id: 'location-acondicionado', codigo: 'ACONDICIONADO', activo: true }

function source(
  products: StockProjectionSource['productos'],
  ubicaciones: StockProjectionSource['ubicaciones'] = [DEPOSITO, ACONDICIONADO],
): StockProjectionSource {
  return { ubicaciones, productos: products }
}

function product(
  id: string,
  nombre: string,
  lotes: StockProjectionSource['productos'][number]['lotes'],
  activo = true,
): StockProjectionSource['productos'][number] {
  return { id, nombre, activo, lotes }
}

function lot(
  id: string,
  numero: string,
  createdAt: string,
  saldos: Array<{ ubicacionId: string; cantidad: number }> = [],
  options: { activo?: boolean; fechaVencimiento?: string | null } = {},
): StockProjectionSource['productos'][number]['lotes'][number] {
  return {
    id,
    numero,
    activo: options.activo ?? true,
    createdAt: new Date(createdAt),
    fechaVencimiento: options.fechaVencimiento ? new Date(options.fechaVencimiento) : null,
    saldos,
  }
}

describe('buildStockProjectionSnapshot', () => {
  it('adds the lot expiration and synchronization timestamp when building the live Sheet projection', () => {
    const at = new Date('2026-10-05T15:00:00Z')
    const input = source([
      product('p1', 'PRODUCTO 100 ML', [
        lot('l1', 'L1', '2026-01-01', [{ ubicacionId: DEPOSITO.id, cantidad: 3 }], { fechaVencimiento: '2027-04-17' }),
      ]),
    ])

    expect(buildStockProjectionSnapshot(input, at).productoTerminado).toEqual([
      expect.objectContaining({ producto: 'PRODUCTO 100 ML', lote: 'L1', vencimiento: '17/4/2027', total: 3 }),
    ])
    expect(buildStockProjectionSnapshot(input, at).productoTerminado[0]?.actualizadoEn).toContain('5/10/26')
  })

  it('maps DEPOSITO to productoTerminado and ACONDICIONADO to sinAcondicionar without adding locations', () => {
    const input = source([
      product('p1', 'CETRI 500 ML', [
        lot('l1', 'X', '2026-01-01', [
          { ubicacionId: DEPOSITO.id, cantidad: 198 },
          { ubicacionId: ACONDICIONADO.id, cantidad: 40 },
        ]),
      ]),
    ])

    expect(buildStockProjectionSnapshot(input)).toEqual({
      productoTerminado: [{ producto: 'CETRI 500 ML', lote: 'X', total: 198 }],
      sinAcondicionar: [{ producto: 'CETRI 500 ML', lote: 'X', total: 40 }],
    })
  })

  it.each([
    ['missing', [DEPOSITO]],
    ['duplicate', [DEPOSITO, ACONDICIONADO, { ...ACONDICIONADO, id: 'duplicate' }]],
    ['inactive', [DEPOSITO, { ...ACONDICIONADO, activo: false }]],
  ])('fails closed for %s required location data', (_case, ubicaciones) => {
    expect(() => buildStockProjectionSnapshot(source([], ubicaciones))).toThrow(/ACONDICIONADO/)
  })

  it('orders real catalog presentation sizes numerically, including milliliters, liters, and grams', () => {
    const input = source([
      product('p-5l', 'FAMILIA 5 L', [lot('l-5l', 'L', '2026-01-01')]),
      product('p-500', 'FAMILIA 500 ML', [lot('l-500', 'L', '2026-01-01')]),
      product('p-100', 'FAMILIA 100 ML', [lot('l-100', 'L', '2026-01-01')]),
      product('p-1l', 'FAMILIA 1 L', [lot('l-1l', 'L', '2026-01-01')]),
      product('p-300', 'FAMILIA 300 ML', [lot('l-300', 'L', '2026-01-01')]),
      product('p-250', 'FAMILIA 250 ML', [lot('l-250', 'L', '2026-01-01')]),
      product('p-50', 'FAMILIA 50 ML', [lot('l-50', 'L', '2026-01-01')]),
      product('p-25', 'FAMILIA 25 ML', [lot('l-25', 'L', '2026-01-01')]),
      product('p-20', 'FAMILIA 20 ML', [lot('l-20', 'L', '2026-01-01')]),
      product('g-100', 'PESO 100 GR', [lot('lg-100', 'L', '2026-01-01')]),
      product('g-35', 'PESO 35 GR', [lot('lg-35', 'L', '2026-01-01')]),
    ])

    expect(buildStockProjectionSnapshot(input).productoTerminado.map((row) => row.producto)).toEqual([
      'FAMILIA 20 ML',
      'FAMILIA 25 ML',
      'FAMILIA 50 ML',
      'FAMILIA 100 ML',
      'FAMILIA 250 ML',
      'FAMILIA 300 ML',
      'FAMILIA 500 ML',
      'FAMILIA 1 L',
      'FAMILIA 5 L',
      'PESO 35 GR',
      'PESO 100 GR',
    ])
  })

  it('groups products by parsed base, then presentation, variant, and canonical name', () => {
    const input = source([
      product('premium-500', 'AMANTINA PREMIUM 500 ML', [lot('1', 'L', '2026-01-01')]),
      product('regular-500', 'AMANTINA 500 ML', [lot('2', 'L', '2026-01-01')]),
      product('premium-100', 'AMANTINA PREMIUM 100 ML', [lot('3', 'L', '2026-01-01')]),
      product('regular-250', 'AMANTINA 250 ML', [lot('4', 'L', '2026-01-01')]),
      product('premium-250', 'AMANTINA PREMIUM 250 ML', [lot('5', 'L', '2026-01-01')]),
      product('aves', 'AMINOACIDOS 50 ML AVES', [lot('6', 'L', '2026-01-01')]),
      product('mascota', 'AMINOACIDOS 50 ML MASCOTA', [lot('7', 'L', '2026-01-01')]),
    ])

    expect(buildStockProjectionSnapshot(input).productoTerminado.map((row) => row.producto)).toEqual([
      'AMANTINA 250 ML',
      'AMANTINA 500 ML',
      'AMANTINA PREMIUM 100 ML',
      'AMANTINA PREMIUM 250 ML',
      'AMANTINA PREMIUM 500 ML',
      'AMINOACIDOS 50 ML AVES',
      'AMINOACIDOS 50 ML MASCOTA',
    ])
  })

  it('keeps lots of one product consecutive and orders them by createdAt ASC then id ASC', () => {
    const input = source([
      product('olivita', 'OLIVITASAN PLUS 500 ML', [
        lot('lot-c', 'PL0615', '2026-03-01', [{ ubicacionId: DEPOSITO.id, cantidad: 3 }]),
        lot('lot-b', 'PL0614-B', '2026-02-01', [{ ubicacionId: DEPOSITO.id, cantidad: 2 }]),
        lot('lot-a', 'PL0614-A', '2026-02-01', [{ ubicacionId: DEPOSITO.id, cantidad: 1 }]),
        lot('lot-old', 'PL0608', '2026-01-01', [{ ubicacionId: DEPOSITO.id, cantidad: 4 }]),
      ]),
      product('other', 'TILCOSAN 100 ML', [
        lot('other-lot', 'T1', '2025-01-01', [{ ubicacionId: DEPOSITO.id, cantidad: 1 }]),
      ]),
    ])

    expect(buildStockProjectionSnapshot(input).productoTerminado).toEqual([
      { producto: 'OLIVITASAN PLUS 500 ML', lote: 'PL0608', total: 4 },
      { producto: 'OLIVITASAN PLUS 500 ML', lote: 'PL0614-A', total: 1 },
      { producto: 'OLIVITASAN PLUS 500 ML', lote: 'PL0614-B', total: 2 },
      { producto: 'OLIVITASAN PLUS 500 ML', lote: 'PL0615', total: 3 },
      { producto: 'TILCOSAN 100 ML', lote: 'T1', total: 1 },
    ])
  })

  it('publishes only positive lots when any exist and does not mutate its input', () => {
    const input = source([
      product('p1', 'OLIVITASAN PLUS 500 ML', [
        lot('zero', 'PL0614', '2026-01-01', [{ ubicacionId: DEPOSITO.id, cantidad: 0 }]),
        lot('positive-a', 'PL0615', '2026-02-01', [{ ubicacionId: DEPOSITO.id, cantidad: 2400 }]),
        lot('positive-b', 'PL0616', '2026-03-01', [{ ubicacionId: DEPOSITO.id, cantidad: 2400 }]),
      ]),
    ])
    const originalLots = [...input.productos[0]!.lotes]

    expect(buildStockProjectionSnapshot(input).productoTerminado).toEqual([
      { producto: 'OLIVITASAN PLUS 500 ML', lote: 'PL0615', total: 2400 },
      { producto: 'OLIVITASAN PLUS 500 ML', lote: 'PL0616', total: 2400 },
    ])
    expect(input.productos[0]!.lotes).toEqual(originalLots)
  })

  it('publishes one deterministic zero: newest active lot, or newest lot overall when all are inactive', () => {
    const withActive = source([
      product('p1', 'PRODUCTO 100 ML', [
        lot('inactive-newer', 'INACTIVO', '2026-03-01', [], { activo: false }),
        lot('active-a', 'ACTIVO-A', '2026-02-01'),
        lot('active-b', 'ACTIVO-B', '2026-02-01'),
      ]),
    ])
    const allInactive = source([
      product('p2', 'OTRO 100 ML', [
        lot('inactive-a', 'INACTIVO-A', '2026-02-01', [], { activo: false }),
        lot('inactive-b', 'INACTIVO-B', '2026-02-01', [], { activo: false }),
      ]),
    ])

    expect(buildStockProjectionSnapshot(withActive).productoTerminado).toEqual([
      { producto: 'PRODUCTO 100 ML', lote: 'ACTIVO-B', total: 0 },
    ])
    expect(buildStockProjectionSnapshot(allInactive).productoTerminado).toEqual([
      { producto: 'OTRO 100 ML', lote: 'INACTIVO-B', total: 0 },
    ])
  })

  it('replaces a previous zero representative naturally when a positive balance appears', () => {
    const zeroInput = source([
      product('p1', 'PRODUCTO 100 ML', [
        lot('old', 'OLD', '2026-01-01'),
        lot('new', 'NEW', '2026-02-01'),
      ]),
    ])
    const positiveInput = source([
      product('p1', 'PRODUCTO 100 ML', [
        lot('old', 'OLD', '2026-01-01'),
        lot('new', 'NEW', '2026-02-01', [{ ubicacionId: DEPOSITO.id, cantidad: 5 }]),
      ]),
    ])

    expect(buildStockProjectionSnapshot(zeroInput).productoTerminado).toEqual([
      { producto: 'PRODUCTO 100 ML', lote: 'NEW', total: 0 },
    ])
    expect(buildStockProjectionSnapshot(positiveInput).productoTerminado).toEqual([
      { producto: 'PRODUCTO 100 ML', lote: 'NEW', total: 5 },
    ])
  })

  it('treats absent balances as zero independently for each required location', () => {
    const input = source([
      product('p1', 'PRODUCTO 100 ML', [
        lot('a', 'A', '2026-01-01', [{ ubicacionId: ACONDICIONADO.id, cantidad: 100 }]),
        lot('b', 'B', '2026-02-01', [{ ubicacionId: DEPOSITO.id, cantidad: 200 }]),
      ]),
    ])

    expect(buildStockProjectionSnapshot(input)).toEqual({
      productoTerminado: [{ producto: 'PRODUCTO 100 ML', lote: 'B', total: 200 }],
      sinAcondicionar: [{ producto: 'PRODUCTO 100 ML', lote: 'A', total: 100 }],
    })
  })

  it('includes positive physical stock from inactive or expired lots, but excludes inactive products and products without lots', () => {
    const input = source([
      product('active', 'VISIBLE 100 ML', [
        lot('inactive-expired', 'FISICO', '2025-01-01', [{ ubicacionId: DEPOSITO.id, cantidad: 9 }], {
          activo: false,
          fechaVencimiento: '2025-02-01',
        }),
      ]),
      product('inactive-product', 'NO VISIBLE 100 ML', [
        lot('positive', 'OCULTO', '2026-01-01', [{ ubicacionId: DEPOSITO.id, cantidad: 10 }]),
      ], false),
      product('without-lots', 'SIN LOTES 100 ML', []),
    ])

    expect(buildStockProjectionSnapshot(input).productoTerminado).toEqual([
      { producto: 'VISIBLE 100 ML', lote: 'FISICO', total: 9 },
    ])
  })

  it('is idempotent and rejects duplicate balances instead of summing them', () => {
    const input = source([
      product('p1', 'PRODUCTO 100 ML', [
        lot('l1', 'L1', '2026-01-01', [{ ubicacionId: DEPOSITO.id, cantidad: 3 }]),
      ]),
    ])
    expect(buildStockProjectionSnapshot(input)).toEqual(buildStockProjectionSnapshot(input))

    const duplicate = source([
      product('p1', 'PRODUCTO 100 ML', [
        lot('l1', 'L1', '2026-01-01', [
          { ubicacionId: DEPOSITO.id, cantidad: 2 },
          { ubicacionId: DEPOSITO.id, cantidad: 3 },
        ]),
      ]),
    ])
    expect(() => buildStockProjectionSnapshot(duplicate)).toThrow(/duplicado/i)
  })
})
