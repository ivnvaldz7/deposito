import { apiClient } from '@/lib/api-client'

export type CategoriaProducto = 'droga' | 'estuche' | 'etiqueta' | 'frasco'

export interface CatalogoProducto {
  id: string
  nombreCompleto: string
  categoria: CategoriaProducto
}

export async function fetchCatalogoProductos(
  categoria: CategoriaProducto
): Promise<CatalogoProducto[]> {
  return apiClient.get<CatalogoProducto[]>(`/productos?categoria=${categoria}`)
}
