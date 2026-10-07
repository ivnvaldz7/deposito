import { describe, expect, it } from 'vitest'

import { APPROVED_DRUG_NAMES, validateApprovedDrugSnapshot } from '../services/catalogo-inicial-drogas-service'

describe('approved initial drug catalog', () => {
  it('contains exactly the 55 normalized unique drug identities', () => {
    expect(APPROVED_DRUG_NAMES).toHaveLength(55)
    expect(new Set(APPROVED_DRUG_NAMES).size).toBe(55)
    expect(APPROVED_DRUG_NAMES).toContain('ÁCIDO CÍTRICO')
    expect(APPROVED_DRUG_NAMES).toContain('VITAMINA B2-5 FOSFATO')
  })

  it('accepts only an active catalog-only drug and rejects identity or lifecycle drift', () => {
    const valid = {
      nombreBase: 'ÁCIDO CÍTRICO', nombreCompleto: 'ÁCIDO CÍTRICO', categoria: 'droga',
      codigo: null, mercado: null, mercadosHabilitados: [], estado: 'ACTIVO', activo: true,
      origen: 'IMPORTACION',
    }
    expect(validateApprovedDrugSnapshot(valid, 'ÁCIDO CÍTRICO')).toBe('already-correct')
    expect(() => validateApprovedDrugSnapshot({ ...valid, codigo: 'TEST001' }, 'ÁCIDO CÍTRICO')).toThrow('drift')
    expect(() => validateApprovedDrugSnapshot({ ...valid, estado: 'INACTIVO', activo: false }, 'ÁCIDO CÍTRICO')).toThrow('drift')
  })
})
