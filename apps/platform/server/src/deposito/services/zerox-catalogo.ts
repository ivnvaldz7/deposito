export type ZeroxCategoria = 'frasco' | 'tapa'

const FRASCOS_ZEROX = new Set([
  'AGROPECUARIO 25 ML', 'AGROPECUARIO 100 ML', 'AGROPECUARIO 500 ML',
  'BLANCO 500 ML', 'DORADO 50 ML', 'DORADO 250 ML', 'DORADO 500 ML',
  'IVERSAN 50 ML', 'TRANSPARENTE 500 ML', 'MARRON 300 ML', 'MARRON 500 ML',
  'PVC 100 ML', 'PVC 200 ML', 'PVC 500 ML', 'VETERINARIO 250 ML',
  'AMBAR 100 ML', 'BIDON 500 ML',
])

function normalizar(nombre: string): string {
  const base = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
  return base === 'PVC 200' ? 'PVC 200 ML' : base
}

export function categoriaZerox(producto: { categoria: string; nombreCompleto: string }): ZeroxCategoria | null {
  const nombre = normalizar(producto.nombreCompleto)
  if (producto.categoria === 'frasco' && FRASCOS_ZEROX.has(nombre)) return 'frasco'
  if (producto.categoria === 'material_empaque' && /\bTAPAS?\b/.test(nombre)) return 'tapa'
  return null
}
