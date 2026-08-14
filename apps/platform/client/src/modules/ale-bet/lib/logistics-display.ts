const TECHNICAL_LOGISTICS_SKU = /^LOG-[A-F0-9]{16}$/i

export function isTechnicalLogisticsSku(sku: string): boolean {
  return TECHNICAL_LOGISTICS_SKU.test(sku)
}

export function displayBusinessSku(sku: string): string {
  return isTechnicalLogisticsSku(sku) ? '—' : sku
}

export function matchesFunctionalProductSearch(product: { nombre: string; sku: string }, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('es-AR')
  if (!normalized) return true
  return product.nombre.toLocaleLowerCase('es-AR').includes(normalized)
    || (!isTechnicalLogisticsSku(product.sku) && product.sku.toLocaleLowerCase('es-AR').includes(normalized))
}

export function formatOptionalDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '—'
}
