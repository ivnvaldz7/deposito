export function StockChip({ cantidad, threshold }: { cantidad: number; threshold: number }) {
  const bajo = cantidad < threshold
  return (
    <span
      className={`inline-block font-body text-xs font-medium px-2 py-0.5 rounded shrink-0 border ${
        bajo
          ? 'border-[#D5B4B5] bg-[#F5ECEC] text-[#A06869]'
          : 'border-transparent bg-[#00AE42]/10 text-[#00AE42]'
      }`}
    >
      {bajo ? 'Stock bajo' : 'Normal'}
    </span>
  )
}
