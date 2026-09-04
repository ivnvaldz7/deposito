import { createHash } from 'node:crypto'

export type InitialEstuchesMarket = 'argentina' | 'colombia' | 'bolivia' | 'ecuador' | 'paraguay' | 'VENEZUELA' | 'mexico'
export type InitialCatalogCategory = 'estuche' | 'etiqueta' | 'frasco'

export interface InitialEstuchesRow {
  sourceRow: number
  nombreBase: string
  nombreCompleto: string
  presentacion?: number
  unidad?: string
  mercado: InitialEstuchesMarket
  categoria?: InitialCatalogCategory
  codigo?: string
  unidadesPorCaja?: number
}

export interface CanonicalInitialEstuchesRow extends Omit<InitialEstuchesRow, 'codigo' | 'categoria'> {
  categoria: InitialCatalogCategory
  codigo?: string
}

const MARKET_PREFIX: Readonly<Record<InitialEstuchesMarket, string>> = {
  argentina: 'IGES', colombia: 'IGESCO', bolivia: 'IGESBO', ecuador: 'IGESEC', paraguay: 'IGESPY', VENEZUELA: 'IGESVN', mexico: 'IGESMX',
}
const LABEL_MARKET_PREFIX: Readonly<Record<InitialEstuchesMarket, string>> = {
  argentina: 'IGET', colombia: 'IGETCO', bolivia: 'IGETBO', ecuador: 'IGETEC', paraguay: 'IGETPY', VENEZUELA: 'IGETVN', mexico: 'IGETMX',
}
const MARKETS = new Set<InitialEstuchesMarket>(Object.keys(MARKET_PREFIX) as InitialEstuchesMarket[])

export function isInitialEstuchesMarket(value: string): value is InitialEstuchesMarket {
  return MARKETS.has(value as InitialEstuchesMarket)
}

function normalizeText(value: string, field: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ').toUpperCase()
  if (!normalized) throw new InitialEstuchesImportError('INVALID', `${field} es obligatorio`)
  return normalized
}

export function codeForMarketSequence(mercado: InitialEstuchesMarket, sequence: number): string {
  if (!MARKETS.has(mercado)) throw new InitialEstuchesImportError('INVALID', 'Mercado de estuche inválido')
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) throw new InitialEstuchesImportError('INVALID', 'La secuencia de código debe estar entre 001 y 999')
  return `${MARKET_PREFIX[mercado]}${String(sequence).padStart(3, '0')}`
}

export function codeForCatalogSequence(categoria: InitialCatalogCategory, mercado: InitialEstuchesMarket, sequence: number): string {
  if (categoria === 'frasco') {
    if (mercado !== 'argentina') throw new InitialEstuchesImportError('INVALID', 'Los Frascos canónicos solo admiten mercado Argentina')
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) throw new InitialEstuchesImportError('INVALID', 'La secuencia de código debe estar entre 001 y 999')
    return `ENV${String(sequence).padStart(3, '0')}`
  }
  if (categoria === 'estuche') return codeForMarketSequence(mercado, sequence)
  if (categoria !== 'etiqueta') throw new InitialEstuchesImportError('INVALID', 'Categoría de catálogo inválida')
  if (!MARKETS.has(mercado)) throw new InitialEstuchesImportError('INVALID', 'Mercado de etiqueta inválido')
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) throw new InitialEstuchesImportError('INVALID', 'La secuencia de código debe estar entre 001 y 999')
  return `${LABEL_MARKET_PREFIX[mercado]}${String(sequence).padStart(3, '0')}`
}

export function canonicalizeInitialEstuchesRows(rows: readonly InitialEstuchesRow[]): CanonicalInitialEstuchesRow[] {
  if (rows.length === 0) throw new InitialEstuchesImportError('INVALID', 'La importación debe incluir al menos un estuche')
  const identities = new Set<string>()
  const codes = new Set<string>()
  return rows.map((row) => {
    if (!Number.isInteger(row.sourceRow) || row.sourceRow < 1) throw new InitialEstuchesImportError('INVALID', 'sourceRow debe ser un entero positivo')
    if (!MARKETS.has(row.mercado)) throw new InitialEstuchesImportError('INVALID', 'Mercado de estuche inválido')
    const categoria = row.categoria ?? 'estuche'
    if (categoria !== 'estuche' && categoria !== 'etiqueta' && categoria !== 'frasco') throw new InitialEstuchesImportError('INVALID', 'Categoría de catálogo inválida')
    if (categoria === 'frasco') {
      if (row.mercado !== 'argentina') throw new InitialEstuchesImportError('INVALID', 'Los Frascos canónicos solo admiten mercado Argentina')
      if (!Number.isInteger(row.unidadesPorCaja) || row.unidadesPorCaja! <= 0) throw new InitialEstuchesImportError('INVALID', 'Las unidades por caja deben ser un entero positivo')
    } else if (!Number.isInteger(row.presentacion) || row.presentacion! <= 0) {
      throw new InitialEstuchesImportError('INVALID', 'La presentación debe ser un entero positivo')
    }
    if ('cantidad' in row) throw new InitialEstuchesImportError('INVALID', 'La importación de catálogo no admite cantidades históricas')
    const nombreBase = normalizeText(row.nombreBase, 'nombreBase')
    const nombreCompleto = normalizeText(row.nombreCompleto, 'nombreCompleto')
    const frascoPresentation = categoria === 'frasco'
      ? nombreCompleto.match(/^(.*\S)\s+(\d+)\s+(ML|L|GR)$/)
      : null
    if (categoria === 'frasco' && !frascoPresentation) {
      throw new InitialEstuchesImportError('INVALID', 'El nombre de Frasco debe terminar con una presentación ML, L o GR')
    }
    const codigo = row.codigo?.trim().toUpperCase() || undefined
    const identity = `${nombreCompleto}|${categoria}|${row.mercado}`
    if (identities.has(identity)) throw new InitialEstuchesImportError('CONFLICT', 'La importación contiene una identidad producto/mercado duplicada')
    if (codigo && codes.has(codigo)) throw new InitialEstuchesImportError('CONFLICT', 'La importación contiene un código duplicado')
    identities.add(identity)
    if (codigo) codes.add(codigo)
    return {
      sourceRow: row.sourceRow,
      nombreBase: frascoPresentation ? frascoPresentation[1]! : nombreBase,
      nombreCompleto, mercado: row.mercado, categoria,
      ...(frascoPresentation
        ? { presentacion: Number(frascoPresentation[2]), unidad: frascoPresentation[3]! }
        : row.presentacion === undefined ? {} : { presentacion: row.presentacion }),
      ...(row.unidadesPorCaja === undefined ? {} : { unidadesPorCaja: row.unidadesPorCaja }),
      ...(codigo ? { codigo } : {}),
    }
  }).sort((left, right) => left.mercado.localeCompare(right.mercado) || left.sourceRow - right.sourceRow)
}

export function checksumInitialEstuchesRows(rows: readonly CanonicalInitialEstuchesRow[]): string {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}

export class InitialEstuchesImportError extends Error {
  constructor(public readonly code: 'INVALID' | 'CONFLICT', message: string) { super(message) }
}
