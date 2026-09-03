import { describe, expect, it } from 'vitest'
import { interpretOrder } from '../interpreter'

const customer = [{ id: 'c1', nombre: 'Veterinaria Norte' }]
function product(unidadesPorCaja: number) { return [{ id: 'p1', nombre: 'Olivitasan 500 ML', sku: 'OLIVITASAN-500', unidadesPorCaja }] }

describe('automation deterministic interpreter', () => {
  it.each([4, 12, 20, 24, 30, 40])('interpreta números sin modalidad como unidades (%i u/caja)', (unidadesPorCaja) => {
    const parsed = interpretOrder('Cliente: Veterinaria Norte\n60 Olivitasan 500', product(unidadesPorCaja), customer)
    expect(parsed.lines[0].quantity).toMatchObject({ mode: 'UNITS', explicitUnits: 60, totalUnits: 60, normalizedBoxes: Math.floor(60 / unidadesPorCaja), normalizedLooseUnits: 60 % unidadesPorCaja })
  })

  it('interpreta x60 como unidades y cajas + sueltos como mixto', () => {
    expect(interpretOrder('Cliente: Veterinaria Norte\nOlivitasan 500 x60', product(20), customer).lines[0].quantity).toMatchObject({ mode: 'UNITS', totalUnits: 60 })
    expect(interpretOrder('Cliente: Veterinaria Norte\n3 cajas y 5 Olivitasan 500', product(20), customer).lines[0].quantity).toMatchObject({ mode: 'MIXED', explicitBoxes: 3, explicitUnits: 5, totalUnits: 65 })
  })

  it('normaliza presentación y resuelve el alias conocido sin confundir PLUS', () => {
    expect(interpretOrder('Cliente: Veterinaria Norte\n3 cajas OLIVITA 500', product(20), customer).lines[0]).toMatchObject({ productCandidate: { productId: 'p1' }, quantity: { mode: 'BOXES', totalUnits: 60 } })
    const ambiguous = interpretOrder('Cliente: Veterinaria Norte\n60 Olivitasan', [{ id: 'plain', nombre: 'Olivitasan 500 ML', sku: 'OLI-500', unidadesPorCaja: 20 }, { id: 'plus', nombre: 'Olivitasan Plus 500 ML', sku: 'OLI-PLUS-500', unidadesPorCaja: 20 }], customer)
    expect(ambiguous.lines[0].requiresReview).toBe(true)
  })
})
