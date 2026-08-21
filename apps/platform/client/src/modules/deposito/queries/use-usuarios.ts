import { useQuery } from '@tanstack/react-query'
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
