import { describe, expect, it } from 'vitest'
import { interpretOrder, extractQuantityAndProduct, hasStrongMismatch } from '../interpreter'

// ============================================================
// CATALOGO REAL para replicar el bug de UAT
// ============================================================

const ZENON_CUSTOMER = [{ id: 'zenon', nombre: 'ZENON', aliases: [] }]

const B12_CATALOG = [
  { id: 'b12-100', nombre: 'COMPLEJO B B12 B15 100 ML', sku: 'B12-100', unidadesPorCaja: 5, aliases: [] },
  { id: 'b12-250', nombre: 'COMPLEJO B B12 B15 250 ML', sku: 'B12-250', unidadesPorCaja: 5, aliases: [] },
]

const FULL_CATALOG = [
  ...B12_CATALOG,
  { id: 'olivita-plus', nombre: 'OLIVITASAN PLUS 500 ML', sku: 'O-PLUS', unidadesPorCaja: 20, aliases: [] },
  { id: 'olivita', nombre: 'OLIVITASAN 500 ML', sku: 'O', unidadesPorCaja: 20, aliases: [] },
  { id: 'cetri', nombre: 'CETRI-AMON 1 L', sku: 'CETRI', unidadesPorCaja: 10, aliases: [] },
]

const ANY_CUSTOMER = [{ id: 'c1', nombre: 'Veterinaria Norte', aliases: [] }]

// ============================================================
// CASO 1: ZENON exacto marcado como revisar
// ============================================================

describe('Bug CASO 1 — ZENON como cliente exacto', () => {
  it('ZENON exacto → candidate resuelto, requiresReview false para cliente', () => {
    const parsed = interpretOrder('ZENON\n24 b12b15 250', B12_CATALOG, ZENON_CUSTOMER)
    expect(parsed.customerCandidate).not.toBeNull()
    expect(parsed.customerCandidate?.customerId).toBe('zenon')
    expect(parsed.customerCandidate?.nombre).toBe('ZENON')
    // El requiresReview del order puede ser true si los productos no resuelven,
    // pero la parte de cliente NO debe ser el motivo
    expect(parsed.warnings).not.toContain('CUSTOMER_UNRESOLVED')
  })

  it('ZENON suelto (solo texto) → cliente resuelto sin warnings', () => {
    const parsed = interpretOrder('ZENON', [], ZENON_CUSTOMER)
    expect(parsed.customerCandidate?.customerId).toBe('zenon')
    expect(parsed.warnings).not.toContain('CUSTOMER_UNRESOLVED')
  })
})

// ============================================================
// CASO 2: Cantidad contamina match de producto
// ============================================================

describe('Bug CASO 2 — Cantidad contamina identidad del producto', () => {
  it('extractQuantityAndProduct("24 b12b15 250") separa correctamente cantidad e identidad', () => {
    const result = extractQuantityAndProduct('24 b12b15 250')
    expect(result.explicitUnits).toBe(24)
    expect(result.productText).toBe('b12b15 250')
  })

  it('hasStrongMismatch con productText sin cantidad NO genera mismatch falso', () => {
    // b12b15 250 vs COMPLEJO B B12 B15 250 ML — NO debe ser mismatch
    expect(hasStrongMismatch('b12b15 250', 'COMPLEJO B B12 B15 250 ML')).toBe(false)
  })

  it('24 b12b15 250 → qty 24, COMPLEJO B B12 B15 250 ML, requiresReview false en producto', () => {
    const parsed = interpretOrder('Cliente: Veterinaria Norte\n24 b12b15 250', B12_CATALOG, ANY_CUSTOMER)
    expect(parsed.lines).toHaveLength(1)
    const line = parsed.lines[0]!
    expect(line.productCandidate?.productId).toBe('b12-250')
    expect(line.quantity.explicitUnits).toBe(24)
    expect(line.requiresReview).toBe(false)
  })

  it('504 b12b15 100ml → qty 504, COMPLEJO B B12 B15 100 ML', () => {
    const parsed = interpretOrder('Cliente: Veterinaria Norte\n504 b12b15 100ml', B12_CATALOG, ANY_CUSTOMER)
    const line = parsed.lines[0]!
    expect(line.productCandidate?.productId).toBe('b12-100')
    expect(line.quantity.explicitUnits).toBe(504)
    expect(line.requiresReview).toBe(false)
  })

  it('240 b12b15 250ml → qty 240, COMPLEJO B B12 B15 250 ML', () => {
    const parsed = interpretOrder('Cliente: Veterinaria Norte\n240 b12b15 250ml', B12_CATALOG, ANY_CUSTOMER)
    const line = parsed.lines[0]!
    expect(line.productCandidate?.productId).toBe('b12-250')
    expect(line.quantity.explicitUnits).toBe(240)
    expect(line.requiresReview).toBe(false)
  })

  it('400 plus 500ml → qty 400, OLIVITASAN PLUS 500 ML', () => {
    const parsed = interpretOrder('Cliente: Veterinaria Norte\n400 plus 500ml', FULL_CATALOG, ANY_CUSTOMER)
    const line = parsed.lines[0]!
    expect(line.productCandidate?.productId).toBe('olivita-plus')
    expect(line.quantity.explicitUnits).toBe(400)
    expect(line.requiresReview).toBe(false)
  })

  it('12 cetri 1lt → qty 12, CETRI-AMON 1 L', () => {
    const parsed = interpretOrder('Cliente: Veterinaria Norte\n12 cetri 1lt', FULL_CATALOG, ANY_CUSTOMER)
    const line = parsed.lines[0]!
    expect(line.productCandidate?.productId).toBe('cetri')
    expect(line.quantity.explicitUnits).toBe(12)
    expect(line.requiresReview).toBe(false)
  })
})

