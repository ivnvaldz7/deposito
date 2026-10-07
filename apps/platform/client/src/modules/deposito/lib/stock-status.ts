export type StockStatus = 'sin_configurar' | 'bajo' | 'normal'

export function getStockStatus(cantidad: number, stockMinimo: number | null | undefined): StockStatus {
  if (stockMinimo == null) return 'sin_configurar'
  return cantidad <= stockMinimo ? 'bajo' : 'normal'
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  sin_configurar: 'Sin configurar',
  bajo: 'Stock bajo',
  normal: 'Normal',
}
