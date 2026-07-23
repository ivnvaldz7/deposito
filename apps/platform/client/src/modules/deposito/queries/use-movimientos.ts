import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface Movimiento {
  id: string
  tipo: string
  categoria: string
  productoNombre: string
  cantidad: number
  referenciaId: string | null
  justificacion: string | null
  user: { name: string }
  createdAt: string
}

export const movimientosKeys = {
  all: ['deposito', 'movimientos'] as const,
  list: (filters?: Record<string, string>) => [...movimientosKeys.all, 'list', filters] as const,
}

export function useMovimientos(filters?: { desde?: string; hasta?: string; categoria?: string }) {
  const params = new URLSearchParams()
  if (filters?.desde) params.set('desde', filters.desde)
  if (filters?.hasta) params.set('hasta', filters.hasta)
  if (filters?.categoria) params.set('categoria', filters.categoria)
  const qs = params.toString()
  return useQuery({
    queryKey: movimientosKeys.list(filters),
    queryFn: () => api.get<Movimiento[]>(`/movimientos${qs ? `?${qs}` : ''}`),
  })
}
