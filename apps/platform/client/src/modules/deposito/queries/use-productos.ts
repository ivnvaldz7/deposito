import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '@/stores/auth-store'
import type { Mercado } from '../components/inventory-shared/mercados'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EstadoProducto = 'PENDIENTE_REVISION' | 'ACTIVO' | 'INACTIVO'
export type CategoriaProducto = 'droga' | 'estuche' | 'etiqueta' | 'frasco'

export interface Producto {
  id: string
  codigo: string | null
  nombreBase: string
  volumen: number | null
  unidad: string | null
  variante: string | null
  categoria: CategoriaProducto
  nombreCompleto: string
  presentacion: number | null
  estado: EstadoProducto
  mercadosHabilitados: Mercado[]
  activo: boolean
  origen: 'MANUAL' | 'IMPORTACION' | 'MIGRACION'
  createdAt: string
  updatedAt: string
}

export interface ProductoFormData {
  nombreBase: string
  nombreCompleto: string
  codigo?: string
  categoria: CategoriaProducto
  presentacion?: number | null
  mercadosHabilitados?: Mercado[]
}

export interface ImportDryRunResult {
  filas: ImportRow[]
  validas: number
  invalidas: number
}

export interface ImportRow {
  fila: number
  valido: boolean
  errores?: Record<string, string[]>
  producto?: ProductoFormData
}

export type ImportConfirmResult = Producto[]

// ─── Query keys ───────────────────────────────────────────────────────────────

export const productosKeys = {
  all: ['deposito', 'productos'] as const,
  list: () => [...productosKeys.all, 'list'] as const,
}

// ─── Hooks: List ──────────────────────────────────────────────────────────────

export function useProductos(filters?: { categoria?: string; estado?: string; buscar?: string }) {
  const params = new URLSearchParams()
  if (filters?.categoria) params.set('categoria', filters.categoria)
  if (filters?.estado) params.set('estado', filters.estado)
  if (filters?.buscar) params.set('buscar', filters.buscar)
  const qs = params.toString()
  return useQuery({
    queryKey: [...productosKeys.list(), filters],
    queryFn: () => api.get<Producto[]>(`/productos${qs ? `?${qs}` : ''}`),
    placeholderData: (prev) => prev,
  })
}

// ─── Hooks: CRUD ──────────────────────────────────────────────────────────────

export function useCreateProducto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ProductoFormData) => api.post<Producto>('/productos', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

export function useUpdateProducto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<ProductoFormData>) =>
      api.patch<Producto>(`/productos/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

export function useDeleteProducto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/productos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

// ─── Hooks: State transitions ────────────────────────────────────────────────

export function useActivarProducto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<Producto>(`/productos/${id}/activar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

export function useReactivarProducto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<Producto>(`/productos/${id}/reactivar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

export function useDesactivarProducto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<Producto>(`/productos/${id}/desactivar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

// ─── Hooks: Import (multipart — uses native fetch) ──────────────────────────

const BASE = '/deposito'

function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function useImportDryRun() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('archivo', file)
      const baseUrl = import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${baseUrl}/api${BASE}/productos/importaciones/dry-run`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeaders() },
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Error en la importación' }))
        throw new Error(body.message ?? body.error ?? 'Error en la importación')
      }
      return res.json() as Promise<ImportDryRunResult>
    },
  })
}

export function useImportConfirmar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('archivo', file)
      const baseUrl = import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${baseUrl}/api${BASE}/productos/importaciones/confirmar`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeaders() },
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Error al confirmar la importación' }))
        throw new Error(body.message ?? body.error ?? 'Error al confirmar la importación')
      }
      return res.json() as Promise<ImportConfirmResult>
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: productosKeys.all }),
  })
}
