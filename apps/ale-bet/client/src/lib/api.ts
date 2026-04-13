import { getToken, removeToken } from './auth'

export interface AuthUser {
  id: string
  email: string
  nombre: string
  rol: 'admin' | 'vendedor' | 'armador'
}

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
  producto: {
    id: string
    nombre: string
    sku: string
  }
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

interface ApiOptions extends RequestInit {}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { error?: string }
      | null

    if (response.status === 401) {
      removeToken()
      window.location.assign('/login')
    }

    throw new Error(data?.error ?? 'Error del servidor')
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function apiRequest<T>(
  input: string,
  options: ApiOptions = {},
  authenticated = true
): Promise<T> {
  const headers = new Headers(options.headers)

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (authenticated) {
    const token = getToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  const response = await fetch(input, {
    ...options,
    headers,
  })

  return parseResponse<T>(response)
}