// ============================================================
// Seguridad: no degradar strong-token mismatch real
// ============================================================

describe('Strong token mismatch — no degradar seguridad', () => {
  it('b12b15 250 NO puede resolver COMPLEJO B B12 B15 100 ML (diferente presentación)', () => {
    const parsed = interpretOrder('Cliente: Veterinaria Norte\n1 b12b15 250', B12_CATALOG, ANY_CUSTOMER)
    expect(parsed.lines[0]?.productCandidate?.productId).not.toBe('b12-100')
    expect(parsed.lines[0]?.productCandidate?.productId).toBe('b12-250')
  })

  it('b12b15 sin presentación → ambiguo (no resuelve)', () => {
    const parsed = interpretOrder('Cliente: Veterinaria Norte\n1 b12b15', B12_CATALOG, ANY_CUSTOMER)
    expect(parsed.lines[0]?.productCandidate).toBeNull()
    expect(parsed.lines[0]?.requiresReview).toBe(true)
    expect(parsed.lines[0]?.alternatives?.map(a => a.productId)).toEqual(expect.arrayContaining(['b12-100', 'b12-250']))
  })

  it('24 b12b15 250 NO puede resolver COMPLEJO B B12 B15 100 ML (cantidad no puede modificar presentación)', () => {
    const parsed = interpretOrder('Cliente: Veterinaria Norte\n24 b12b15 250', B12_CATALOG, ANY_CUSTOMER)
    // Debe resolver 250 ML, no 100 ML
    expect(parsed.lines[0]?.productCandidate?.productId).toBe('b12-250')
    expect(parsed.lines[0]?.productCandidate?.productId).not.toBe('b12-100')
  })
})

// ============================================================
// Alias: NO incluir cantidad inicial en el alias
// ============================================================

describe('Alias — alias normalizado sin cantidad inicial', () => {
  it('extractQuantityAndProduct("24 b12b15 250").productText no contiene la cantidad', () => {
    const { productText, explicitUnits } = extractQuantityAndProduct('24 b12b15 250')
    expect(explicitUnits).toBe(24)
    // El productText usado para alias debe ser sólo la identidad del producto
    expect(productText).toBe('b12b15 250')
    // El alias nunca debe tener la cantidad
    expect(productText).not.toMatch(/^24/)
  })

  it('extractQuantityAndProduct("504 b12b15 100ml").productText no incluye 504', () => {
    const { productText, explicitUnits } = extractQuantityAndProduct('504 b12b15 100ml')
    expect(explicitUnits).toBe(504)
    expect(productText).not.toMatch(/^504/)
    expect(productText.toLowerCase()).toContain('b12b15')
  })
})
