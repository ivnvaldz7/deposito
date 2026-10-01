function normalizedProductName(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

export function suggestedLotPrefix(nombre: string): string {
  const normalized = normalizedProductName(nombre)
  if (normalized.startsWith('OLIVITASAN PLUS')) return 'PL'
  if (normalized.startsWith('OLIVITASAN')) return 'OL'

  const firstWord = normalized.split(/\s+/)[0] ?? ''
  return firstWord.slice(0, 2)
}
