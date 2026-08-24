import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Mercado } from '../components/inventory-shared/mercados'
import { fetchCatalogoProductos } from '../lib/catalogo-productos'

export interface Estuche {
  id: string
  productoId?: string | null
  articulo: string
  mercado: Mercado
  cantidad: number
  updatedAt: string
  stockMinimo?: number | null
}

export const estuchesKeys = {
  all: ['deposito', 'estuches'] as const,
  list: () => [...estuchesKeys.all, 'list'] as const,
}

export function useEstuches() {
  return useQuery({
    queryKey: estuchesKeys.list(),
    queryFn: async () => {
      const [inventario, catalogo] = await Promise.all([api.get<Estuche[]>('/estuches'), fetchCatalogoProductos('estuche')])
      const existing = new Set(inventario.map((row) => `${row.productoId}:${row.mercado}`))
      return [...inventario, ...catalogo.flatMap((p) => (p.mercadosHabilitados ?? (p.mercado ? [p.mercado] : [])).filter((mercado) => !existing.has(`${p.id}:${mercado}`)).map((mercado) => ({ id: `${p.id}:${mercado}`, productoId: p.id, articulo: p.nombreCompleto, mercado, cantidad: 0, updatedAt: new Date().toISOString(), stockMinimo: p.stockMinimo ?? null })))]
    },
  })
}

export function useCreateEstuche() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { articulo: string; mercado: Mercado; cantidad: number }) =>
      api.post<Estuche>('/estuches', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: estuchesKeys.all }),
  })
}

export function useUpdateEstuche() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<{ articulo: string; mercado: Mercado; cantidad: number }>) =>
      api.put<Estuche>(`/estuches/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: estuchesKeys.all }),
  })
}

export function useDeleteEstuche() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/estuches/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: estuchesKeys.all }),
  })
}
