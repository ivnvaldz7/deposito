import { describe, expect, it, vi } from 'vitest'

vi.mock('@platform/db', () => ({
  Categoria: { droga: 'droga', estuche: 'estuche', etiqueta: 'etiqueta', frasco: 'frasco' },
  EstadoProductoCatalogo: { PENDIENTE_REVISION: 'PENDIENTE_REVISION', ACTIVO: 'ACTIVO', INACTIVO: 'INACTIVO' },
  Mercado: { argentina: 'argentina' },
  OrigenProductoCatalogo: { MANUAL: 'MANUAL', IMPORTACION: 'IMPORTACION', MIGRACION: 'MIGRACION' },
  TipoAuditoriaCatalogo: {},
  Prisma: {},
}))
import { validateCatalogoInput } from '../services/catalogo-producto-service'

describe('stockMinimo de catálogo', () => {
  const base = { categoria: 'droga' as const, mercadosHabilitados: [], presentacion: null }
  it('permite null y cero', () => { expect(() => validateCatalogoInput({ ...base, stockMinimo: null })).not.toThrow(); expect(() => validateCatalogoInput({ ...base, stockMinimo: 0 })).not.toThrow() })
  it('rechaza negativos y decimales', () => { expect(() => validateCatalogoInput({ ...base, stockMinimo: -1 })).toThrow(); expect(() => validateCatalogoInput({ ...base, stockMinimo: 1.5 })).toThrow() })
})
