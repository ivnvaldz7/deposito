import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface Frasco {
  id: string
  productoId?: string | null
  articulo: string
  unidadesPorCaja: number
  cantidadCajas: number
  total: number
  updatedAt: string
}

export const frascosKeys = {
  all: ['deposito', 'frascos'] as const,
  list: () => [...frascosKeys.all, 'list'] as const,
}

export function useFrascos() {
  return useQuery({
    queryKey: frascosKeys.list(),
    queryFn: () => api.get<Frasco[]>('/frascos'),
  })
}

export function useCreateFrasco() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { articulo: string; unidadesPorCaja: number; cantidadCajas: number }) =>
      api.post<Frasco>('/frascos', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: frascosKeys.all }),
  })
}

export function useUpdateFrasco() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<{ articulo: string; unidadesPorCaja: number; cantidadCajas: number }>) =>
      api.put<Frasco>(`/frascos/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: frascosKeys.all }),
  })
}

export function useDeleteFrasco() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/frascos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: frascosKeys.all }),
  })
}
