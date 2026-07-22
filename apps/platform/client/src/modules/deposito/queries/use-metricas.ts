import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface MetricasData {
  metrics: Record<string, number>
  topProducts?: Array<{ nombre: string; cantidad: number }>
}

export const metricasKeys = {
  all: ['deposito', 'metricas'] as const,
  data: (filters?: Record<string, string>) => [...metricasKeys.all, 'data', filters] as const,
  productos: () => [...metricasKeys.all, 'productos'] as const,
}

export function useMetricas(filters?: { desde?: string; hasta?: string; categoria?: string; producto?: string }) {
  const params = new URLSearchParams()
  if (filters?.desde) params.set('desde', filters.desde)
  if (filters?.hasta) params.set('hasta', filters.hasta)
  if (filters?.categoria) params.set('categoria', filters.categoria)
  if (filters?.producto) params.set('producto', filters.producto)
  const qs = params.toString()
  return useQuery({
    queryKey: metricasKeys.data(filters),
    queryFn: () => api.get<MetricasData>(`/metricas${qs ? `?${qs}` : ''}`),
  })
}

export function useProductosCatalogo() {
  return useQuery({
    queryKey: metricasKeys.productos(),
    queryFn: () => api.get<string[]>('/metricas/productos'),
  })
}
