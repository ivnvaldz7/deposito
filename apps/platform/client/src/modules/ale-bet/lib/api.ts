import { apiClient } from '@/lib/api-client'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Producto {
  id: string
  nombre: string
  sku: string
  stockMinimo: number
  activo: boolean
  stock: number
  stockBajo: boolean
  lotes?: Lote[]
}

export interface Lote {
  id: string
  numero: string
  cajas: number
  sueltos: number
  fechaProduccion: string
  fechaVencimiento: string
  activo: boolean
  unidades: number
}

export interface Cliente {
  id: string
  nombre: string
  contacto: string | null
  direccion: string | null
  activo: boolean
}

export interface MovimientoStock {
  id: string
  productoId: string
  cantidad: number
  tipo: 'ENTRADA_MANUAL' | 'SALIDA_PEDIDO' | 'AJUSTE'
  referencia: string | null
  usuarioId: string
  createdAt: string
}

export interface StockOverview {
  productos: Producto[]
  movimientos: MovimientoStock[]
}

export interface PedidoItem {
  id: string
  productoId: string
  cantidad: number
  completado: boolean
  producto: { id: string; nombre: string; sku: string }
}

export interface Pedido {
  id: string
  numero: string
  clienteId: string
  vendedorId: string
  armadorId: string | null
  estado: 'PENDIENTE' | 'APROBADO' | 'EN_ARMADO' | 'COMPLETADO' | 'CANCELADO'
  createdAt: string
  updatedAt: string
  cliente: Cliente
  items: PedidoItem[]
  vendedorNombre?: string
  armadorNombre?: string | null
}

export interface DashboardPedidoReciente {
  id: string
  numero: string
  estado: Pedido['estado']
  clienteNombre: string
  vendedorNombre: string
  armadorNombre: string | null
  cantidadItems: number
  createdAt: string
}

export interface DashboardOverview {
  stockCritico: number
  pedidosHoy: number
  enArmado: number
  totalProductos: number
  pedidosRecientes: DashboardPedidoReciente[]
}

export interface HistorialPedidoItem {
  productoNombre: string
  cantidad: number
}

export interface HistorialPedido {
  id: string
  numero: string
  estado: Pedido['estado']
  createdAt: string
  clienteNombre: string
  vendedorNombre: string
  armadorNombre: string | null
  items: HistorialPedidoItem[]
}

// ─── API calls ───────────────────────────────────────────────────────────────

const BASE = '/ale-bet'

export const aleBetApi = {
  // Dashboard
  dashboard: () => apiClient.get<DashboardOverview>(`${BASE}/dashboard`),

  // Productos
  productos: {
    list: () => apiClient.get<Producto[]>(`${BASE}/productos`),
    create: (data: { nombre: string; sku: string; stockMinimo?: number }) =>
      apiClient.post<Producto>(`${BASE}/productos`, data),
    update: (id: string, data: { nombre?: string; stockMinimo?: number; activo?: boolean }) =>
      apiClient.put<Producto>(`${BASE}/productos/${id}`, data),
    delete: (id: string) => apiClient.del<void>(`${BASE}/productos/${id}`),
    lotes: {
      list: (id: string) => apiClient.get<Lote[]>(`${BASE}/productos/${id}/lotes`),
      create: (id: string, data: { numero?: string; cajas: number; sueltos: number; fechaProduccion: string }) =>
        apiClient.post<Lote>(`${BASE}/productos/${id}/lotes`, data),
    },
  },

  // Clientes
  clientes: {
    list: () => apiClient.get<Cliente[]>(`${BASE}/clientes`),
    create: (data: { nombre: string; contacto?: string; direccion?: string }) =>
      apiClient.post<Cliente>(`${BASE}/clientes`, data),
    update: (id: string, data: { nombre?: string; contacto?: string | null; direccion?: string | null; activo?: boolean }) =>
      apiClient.put<Cliente>(`${BASE}/clientes/${id}`, data),
  },

  // Pedidos
  pedidos: {
    list: (params?: { estado?: string; vendedorId?: string }) => {
      const searchParams = new URLSearchParams()
      if (params?.estado) searchParams.set('estado', params.estado)
      if (params?.vendedorId) searchParams.set('vendedorId', params.vendedorId)
      const qs = searchParams.toString()
      return apiClient.get<Pedido[]>(`${BASE}/pedidos${qs ? `?${qs}` : ''}`)
    },
    create: (data: { clienteId: string; items: Array<{ productoId: string; cantidad: number }> }) =>
      apiClient.post<Pedido>(`${BASE}/pedidos`, data),
    aprobar: (id: string) => apiClient.put<Pedido>(`${BASE}/pedidos/${id}/aprobar`),
    tomar: (id: string) => apiClient.put<Pedido>(`${BASE}/pedidos/${id}/tomar`),
    completarItem: (pedidoId: string, itemId: string) =>
      apiClient.put<Pedido>(`${BASE}/pedidos/${pedidoId}/items/${itemId}/completar`),
    cancelar: (id: string) => apiClient.put<Pedido>(`${BASE}/pedidos/${id}/cancelar`),
  },

  // Stock
  stock: {
    get: () => apiClient.get<StockOverview>(`${BASE}/stock`),
    movimientos: () => apiClient.get<MovimientoStock[]>(`${BASE}/stock/movimientos`),
  },

  // Historial
  historial: {
    list: (params?: { desde?: string; hasta?: string; estado?: string; clienteId?: string; vendedorId?: string }) => {
      const searchParams = new URLSearchParams()
      if (params?.desde) searchParams.set('desde', params.desde)
      if (params?.hasta) searchParams.set('hasta', params.hasta)
      if (params?.estado) searchParams.set('estado', params.estado)
      if (params?.clienteId) searchParams.set('clienteId', params.clienteId)
      if (params?.vendedorId) searchParams.set('vendedorId', params.vendedorId)
      const qs = searchParams.toString()
      return apiClient.get<HistorialPedido[]>(`${BASE}/historial${qs ? `?${qs}` : ''}`)
    },
    exportDownload: () => apiClient.getBlob(`${BASE}/historial/export`),
  },
}
