import { descomponerUnidades } from '../constants'
import type { CustomerAlternative, MatchCustomer, MatchProduct, ParsedOrder, ParsedOrderLine, ParsedQuantity, ProductAlternative, QuantityMode } from './contracts'

const aliases: Readonly<Record<string, string>> = {
  'OLIVITA 500': 'OLIVITASAN 500 ML',
}

export function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/(\d+)\s*ML\b/g, '$1 ML')
    .replace(/[.,;:()[\]{}!¿?"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string): string[] { return normalizeForMatch(value).split(' ').filter(Boolean) }
function hasStrongMismatch(input: string, candidate: string): boolean {
  const inputTokens = new Set(tokens(input))
  const candidateTokens = new Set(tokens(candidate))
  const inputNumbers = [...inputTokens].filter((token) => /^\d+$/.test(token))
  const candidateNumbers = [...candidateTokens].filter((token) => /^\d+$/.test(token))
  if (inputNumbers.some((number) => !candidateNumbers.includes(number))) return true
  if (inputTokens.has('PLUS') !== candidateTokens.has('PLUS')) return true
  return false
}

function scoreMatch(input: string, candidate: string): number {
  const normalizedInput = normalizeForMatch(input)
  const normalizedCandidate = normalizeForMatch(candidate)
  const inputNumbers = tokens(normalizedInput).filter((token) => /^\d+$/.test(token))
  const candidateNumbers = tokens(normalizedCandidate).filter((token) => /^\d+$/.test(token))
  // Presentations are hard constraints: a bare family name is never enough to
  // auto-select a concrete presentation such as 500 ML.
  if (candidateNumbers.length > 0 && inputNumbers.length === 0) return 0
  if (normalizedInput === normalizedCandidate) return 1
  const inputWithoutMl = normalizedInput.replace(/\bML\b/g, '').replace(/\s+/g, ' ').trim()
  const candidateWithoutMl = normalizedCandidate.replace(/\bML\b/g, '').replace(/\s+/g, ' ').trim()
  if (inputWithoutMl === candidateWithoutMl) return 0.99
  const wanted = tokens(inputWithoutMl).filter((token) => !['DE', 'MAS', 'AGREGA', 'AGREGAR'].includes(token))
  const actual = new Set(tokens(candidateWithoutMl))
  if (wanted.length > 0 && wanted.every((token) => actual.has(token))) return 0.93
  return 0
}

function productPhrase(line: string): string {
  return line
    .replace(/^\s*\d+\s+(?:CAJAS?|UNIDADES?|SUELTOS?)\b/i, '')
    .replace(/^\s*\d+\s+/, '')
    .replace(/\bX\s*\d+\b/i, '')
    .replace(/\b\d+\s+(?:MAS|MÁS)\b/i, '')
    .replace(/\b(?:AGREGA|AGREGÁ|AGREGAR)\b/i, '')
    .replace(/\bY\s*\d+\s*(?:UNIDADES?|SUELTOS?)?\b/i, '')
    .replace(/\b\d+\s*CAJAS?\b/i, '')
    .trim()
}

function matchProduct(line: string, products: MatchProduct[]): { candidate: ProductAlternative | null; alternatives: ProductAlternative[] } {
  const phrase = normalizeForMatch(productPhrase(line))
  const alias = aliases[phrase]
  const hits = products.flatMap((product) => {
    const score = alias === normalizeForMatch(product.nombre)
      ? 0.98
      : hasStrongMismatch(phrase, product.nombre) ? 0 : Math.max(scoreMatch(phrase, product.nombre), scoreMatch(phrase, product.sku))
    return score > 0 ? [{ productId: product.id, nombre: product.nombre, confidence: score }] : []
  }).sort((left, right) => right.confidence - left.confidence || left.nombre.localeCompare(right.nombre))
  const certain = hits[0] && (hits.length === 1 || hits[0].confidence > hits[1].confidence) && hits[0].confidence >= 0.93
  return { candidate: certain ? hits[0] : null, alternatives: hits.slice(0, 5) }
}

function parseQuantity(line: string, unidadesPorCaja: number | undefined): ParsedQuantity {
  const normalized = normalizeForMatch(line)
  const boxes = normalized.match(/\b(\d+)\s*CAJAS?\b/)
  const xUnits = normalized.match(/\bX\s*(\d+)\b/)
  const leadingUnits = normalized.match(/^\s*(\d+)\s+(?!CAJAS?\b)/)
  const extraUnits = boxes ? normalized.match(/\b(?:Y|MAS|MÁS)\s*(\d+)\s*(?:UNIDADES?|SUELTOS?)?\b/) : null
  const additiveUnits = normalized.match(/\b(\d+)\s+(?:MAS|MÁS)\b/)
  const explicitBoxes = boxes ? Number(boxes[1]) : null
  const explicitUnits = extraUnits ? Number(extraUnits[1]) : xUnits ? Number(xUnits[1]) : leadingUnits ? Number(leadingUnits[1]) : additiveUnits ? Number(additiveUnits[1]) : null
  const conflicting = Boolean(boxes && xUnits)
  let mode: QuantityMode = conflicting ? 'AMBIGUOUS' : explicitBoxes !== null && explicitUnits !== null ? 'MIXED' : explicitBoxes !== null ? 'BOXES' : explicitUnits !== null ? 'UNITS' : 'AMBIGUOUS'
  let totalUnits: number | null = null
  if (mode !== 'AMBIGUOUS' && unidadesPorCaja) totalUnits = (explicitBoxes ?? 0) * unidadesPorCaja + (explicitUnits ?? 0)
  const normalizedQuantity = totalUnits === null || !unidadesPorCaja ? null : descomponerUnidades(totalUnits, unidadesPorCaja)
  return {
    originalExpression: line,
    mode,
    explicitBoxes,
    explicitUnits,
    totalUnits,
    normalizedBoxes: normalizedQuantity?.cajas ?? null,
    normalizedLooseUnits: normalizedQuantity?.sueltos ?? null,
  }
}

function matchCustomer(text: string, customers: MatchCustomer[]): { candidate: CustomerAlternative | null; alternatives: CustomerAlternative[]; warning?: string } {
  const mentions = [...text.matchAll(/(?:^|\n)\s*(?:CLIENTE|PARA)\s*[:\-]?\s*([^\n]+)/gi)].map((match) => match[1].trim()).filter(Boolean)
  const alternatives = mentions.flatMap((mention) => customers.flatMap((customer) => {
    const score = scoreMatch(mention, customer.nombre)
    return score >= 0.93 ? [{ customerId: customer.id, nombre: customer.nombre, confidence: score }] : []
  })).sort((left, right) => right.confidence - left.confidence || left.nombre.localeCompare(right.nombre))
  const unique = [...new Map(alternatives.map((alternative) => [alternative.customerId, alternative])).values()]
  return { candidate: unique.length === 1 ? unique[0] : null, alternatives: unique.slice(0, 5), warning: new Set(mentions.map(normalizeForMatch)).size > 1 ? 'MULTIPLE_CUSTOMERS_DETECTED' : undefined }
}

export function interpretOrder(originalText: string, products: MatchProduct[], customers: MatchCustomer[]): ParsedOrder {
  const customer = matchCustomer(originalText, customers)
  const lines = originalText.split(/\r?\n|;/).map((entry) => entry.trim()).filter(Boolean).flatMap((line): ParsedOrderLine[] => {
    if (/^(?:CLIENTE|PARA)\s*[:\-]?/i.test(line)) return []
    const match = matchProduct(line, products)
    const product = match.candidate ? products.find((entry) => entry.id === match.candidate?.productId) : undefined
    const quantity = parseQuantity(line, product?.unidadesPorCaja)
    const warnings: string[] = []
    if (!match.candidate) warnings.push('PRODUCT_UNRESOLVED')
    if (quantity.mode === 'AMBIGUOUS') warnings.push('QUANTITY_AMBIGUOUS')
    return [{ originalText: line, productCandidate: match.candidate, alternatives: match.alternatives, confidence: match.candidate?.confidence ?? 0, quantity, requiresReview: warnings.length > 0, warnings }]
  })
  const warnings = customer.warning ? [customer.warning] : []
  if (!customer.candidate) warnings.push('CUSTOMER_UNRESOLVED')
  if (lines.length === 0) warnings.push('NO_ORDER_LINES_DETECTED')
  return { originalText, customerCandidate: customer.candidate, customerAlternatives: customer.alternatives, customerConfidence: customer.candidate?.confidence ?? 0, lines, requiresReview: warnings.length > 0 || lines.some((line) => line.requiresReview), warnings }
}
