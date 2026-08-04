import { useMutation, useQueryClient } from '@tanstack/react-query'
import { aleBetApi } from '../lib/api'
import type { EmitirRemitoInput, AnularRemitoInput } from '../lib/api'
import { pedidosKeys } from './use-pedidos'

export const remitosKeys = {
  all: ['ale-bet', 'remitos'] as const,
}

export function useEmitirRemito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pedidoId, idempotencyKey, ...data }: { pedidoId: string; idempotencyKey?: string } & EmitirRemitoInput) =>
      aleBetApi.remitos.emitir(pedidoId, data, idempotencyKey ? { idempotencyKey } : undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pedidosKeys.all })
      qc.invalidateQueries({ queryKey: remitosKeys.all })
    },
  })
}

export function useAnularRemito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pedidoId, remitoId, idempotencyKey, ...data }: { pedidoId: string; remitoId: string; idempotencyKey?: string } & AnularRemitoInput) =>
      aleBetApi.remitos.anular(pedidoId, remitoId, data, idempotencyKey ? { idempotencyKey } : undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pedidosKeys.all })
      qc.invalidateQueries({ queryKey: remitosKeys.all })
    },
  })
}

export async function descargarRemitoPdf(pedidoId: string): Promise<void> {
  const blob = await aleBetApi.remitos.pdf(pedidoId)
  const url = window.URL.createObjectURL(blob)
  window.open(url, '_blank')
  window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000)
}
