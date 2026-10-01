import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { aleBetApi } from '../lib/api'

export const remitoConfiguracionKeys = {
  all: ['ale-bet', 'remito-configuracion'] as const,
}

export function useRemitoConfiguracion(enabled = true) {
  return useQuery({ queryKey: remitoConfiguracionKeys.all, queryFn: () => aleBetApi.remitos.configuracion(), enabled })
}

export function useActualizarRemitoConfiguracion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { proximoCorrelativo?: number; cai?: string; caiVencimiento?: string }) => aleBetApi.remitos.actualizarConfiguracion(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: remitoConfiguracionKeys.all }),
  })
}
