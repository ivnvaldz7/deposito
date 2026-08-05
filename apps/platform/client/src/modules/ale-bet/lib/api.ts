import { apiClient, type ApiRequestOptions } from '@/lib/api-client'

// ─── Types ───────────────────────────────────────────────────────────────────

export type PedidoEstado = 'BORRADOR' | 'APROBADO' | 'EN_ARMADO' | 'PREPARADO' | 'DESPACHADO' | 'CANCELADO'
export type EstadoCliente = 'PENDIENTE_CLIENTE' | 'VALIDADO'
export type EstadoRemito = 'VIGENTE' | 'INVALIDADO'
export type EstadoReserva = 'ACTIVA' | 'LIBERADA' | 'CONSUMIDA'

export interface Producto {
  id: string
  nombre: string
  sku: string
  stockMinimo: number
  unidadesPorCaja: number
  activo: boolean
  stock: number
  fisico: number
  reservado: number
  disponible: number
  stockBajo: boolean
  lotes?: Lote[]
}

export interface ProductoSearchResult {
  id: string
  nombre: string
  sku: string
  unidadesPorCaja: number
  fisico: number
  reservado: number
  disponible: number
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
  unidadesPorCaja: number
}

export interface Cliente {
  id: string
  nombre: string
  contacto: string | null
  referencia: string | null
  direccion: string | null
  localidad: string | null
  provincia: string | null
  cuit: string | null
  condicionIva: string | null
  condicionVenta: string | null
  estado: EstadoCliente
  activo: boolean
  createdAt: string
  updatedAt: string
}

export interface ReservaStock {
  id: string
  pedidoId: string
  itemPedidoId: string | null
  loteId: string
  cantidad: number
  estado: EstadoReserva
  createdAt: string
  releasedAt: string | null
  consumedAt: string | null
}

export interface PedidoItem {
  id: string
  productoId: string
  cantidad: number
  completado: boolean
  producto: { id: string; nombre: string; sku: string; unidadesPorCaja: number }
  reservas?: ReservaStock[]
}

export interface PedidoAuditoria {
  id: string
  pedidoId: string
  actorId: string
  accion: string
  motivo: string | null
  anterior: unknown
  nuevo: unknown
  createdAt: string
}

export interface Pedido {
  id: string
  numero: string
  clienteId: string
  vendedorId: string
  armadorId: string | null
  estado: PedidoEstado
  version: number
  cancelacionSolicitadaAt: string | null
  cancelacionSolicitadaPor: string | null
  motivoCancelacion: string | null
  aprobadoAt: string | null
  preparadoAt: string | null
  despachadoAt: string | null
  canceladoAt: string | null
  createdAt: string
  updatedAt: string
  cliente: Cliente
  items: PedidoItem[]
  remitos?: Remito[]
  reservas?: ReservaStock[]
  auditorias?: PedidoAuditoria[]
  /** Present in list responses only for UI display; the server does not include it in GET /pedidos. */
  vendedorNombre?: string
  armadorNombre?: string | null
}

export interface Transportista {
  id: string
  nombre: string
  direccion: string
  activo: boolean
  createdAt: string
  updatedAt: string
}

export interface RemitoItemSnapshot {
  productoId: string
  nombre: string
  cantidad: number
}

export interface Remito {
  id: string
  pedidoId: string
  numero: string
  fecha: string
  transportistaId: string | null
  transporteNombre: string
  transporteDireccion: string
  clienteSnapshot: Record<string, unknown>
  transporteSnapshot: Record<string, unknown>
  itemsSnapshot: RemitoItemSnapshot[]
  estado: EstadoRemito
  invalidadoAt: string | null
  invalidadoPor: string | null
  motivoInvalidacion: string | null
  createdBy: string
}

export type CancelarPedidoResponse =
  | { discarded: true; requested: false; pedidoId: string }
  | { discarded?: false; requested: boolean; pedido: Pedido }

// ─── Legacy types (dashboard/stock/historial remain misaligned on the server) ─

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

