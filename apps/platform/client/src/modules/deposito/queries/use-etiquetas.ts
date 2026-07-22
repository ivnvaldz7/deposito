import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface Etiqueta {
  id: string
  productoId?: string | null
  articulo: string
  mercado: string
  cantidad: number
  updatedAt: string
}

export const etiquetasKeys = {
  all: ['deposito', 'etiquetas'] as const,
  list: () => [...etiquetasKeys.all, 'list'] as const,
}

export function useEtiquetas() {
  return useQuery({
    queryKey: etiquetasKeys.list(),
    queryFn: () => api.get<Etiqueta[]>('/etiquetas'),
  })
}

export function useCreateEtiqueta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { articulo: string; mercado: string; cantidad: number }) =>
      api.post<Etiqueta>('/etiquetas', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: etiquetasKeys.all }),
  })
}

export function useUpdateEtiqueta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<{ articulo: string; cantidad: number }>) =>
      api.put<Etiqueta>(`/etiquetas/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: etiquetasKeys.all }),
  })
}

export function useDeleteEtiqueta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/etiquetas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: etiquetasKeys.all }),
  })
}
