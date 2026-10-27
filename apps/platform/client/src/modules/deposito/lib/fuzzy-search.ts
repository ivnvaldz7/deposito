import { findApproximateMatches } from '@/lib/approximate-search'

export function findClosestMatches<T>(
  items: T[],
  query: string,
  getSearchableText: (item: T) => string,
): { matches: T[]; isApproximate: boolean } {
  return findApproximateMatches(items, query, getSearchableText)
}
