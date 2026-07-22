import { useQuery } from '@tanstack/react-query'
import { aleBetApi } from '../lib/api'

export const stockKeys = {
  all: ['ale-bet', 'stock'] as const,
  overview: () => [...stockKeys.all, 'overview'] as const,
  movimientos: () => [...stockKeys.all, 'movimientos'] as const,
}

export function useStockOverview() {
  return useQuery({
    queryKey: stockKeys.overview(),
    queryFn: () => aleBetApi.stock.get(),
  })
}

export function useStockMovimientos() {
  return useQuery({
    queryKey: stockKeys.movimientos(),
    queryFn: () => aleBetApi.stock.movimientos(),
  })
}
