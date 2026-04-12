export type EstadoActa = 'pendiente' | 'parcial' | 'completada'
export type Categoria = 'droga' | 'estuche' | 'etiqueta' | 'frasco'
export type CondicionEmbalaje = 'bueno' | 'regular' | 'malo'

export type Mercado =
  | 'argentina'
  | 'colombia'
  | 'mexico'
  | 'ecuador'
  | 'bolivia'
  | 'paraguay'
  | 'no_exportable'

export interface ActaItem {
  id: string
  actaId: string
  categoria: Categoria
  productoNombre: string
  lote: string
  vencimiento: string | null
  temperaturaTransporte: string | null
  condicionEmbalaje: CondicionEmbalaje | null
  observacionesCalidad: string | null
  aprobadoCalidad: boolean
  cantidadIngresada: number
  cantidadDistribuida: number
  mercado: Mercado | null
  createdAt: string
}

// Campos reducidos que devuelve el endpoint de lista
export interface ActaItemSummary {
  lote: string
  productoNombre: string
  temperaturaTransporte: string | null
  condicionEmbalaje: CondicionEmbalaje | null
  observacionesCalidad: string | null
  aprobadoCalidad: boolean
}

// Acta tal como la devuelve GET /api/actas (lista)
export interface ActaListItem {
  id: string
  fecha: string
  estado: EstadoActa
  notas: string | null
  createdAt: string
  updatedAt: string
  user: { name: string }
  _count?: { items: number }
  items?: ActaItemSummary[]
}

// Acta con items completos, tal como la devuelve GET /api/actas/:id (detalle)
export interface Acta {
  id: string
  fecha: string
  estado: EstadoActa
  notas: string | null
  createdAt: string
  updatedAt: string
  user: { name: string }
  _count?: { items: number }
  items?: ActaItem[]
}
