import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aleBetApi } from '../lib/api'
import type { ClienteUpdateInput } from '../lib/api'

export const clientesKeys = {
  all: ['ale-bet', 'clientes'] as const,
  list: () => [...clientesKeys.all, 'list'] as const,
}

export function useClientes() {
  return useQuery({
    queryKey: clientesKeys.list(),
    queryFn: () => aleBetApi.clientes.list(),
  })
}

export function useCreateCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { nombre: string; contacto?: string; referencia?: string; direccion?: string }) =>
      aleBetApi.clientes.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: clientesKeys.all }),
  })
}

export function useUpdateCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & ClienteUpdateInput) =>
      aleBetApi.clientes.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: clientesKeys.all }),
  })
}
