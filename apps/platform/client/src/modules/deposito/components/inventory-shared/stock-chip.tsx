import { getStockStatus, STOCK_STATUS_LABEL } from '../../lib/stock-status'

export function StockChip({ cantidad, stockMinimo }: { cantidad: number; stockMinimo: number | null | undefined }) {
  const status = getStockStatus(cantidad, stockMinimo)
  const bajo = status === 'bajo'
  return (
    <span
      className={`inline-block font-body text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 border ${
        bajo
          ? 'border-[#d47878]/30 bg-[#d47878]/10 text-[#d47878]'
          : status === 'normal'
            ? 'border-[#78b387]/30 bg-[#78b387]/10 text-[#78b387]'
            : 'border-outline-variant/40 bg-surface-container-high text-on-surface-variant'
      }`}
    >
      {STOCK_STATUS_LABEL[status]}
    </span>
  )
}
