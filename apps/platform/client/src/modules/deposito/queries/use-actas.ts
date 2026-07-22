import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Acta, ActaItem, ActaListItem } from '../lib/actas-types'

export const actasKeys = {
  all: ['deposito', 'actas'] as const,
  list: (filters?: Record<string, string>) => [...actasKeys.all, 'list', filters] as const,
  detail: (id: string) => [...actasKeys.all, 'detail', id] as const,
}

export function useActas(filters?: { estado?: string }) {
  const params = new URLSearchParams()
  if (filters?.estado) params.set('estado', filters.estado)
  const qs = params.toString()
  return useQuery({
    queryKey: actasKeys.list(filters as Record<string, string> | undefined),
    queryFn: () => api.get<ActaListItem[]>(`/actas${qs ? `?${qs}` : ''}`),
  })
}

export function useActa(id: string) {
  return useQuery({
    queryKey: actasKeys.detail(id),
    queryFn: () => api.get<Acta>(`/actas/${id}`),
    enabled: !!id,
  })
}

export function useCreateActa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { fecha: string; notas?: string }) =>
      api.post<Acta>('/actas', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: actasKeys.all }),
  })
}

export function useAddActaItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ actaId, ...data }: { actaId: string } & Record<string, unknown>) =>
      api.post<ActaItem>(`/actas/${actaId}/items`, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: actasKeys.detail(variables.actaId) })
      qc.invalidateQueries({ queryKey: actasKeys.all })
    },
  })
}

export function useDistribuirItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ actaId, itemId, ...data }: { actaId: string; itemId: string } & Record<string, unknown>) =>
      api.post<{ item: ActaItem }>(`/actas/${actaId}/items/${itemId}/distribuir`, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: actasKeys.detail(variables.actaId) })
      qc.invalidateQueries({ queryKey: actasKeys.all })
    },
  })
}

export function useAprobarCalidad() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ actaId, itemId }: { actaId: string; itemId: string }) =>
      api.put<ActaItem>(`/actas/${actaId}/items/${itemId}/aprobar-calidad`),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: actasKeys.detail(variables.actaId) })
      qc.invalidateQueries({ queryKey: actasKeys.all })
    },
  })
}
