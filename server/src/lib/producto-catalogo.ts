import type { Categoria } from '@prisma/client'

export function normalizeProductName(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ')
}

export const LEGACY_PRODUCT_ALIASES: Record<string, string> = {
  [normalizeProductName('AMANTINA PREMIUM 500 ML NR')]: normalizeProductName('AMANTINA PREMIUM 500 ML'),
}

export function resolveCanonicalProductName(value: string): string {
  const normalized = normalizeProductName(value)
  return LEGACY_PRODUCT_ALIASES[normalized] ?? normalized
}

export function buildProductoLookupKey(categoria: Categoria, nombre: string): string {
  return `${categoria}::${resolveCanonicalProductName(nombre)}`
}
