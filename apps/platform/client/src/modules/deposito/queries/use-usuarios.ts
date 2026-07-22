import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export type DepositoUserRole = 'encargado' | 'observador' | 'solicitante'

export interface DepositoUser {
  id: string
  email: string
  name: string
  role: DepositoUserRole
  createdAt: string
}

export const usuariosKeys = {
  all: ['deposito', 'usuarios'] as const,
  list: () => [...usuariosKeys.all, 'list'] as const,
}

export function useUsuarios() {
  return useQuery({
    queryKey: usuariosKeys.list(),
    queryFn: () => api.get<DepositoUser[]>('/users'),
  })
}

export function useCreateUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; email: string; password: string; role: string }) =>
      api.post<{ token: string; user: DepositoUser }>('/auth/register', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: usuariosKeys.all }),
  })
}

export function useUpdateUsuarioRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.put<DepositoUser>(`/users/${id}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usuariosKeys.all }),
  })
}

export function useDeleteUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: usuariosKeys.all }),
  })
}
