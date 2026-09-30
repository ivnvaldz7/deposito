import crypto from 'node:crypto'
import { descomponerUnidades } from '../constants'
import type { CustomerAlternative, MatchCustomer, MatchProduct, ParsedOrder, ParsedOrderLine, ParsedQuantity, ProductAlternative, QuantityMode } from './contracts'

export function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\bX\s*(?=\d+\s*(?:ML|LT|L|LITROS?)\b)/g, '')
    .replace(/(\d+)\s*(ML|LT|L|LITROS?)\b/g, (_match, amount: string, unit: string) => `${amount} ${unit === 'ML' ? 'ML' : 'L'}`)
    .replace(/[.,;:()[\]{}!¿?"'\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function lineId(originalText: string, sourceIndex: number): string {
  const digest = crypto.createHash('sha256').update(`${sourceIndex}\u0000${originalText}`).digest('hex').slice(0, 16)
  return `line-${digest}`
}

function tokens(value: string): string[] { return normalizeForMatch(value).split(' ').filter(Boolean) }
const strongTokens = ['B12', 'B15', 'B25', 'PLUS']

function presentationTokens(value: string): string[] {
  return [...normalizeForMatch(value).matchAll(/\b(\d+)\s+(ML|L)\b/g)].map((match) => `${match[1]} ${match[2]}`)
}

export function presentationMismatch(input: string, candidate: string): string | null {
  const candidatePresentations = new Set(presentationTokens(candidate))
  return presentationTokens(input).find((presentation) => !candidatePresentations.has(presentation)) ?? null
}

export function hasStrongMismatch(input: string, candidate: string): boolean {
  const inputStr = normalizeForMatch(input)
  const candidateStr = normalizeForMatch(candidate)
  const inputTokens = new Set(tokens(inputStr))
  const candidateTokens = new Set(tokens(candidateStr))
  const inputNumbers = [...inputTokens].filter((token) => /^\d+$/.test(token))
  const candidateNumbers = [...candidateTokens].filter((token) => /^\d+$/.test(token))
  if (inputNumbers.some((number) => !candidateNumbers.includes(number))) return true
  if (presentationMismatch(input, candidate)) return true
  
  for (const token of strongTokens) {
    const hasInInput = inputStr.includes(token)
    const hasInCandidate = candidateStr.includes(token)
    if (hasInInput !== hasInCandidate) return true
  }

  return false
}

// Expande tokens fusionados de identidad fuerte, ej. "B12B15" → ["B12","B15"], "B12B25" → ["B12","B25"].
// Esto permite comparar la notación compacta habitual de los vendedores contra los nombres canónicos del catálogo.
function expandFusedTokens(tokenList: string[]): string[] {
  return tokenList.flatMap((token) => {
    const expanded = token.replace(/\b(B12)(B15|B25)\b/g, '$1 $2').split(' ').filter(Boolean)
    return expanded.length > 1 ? expanded : [token]
  })
}

function strongIdentityScore(input: string, candidate: string): number {
  const inputStr = normalizeForMatch(input)
  const candidateStr = normalizeForMatch(candidate)
  const inputStrong = strongTokens.filter((token) => inputStr.includes(token))
  if (inputStrong.length === 0 || inputStrong.some((token) => !candidateStr.includes(token))) return 0
  const inputPresentations = presentationTokens(inputStr)
  // Si el input no tiene sufijo ML explícito pero tiene un número desnudo que coincide
  // exactamente con el número de presentación del candidato, se considera match implícito.
  // Ejemplo: "b12b15 250" vs "COMPLEJO B B12 B15 250 ML" → 250 es la presentación implícita.
  if (inputPresentations.length === 0) {
    const inputNums = tokens(inputStr).filter((t) => /^\d+$/.test(t))
    const candidatePresentationNums = new Set(presentationTokens(candidateStr).map((p) => p.split(' ')[0]))
    if (inputNums.length > 0 && inputNums.every((n) => candidatePresentationNums.has(n))) return 0.94
    return 0.8
  }
  const candidatePresentations = new Set(presentationTokens(candidateStr))
  return inputPresentations.every((presentation) => candidatePresentations.has(presentation)) ? 0.94 : 0
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
  
  // Expandir tokens fusionados (ej. B12B15 → B12 B15) antes de la comparación de subconjunto
  // para que la notación compacta del vendedor matchee con el nombre canónico del catálogo.
  const wanted = expandFusedTokens(
    tokens(inputWithoutMl).filter((token) => !['DE', 'MAS', 'AGREGA', 'AGREGAR'].includes(token))
  )
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
  // También se acepta la forma habitual "Producto - cantidad". Requerimos
  // espacio después del guion para no confundir identificadores como B-12.
  const trailingUnitsMatch = line.match(/\s*[-–—]\s+(\d+)\s*$/)
  
  if (trailingUnitsMatch) {
    explicitUnits = Number(trailingUnitsMatch[1])
    productText = line.slice(0, trailingUnitsMatch.index).trim()
    mode = 'UNITS'
  } else {
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

export function traceProductMatch(productText: string, products: MatchProduct[]) {
  const phrase = normalizeForMatch(productText)
  return products.map((product) => {
    const strongMismatch = hasStrongMismatch(phrase, product.nombre)
    const alias = product.aliases?.find((entry) => phrase === normalizeForMatch(entry)) ?? null
    let score = 0
    if (phrase === normalizeForMatch(product.nombre)) score = 1
    else if (strongMismatch) score = 0
    // Alias data is operator-entered. A historic alias never overrides a
    // presentation or other strong identifier from the canonical product.
    else if (alias) score = 0.98
    else score = Math.max(scoreMatch(phrase, product.nombre), scoreMatch(phrase, product.sku), strongIdentityScore(phrase, product.nombre))
    return { productId: product.id, nombre: product.nombre, score, strongMismatch, alias }
  })
}

function matchProduct(productText: string, products: MatchProduct[]): { candidate: ProductAlternative | null; alternatives: ProductAlternative[] } {
  const hits = traceProductMatch(productText, products)
    .flatMap((entry) => entry.score > 0 ? [{ productId: entry.productId, nombre: entry.nombre, confidence: entry.score }] : [])
    .sort((left, right) => right.confidence - left.confidence || left.nombre.localeCompare(right.nombre))
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
    return [{ lineId: lineId(line, index), originalText: line, productCandidate: match.candidate, alternatives: match.alternatives, confidence: match.candidate?.confidence ?? 0, quantity, requiresReview: warnings.length > 0, warnings }]
  })
  const warnings = customerMatch.warning ? [customerMatch.warning] : []
  if (!customerMatch.candidate) warnings.push('CUSTOMER_UNRESOLVED')
  if (orderLines.length === 0) warnings.push('NO_ORDER_LINES_DETECTED')
  return { originalText, customerCandidate: customerMatch.candidate, customerCandidateText: customerMatch.candidateText, customerAlternatives: customerMatch.alternatives, customerConfidence: customerMatch.candidate?.confidence ?? 0, lines: orderLines, requiresReview: warnings.length > 0 || orderLines.some((line) => line.requiresReview), warnings }
}
