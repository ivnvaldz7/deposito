import { describe, expect, it } from 'vitest'
import { hasStrongMismatch, interpretOrder } from '../interpreter'

const customer = [{ id: 'c1', nombre: 'Veterinaria Norte', aliases: [] }, { id: 'el-federal', nombre: 'EL FEDERAL', aliases: ['FEDERAL', 'FEDERAL 3'] }]
function product(unidadesPorCaja: number) { return [{ id: 'p1', nombre: 'Olivitasan 500 ML', sku: 'OLIVITASAN-500', unidadesPorCaja, aliases: ['OLIVITA 500'] }] }

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
    const ambiguous = interpretOrder('Cliente: Veterinaria Norte\n60 Olivitasan', [{ id: 'plain', nombre: 'Olivitasan 500 ML', sku: 'OLI-500', unidadesPorCaja: 20, aliases: [] }, { id: 'plus', nombre: 'Olivitasan Plus 500 ML', sku: 'OLI-PLUS-500', unidadesPorCaja: 20, aliases: [] }], customer)
    expect(ambiguous.lines[0].requiresReview).toBe(true)
  })

  it('detecta cliente en la primera linea y extrae cantidad correctamente', () => {
    const catalog = [
      { id: 'p-plus', nombre: 'PLUS 500 ML', sku: 'P500', unidadesPorCaja: 20, aliases: [] },
      { id: 'p-cetri', nombre: 'CETRI AMON 1 L', sku: 'CETRI', unidadesPorCaja: 10, aliases: ['CETRI', 'CETRI 1LT'] },
      { id: 'p-b12', nombre: 'COMPLEJO B B12B15 100 ML', sku: 'B12', unidadesPorCaja: 5, aliases: ['b12b15 100', 'b12b15 100ml'] },
      { id: 'p-b12-250', nombre: 'COMPLEJO B B12B25 250 ML', sku: 'B12-250', unidadesPorCaja: 5, aliases: ['b12b25 250ml'] }
    ]
    const parsed = interpretOrder('FEDERAL 3\n400 plus 500ml\n504 b12b15 100ml\n240 b12b25 250ml\n12 cetri 1lt', catalog, customer)
    expect(parsed.customerCandidate?.customerId).toBe('el-federal')
    expect(parsed.lines).toHaveLength(4)
    expect(parsed.lines[0].productCandidate?.productId).toBe('p-plus')
    expect(parsed.lines[0].quantity.explicitUnits).toBe(400)
    expect(parsed.lines[1].productCandidate?.productId).toBe('p-b12')
    expect(parsed.lines[1].quantity.explicitUnits).toBe(504)
    expect(parsed.lines[2].productCandidate?.productId).toBe('p-b12-250')
    expect(parsed.lines[3].productCandidate?.productId).toBe('p-cetri')
    expect(parsed.lines[3].quantity.explicitUnits).toBe(12)
  })

  it('no matchea productos que fallan validación de tokens fuertes (B12, B15, B25, PLUS, etc)', () => {
    const catalog = [
      { id: 'p-b12-100', nombre: 'COMPLEJO B B12B15 100 ML', sku: 'B12-100', unidadesPorCaja: 5, aliases: [] },
      { id: 'p-b12-250', nombre: 'COMPLEJO B B12B15 250 ML', sku: 'B12-250', unidadesPorCaja: 5, aliases: [] },
      { id: 'p-plus', nombre: 'OLIVITASAN PLUS 500 ML', sku: 'O-PLUS', unidadesPorCaja: 5, aliases: [] },
      { id: 'p-noplus', nombre: 'OLIVITASAN 500 ML', sku: 'O', unidadesPorCaja: 5, aliases: [] }
    ]
    const parsed = interpretOrder('1 b12b25 250ml', catalog, customer)
    expect(parsed.lines[0].productCandidate).toBeNull()
    expect(parsed.lines[0].requiresReview).toBe(true)

    const parsed2 = interpretOrder('olivitasan 500ml', catalog, customer)
    expect(parsed2.lines[0].productCandidate?.productId).toBe('p-noplus')

    const parsed3 = interpretOrder('olivitasan plus 500ml', catalog, customer)
    expect(parsed3.lines[0].productCandidate?.productId).toBe('p-plus')
  })

  it('mantiene la presentación al resolver B12B15 y deja ambiguo el texto sin presentación', () => {
    const catalog = [
      { id: 'b12-100', nombre: 'COMPLEJO B B12 B15 100 ML', sku: 'B12-100', unidadesPorCaja: 5, aliases: [] },
      { id: 'b12-250', nombre: 'COMPLEJO B B12 B15 250 ML', sku: 'B12-250', unidadesPorCaja: 5, aliases: [] },
    ]
    const ambiguous = interpretOrder('1 b12b15', catalog, customer).lines[0]
    expect(ambiguous).toMatchObject({ productCandidate: null, requiresReview: true })
    expect(ambiguous.alternatives.map((alternative) => alternative.productId)).toEqual(['b12-100', 'b12-250'])
    expect(interpretOrder('1 b12b15 100ml', catalog, customer).lines[0]?.productCandidate?.productId).toBe('b12-100')
    expect(interpretOrder('1 b12b15 250ml', catalog, customer).lines[0]?.productCandidate?.productId).toBe('b12-250')
  })

  it('ignora un alias histórico cuya presentación contradice el producto', () => {
    const catalog = [
      { id: 'b12-100', nombre: 'COMPLEJO B B12 B15 100 ML', sku: 'B12-100', unidadesPorCaja: 5, aliases: ['b12b15 250ml'] },
      { id: 'b12-250', nombre: 'COMPLEJO B B12 B15 250 ML', sku: 'B12-250', unidadesPorCaja: 5, aliases: [] },
    ]
    const line = interpretOrder('1 b12b15 250ml', catalog, customer).lines[0]
    expect(line?.productCandidate?.productId).toBe('b12-250')
    expect(line?.productCandidate?.productId).not.toBe('b12-100')
  })

  it('acepta un alias genérico que no contradice identificadores fuertes del producto', () => {
    expect(hasStrongMismatch('CETRI', 'CETRI-AMON 1 L')).toBe(false)
    expect(hasStrongMismatch('CETRI 1 ML', 'CETRI-AMON 1 L')).toBe(true)
    expect(hasStrongMismatch('B12B25 250 ML', 'COMPLEJO B B12 B15 100 ML')).toBe(true)
  })

  it('primera línea customerCandidateText unresolved no genera product line', () => {
    const catalog = [
      { id: 'p-plus', nombre: 'OLIVITASAN PLUS 500 ML', sku: 'O-PLUS', unidadesPorCaja: 5, aliases: [] }
    ]
    const parsed = interpretOrder('FEDERAL 3\n400 plus 500ml', catalog, [])
    expect(parsed.customerCandidate).toBeNull()
    expect(parsed.customerCandidateText).toBe('FEDERAL 3')
    expect(parsed.lines).toHaveLength(1)
    expect(parsed.lines[0].productCandidate?.productId).toBe('p-plus')
  })

  it('ZENON funciona como cliente canónico', () => {
    const catalog = [
      { id: 'p-plus', nombre: 'OLIVITASAN PLUS 500 ML', sku: 'O-PLUS', unidadesPorCaja: 5, aliases: [] }
    ]
    const customers = [{ id: 'zenon', nombre: 'ZENON', aliases: [] }]
    const parsed = interpretOrder('ZENON\n400 plus 500ml', catalog, customers)
    expect(parsed.customerCandidate?.customerId).toBe('zenon')
    expect(parsed.lines).toHaveLength(1)
    expect(parsed.lines[0].productCandidate?.productId).toBe('p-plus')
  })
})
