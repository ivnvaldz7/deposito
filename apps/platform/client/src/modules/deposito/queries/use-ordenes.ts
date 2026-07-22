import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface OrdenProduccion {
  id: string
  categoria: string
  productoId?: string | null
  productoNombre: string
  mercado?: string | null
  cantidad: number
  urgencia: string
  estado: string
  solicitanteId: string
  solicitanteNombre?: string
  aprobadorId?: string | null
  aprobadorNombre?: string
  motivoRechazo?: string | null
  createdAt: string
}

export const ordenesKeys = {
  all: ['deposito', 'ordenes'] as const,
  list: (filters?: Record<string, string>) => [...ordenesKeys.all, 'list', filters] as const,
}

export function useOrdenes(filters?: { estado?: string }) {
  const params = new URLSearchParams()
  if (filters?.estado) params.set('estado', filters.estado)
  const qs = params.toString()
  return useQuery({
    queryKey: ordenesKeys.list(filters),
    queryFn: () => api.get<OrdenProduccion[]>(`/ordenes${qs ? `?${qs}` : ''}`),
  })
}

export function useCreateOrden() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { categoria: string; productoNombre: string; cantidad: number; mercado?: string; urgencia?: string }) =>
      api.post<OrdenProduccion>('/ordenes', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ordenesKeys.all }),
  })
}

export function useAprobarOrden() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.put(`/ordenes/${id}/aprobar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ordenesKeys.all }),
  })
}

export function useRechazarOrden() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api.put(`/ordenes/${id}/rechazar`, { motivoRechazo: motivo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ordenesKeys.all }),
  })
}

export function useEjecutarOrden() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.put(`/ordenes/${id}/ejecutar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ordenesKeys.all }),
  })
}

export function useCompletarOrden() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.put(`/ordenes/${id}/completar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ordenesKeys.all }),
  })
}
