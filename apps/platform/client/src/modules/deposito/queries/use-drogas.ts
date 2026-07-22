import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

export function useCreateDroga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { nombre: string; cantidad: number; lote?: string; vencimiento?: string }) =>
      api.post<DrogaRecord>('/drogas', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: drogasKeys.all }),
  })
}

export function useDeleteDroga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/drogas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: drogasKeys.all }),
  })
}
