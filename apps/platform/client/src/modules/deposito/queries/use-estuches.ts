import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface Estuche {
  id: string
  productoId?: string | null
  articulo: string
  mercado: string
  cantidad: number
  updatedAt: string
}

export const estuchesKeys = {
  all: ['deposito', 'estuches'] as const,
  list: () => [...estuchesKeys.all, 'list'] as const,
}

export function useEstuches() {
  return useQuery({
    queryKey: estuchesKeys.list(),
    queryFn: () => api.get<Estuche[]>('/estuches'),
  })
}

export function useCreateEstuche() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { articulo: string; mercado: string; cantidad: number }) =>
      api.post<Estuche>('/estuches', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: estuchesKeys.all }),
  })
}

export function useUpdateEstuche() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<{ articulo: string; cantidad: number }>) =>
      api.put<Estuche>(`/estuches/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: estuchesKeys.all }),
  })
}

export function useDeleteEstuche() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/estuches/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: estuchesKeys.all }),
  })
}
