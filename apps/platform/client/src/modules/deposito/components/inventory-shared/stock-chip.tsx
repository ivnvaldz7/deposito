export function StockChip({ cantidad, threshold }: { cantidad: number; threshold: number }) {
  const bajo = cantidad < threshold
  return (
    <span
      className="inline-block font-body text-xs font-medium px-2 py-0.5 rounded shrink-0"
      style={
        bajo
          ? { color: '#FF9800', backgroundColor: 'rgba(255,152,0,0.10)' }
          : { color: '#00AE42', backgroundColor: 'rgba(0,174,66,0.10)' }
      }
    >
      {bajo ? 'Stock bajo' : 'Normal'}
    </span>
  )
}
