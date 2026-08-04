import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { aleBetApi } from '../lib/api'
import type { Pedido, PedidoEstado, CreatePedidoInput, UpdatePedidoInput } from '../lib/api'

export const pedidosKeys = {
  all: ['ale-bet', 'pedidos'] as const,
  list: (filters?: { estado?: PedidoEstado; vendedorId?: string }) => [...pedidosKeys.all, 'list', filters] as const,
  detail: (id: string) => [...pedidosKeys.all, 'detail', id] as const,
}

function invalidatePedido(qc: QueryClient, pedido: Pick<Pedido, 'id'>) {
  qc.invalidateQueries({ queryKey: pedidosKeys.all })
  qc.invalidateQueries({ queryKey: pedidosKeys.detail(pedido.id) })
}

export function usePedidos(filters?: { estado?: PedidoEstado; vendedorId?: string }) {
  return useQuery({
    queryKey: pedidosKeys.list(filters),
    queryFn: () => aleBetApi.pedidos.list(filters),
    placeholderData: (prev) => prev,
  })
}

export function usePedidoDetalle(id?: string) {
  return useQuery({
    queryKey: pedidosKeys.detail(id ?? ''),
    queryFn: () => aleBetApi.pedidos.get(id ?? ''),
    enabled: Boolean(id),
    placeholderData: (prev) => prev,
  })
}

export function useCreatePedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreatePedidoInput & { idempotencyKey?: string }) =>
      aleBetApi.pedidos.create(
        { clienteId: data.clienteId, items: data.items },
        data.idempotencyKey ? { idempotencyKey: data.idempotencyKey } : undefined,
      ),
    onSuccess: (pedido) => invalidatePedido(qc, pedido),
  })
}

export function useUpdatePedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdatePedidoInput) => aleBetApi.pedidos.update(id, data),
    onSuccess: (pedido) => invalidatePedido(qc, pedido),
  })
}

export function useAprobarPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, expectedVersion, idempotencyKey }: { id: string; expectedVersion: number; idempotencyKey?: string }) =>
      aleBetApi.pedidos.aprobar(id, { expectedVersion }, idempotencyKey ? { idempotencyKey } : undefined),
    onSuccess: (pedido) => invalidatePedido(qc, pedido),
  })
}

export function useTomarPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, expectedVersion, idempotencyKey }: { id: string; expectedVersion: number; idempotencyKey?: string }) =>
      aleBetApi.pedidos.tomar(id, { expectedVersion }, idempotencyKey ? { idempotencyKey } : undefined),
    onSuccess: (pedido) => invalidatePedido(qc, pedido),
  })
}

export function useCompletarItemPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pedidoId, itemId, expectedVersion, idempotencyKey }: { pedidoId: string; itemId: string; expectedVersion: number; idempotencyKey?: string }) =>
      aleBetApi.pedidos.completarItem(pedidoId, itemId, { expectedVersion }, idempotencyKey ? { idempotencyKey } : undefined),
    onSuccess: (pedido) => invalidatePedido(qc, pedido),
  })
}

export function usePrepararPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, expectedVersion, idempotencyKey }: { id: string; expectedVersion: number; idempotencyKey?: string }) =>
      aleBetApi.pedidos.preparar(id, { expectedVersion }, idempotencyKey ? { idempotencyKey } : undefined),
    onSuccess: (pedido) => invalidatePedido(qc, pedido),
  })
}

export function useCancelarPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, expectedVersion, motivo, idempotencyKey }: { id: string; expectedVersion: number; motivo?: string; idempotencyKey?: string }) =>
      aleBetApi.pedidos.cancelar(id, { expectedVersion, motivo }, idempotencyKey ? { idempotencyKey } : undefined),
    onSuccess: ({ pedido }) => invalidatePedido(qc, pedido),
  })
}

export function useConfirmarCancelacionPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, expectedVersion, motivo, idempotencyKey }: { id: string; expectedVersion: number; motivo: string; idempotencyKey?: string }) =>
      aleBetApi.pedidos.confirmarCancelacion(id, { expectedVersion, motivo }, idempotencyKey ? { idempotencyKey } : undefined),
    onSuccess: (pedido) => invalidatePedido(qc, pedido),
  })
}

export function useDespacharPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, expectedVersion, idempotencyKey }: { id: string; expectedVersion: number; idempotencyKey?: string }) =>
      aleBetApi.pedidos.despachar(id, { expectedVersion }, idempotencyKey ? { idempotencyKey } : undefined),
    onSuccess: (pedido) => invalidatePedido(qc, pedido),
  })
}
