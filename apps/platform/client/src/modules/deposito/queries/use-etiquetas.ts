import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Mercado } from '../components/inventory-shared/mercados'
import { fetchCatalogoProductos } from '../lib/catalogo-productos'

export interface Etiqueta {
  id: string
  productoId?: string | null
  articulo: string
  mercado: Mercado
  cantidad: number
  updatedAt: string
  stockMinimo?: number | null
}

export const etiquetasKeys = {
  all: ['deposito', 'etiquetas'] as const,
  list: () => [...etiquetasKeys.all, 'list'] as const,
}

export function useEtiquetas() {
  return useQuery({
    queryKey: etiquetasKeys.list(),
    queryFn: async () => {
      const [inventario, catalogo] = await Promise.all([api.get<Etiqueta[]>('/etiquetas'), fetchCatalogoProductos('etiqueta')])
      const existing = new Set(inventario.map((row) => `${row.productoId}:${row.mercado}`))
      return [...inventario, ...catalogo.flatMap((p) => (p.mercadosHabilitados ?? (p.mercado ? [p.mercado] : [])).filter((mercado) => !existing.has(`${p.id}:${mercado}`)).map((mercado) => ({ id: `${p.id}:${mercado}`, productoId: p.id, articulo: p.nombreCompleto, mercado, cantidad: 0, updatedAt: new Date().toISOString(), stockMinimo: p.stockMinimo ?? null })))]
    },
  })
}

export function useCreateEtiqueta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { articulo: string; mercado: Mercado; cantidad: number }) =>
      api.post<Etiqueta>('/etiquetas', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: etiquetasKeys.all }),
  })
}

export function useUpdateEtiqueta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<{ articulo: string; mercado: Mercado; cantidad: number }>) =>
      api.put<Etiqueta>(`/etiquetas/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: etiquetasKeys.all }),
  })
}

export function useDeleteEtiqueta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/etiquetas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: etiquetasKeys.all }),
  })
}
