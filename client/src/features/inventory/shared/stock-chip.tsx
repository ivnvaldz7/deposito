interface StockChipProps {
  cantidad: number
  threshold: number
  lowLabel?: string
  normalLabel?: string
}

export function StockChip({
  cantidad,
  threshold,
  lowLabel = 'Stock bajo',
  normalLabel = 'Normal',
}: StockChipProps) {
  const bajo = cantidad < threshold

  return (
    <span
      className="inline-block rounded px-2 py-0.5 font-body text-xs font-medium"
      style={
        bajo
          ? { color: '#FF9800', backgroundColor: 'rgba(255,152,0,0.10)' }
          : { color: '#00AE42', backgroundColor: 'rgba(0,174,66,0.10)' }
      }
    >
      {bajo ? lowLabel : normalLabel}
    </span>
  )
}
