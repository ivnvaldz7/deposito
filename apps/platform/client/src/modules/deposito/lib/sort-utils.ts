// Extrae el volumen en ml del nombre de un producto.
// "250 ML" → 250, "1 L" → 1000, "1.5 L" → 1500, sin volumen → 0
function extractVolumeMl(name: string): number {
  const mlMatch = /(\d+(?:\.\d+)?)\s*ML\b/i.exec(name)
  if (mlMatch) return parseFloat(mlMatch[1])
  const lMatch = /(\d+(?:\.\d+)?)\s*L\b/i.exec(name)
  if (lMatch) return parseFloat(lMatch[1]) * 1000
  return 0
}

// Nombre sin el segmento de volumen, para comparación de base.
function baseName(name: string): string {
  return name.replace(/\s*\d+(?:\.\d+)?\s*(?:ML|L)\b/gi, '').trim()
}

// Comparador: primero por nombre base alfabético, luego por volumen numérico.
export function sortByArticulo(a: string, b: string): number {
  const baseComp = baseName(a).localeCompare(baseName(b))
  if (baseComp !== 0) return baseComp
  return extractVolumeMl(a) - extractVolumeMl(b)
}
