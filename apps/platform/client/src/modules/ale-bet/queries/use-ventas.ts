import { useQuery } from '@tanstack/react-query'
import { aleBetApi } from '../lib/api'

export const ventasKeys = {
  all: ['ale-bet', 'facturacion', 'ventas'] as const,
  list: (params: { clienteId: string; year: number; month?: number }) => [...ventasKeys.all, 'list', params] as const,
}

export function useVentas(params: { clienteId: string; year: number; month?: number }) {
  return useQuery({
    queryKey: ventasKeys.list(params),
    queryFn: () => aleBetApi.facturacion.ventas(params),
    // Never fire a request before a client is selected.
    enabled: Boolean(params.clienteId),
  })
}
