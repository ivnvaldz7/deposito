import { api } from './api'

export type CategoriaProducto = 'droga' | 'estuche' | 'etiqueta' | 'frasco'

export interface CatalogoProducto {
  id: string
  nombreCompleto: string
  categoria: CategoriaProducto
}

export async function fetchCatalogoProductos(
  categoria: CategoriaProducto
): Promise<CatalogoProducto[]> {
  return api.get<CatalogoProducto[]>(`/productos?categoria=${categoria}`)
}
