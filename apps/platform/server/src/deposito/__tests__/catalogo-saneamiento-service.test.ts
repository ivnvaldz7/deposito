import { describe, expect, it } from 'vitest'
import {
  CATALOG_CLEANUP_MANIFEST,
  classifyCleanupCandidate,
  type CleanupCandidateSnapshot,
} from '../services/catalogo-saneamiento-service'

function snapshot(overrides: Partial<CleanupCandidateSnapshot> = {}): CleanupCandidateSnapshot {
  return {
    id: CATALOG_CLEANUP_MANIFEST[0].id,
    codigo: CATALOG_CLEANUP_MANIFEST[0].codigo,
    nombreCompleto: 'AGROPECUARIO 25 ML',
    presentacion: null,
    categoria: 'frasco',
    estado: 'PENDIENTE_REVISION',
    origen: 'IMPORTACION',
    inventarioDroga: [],
    inventarioEstuche: [],
    inventarioEtiqueta: [],
    inventarioFrasco: [],
    movimientos: 0,
    actaItems: 0,
    ordenes: 0,
    importaciones: 0,
    ...overrides,
  }
}

describe('catalog cleanup safety classification', () => {
  it('allows an exact legacy candidate only when its canonical semantic identity matches', () => {
    const candidate = snapshot()
    const result = classifyCleanupCandidate(CATALOG_CLEANUP_MANIFEST[0], candidate, {
      codigo: 'ENV063',
      nombreCompleto: 'AGROPECUARIO 25 ML',
      presentacion: 25,
      categoria: 'frasco',
    })

    expect(result).toEqual({ safe: true, inventoryIds: [] })
  })

  it('rejects semantic drift and every operational relation', () => {
    const candidate = snapshot({ movimientos: 1 })
    const result = classifyCleanupCandidate(CATALOG_CLEANUP_MANIFEST[0], candidate, {
      codigo: 'ENV063',
      nombreCompleto: 'OTHER PRODUCT 25 ML',
      presentacion: 25,
      categoria: 'frasco',
    })

    expect(result.safe).toBe(false)
    expect(result.reasons).toEqual(expect.arrayContaining([
      'semantic identity differs from ENV063',
      'operational relations found',
    ]))
  })

  it('allows only declared zero inventories and rejects non-zero quantities', () => {
    const allowed = CATALOG_CLEANUP_MANIFEST.find((item) => item.codigo === 'IGET00245')!
    const zero = classifyCleanupCandidate(allowed, snapshot({
      id: allowed.id,
      codigo: allowed.codigo,
      categoria: 'etiqueta',
      estado: 'ACTIVO',
      origen: 'MANUAL',
      inventarioEtiqueta: [{ id: 'inv-zero', cantidad: 0 }],
    }))
    const nonZero = classifyCleanupCandidate(allowed, snapshot({
      id: allowed.id,
      codigo: allowed.codigo,
      categoria: 'etiqueta',
      estado: 'ACTIVO',
      origen: 'MANUAL',
      inventarioEtiqueta: [{ id: 'inv-stock', cantidad: 2 }],
    }))

    expect(zero).toEqual({ safe: true, inventoryIds: ['inv-zero'] })
    expect(nonZero.safe).toBe(false)
    expect(nonZero.reasons).toContain('inventory is not zero')
  })

  it('never admits canonical ENV063 through ENV083', () => {
    const result = classifyCleanupCandidate(CATALOG_CLEANUP_MANIFEST[0], snapshot({ codigo: 'ENV063' }), {
      codigo: 'ENV063',
      nombreCompleto: 'AGROPECUARIO 25 ML',
      presentacion: 25,
      categoria: 'frasco',
    })

    expect(result.safe).toBe(false)
    expect(result.reasons).toContain('protected canonical code')
  })
})
