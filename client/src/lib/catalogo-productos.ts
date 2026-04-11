import { apiClient } from '@/lib/api-client'

export type CategoriaProducto = 'droga' | 'estuche' | 'etiqueta' | 'frasco'

export interface CatalogoProducto {
  id: string
  nombreCompleto: string
  categoria: CategoriaProducto
}

export async function fetchCatalogoProductos(
  categoria: CategoriaProducto,
  token: string | null
): Promise<CatalogoProducto[]> {
  return apiClient.get<CatalogoProducto[]>(`/productos?categoria=${categoria}`, token)
}
