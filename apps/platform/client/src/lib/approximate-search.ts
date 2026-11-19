import Fuse from 'fuse.js'

/**
 * Produces a comparison key that is tolerant of the way people type in a
 * search box: accents, punctuation and repeated spaces do not affect it.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('es-AR')
}

function isDirectMatch(text: string, query: string): boolean {
  const normalizedText = normalizeSearchText(text)
  const terms = query.split(' ').filter(Boolean)
  return terms.every((term) => normalizedText.includes(term))
}

function matchesEveryTermApproximately(text: string, query: string): boolean {
  const words = normalizeSearchText(text).split(' ').filter(Boolean)
  return query.split(' ').filter(Boolean).every((term) => {
    if (words.some((word) => word.includes(term))) return true
    if (term.length < 3) return false
    return new Fuse(words, {
      threshold: term.length >= 6 ? 0.4 : 0.3,
      ignoreLocation: true,
      ignoreFieldNorm: true,
      minMatchCharLength: 2,
    }).search(term).length > 0
  })
}

export interface ApproximateMatches<T> {
  matches: T[]
  isApproximate: boolean
}

/**
 * Finds direct token matches first and then typo-tolerant matches. Keeping the
 * exact results in front means a user never loses the obvious result while
 * typing, but can still find a name with an omitted accent or a small typo.
 */
export function findApproximateMatches<T>(
  items: readonly T[],
  query: string,
  getSearchableText: (item: T) => string,
  limit?: number,
): ApproximateMatches<T> {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return { matches: [...items], isApproximate: false }

  const directMatches = items.filter((item) => isDirectMatch(getSearchableText(item), normalizedQuery))
  const directSet = new Set(directMatches)
  const fuzzyMatches = normalizedQuery.length < 3
    ? []
    : items.filter((item) => !directSet.has(item) && matchesEveryTermApproximately(getSearchableText(item), normalizedQuery))

  const matches = [...directMatches, ...fuzzyMatches]
  return {
    matches: limit === undefined ? matches : matches.slice(0, limit),
    isApproximate: fuzzyMatches.length > 0,
  }
}

export function matchesApproximateSearch(text: string, query: string): boolean {
  return findApproximateMatches([text], query, (value) => value).matches.length > 0
}
