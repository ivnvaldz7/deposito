export function formatCantidad(cantidad: number, categoria: string): string {
  if (categoria === 'droga') {
    const kilos = cantidad / 1000
    // Formatting: 25 -> '25 kg', 1.25 -> '1.250 kg', 0.4 -> '0.400 kg'
    const strKilos = Number.isInteger(kilos) ? kilos.toString() : kilos.toFixed(3)
    return `${strKilos} kg`
  }
  return `${cantidad} uds`
}

export function formatUnit(categoria: string): string {
  return categoria === 'droga' ? 'kg' : 'uds'
}
