import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Mercado } from '../components/inventory-shared/mercados'

export type { Mercado } from '../components/inventory-shared/mercados'

export type Categoria = 'droga' | 'estuche' | 'etiqueta' | 'frasco'
export type EstadoOrden = 'solicitada' | 'aprobada' | 'ejecutada' | 'completada' | 'rechazada'
export interface OrdenProduccion {
  id: string
  categoria: Categoria
  productoId?: string | null
  productoNombre: string
  mercado?: Mercado | null
  cantidad: number
  grupoId?: string | null
  estado: EstadoOrden
  solicitante: { id: string; name: string; role: string }
  aprobador: { id: string; name: string } | null
  motivoRechazo?: string | null
  createdAt: string
}

export type OrdenInput = {
  categoria: Categoria
  productoId: string
  cantidad: number
  mercado?: Mercado
}

export type SolicitudOrdenes = { grupoId: string; ordenes: OrdenProduccion[] }

export const ordenesKeys = {
  all: ['deposito', 'ordenes'] as const,
  list: (filters?: { estado?: string; archivadas?: boolean }) => [...ordenesKeys.all, 'list', filters] as const,
}

export function useOrdenes(filters?: { estado?: string; archivadas?: boolean }) {
  const params = new URLSearchParams()
  if (filters?.estado) params.set('estado', filters.estado)
  if (filters?.archivadas) params.set('archivadas', 'true')
  const qs = params.toString()
  return useQuery({
    queryKey: ordenesKeys.list(filters),
    queryFn: () => api.get<OrdenProduccion[]>(`/ordenes${qs ? `?${qs}` : ''}`),
  })
}

export function useCreateOrden() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { items: OrdenInput[] }) => api.post<SolicitudOrdenes>('/ordenes', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ordenesKeys.all }),
  })
}

export function useAprobarOrden() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/ordenes/${id}/aprobar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ordenesKeys.all }),
  })
}

export function useRechazarOrden() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo?: string }) =>
      api.put(`/ordenes/${id}/rechazar`, motivo ? { motivoRechazo: motivo } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ordenesKeys.all }),
  })
}
