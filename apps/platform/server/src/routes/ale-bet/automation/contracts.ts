export type QuantityMode = 'BOXES' | 'UNITS' | 'MIXED' | 'AMBIGUOUS'
export type InterpretationLineState = 'VALID' | 'NEEDS_REVIEW' | 'DISCARDED'

export type ProductAlternative = { productId: string; nombre: string; confidence: number }
export type CustomerAlternative = { customerId: string; nombre: string; confidence: number }

export type ParsedQuantity = {
  originalExpression: string
  mode: QuantityMode
  explicitBoxes: number | null
  explicitUnits: number | null
  totalUnits: number | null
  normalizedBoxes: number | null
  normalizedLooseUnits: number | null
}

export type ParsedOrderLine = {
  /** Stable identity within a draft. It survives partial corrections. */
  lineId?: string
  originalText: string
  productCandidate: ProductAlternative | null
  alternatives: ProductAlternative[]
  confidence: number
  quantity: ParsedQuantity
  requiresReview: boolean
  warnings: string[]
  /** Destination explicitly chosen for a configurable presentation. */
  presentationTargetProductId?: string
  /** A user decision within the interpretation draft. Persisted only there. */
  lineState?: InterpretationLineState
  /** Preserved only while discarded so undo can restore the original review state. */
  discardedWarnings?: string[]
  discardedRequiresReview?: boolean
}

export type ParsedOrder = {
  originalText: string
  customerCandidate: CustomerAlternative | null
  customerCandidateText?: string
  customerAlternatives: CustomerAlternative[]
  customerConfidence: number
  lines: ParsedOrderLine[]
  requiresReview: boolean
  warnings: string[]
}

export type MatchProduct = { id: string; nombre: string; sku: string; unidadesPorCaja: number; aliases: string[] }
export type MatchCustomer = { id: string; nombre: string; aliases: string[] }
