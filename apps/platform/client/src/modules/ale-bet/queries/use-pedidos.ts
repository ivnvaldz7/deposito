import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aleBetApi } from '../lib/api'

export const pedidosKeys = {
  all: ['ale-bet', 'pedidos'] as const,
  list: (filters?: Record<string, string>) => [...pedidosKeys.all, 'list', filters] as const,
}

export function usePedidos(filters?: { estado?: string; vendedorId?: string }) {
  return useQuery({
    queryKey: pedidosKeys.list(filters),
    queryFn: () => aleBetApi.pedidos.list(filters),
  })
}

export function useCreatePedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { clienteId: string; items: Array<{ productoId: string; cantidad: number }> }) =>
      aleBetApi.pedidos.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pedidosKeys.all }),
  })
}

export function useAprobarPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => aleBetApi.pedidos.aprobar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: pedidosKeys.all }),
  })
}

export function useTomarPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => aleBetApi.pedidos.tomar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: pedidosKeys.all }),
  })
}

export function useCompletarItemPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pedidoId, itemId }: { pedidoId: string; itemId: string }) =>
      aleBetApi.pedidos.completarItem(pedidoId, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: pedidosKeys.all }),
  })
}

export function useCancelarPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => aleBetApi.pedidos.cancelar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: pedidosKeys.all }),
  })
}
