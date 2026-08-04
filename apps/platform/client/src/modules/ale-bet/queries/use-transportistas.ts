import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aleBetApi } from '../lib/api'
import type { TransportistaInput, TransportistaUpdateInput } from '../lib/api'

export const transportistasKeys = {
  all: ['ale-bet', 'transportistas'] as const,
  list: () => [...transportistasKeys.all, 'list'] as const,
}

export function useTransportistas(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: transportistasKeys.list(),
    queryFn: () => aleBetApi.transportistas.list(),
    enabled: options?.enabled ?? true,
    placeholderData: (prev) => prev,
  })
}

export function useCreateTransportista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TransportistaInput) => aleBetApi.transportistas.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: transportistasKeys.all }),
  })
}

export function useUpdateTransportista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & TransportistaUpdateInput) =>
      aleBetApi.transportistas.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: transportistasKeys.all }),
  })
}
