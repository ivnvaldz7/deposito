import { describe, expect, it } from 'vitest'
import { validateCatalogoInput } from '../services/catalogo-producto-service'

describe('stockMinimo de catálogo', () => {
  const base = { categoria: 'droga' as const, mercadosHabilitados: [], presentacion: null }
  it('permite null y cero', () => { expect(() => validateCatalogoInput({ ...base, stockMinimo: null })).not.toThrow(); expect(() => validateCatalogoInput({ ...base, stockMinimo: 0 })).not.toThrow() })
  it('rechaza negativos y decimales', () => { expect(() => validateCatalogoInput({ ...base, stockMinimo: -1 })).toThrow(); expect(() => validateCatalogoInput({ ...base, stockMinimo: 1.5 })).toThrow() })
})
