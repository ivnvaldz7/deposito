export type StockStatus = 'sin_configurar' | 'bajo' | 'normal'

export function getStockStatus(cantidad: number, stockMinimo: number | null | undefined): StockStatus {
  if (stockMinimo == null) return 'sin_configurar'
  return cantidad <= stockMinimo ? 'bajo' : 'normal'
}

export function isStockBajo(cantidad: number, stockMinimo: number | null | undefined): boolean {
  return getStockStatus(cantidad, stockMinimo) === 'bajo'
}
