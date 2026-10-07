export function formatCantidad(cantidad: number, categoria: string): string {
  if (categoria === 'droga') {
    // Drug quantities are stored and entered in kilograms.
    // Formatting: 25 -> '25 kg', 1.25 -> '1.250 kg', 0.4 -> '0.400 kg'
    const strKilos = Number.isInteger(cantidad) ? cantidad.toString() : cantidad.toFixed(3)
    return `${strKilos} kg`
  }
  return `${cantidad} uds`
}

export function formatUnit(categoria: string): string {
  return categoria === 'droga' ? 'kg' : 'uds'
}
