import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

// Types (copied from DrogasPage — only the ones needed for API responses)
export interface DrogaRecord {
  id: string
  productoId?: string | null
  nombre: string
  lote: string | null
  vencimiento: string | null
  cantidad: number
  updatedAt: string
  stockMinimo?: number | null
  codigo?: string | null
}

interface CatalogDrugResponse {
  productoId: string
  codigo?: string | null
  nombre: string
  stockMinimo: number | null
  lotes: Array<Omit<DrogaRecord, 'productoId' | 'nombre' | 'stockMinimo' | 'updatedAt'> & { updatedAt?: string; createdAt?: string }>
}

// Query keys
export const drogasKeys = {
  all: ['deposito', 'drogas'] as const,
  list: () => [...drogasKeys.all, 'list'] as const,
}

// Hooks
export function useDrogas() {
  return useQuery({
    queryKey: drogasKeys.list(),
    queryFn: async () => {
      const response = await api.get<DrogaRecord[] | CatalogDrugResponse[]>('/drogas')
      if (response.length === 0 || 'cantidad' in response[0]!) return response as DrogaRecord[]
      return (response as CatalogDrugResponse[]).flatMap((product) => {
        if (product.lotes.length === 0) return [{
          id: `catalog:${product.productoId}`,
          productoId: product.productoId,
          codigo: product.codigo ?? null,
          nombre: product.nombre,
          lote: null,
          vencimiento: null,
          cantidad: 0,
          stockMinimo: product.stockMinimo,
          updatedAt: '',
        }]
        return product.lotes.map((lot) => ({
          ...lot,
          productoId: product.productoId,
          codigo: product.codigo ?? null,
          nombre: product.nombre,
          stockMinimo: product.stockMinimo,
          updatedAt: lot.updatedAt ?? lot.createdAt ?? new Date(0).toISOString(),
        }))
      })
    },
  })
}


