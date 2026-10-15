import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export type ZeroxCategoria = 'frasco' | 'tapa'
export type ZeroxTipo = 'ingreso' | 'salida'

export interface ZeroxSaldo {
  productoId: string
  nombre: string
  codigo: string | null
  categoria: ZeroxCategoria
  activo: boolean
  permiteIngreso: boolean
  saldo: number
}

export interface ZeroxMovimiento {
  id: string
  productoId: string
  nombreProducto: string
  tipo: ZeroxTipo
  cantidad: number
  saldoResultante: number
  fechaMovimiento: string
  registradoAt: string
  observacion: string | null
  usuario: { name: string }
}

export interface ZeroxFiltros {
  categoria: ZeroxCategoria
  productoId?: string
  tipo?: ZeroxTipo
  desde?: string
  hasta?: string
  cantidadMin?: string
  cantidadMax?: string
  pagina: number
}

// getRandomValues también funciona en el acceso HTTP por IP de la red local;
// randomUUID no está disponible fuera de contextos seguros.
export function crearClaveOperacion(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function zeroxParams(filtros: ZeroxFiltros): string {
  const params = new URLSearchParams()
  Object.entries(filtros).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  })
  return params.toString()
}

const zeroxKeys = { all: ['deposito', 'zerox'] as const }

export function useZeroxSaldos(categoria: ZeroxCategoria) {
  return useQuery({
    queryKey: [...zeroxKeys.all, 'saldos', categoria],
    queryFn: () => api.get<ZeroxSaldo[]>(`/zerox/saldos?categoria=${categoria}`),
  })
}

export function useZeroxMovimientos(filtros: ZeroxFiltros, enabled = true) {
  return useQuery({
    queryKey: [...zeroxKeys.all, 'movimientos', filtros],
    queryFn: () => api.get<{ items: ZeroxMovimiento[]; total: number; pagina: number; paginas: number }>(`/zerox/movimientos?${zeroxParams(filtros)}`),
    placeholderData: (previous) => previous,
    enabled,
  })
}

export function useCrearMovimientoZerox() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { claveOperacion: string; productoId: string; tipo: ZeroxTipo; cantidad: number; fechaMovimiento: string; observacion?: string }) =>
      api.post<ZeroxMovimiento>('/zerox/movimientos', data),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: zeroxKeys.all }),
  })
}
