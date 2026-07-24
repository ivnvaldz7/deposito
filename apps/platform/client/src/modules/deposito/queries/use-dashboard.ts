import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
export type TipoMovimiento = 'ingreso_acta' | 'egreso_orden' | 'ajuste_manual'

export interface UltimoMovimiento {
  id: string
  tipo: TipoMovimiento
  categoria: string
  productoNombre: string
  lote: string | null
  cantidad: number
  createdAt: string
  user: { name: string }
}

export interface DrogaBajo {
  id: string
  nombre: string
  cantidad: number
}

export interface ItemMercadoBajo {
  id: string
  articulo: string
  mercado: string
  cantidad: number
}

export interface FrascoBajo {
  id: string
  articulo: string
  cantidadCajas: number
  unidadesPorCaja: number
  total: number
}

export interface DrogaPorVencer {
  id: string
  nombre: string
  lote: string | null
  vencimiento: string
  cantidad: number
}

export interface DashboardStats {
  totalDrogas: number
  drogasEnStock: number
  drogasSinStock: number
  totalEstuches: number
  estuchesSinStock: number
  totalEtiquetas: number
  etiquetasSinStock: number
  totalFrascos: number
  frascosSinStock: number
  movimientosHoy: number
  ultimosMovimientos: UltimoMovimiento[]
  stockBajo: DrogaBajo[]
  stockBajoEstuches: ItemMercadoBajo[]
  stockBajoEtiquetas: ItemMercadoBajo[]
  stockBajoFrascos: FrascoBajo[]
  porVencer: DrogaPorVencer[]
}

export const dashboardKeys = {
  all: ['deposito', 'dashboard'] as const,
  stats: () => [...dashboardKeys.all, 'stats'] as const,
}

export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: () => api.get<DashboardStats>('/dashboard/stats'),
  })
}
