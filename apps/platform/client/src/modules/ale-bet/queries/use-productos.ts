import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aleBetApi, getHistorialLotes } from '../lib/api'
import { dashboardKeys } from './use-dashboard'
import { stockKeys } from './use-stock'
import { sortProductsByNaturalPresentation } from '@/lib/natural-product-order'

export const productosKeys = {
  all: ['ale-bet', 'productos'] as const,
  list: () => [...productosKeys.all, 'list'] as const,
  detail: (id: string) => [...productosKeys.all, 'detail', id] as const,
}

export function useProductos() {
  return useQuery({
    queryKey: productosKeys.list(),
    queryFn: async () => {
      const productos = await aleBetApi.productos.list()
      return sortProductsByNaturalPresentation(productos, (producto) => producto.nombre)
    },
  })
}

export function useProductosSearch(q: string) {
  return useQuery({
    queryKey: [...productosKeys.all, 'search', q] as const,
    queryFn: async () => {
      const productos = await aleBetApi.productos.search(q)
      return sortProductsByNaturalPresentation(productos, (producto) => producto.nombre)
    },
    enabled: q.trim().length > 0,
    placeholderData: (prev) => prev,
  })
}

export function useCreateProducto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { nombre: string; sku: string; stockMinimo?: number; unidadesPorCaja: number }) =>
      aleBetApi.productos.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productosKeys.all })
      qc.invalidateQueries({ queryKey: stockKeys.all })
      qc.invalidateQueries({ queryKey: dashboardKeys.all })
    },
  })
}

export function useUpdateProducto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; nombre?: string; stockMinimo?: number | null; unidadesPorCaja?: number; activo?: boolean }) =>
      aleBetApi.productos.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productosKeys.all })
      qc.invalidateQueries({ queryKey: stockKeys.all })
      qc.invalidateQueries({ queryKey: dashboardKeys.all })
    },
  })
}

export function useDeleteProducto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => aleBetApi.productos.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productosKeys.all })
      qc.invalidateQueries({ queryKey: stockKeys.all })
      qc.invalidateQueries({ queryKey: dashboardKeys.all })
    },
  })
}

export function useLotes(productoId: string) {
  return useQuery({
    queryKey: [...productosKeys.all, 'lotes', productoId] as const,
    queryFn: () => aleBetApi.productos.lotes.list(productoId),
    enabled: !!productoId,
  })
}

export function useCreateLote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productoId, ...data }: { productoId: string; numero?: string; cajas: number; sueltos: number; fechaProduccion: string }) =>
      aleBetApi.productos.lotes.create(productoId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

export function useUpdateLote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productoId, loteId, ...data }: { productoId: string; loteId: string; cajas?: number; sueltos?: number; activo?: boolean }) =>
      aleBetApi.productos.lotes.update(productoId, loteId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

// ─── Admin Stock ─────────────────────────────────────────────────────────────

export function useProductoAdminStock(productoId: string, options?: { includeArchived?: boolean }) {
  const includeArchived = options?.includeArchived ?? false
  return useQuery({
    queryKey: [...productosKeys.all, 'admin-stock', productoId, { includeArchived }] as const,
    queryFn: () => aleBetApi.productos.stock.get(productoId, { includeArchived }),
    enabled: !!productoId,
  })
}

export function useProductTransferRules(productoId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...productosKeys.all, 'transfer-rules', productoId] as const,
    queryFn: () => aleBetApi.stock.transferRules(productoId),
    enabled: enabled && !!productoId,
  })
}

export function useCreateAdminLote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productoId, idempotencyKey, ...data }: { productoId: string; numero: string; cantidadInicial?: number; fechaProduccion?: string | null; fechaVencimiento?: string | null; idempotencyKey?: string }) =>
      aleBetApi.productos.stock.lotes.create(productoId, data, { idempotencyKey }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: [...productosKeys.all, 'admin-stock', variables.productoId] })
      qc.invalidateQueries({ queryKey: productosKeys.list() })
      qc.invalidateQueries({ queryKey: stockKeys.all })
      qc.invalidateQueries({ queryKey: dashboardKeys.all })
    },
  })
}

export function useAjusteAdminStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productoId, loteId, ubicacionId, cantidadFinal, motivo, idempotencyKey }: { productoId: string; loteId: string; ubicacionId: string; cantidadFinal: number; motivo?: string; idempotencyKey: string }) =>
      aleBetApi.productos.stock.lotes.ajuste(productoId, loteId, { ubicacionId, cantidadFinal, motivo }, { idempotencyKey }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [...productosKeys.all, 'admin-stock', variables.productoId] }),
        qc.invalidateQueries({ queryKey: productosKeys.list() }),
        qc.invalidateQueries({ queryKey: stockKeys.all }),
        qc.invalidateQueries({ queryKey: dashboardKeys.all }),
      ])
    },
  })
}

export function useIngresarAdminStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productoId, loteId, ubicacionId, cantidad, motivo, fechaEfectiva, idempotencyKey }: { productoId: string; loteId: string; ubicacionId: string; cantidad: number; motivo?: string; fechaEfectiva?: string; idempotencyKey: string }) =>
      aleBetApi.productos.stock.lotes.ingreso(productoId, loteId, { ubicacionId, cantidad, motivo, fechaEfectiva }, { idempotencyKey }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [...productosKeys.all, 'admin-stock', variables.productoId] }),
        qc.invalidateQueries({ queryKey: productosKeys.list() }),
        qc.invalidateQueries({ queryKey: stockKeys.all }),
        qc.invalidateQueries({ queryKey: dashboardKeys.all }),
      ])
    },
  })
}

export function useTransferirStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { productoId: string; loteId: string; origen: 'DEPOSITO' | 'ACONDICIONADO'; destino: 'DEPOSITO' | 'ACONDICIONADO'; cantidad: number; transferRuleId?: string; idempotencyKey: string }) => {
      const { idempotencyKey, ...payload } = data
      return aleBetApi.stock.transferir(payload, { idempotencyKey })
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [...productosKeys.all, 'admin-stock', variables.productoId] }),
        ...(variables.transferRuleId ? [qc.invalidateQueries({ queryKey: [...productosKeys.all, 'admin-stock'] })] : []),
        qc.invalidateQueries({ queryKey: productosKeys.list() }),
        qc.invalidateQueries({ queryKey: stockKeys.all }),
        qc.invalidateQueries({ queryKey: dashboardKeys.all }),
      ])
    },
  })
}

export function useLotesHistorial(productoId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...productosKeys.all, 'lotes', productoId, 'historial'] as const,
    queryFn: () => getHistorialLotes(productoId),
    enabled: !!productoId && enabled,
  })
}

