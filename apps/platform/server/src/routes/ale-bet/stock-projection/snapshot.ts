export const REQUIRED_STOCK_PROJECTION_LOCATION_CODES = ['DEPOSITO', 'ACONDICIONADO'] as const

export type StockProjectionLocationCode = typeof REQUIRED_STOCK_PROJECTION_LOCATION_CODES[number]

export interface StockProjectionRow {
  producto: string
  lote: string
  vencimiento?: string
  total: number
  actualizadoEn?: string
}

export interface StockProjectionSnapshot {
  productoTerminado: StockProjectionRow[]
  sinAcondicionar: StockProjectionRow[]
}

export interface StockProjectionSource {
  ubicaciones: ReadonlyArray<{
    id: string
    codigo: string
    activo: boolean
  }>
  productos: ReadonlyArray<{
    id: string
    nombre: string
    activo: boolean
    lotes: ReadonlyArray<{
      id: string
      numero: string
      activo: boolean
      createdAt: Date
      fechaVencimiento: Date | null
      saldos: ReadonlyArray<{
        ubicacionId: string
        cantidad: number
      }>
    }>
  }>
}

interface ParsedPresentation {
  baseName: string
  normalizedName: string
  value: number
  dimension: 'volume' | 'weight'
  suffix: string
}

const collator = new Intl.Collator('es', { sensitivity: 'base' })
const PRESENTATION_PATTERN = /^(.*?)(\d+(?:[.,]\d+)?)\s*(KG|ML|GR?|L)\b(.*)$/i

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ')
}

function cleanSegment(value: string): string {
  return normalizeText(value).replace(/^[\s-]+|[\s-]+$/g, '')
}

function parsePresentation(name: string): ParsedPresentation | null {
  const normalizedName = normalizeText(name)
  const match = PRESENTATION_PATTERN.exec(normalizedName)
  if (!match) return null

  const rawValue = Number(match[2]!.replace(',', '.'))
  if (!Number.isFinite(rawValue)) return null

  const unit = match[3]!.toUpperCase()
  const dimension = unit === 'ML' || unit === 'L' ? 'volume' : 'weight'
  const value = unit === 'L' || unit === 'KG' ? rawValue * 1000 : rawValue

  return {
    baseName: cleanSegment(match[1]!),
    normalizedName,
    value,
    dimension,
    suffix: cleanSegment(match[4]!),
  }
}

export function compareStockProjectionProducts(
  left: { id: string; nombre: string },
  right: { id: string; nombre: string },
): number {
  const leftName = normalizeText(left.nombre)
  const rightName = normalizeText(right.nombre)
  const a = parsePresentation(leftName)
  const b = parsePresentation(rightName)
  const baseComparison = collator.compare(a?.baseName ?? leftName, b?.baseName ?? rightName)
  if (baseComparison !== 0) return baseComparison

  if (a && b && a.dimension === b.dimension) {
    const presentationComparison = a.value - b.value
    if (presentationComparison !== 0) return presentationComparison

    const variantComparison = collator.compare(a.suffix, b.suffix)
    if (variantComparison !== 0) return variantComparison
  }

  const canonicalComparison = collator.compare(leftName, rightName)
  return canonicalComparison || left.id.localeCompare(right.id)
}

export function assertRequiredProjectionLocations(
  locations: StockProjectionSource['ubicaciones'],
): Record<StockProjectionLocationCode, string> {
  const result = {} as Record<StockProjectionLocationCode, string>

  for (const code of REQUIRED_STOCK_PROJECTION_LOCATION_CODES) {
    const matches = locations.filter((location) => location.codigo === code)
    if (matches.length !== 1) {
      throw new Error(`La proyección requiere exactamente una ubicación ${code}; se encontraron ${matches.length}.`)
    }
    if (!matches[0]!.activo) {
      throw new Error(`La ubicación requerida ${code} está inactiva.`)
    }
    result[code] = matches[0]!.id
  }

  return result
}

type SourceProduct = StockProjectionSource['productos'][number]
type SourceLot = SourceProduct['lotes'][number]

interface LotQuantity {
  lote: SourceLot
  cantidad: number
}

function compareLotsAscending(left: SourceLot, right: SourceLot): number {
  return left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)
}

function compareLotsDescending(left: SourceLot, right: SourceLot): number {
  return right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id)
}

function quantityAtLocation(lot: SourceLot, locationId: string): number {
  const balances = lot.saldos.filter((balance) => balance.ubicacionId === locationId)
  if (balances.length > 1) {
    throw new Error(`Saldo duplicado para lote ${lot.id} y ubicación ${locationId}.`)
  }

  const quantity = balances[0]?.cantidad ?? 0
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error(`Cantidad física inválida para lote ${lot.id} y ubicación ${locationId}.`)
  }
  return quantity
}

function projectedLots(product: SourceProduct, locationId: string): LotQuantity[] {
  const quantities = product.lotes.map((lote) => ({
    lote,
    cantidad: quantityAtLocation(lote, locationId),
  }))
  const positive = quantities.filter(({ cantidad }) => cantidad > 0)

  if (positive.length > 0) {
    return positive.sort((left, right) => compareLotsAscending(left.lote, right.lote))
  }

  const activeLots = quantities.filter(({ lote }) => lote.activo)
  const zeroCandidates = activeLots.length > 0 ? activeLots : quantities
  const representative = zeroCandidates.sort((left, right) => compareLotsDescending(left.lote, right.lote))[0]
  return representative ? [{ ...representative, cantidad: 0 }] : []
}

function formatDate(value: Date | null): string {
  if (!value) return 'SIN VTO'
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC' }).format(value)
}

function formatUpdatedAt(value: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value)
}

function projectTable(products: readonly SourceProduct[], locationId: string, updatedAt?: Date): StockProjectionRow[] {
  return products.flatMap((product) => projectedLots(product, locationId).map(({ lote, cantidad }) => ({
    producto: product.nombre,
    lote: lote.numero,
    total: cantidad,
    ...(updatedAt ? { vencimiento: formatDate(lote.fechaVencimiento), actualizadoEn: formatUpdatedAt(updatedAt) } : {}),
  })))
}

export function buildStockProjectionSnapshot(source: StockProjectionSource, updatedAt?: Date): StockProjectionSnapshot {
  const locationIds = assertRequiredProjectionLocations(source.ubicaciones)
  const visibleProducts = source.productos
    .filter((product) => product.activo && product.lotes.length > 0)
    .slice()
    .sort(compareStockProjectionProducts)

  return {
    productoTerminado: projectTable(visibleProducts, locationIds.DEPOSITO, updatedAt),
    sinAcondicionar: projectTable(visibleProducts, locationIds.ACONDICIONADO, updatedAt),
  }
}
