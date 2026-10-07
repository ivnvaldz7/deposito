import { resolveCanonicalProductName } from '../../lib/producto-catalogo'

export function resolveUniqueFrascoCandidate<T extends { articulo: string }>(productName: string, candidates: readonly T[]): T | null {
  const normalized = resolveCanonicalProductName(productName)
  const matches = candidates.filter((candidate) => resolveCanonicalProductName(candidate.articulo) === normalized)
  if (matches.length > 1) throw new Error('HTTP_409: Más de un frasco coincide; indique productoId')
  return matches[0] ?? null
}
