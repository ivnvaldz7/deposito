import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface DashboardStats {
  stockTotal: number
  stockBajo: number
  porVencer: number
  movimientosHoy: number
}

export const dashboardKeys = {
  all: ['deposito', 'dashboard'] as const,
  stats: () => [...dashboardKeys.all, 'stats'] as const,
}

export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: () => api.get<DashboardStats>('/dashboard/stats'),
  })
}
