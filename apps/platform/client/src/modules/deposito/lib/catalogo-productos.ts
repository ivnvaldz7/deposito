import { api } from './api'
import type { Mercado } from '../components/inventory-shared/mercados'
import { sortProductsByNaturalPresentation } from '@/lib/natural-product-order'

export type CategoriaProducto = 'droga' | 'estuche' | 'etiqueta' | 'frasco'

export interface CatalogoProducto {
  id: string
  nombreCompleto: string
  categoria: CategoriaProducto
  mercadosHabilitados?: Mercado[]
  mercado?: Mercado | null
  presentacion?: number | null
  stockMinimo?: number | null
}

export async function fetchCatalogoProductos(
  categoria: CategoriaProducto
): Promise<CatalogoProducto[]> {
  const productos = await api.get<CatalogoProducto[]>(`/productos?categoria=${categoria}`)
  return sortProductsByNaturalPresentation(productos, (producto) => producto.nombreCompleto)
}
