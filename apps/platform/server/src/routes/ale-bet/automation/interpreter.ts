import { descomponerUnidades } from '../constants'
import type { CustomerAlternative, MatchCustomer, MatchProduct, ParsedOrder, ParsedOrderLine, ParsedQuantity, ProductAlternative, QuantityMode } from './contracts'

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
  const inputStr = normalizeForMatch(input)
  const candidateStr = normalizeForMatch(candidate)
  const inputTokens = new Set(tokens(inputStr))
  const candidateTokens = new Set(tokens(candidateStr))
  const inputNumbers = [...inputTokens].filter((token) => /^\d+$/.test(token))
  const candidateNumbers = [...candidateTokens].filter((token) => /^\d+$/.test(token))
  if (inputNumbers.some((number) => !candidateNumbers.includes(number))) return true
  
  const strongTokens = ['B12', 'B15', 'B25', 'PLUS', '1L', '1 L']
  for (const token of strongTokens) {
    const hasInInput = inputStr.includes(token)
    const hasInCandidate = candidateStr.includes(token)
    if (hasInInput !== hasInCandidate) return true
  }

  return false
}

function scoreMatch(input: string, candidate: string): number {
  const normalizedInput = normalizeForMatch(input)
  const normalizedCandidate = normalizeForMatch(candidate)
  const inputNumbers = tokens(normalizedInput).filter((token) => /^\d+$/.test(token))
  const candidateNumbers = tokens(normalizedCandidate).filter((token) => /^\d+$/.test(token))
  
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

export function extractQuantityAndProduct(line: string): { originalExpression: string; explicitBoxes: number | null; explicitUnits: number | null; mode: QuantityMode; productText: string } {
  let productText = line
  let explicitBoxes: number | null = null
  let explicitUnits: number | null = null
  let mode: QuantityMode = 'AMBIGUOUS'

  const normalized = normalizeForMatch(line)
  
  // Extraer cajas
  const boxesMatch = normalized.match(/^(\d+)\s*CAJAS?\b/)
  if (boxesMatch) {
    explicitBoxes = Number(boxesMatch[1])
    productText = productText.replace(new RegExp(`^\\s*${boxesMatch[1]}\\s*cajas?\\b`, 'i'), '').trim()
    mode = 'BOXES'
    
    // Buscar unidades adicionales
    const extraUnitsMatch = normalizeForMatch(productText).match(/^(?:Y|MAS|MÁS)\s*(\d+)\s*(?:UNIDADES?|SUELTOS?)?\b/)
    if (extraUnitsMatch) {
      explicitUnits = Number(extraUnitsMatch[1])
      productText = productText.replace(new RegExp(`^(?:y|mas|más)\\s*${extraUnitsMatch[1]}\\s*(?:unidades?|sueltos?)?\\b`, 'i'), '').trim()
      mode = 'MIXED'
    }
  } else {
    // Si empieza con un número y NO son cajas, son unidades
    const unitsMatch = normalized.match(/^(\d+)\s+(?!CAJAS?\b)/)
    if (unitsMatch) {
      explicitUnits = Number(unitsMatch[1])
      // Only remove the number if we are sure it's quantity.
      // E.g., "12 cetri 1lt" -> "12" is units, "cetri 1lt" is product.
      productText = productText.replace(new RegExp(`^\\s*${unitsMatch[1]}\\s+`), '').trim()
      mode = 'UNITS'
    } else {
      // Buscar X unidades al final
      const xUnitsMatch = normalized.match(/\bX\s*(\d+)\b/)
      if (xUnitsMatch) {
        explicitUnits = Number(xUnitsMatch[1])
        productText = productText.replace(new RegExp(`\\bx\\s*${xUnitsMatch[1]}\\b`, 'i'), '').trim()
        mode = 'UNITS'
      }
    }
  }

  // Si no se encontró cantidad explícita pero hay un número al inicio
  if (explicitBoxes === null && explicitUnits === null) {
      const startNumMatch = line.match(/^\s*(\d+)\s+/)
      if (startNumMatch) {
          explicitUnits = Number(startNumMatch[1])
          productText = productText.replace(new RegExp(`^\\s*${startNumMatch[1]}\\s+`), '').trim()
          mode = 'UNITS'
      }
  }

  return { originalExpression: line, explicitBoxes, explicitUnits, mode: (explicitBoxes === null && explicitUnits === null) ? 'AMBIGUOUS' : mode, productText }
}

function matchProduct(productText: string, products: MatchProduct[]): { candidate: ProductAlternative | null; alternatives: ProductAlternative[] } {
  const phrase = normalizeForMatch(productText)
  const hits = products.flatMap((product) => {
    let score = 0
    if (phrase === normalizeForMatch(product.nombre)) score = 1
    else if (product.aliases?.some(alias => phrase === normalizeForMatch(alias))) score = 0.98
    else if (hasStrongMismatch(phrase, product.nombre)) score = 0
    else score = Math.max(scoreMatch(phrase, product.nombre), scoreMatch(phrase, product.sku))
    return score > 0 ? [{ productId: product.id, nombre: product.nombre, confidence: score }] : []
  }).sort((left, right) => right.confidence - left.confidence || left.nombre.localeCompare(right.nombre))
  const certain = hits[0] && (hits.length === 1 || hits[0].confidence > hits[1].confidence) && hits[0].confidence >= 0.93
  return { candidate: certain ? hits[0] : null, alternatives: hits.slice(0, 5) }
}

export function extractClientCandidateLine(originalText: string): string | null {
    const lines = originalText.split(/\r?\n|;/).map((entry) => entry.trim()).filter(Boolean)
    if (lines.length === 0) return null
    const explicitMention = lines.find(line => /^(?:CLIENTE|PARA)\s*[:\-]?\s*([^\n]+)/i.test(line))
    if (explicitMention) {
        return explicitMention.replace(/^(?:CLIENTE|PARA)\s*[:\-]?\s*/i, '').trim()
    }
    // Asumir que la primera línea puede ser cliente si no tiene números de cantidad obvios
    const firstLine = lines[0]
    if (firstLine && /^\s*\d+\s+/.test(firstLine)) return null
    return firstLine
}

function matchCustomer(text: string, customers: MatchCustomer[]): { candidate: CustomerAlternative | null; alternatives: CustomerAlternative[]; warning?: string; candidateText: string } {
    let candidateText = extractClientCandidateLine(text) || ''
    
    // Intentar matching de todas las menciones explícitas primero
    const explicitMentions = [...text.matchAll(/(?:^|\n)\s*(?:CLIENTE|PARA)\s*[:\-]?\s*([^\n]+)/gi)].map((match) => match[1].trim()).filter(Boolean)
    const textsToMatch = explicitMentions.length > 0 ? explicitMentions : [candidateText].filter(Boolean)

    const alternatives = textsToMatch.flatMap((mention) => customers.flatMap((customer) => {
        let score = 0
        const normMention = normalizeForMatch(mention)
        if (normMention === normalizeForMatch(customer.nombre)) score = 1
        else if (customer.aliases?.some(alias => normMention === normalizeForMatch(alias))) score = 0.98
        else score = scoreMatch(mention, customer.nombre)
        return score >= 0.93 ? [{ customerId: customer.id, nombre: customer.nombre, confidence: score }] : []
    })).sort((left, right) => right.confidence - left.confidence || left.nombre.localeCompare(right.nombre))
    
    const unique = [...new Map(alternatives.map((alternative) => [alternative.customerId, alternative])).values()]
    return { candidate: unique.length === 1 ? unique[0] : null, alternatives: unique.slice(0, 5), warning: new Set(textsToMatch.map(normalizeForMatch)).size > 1 ? 'MULTIPLE_CUSTOMERS_DETECTED' : undefined, candidateText }
}

export function interpretOrder(originalText: string, products: MatchProduct[], customers: MatchCustomer[]): ParsedOrder {
  const customerMatch = matchCustomer(originalText, customers)
  const lines = originalText.split(/\r?\n|;/).map((entry) => entry.trim()).filter(Boolean)
  
  const orderLines = lines.flatMap((line, index): ParsedOrderLine[] => {
    if (/^(?:CLIENTE|PARA)\s*[:\-]?/i.test(line)) return []
    
    const parsedLine = extractQuantityAndProduct(line)
    const match = matchProduct(parsedLine.productText, products)
    
    // Si es la primera línea, evaluamos si debemos omitirla por ser cliente
    if (index === 0 && customerMatch.candidateText === line) {
        if (customerMatch.candidate !== null) return [] // Definitivamente cliente
        // Si no hizo match con un cliente, pero hace match fuerte con un producto o tiene cantidad explícita clara, NO la omitimos
        if (match.candidate !== null || parsedLine.explicitBoxes !== null || parsedLine.explicitUnits !== null) {
            // Es un producto
        } else {
            // No tiene cantidad, no hizo match con producto... asumimos que era un intento de cliente fallido
            return []
        }
    }
    
    const product = match.candidate ? products.find((entry) => entry.id === match.candidate?.productId) : undefined
    
    let totalUnits: number | null = null
    if (parsedLine.mode !== 'AMBIGUOUS' && product?.unidadesPorCaja) totalUnits = (parsedLine.explicitBoxes ?? 0) * product.unidadesPorCaja + (parsedLine.explicitUnits ?? 0)
    const normalizedQuantity = totalUnits === null || !product?.unidadesPorCaja ? null : descomponerUnidades(totalUnits, product.unidadesPorCaja)
    
    const quantity: ParsedQuantity = {
        ...parsedLine,
        totalUnits,
        normalizedBoxes: normalizedQuantity?.cajas ?? null,
        normalizedLooseUnits: normalizedQuantity?.sueltos ?? null
    }

    const warnings: string[] = []
    if (!match.candidate) warnings.push('PRODUCT_UNRESOLVED')
    if (quantity.mode === 'AMBIGUOUS') warnings.push('QUANTITY_AMBIGUOUS')
    return [{ originalText: line, productCandidate: match.candidate, alternatives: match.alternatives, confidence: match.candidate?.confidence ?? 0, quantity, requiresReview: warnings.length > 0, warnings }]
  })
  const warnings = customerMatch.warning ? [customerMatch.warning] : []
  if (!customerMatch.candidate) warnings.push('CUSTOMER_UNRESOLVED')
  if (orderLines.length === 0) warnings.push('NO_ORDER_LINES_DETECTED')
  return { originalText, customerCandidate: customerMatch.candidate, customerCandidateText: customerMatch.candidateText, customerAlternatives: customerMatch.alternatives, customerConfidence: customerMatch.candidate?.confidence ?? 0, lines: orderLines, requiresReview: warnings.length > 0 || orderLines.some((line) => line.requiresReview), warnings }
}
