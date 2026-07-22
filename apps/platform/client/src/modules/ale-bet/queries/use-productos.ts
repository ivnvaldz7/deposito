import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aleBetApi } from '../lib/api'

export const productosKeys = {
  all: ['ale-bet', 'productos'] as const,
  list: () => [...productosKeys.all, 'list'] as const,
  detail: (id: string) => [...productosKeys.all, 'detail', id] as const,
}

export function useProductos() {
  return useQuery({
    queryKey: productosKeys.list(),
    queryFn: () => aleBetApi.productos.list(),
  })
}

export function useCreateProducto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { nombre: string; sku: string; stockMinimo?: number }) =>
      aleBetApi.productos.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

export function useUpdateProducto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; nombre?: string; stockMinimo?: number; activo?: boolean }) =>
      aleBetApi.productos.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

export function useDeleteProducto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => aleBetApi.productos.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

export function useLotes(productoId: string) {
  return useQuery({
    queryKey: [...productosKeys.all, 'lotes', productoId] as const,
    queryFn: () => aleBetApi.productos.lotes.list(productoId),
    enabled: !!productoId,
  })
}

export function useCreateLote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productoId, ...data }: { productoId: string; numero?: string; cajas: number; sueltos: number; fechaProduccion: string }) =>
      aleBetApi.productos.lotes.create(productoId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: productosKeys.all }),
  })
}
