import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export type EstadoPendiente = 'en_esterilizacion' | 'recibido'

export interface InsumoPendiente {
  id: string
  categoria: string
  articulo: string
  cantidad: number
  destino: string
  estado: EstadoPendiente
  fechaEnvio: string
  fechaRetornoEstimada: string | null
  fechaRecibido: string | null
  notas: string | null
  observaciones?: string | null
  createdAt: string
  user: { name: string }
}

export interface Frasco {
  id: string
  articulo: string
  unidadesPorCaja: number
  cantidadCajas: number
  total: number
}

export const pendientesKeys = {
  all: ['deposito', 'pendientes'] as const,
  list: () => [...pendientesKeys.all, 'list'] as const,
  frascos: () => [...pendientesKeys.all, 'frascos'] as const,
}

export function usePendientes() {
  return useQuery({
    queryKey: pendientesKeys.list(),
    queryFn: () => api.get<InsumoPendiente[]>('/pendientes'),
  })
}

export function useFrascosDisponibles() {
  return useQuery({
    queryKey: pendientesKeys.frascos(),
    queryFn: () => api.get<Frasco[]>('/pendientes/frascos'),
  })
}

export function useEnviarEsterilizacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { frascoId: string; cantidad: number }) =>
      api.post('/pendientes/enviar', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pendientesKeys.all })
      qc.invalidateQueries({ queryKey: pendientesKeys.frascos() })
    },
  })
}

export function useRecibirEsterilizacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.put(`/pendientes/${id}/recibir`),
    onSuccess: () => qc.invalidateQueries({ queryKey: pendientesKeys.all }),
  })
}
