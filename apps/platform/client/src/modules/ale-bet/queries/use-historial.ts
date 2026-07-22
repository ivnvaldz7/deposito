import { useQuery } from '@tanstack/react-query'
import { aleBetApi } from '../lib/api'

export const historialKeys = {
  all: ['ale-bet', 'historial'] as const,
  list: (filters?: Record<string, string>) => [...historialKeys.all, 'list', filters] as const,
}

export function useHistorial(filters?: { desde?: string; hasta?: string; estado?: string; clienteId?: string; vendedorId?: string }) {
  return useQuery({
    queryKey: historialKeys.list(filters),
    queryFn: () => aleBetApi.historial.list(filters),
  })
}
