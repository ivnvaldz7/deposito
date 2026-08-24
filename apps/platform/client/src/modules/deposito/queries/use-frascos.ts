import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { fetchCatalogoProductos } from '../lib/catalogo-productos'

export interface Frasco {
  id: string
  productoId?: string | null
  articulo: string
  unidadesPorCaja: number
  cantidadCajas: number
  total: number
  updatedAt: string
  stockMinimo?: number | null
}

export const frascosKeys = {
  all: ['deposito', 'frascos'] as const,
  list: () => [...frascosKeys.all, 'list'] as const,
}

export function useFrascos() {
  return useQuery({
    queryKey: frascosKeys.list(),
    queryFn: async () => {
      const [inventario, catalogo] = await Promise.all([api.get<Frasco[]>('/frascos'), fetchCatalogoProductos('frasco')])
      const existing = new Set(inventario.map((row) => row.productoId))
      return [...inventario, ...catalogo.filter((p) => !existing.has(p.id)).map((p) => ({ id: p.id, productoId: p.id, articulo: p.nombreCompleto, unidadesPorCaja: p.presentacion ?? 1, cantidadCajas: 0, total: 0, updatedAt: new Date().toISOString(), stockMinimo: p.stockMinimo ?? null }))]
    },
  })
}

export function useCreateFrasco() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { articulo: string; unidadesPorCaja: number; cantidadCajas: number }) =>
      api.post<Frasco>('/frascos', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: frascosKeys.all }),
  })
}

export function useUpdateFrasco() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<{ articulo: string; unidadesPorCaja: number; cantidadCajas: number }>) =>
      api.put<Frasco>(`/frascos/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: frascosKeys.all }),
  })
}

export function useDeleteFrasco() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/frascos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: frascosKeys.all }),
  })
}
