import { useQuery } from '@tanstack/react-query'
import { aleBetApi } from '../lib/api'

export const dashboardKeys = {
  all: ['ale-bet', 'dashboard'] as const,
  overview: () => [...dashboardKeys.all, 'overview'] as const,
}

export function useDashboardOverview() {
  return useQuery({
    queryKey: dashboardKeys.overview(),
    queryFn: () => aleBetApi.dashboard(),
  })
}
