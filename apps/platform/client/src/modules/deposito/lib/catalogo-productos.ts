import { api } from './api'
import type { Mercado } from '../components/inventory-shared/mercados'

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
  return api.get<CatalogoProducto[]>(`/productos?categoria=${categoria}`)
}
