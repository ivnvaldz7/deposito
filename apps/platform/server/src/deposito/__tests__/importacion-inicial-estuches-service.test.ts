import { describe, expect, it } from 'vitest'

import {
  canonicalizeInitialEstuchesRows,
  checksumInitialEstuchesRows,
  codeForCatalogSequence,
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
    expect(codeForCatalogSequence('etiqueta', 'argentina', 1)).toBe('IGET001')
    expect(codeForCatalogSequence('etiqueta', 'argentina', 48)).toBe('IGET048')
    expect(codeForCatalogSequence('etiqueta', 'colombia', 1)).toBe('IGETCO001')
    expect(codeForCatalogSequence('etiqueta', 'bolivia', 1)).toBe('IGETBO001')
    expect(codeForCatalogSequence('etiqueta', 'paraguay', 1)).toBe('IGETPY001')
    expect(codeForCatalogSequence('etiqueta', 'mexico', 1)).toBe('IGETMX001')
    expect(codeForCatalogSequence('etiqueta', 'ecuador', 1)).toBe('IGETEC001')
    expect(() => codeForCatalogSequence('etiqueta', 'no_exportable' as never, 1)).toThrow('Mercado de etiqueta inválido')
  })

  it('normalizes catalog rows deterministically and rejects historical quantities and duplicate identities', () => {
    const normalized = canonicalizeInitialEstuchesRows([
      { sourceRow: 2, nombreBase: ' estuche ', nombreCompleto: ' estuche 20 ', presentacion: 20, mercado: 'argentina' },
      { sourceRow: 3, nombreBase: ' estuche ', nombreCompleto: ' estuche 30 ', presentacion: 30, mercado: 'colombia' },
    ])
    expect(normalized.map((row) => row.nombreCompleto)).toEqual(['ESTUCHE 20', 'ESTUCHE 30'])
    expect(checksumInitialEstuchesRows(normalized)).toMatch(/^[a-f0-9]{64}$/)
    expect(() => canonicalizeInitialEstuchesRows([{ sourceRow: 2, nombreBase: 'A', nombreCompleto: 'A', presentacion: 1, mercado: 'argentina', cantidad: 1 } as never])).toThrow('cantidades históricas')
    expect(() => canonicalizeInitialEstuchesRows([
      { sourceRow: 2, nombreBase: 'A', nombreCompleto: 'A', presentacion: 1, mercado: 'argentina' },
      { sourceRow: 3, nombreBase: 'A', nombreCompleto: 'A', presentacion: 1, mercado: 'argentina' },
    ])).toThrow('duplicada')
  })

  it('accepts supported catalog categories, rejects others, and includes category in identity', () => {
    const normalized = canonicalizeInitialEstuchesRows([
      { sourceRow: 1, nombreBase: 'Olivitasan', nombreCompleto: 'Olivitasan 500 ML', presentacion: 500, mercado: 'argentina', categoria: 'estuche' },
      { sourceRow: 2, nombreBase: 'Olivitasan', nombreCompleto: 'Olivitasan 500 ML', presentacion: 500, mercado: 'argentina', categoria: 'etiqueta' },
    ])
    expect(normalized.map((row) => row.categoria)).toEqual(['estuche', 'etiqueta'])
    expect(() => canonicalizeInitialEstuchesRows([
      { sourceRow: 1, nombreBase: 'A', nombreCompleto: 'A 1 ML', presentacion: 1, mercado: 'argentina', categoria: 'droga' as never },
    ])).toThrow('Categoría de catálogo inválida')
  })

  it('accepts export etiqueta rows while preserving market identity', () => {
    const normalized = canonicalizeInitialEstuchesRows([
      { sourceRow: 1, nombreBase: 'Aminoacidos', nombreCompleto: 'Aminoacidos 20 ML', presentacion: 20, mercado: 'colombia', categoria: 'etiqueta' },
      { sourceRow: 2, nombreBase: 'Amantina Premium', nombreCompleto: 'Amantina Premium 100 ML', presentacion: 100, mercado: 'ecuador', categoria: 'etiqueta' },
    ])

    expect(normalized.map(({ mercado, categoria }) => ({ mercado, categoria }))).toEqual([
      { mercado: 'colombia', categoria: 'etiqueta' },
      { mercado: 'ecuador', categoria: 'etiqueta' },
    ])
  })

  it('canonicalizes Argentina Frasco rows with units per box and rejects stock quantities', () => {
    expect(canonicalizeInitialEstuchesRows([{
      sourceRow: 1,
      nombreBase: ' ámbar 100 ml ',
      nombreCompleto: ' ámbar 100 ml ',
      mercado: 'argentina',
      categoria: 'frasco',
      unidadesPorCaja: 72,
    }])).toEqual([{
      sourceRow: 1,
      nombreBase: 'ÁMBAR',
      nombreCompleto: 'ÁMBAR 100 ML',
      presentacion: 100,
      unidad: 'ML',
      mercado: 'argentina',
      categoria: 'frasco',
      unidadesPorCaja: 72,
    }])
    expect(() => canonicalizeInitialEstuchesRows([{
      sourceRow: 2,
      nombreBase: 'Frasco',
      nombreCompleto: 'Frasco 20 ML',
      mercado: 'argentina',
      categoria: 'frasco',
      unidadesPorCaja: 20,
      cantidad: 4,
    } as never])).toThrow('no admite cantidades históricas')
  })

  it('separates litre and gram Frasco presentations instead of persisting them in the base name', () => {
    expect(canonicalizeInitialEstuchesRows([
      { sourceRow: 1, nombreBase: 'Bidón Blanco 1 L', nombreCompleto: 'Bidón Blanco 1 L', mercado: 'argentina', categoria: 'frasco', unidadesPorCaja: 60 },
      { sourceRow: 2, nombreBase: 'Jeringa 35 GR', nombreCompleto: 'Jeringa 35 GR', mercado: 'argentina', categoria: 'frasco', unidadesPorCaja: 700 },
    ]).map(({ nombreBase, presentacion, unidad }) => ({ nombreBase, presentacion, unidad }))).toEqual([
      { nombreBase: 'BIDÓN BLANCO', presentacion: 1, unidad: 'L' },
      { nombreBase: 'JERINGA', presentacion: 35, unidad: 'GR' },
    ])
  })

  it('restricts Frascos to Argentina and validates units per box', () => {
    expect(() => canonicalizeInitialEstuchesRows([{
      sourceRow: 1, nombreBase: 'Frasco', nombreCompleto: 'Frasco', mercado: 'colombia', categoria: 'frasco', unidadesPorCaja: 10,
    }])).toThrow('Argentina')
    expect(() => canonicalizeInitialEstuchesRows([{
      sourceRow: 1, nombreBase: 'Frasco', nombreCompleto: 'Frasco', mercado: 'argentina', categoria: 'frasco', unidadesPorCaja: 0,
    }])).toThrow('unidades por caja')
    expect(codeForCatalogSequence('frasco', 'argentina', 63)).toBe('ENV063')
  })
})
