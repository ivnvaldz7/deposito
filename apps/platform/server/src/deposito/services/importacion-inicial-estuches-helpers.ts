import { createHash } from 'node:crypto'

export type InitialEstuchesMarket = 'argentina' | 'colombia' | 'bolivia' | 'ecuador' | 'paraguay' | 'VENEZUELA' | 'mexico'

export interface InitialEstuchesRow {
  sourceRow: number
  nombreBase: string
  nombreCompleto: string
  presentacion: number
  mercado: InitialEstuchesMarket
  cantidad: number
  codigo?: string
}

export interface CanonicalInitialEstuchesRow extends Omit<InitialEstuchesRow, 'codigo'> {
  codigo?: string
}

const MARKET_PREFIX: Readonly<Record<InitialEstuchesMarket, string>> = {
  argentina: 'IGES', colombia: 'IGESCO', bolivia: 'IGESBO', ecuador: 'IGESEC', paraguay: 'IGESPY', VENEZUELA: 'IGESVN', mexico: 'IGESMX',
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

export function canonicalizeInitialEstuchesRows(rows: readonly InitialEstuchesRow[]): CanonicalInitialEstuchesRow[] {
  if (rows.length === 0) throw new InitialEstuchesImportError('INVALID', 'La importación debe incluir al menos un estuche')
  const identities = new Set<string>()
  const codes = new Set<string>()
  return rows.map((row) => {
    if (!Number.isInteger(row.sourceRow) || row.sourceRow < 1) throw new InitialEstuchesImportError('INVALID', 'sourceRow debe ser un entero positivo')
    if (!MARKETS.has(row.mercado)) throw new InitialEstuchesImportError('INVALID', 'Mercado de estuche inválido')
    if (!Number.isInteger(row.presentacion) || row.presentacion <= 0) throw new InitialEstuchesImportError('INVALID', 'La presentación debe ser un entero positivo')
    if (!Number.isInteger(row.cantidad) || row.cantidad < 0) throw new InitialEstuchesImportError('INVALID', 'La cantidad no puede ser negativa')
    const nombreBase = normalizeText(row.nombreBase, 'nombreBase')
    const nombreCompleto = normalizeText(row.nombreCompleto, 'nombreCompleto')
    const codigo = row.codigo?.trim().toUpperCase() || undefined
    const identity = `${nombreCompleto}|${row.mercado}`
    if (identities.has(identity)) throw new InitialEstuchesImportError('CONFLICT', 'La importación contiene una identidad producto/mercado duplicada')
    if (codigo && codes.has(codigo)) throw new InitialEstuchesImportError('CONFLICT', 'La importación contiene un código duplicado')
    identities.add(identity)
    if (codigo) codes.add(codigo)
    return { sourceRow: row.sourceRow, nombreBase, nombreCompleto, presentacion: row.presentacion, mercado: row.mercado, cantidad: row.cantidad, ...(codigo ? { codigo } : {}) }
  }).sort((left, right) => left.mercado.localeCompare(right.mercado) || left.sourceRow - right.sourceRow)
}

export function checksumInitialEstuchesRows(rows: readonly CanonicalInitialEstuchesRow[]): string {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}

export class InitialEstuchesImportError extends Error {
  constructor(public readonly code: 'INVALID' | 'CONFLICT', message: string) { super(message) }
}
