import { compareProductsByNaturalPresentation } from '@/lib/natural-product-order'

/** Compatibility name retained for the inventory pages. */
export function sortByArticulo(a: string, b: string): number {
  return compareProductsByNaturalPresentation(a, b)
}
