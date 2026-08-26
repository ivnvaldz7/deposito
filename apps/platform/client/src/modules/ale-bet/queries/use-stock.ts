import { useQuery } from '@tanstack/react-query'
import { aleBetApi } from '../lib/api'
import { sortProductsByNaturalPresentation } from '@/lib/natural-product-order'

export const stockKeys = {
  all: ['ale-bet', 'stock'] as const,
  overview: () => [...stockKeys.all, 'overview'] as const,
  movimientos: () => [...stockKeys.all, 'movimientos'] as const,
}

export function useStockOverview() {
  return useQuery({
    queryKey: stockKeys.overview(),
    queryFn: async () => {
      const overview = await aleBetApi.stock.get()
      return {
        ...overview,
        productos: sortProductsByNaturalPresentation(overview.productos, (producto) => producto.nombre),
      }
    },
  })
}

export function useStockMovimientos() {
  return useQuery({
    queryKey: stockKeys.movimientos(),
    queryFn: () => aleBetApi.stock.movimientos(),
  })
}
