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
    queryFn: () => api.get<DrogaRecord[]>('/drogas'),
  })
}
