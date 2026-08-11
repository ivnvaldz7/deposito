import { describe, expect, it } from 'vitest'

import {
  canonicalizeInitialEstuchesRows,
  checksumInitialEstuchesRows,
  codeForMarketSequence,
} from '../services/importacion-inicial-estuches-helpers'

const persistedResult = {
  batchId: 'batch-1',
  checksum: 'checksum',
  items: [{ sourceRow: 1, productoId: 'producto-1', inventarioId: 'inventario-1', mercado: 'argentina', codigo: 'IGES001', cantidad: 1 }],
}

describe('initial estuches import normalization', () => {
  it('maps every supported market to an independent uppercase canonical code', () => {
    expect(codeForMarketSequence('argentina', 1)).toBe('IGES001')
    expect(codeForMarketSequence('colombia', 1)).toBe('IGESCO001')
    expect(codeForMarketSequence('bolivia', 12)).toBe('IGESBO012')
    expect(codeForMarketSequence('ecuador', 7)).toBe('IGESEC007')
    expect(codeForMarketSequence('paraguay', 2)).toBe('IGESPY002')
    expect(codeForMarketSequence('VENEZUELA', 3)).toBe('IGESVN003')
    expect(codeForMarketSequence('mexico', 4)).toBe('IGESMX004')
  })

  it('normalizes deterministically and rejects negative quantities and duplicate identities', () => {
    const normalized = canonicalizeInitialEstuchesRows([
      { sourceRow: 2, nombreBase: ' estuche ', nombreCompleto: ' estuche 20 ', presentacion: 20, mercado: 'argentina', cantidad: 0 },
      { sourceRow: 3, nombreBase: ' estuche ', nombreCompleto: ' estuche 30 ', presentacion: 30, mercado: 'colombia', cantidad: 10 },
    ])
    expect(normalized.map((row) => row.nombreCompleto)).toEqual(['ESTUCHE 20', 'ESTUCHE 30'])
    expect(checksumInitialEstuchesRows(normalized)).toMatch(/^[a-f0-9]{64}$/)
    expect(() => canonicalizeInitialEstuchesRows([{ sourceRow: 2, nombreBase: 'A', nombreCompleto: 'A', presentacion: 1, mercado: 'argentina', cantidad: -1 }])).toThrow('no puede ser negativa')
    expect(() => canonicalizeInitialEstuchesRows([
      { sourceRow: 2, nombreBase: 'A', nombreCompleto: 'A', presentacion: 1, mercado: 'argentina', cantidad: 1 },
      { sourceRow: 3, nombreBase: 'A', nombreCompleto: 'A', presentacion: 1, mercado: 'argentina', cantidad: 1 },
    ])).toThrow('duplicada')
  })
})