export interface DashboardPedidoReciente {
  id: string
  numero: string
  /** Server still returns legacy states here; keep tolerant. */
  estado: string
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
  /** Server still returns legacy states here; keep tolerant. */
  estado: string
  createdAt: string
  clienteNombre: string
  vendedorNombre: string
  armadorNombre: string | null
  items: HistorialPedidoItem[]
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface PedidoItemInput {
  productoId: string
  cantidad: number
}

export interface CreatePedidoInput {
  clienteId: string
  items: PedidoItemInput[]
}

export interface UpdatePedidoInput {
  clienteId: string
  items: PedidoItemInput[]
  expectedVersion: number
}

export interface ClienteUpdateInput {
  nombre?: string
  contacto?: string | null
  referencia?: string | null
  direccion?: string | null
  localidad?: string | null
  provincia?: string | null
  cuit?: string | null
  condicionIva?: string | null
  condicionVenta?: string | null
  activo?: boolean
  estado?: EstadoCliente
}

export interface TransportistaInput {
  nombre: string
  direccion: string
  activo?: boolean
}

export interface TransportistaUpdateInput {
  nombre?: string
  direccion?: string
  activo?: boolean
}

export interface EmitirRemitoInput {
  expectedVersion: number
  transportistaId?: string
  transporteOcasional?: { nombre: string; direccion: string }
}

export interface AnularRemitoInput {
  motivo: string
}

// ─── API calls ───────────────────────────────────────────────────────────────

const BASE = '/ale-bet'

interface MutationOptions {
  idempotencyKey?: string
}

function mutationOptions(options?: MutationOptions): ApiRequestOptions | undefined {
  return options?.idempotencyKey ? { headers: { 'Idempotency-Key': options.idempotencyKey } } : undefined
}

export const aleBetApi = {
  // Dashboard (legacy, still unaligned on the server)
  dashboard: () => apiClient.get<DashboardOverview>(`${BASE}/dashboard`),

  // Productos
  productos: {
    list: () => apiClient.get<Producto[]>(`${BASE}/productos`),
    search: (q: string) => apiClient.get<ProductoSearchResult[]>(`${BASE}/productos/search?q=${encodeURIComponent(q)}`),
    create: (data: { nombre: string; sku: string; stockMinimo?: number; unidadesPorCaja: number }) =>
      apiClient.post<Producto>(`${BASE}/productos`, data),
    update: (id: string, data: { nombre?: string; stockMinimo?: number; activo?: boolean; unidadesPorCaja?: number }) =>
      apiClient.put<Producto>(`${BASE}/productos/${id}`, data),
    delete: (id: string) => apiClient.del<void>(`${BASE}/productos/${id}`),
    lotes: {
      list: (id: string) => apiClient.get<Lote[]>(`${BASE}/productos/${id}/lotes`),
      create: (id: string, data: { numero?: string; cajas: number; sueltos: number; fechaProduccion: string }) =>
        apiClient.post<Lote>(`${BASE}/productos/${id}/lotes`, data),
      update: (id: string, loteId: string, data: { cajas?: number; sueltos?: number; activo?: boolean }) =>
        apiClient.put<Lote>(`${BASE}/productos/${id}/lotes/${loteId}`, data),
    },
  },

  // Clientes
  clientes: {
    list: () => apiClient.get<Cliente[]>(`${BASE}/clientes`),
    create: (data: { nombre: string; contacto?: string; referencia?: string; direccion?: string }, options?: MutationOptions) =>
      apiClient.post<Cliente>(`${BASE}/clientes`, data, undefined, mutationOptions(options)),
    update: (id: string, data: ClienteUpdateInput, options?: MutationOptions) =>
      apiClient.put<Cliente>(`${BASE}/clientes/${id}`, data, undefined, mutationOptions(options)),
  },

  // Pedidos
  pedidos: {
    list: (params?: { estado?: PedidoEstado; vendedorId?: string }) => {
      const searchParams = new URLSearchParams()
      if (params?.estado) searchParams.set('estado', params.estado)
      if (params?.vendedorId) searchParams.set('vendedorId', params.vendedorId)
      const qs = searchParams.toString()
      return apiClient.get<Pedido[]>(`${BASE}/pedidos${qs ? `?${qs}` : ''}`)
    },
    get: (id: string) => apiClient.get<Pedido>(`${BASE}/pedidos/${id}`),
    create: (data: CreatePedidoInput, options?: MutationOptions) =>
      apiClient.post<Pedido>(`${BASE}/pedidos`, data, undefined, mutationOptions(options)),
    update: (id: string, data: UpdatePedidoInput, options?: MutationOptions) =>
      apiClient.patch<Pedido>(`${BASE}/pedidos/${id}`, data, undefined, mutationOptions(options)),
    aprobar: (id: string, data: { expectedVersion: number }, options?: MutationOptions) =>
      apiClient.put<Pedido>(`${BASE}/pedidos/${id}/aprobar`, data, undefined, mutationOptions(options)),
    tomar: (id: string, data: { expectedVersion: number }, options?: MutationOptions) =>
      apiClient.put<Pedido>(`${BASE}/pedidos/${id}/tomar`, data, undefined, mutationOptions(options)),
    completarItem: (pedidoId: string, itemId: string, data: { expectedVersion: number }, options?: MutationOptions) =>
      apiClient.put<Pedido>(`${BASE}/pedidos/${pedidoId}/items/${itemId}/completar`, data, undefined, mutationOptions(options)),
    preparar: (id: string, data: { expectedVersion: number }, options?: MutationOptions) =>
      apiClient.put<Pedido>(`${BASE}/pedidos/${id}/preparar`, data, undefined, mutationOptions(options)),
    cancelar: (id: string, data: { expectedVersion: number; motivo?: string }, options?: MutationOptions) =>
      apiClient.put<CancelarPedidoResponse>(`${BASE}/pedidos/${id}/cancelar`, data, undefined, mutationOptions(options)),
    confirmarCancelacion: (id: string, data: { expectedVersion: number; motivo: string }, options?: MutationOptions) =>
      apiClient.put<Pedido>(`${BASE}/pedidos/${id}/confirmar-cancelacion`, data, undefined, mutationOptions(options)),
    despachar: (id: string, data: { expectedVersion: number }, options?: MutationOptions) =>
      apiClient.post<Pedido>(`${BASE}/pedidos/${id}/despachar`, data, undefined, mutationOptions(options)),
  },

  // Transportistas
  transportistas: {
    list: () => apiClient.get<Transportista[]>(`${BASE}/transportistas`),
    create: (data: TransportistaInput, options?: MutationOptions) =>
      apiClient.post<Transportista>(`${BASE}/transportistas`, data, undefined, mutationOptions(options)),
    update: (id: string, data: TransportistaUpdateInput, options?: MutationOptions) =>
      apiClient.patch<Transportista>(`${BASE}/transportistas/${id}`, data, undefined, mutationOptions(options)),
  },

  // Remitos
  remitos: {
    emitir: (pedidoId: string, data: EmitirRemitoInput, options?: MutationOptions) =>
      apiClient.post<Remito>(`${BASE}/pedidos/${pedidoId}/remitos`, data, undefined, mutationOptions(options)),
    anular: (pedidoId: string, remitoId: string, data: AnularRemitoInput, options?: MutationOptions) =>
      apiClient.put<Remito>(`${BASE}/pedidos/${pedidoId}/remitos/${remitoId}/anular`, data, undefined, mutationOptions(options)),
    pdf: (pedidoId: string) => apiClient.getBlob(`${BASE}/pedidos/${pedidoId}/remito.pdf`),
  },

  // Stock (legacy)
  stock: {
    get: () => apiClient.get<StockOverview>(`${BASE}/stock`),
    movimientos: () => apiClient.get<MovimientoStock[]>(`${BASE}/stock/movimientos`),
  },

  // Historial (legacy)
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
