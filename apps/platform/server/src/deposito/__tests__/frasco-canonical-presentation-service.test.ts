import { describe, expect, it } from 'vitest'

import { CANONICAL_FRASCO_PRESENTATIONS, validateCanonicalFrascoSnapshot } from '../services/frasco-canonical-presentation-service'

describe('canonical Frasco name and presentation correction', () => {
  it('defines the exact immutable ENV063-ENV083 range with separated base names', () => {
    expect(CANONICAL_FRASCO_PRESENTATIONS).toHaveLength(21)
    expect(CANONICAL_FRASCO_PRESENTATIONS.map((item) => item.codigo)).toEqual(
      Array.from({ length: 21 }, (_, index) => `ENV${String(index + 63).padStart(3, '0')}`),
    )
    expect(CANONICAL_FRASCO_PRESENTATIONS.find((item) => item.codigo === 'ENV063')).toMatchObject({
      currentName: 'AGROPECUARIO 25 ML', nombreBase: 'AGROPECUARIO', presentacion: 25, unidad: 'ML',
    })
    expect(CANONICAL_FRASCO_PRESENTATIONS.find((item) => item.codigo === 'ENV069')).toMatchObject({
      currentName: 'BIDÓN BLANCO 5 L', nombreBase: 'BIDÓN BLANCO', presentacion: 5, unidad: 'L',
    })
    expect(CANONICAL_FRASCO_PRESENTATIONS.find((item) => item.codigo === 'ENV077')).toMatchObject({
      currentName: 'JERINGA 35 GR', nombreBase: 'JERINGA', presentacion: 35, unidad: 'GR',
    })
  })

  it('accepts only the expected current or already-corrected identity and rejects drift', () => {
    const expected = CANONICAL_FRASCO_PRESENTATIONS[0]!
    expect(validateCanonicalFrascoSnapshot({
      codigo: expected.codigo, nombreBase: expected.currentName, nombreCompleto: expected.currentName,
      presentacion: null, unidad: null, categoria: 'frasco', mercado: 'argentina', estado: 'ACTIVO', activo: true,
    }, expected)).toBe('needs-update')
    expect(validateCanonicalFrascoSnapshot({
      codigo: expected.codigo, nombreBase: expected.nombreBase, nombreCompleto: expected.currentName,
      presentacion: expected.presentacion, unidad: expected.unidad, categoria: 'frasco', mercado: 'argentina', estado: 'ACTIVO', activo: true,
    }, expected)).toBe('already-correct')
    expect(() => validateCanonicalFrascoSnapshot({
      codigo: expected.codigo, nombreBase: 'DRIFT', nombreCompleto: expected.currentName,
      presentacion: null, unidad: null, categoria: 'frasco', mercado: 'argentina', estado: 'ACTIVO', activo: true,
    }, expected)).toThrow('drift')
  })
})
