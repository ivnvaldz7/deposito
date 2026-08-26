export type ProductNameLike = string | {
  nombre?: string | null
  nombreCompleto?: string | null
  articulo?: string | null
}

type PresentationDimension = 'volume' | 'weight'

export interface ProductPresentation {
  baseName: string
  value: number
  unit: string
  dimension: PresentationDimension
  suffix: string
}

interface ParsedProductName {
  normalizedName: string
  baseName: string
  presentation: ProductPresentation | null
}

const collator = new Intl.Collator('es', { sensitivity: 'base' })
const PRESENTATION_PATTERN = /^(.*?)(\d+(?:[.,]\d+)?)\s*(KG|ML|GR?|L)\b(.*)$/i

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function cleanSegment(value: string): string {
  return normalizeText(value).replace(/^[\s-]+|[\s-]+$/g, '')
}

export function getProductName(value: ProductNameLike): string {
  if (typeof value === 'string') return value
  return value.nombreCompleto ?? value.nombre ?? value.articulo ?? ''
}

export function parseProductPresentation(name: string): ProductPresentation | null {
  const match = PRESENTATION_PATTERN.exec(normalizeText(name))
  if (!match) return null

  const value = Number(match[2]!.replace(',', '.'))
  if (!Number.isFinite(value)) return null

  const rawUnit = match[3]!.toUpperCase()
  const isVolume = rawUnit === 'ML' || rawUnit === 'L'
  const dimension: PresentationDimension = isVolume ? 'volume' : 'weight'
  const normalizedValue = rawUnit === 'L' || rawUnit === 'KG' ? value * 1000 : value

  return {
    baseName: cleanSegment(match[1]!),
    value: normalizedValue,
    unit: isVolume ? 'ML' : 'G',
    dimension,
    suffix: cleanSegment(match[4]!),
  }
}

function parseProductName(value: ProductNameLike): ParsedProductName {
  const normalizedName = normalizeText(getProductName(value))
  const presentation = parseProductPresentation(normalizedName)
  return {
    normalizedName,
    baseName: presentation?.baseName ?? normalizedName,
    presentation,
  }
}

/**
 * Compares catalog products by family, then by compatible physical
 * presentation. Weight and volume are intentionally never compared with one
 * another; those pairs fall back to alphabetical order.
 */
export function compareProductsByNaturalPresentation(
  left: ProductNameLike,
  right: ProductNameLike,
): number {
  const a = parseProductName(left)
  const b = parseProductName(right)

  const baseComparison = collator.compare(a.baseName, b.baseName)
  if (baseComparison !== 0) return baseComparison

  if (a.presentation && b.presentation) {
    if (a.presentation.dimension === b.presentation.dimension) {
      const valueComparison = a.presentation.value - b.presentation.value
      if (valueComparison !== 0) return valueComparison

      const suffixComparison = collator.compare(a.presentation.suffix, b.presentation.suffix)
      if (suffixComparison !== 0) return suffixComparison
    } else {
      return collator.compare(a.normalizedName, b.normalizedName)
    }
  }

  return collator.compare(a.normalizedName, b.normalizedName)
}

export function sortProductsByNaturalPresentation<T>(
  values: readonly T[],
  getName: (value: T) => ProductNameLike,
): T[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => compareProductsByNaturalPresentation(getName(a.value), getName(b.value)) || a.index - b.index)
    .map(({ value }) => value)
}
