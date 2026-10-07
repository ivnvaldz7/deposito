import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { dashboardKeys } from './use-dashboard'

export interface MaterialEmpaque {
  id: string
  productoId: string
  articulo: string
  cantidad: number
  updatedAt: string
  stockMinimo?: number | null
}

export const materialesEmpaqueKeys = {
  all: ['deposito', 'materiales-empaque'] as const,
  list: () => [...materialesEmpaqueKeys.all, 'list'] as const,
}

export function useMaterialesEmpaque() {
  return useQuery({
    queryKey: materialesEmpaqueKeys.list(),
    queryFn: () => api.get<MaterialEmpaque[]>('/materiales-empaque'),
  })
}

export function useUpdateMaterialEmpaque() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, cantidad }: { id: string; cantidad: number }) => api.patch<MaterialEmpaque>(`/materiales-empaque/${id}`, { cantidad }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: materialesEmpaqueKeys.all })
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
    },
  })
}
