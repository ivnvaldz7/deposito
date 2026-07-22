import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
<<<<<<< Updated upstream
import { AlertTriangle, ArrowRight, Package, Pill, Box, Tag, Plus } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { api } from '../lib/api'
=======
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useDashboard } from '../queries'
>>>>>>> Stashed changes

type TipoMovimiento = 'ingreso_acta' | 'egreso_orden' | 'ajuste_manual'

interface UltimoMovimiento {
  id: string
  tipo: TipoMovimiento
  productoNombre: string
  cantidad: number
  createdAt: string
  user: { name: string }
}

interface DrogaBajo {
  id: string
  nombre: string
  cantidad: number
}

interface ItemMercadoBajo {
  id: string
  articulo: string
  mercado: string
  cantidad: number
}

interface FrascoBajo {
  id: string
  articulo: string
  cantidadCajas: number
  unidadesPorCaja: number
  total: number
}

interface DrogaPorVencer {
  id: string
  nombre: string
  lote: string | null
  vencimiento: string
  cantidad: number
}

interface DashboardStats {
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

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatMercado(mercado: string): string {
  return mercado.split('_').join(' ')
}

const TIPO_CONFIG: Record<TipoMovimiento, { label: string; variant: 'primary' | 'error' | 'info' }> = {
  ingreso_acta: { label: 'Ingreso', variant: 'primary' },
  egreso_orden: { label: 'Egreso', variant: 'error' },
  ajuste_manual: { label: 'Ajuste', variant: 'info' },
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon: Icon,
  variant = 'default',
}: {
  label: string
  value: number | string
  icon: React.ComponentType<{ size?: number; className?: string }>
  variant?: 'default' | 'warning' | 'error'
}) {
  return (
    <GlassCard variant={variant} className="flex flex-col justify-between">
      <div className="flex justify-between items-start mb-md">
        <span className="font-body text-sm text-on-surface-variant">{label}</span>
        <Icon size={24} className="opacity-50" />
      </div>
      <div className="font-heading text-3xl font-bold text-on-surface tabular-nums">
        {value}
      </div>
    </GlassCard>
  )
}

function TipoChip({ tipo }: { tipo: TipoMovimiento }) {
  const c = TIPO_CONFIG[tipo]
  const colorMap = {
    primary: 'bg-primary-container/20 text-primary',
    error: 'bg-error-container/20 text-error',
    info: 'bg-tertiary-container/20 text-tertiary',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${colorMap[c.variant]}`}>
      {c.label}
    </span>
  )
}

// ─── Stock Bajo Alert Card ──────────────────────────────────────────────────────

function StockAlertCard({
  icon: Icon,
  productName,
  category,
  currentStock,
  unit,
  stockTone = 'tertiary',
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  productName: string
  category: string
  currentStock: number
  unit: string
  stockTone?: 'tertiary' | 'error'
}) {
  return (
    <div className="bg-surface-container-high rounded-lg p-md border border-white/10 hover:border-primary transition-colors duration-300 group">
      <div className="flex items-center space-x-4 mb-sm">
        <div className={`w-10 h-10 rounded flex items-center justify-center ${stockTone === 'error' ? 'bg-error-container/20 text-error' : 'bg-tertiary-container/20 text-tertiary'}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-sm font-semibold text-on-surface truncate">{productName}</h3>
          <p className="font-body text-xs text-on-surface-variant">{category}</p>
        </div>
      </div>
      <div className="flex justify-between items-end mt-4">
        <div>
          <span className="font-body text-xs text-outline">Current Stock</span>
          <div className={`font-heading text-xl font-bold tabular-nums ${stockTone === 'error' ? 'text-error' : 'text-tertiary'}`}>
            {currentStock}{' '}
            <span className="font-body text-sm text-on-surface-variant font-normal">{unit}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: stats, isLoading, error } = useDashboard()

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="font-body text-sm text-on-surface-variant">Cargando...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="font-body text-sm text-error">No se pudo cargar el dashboard</p>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="font-body text-sm text-on-surface-variant">No hay datos disponibles.</p>
      </div>
    )
  }

  const hayStockBajo =
    stats.stockBajo.length > 0 ||
    stats.stockBajoEstuches.length > 0 ||
    stats.stockBajoEtiquetas.length > 0 ||
    stats.stockBajoFrascos.length > 0

  const totalItems =
    stats.totalDrogas + stats.totalEstuches + stats.totalEtiquetas + stats.totalFrascos

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-primary tracking-tighter">Depósito</h1>
          <p className="font-body text-base text-on-surface-variant mt-1">
            Overview of current laboratory inventory and critical alerts.
          </p>
        </div>
        <button
          onClick={() => navigate('/deposito/ingresos/nueva')}
          className="flex items-center gap-2 bg-primary-container text-white font-body text-sm font-semibold px-lg py-sm rounded-lg scale-hover transition-transform duration-200 hover:bg-primary shadow-float"
        >
          <Plus size={18} />
          <span>New Entry</span>
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        <MetricCard
          label="Total Items"
          value={totalItems.toLocaleString()}
          icon={Package}
          variant="default"
        />
        <MetricCard
          label="Low Stock"
          value={stats.stockBajo.length + stats.stockBajoEstuches.length + stats.stockBajoEtiquetas.length + stats.stockBajoFrascos.length}
          icon={AlertTriangle}
          variant="warning"
        />
        <MetricCard
          label="Movements Today"
          value={stats.movimientosHoy}
          icon={ArrowRight}
          variant={stats.movimientosHoy > 50 ? 'error' : 'default'}
        />
      </div>

      {/* Middle Section (2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">
        {/* Left Column (2/3) - Low Stock Alerts */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-md">
            <h2 className="font-heading text-lg font-semibold text-on-surface">Critical Reorder Alerts</h2>
            <button
              onClick={() => navigate('/deposito/drogas')}
              className="font-body text-xs text-primary hover:underline"
            >
              View All
            </button>
          </div>

          {!hayStockBajo ? (
            <div className="flex h-32 items-center justify-center rounded-xl bg-surface-container-high border border-white/10">
              <p className="font-body text-sm text-on-surface-variant">
                No hay alertas de stock bajo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
              {/* Drogas bajo stock */}
              {stats.stockBajo.slice(0, 4).map((droga) => (
                <StockAlertCard
                  key={droga.id}
                  icon={Pill}
                  productName={droga.nombre}
                  category="Droga"
                  currentStock={droga.cantidad}
                  unit="uds"
                  stockTone={droga.cantidad < 5 ? 'error' : 'tertiary'}
                />
              ))}
              {/* Estuches bajo stock */}
              {stats.stockBajoEstuches.slice(0, 2).map((estuche) => (
                <StockAlertCard
                  key={estuche.id}
                  icon={Box}
                  productName={estuche.articulo}
                  category={`Estuche · ${formatMercado(estuche.mercado)}`}
                  currentStock={estuche.cantidad}
                  unit="uds"
                />
              ))}
              {/* Etiquetas bajo stock */}
              {stats.stockBajoEtiquetas.slice(0, 2).map((etiqueta) => (
                <StockAlertCard
                  key={etiqueta.id}
                  icon={Tag}
                  productName={etiqueta.articulo}
                  category={`Etiqueta · ${formatMercado(etiqueta.mercado)}`}
                  currentStock={etiqueta.cantidad}
                  unit="uds"
                />
              ))}
              {/* Frascos bajo stock */}
              {stats.stockBajoFrascos.slice(0, 2).map((frasco) => (
                <StockAlertCard
                  key={frasco.id}
                  icon={Package}
                  productName={frasco.articulo}
                  category={`Frasco · ${frasco.unidadesPorCaja} uds/caja`}
                  currentStock={frasco.cantidadCajas}
                  unit="cajas"
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Column (1/3) - Recent Movements */}
        <div className="lg:col-span-1">
          <h2 className="font-heading text-lg font-semibold text-on-surface mb-md">Recent Movements</h2>
          <div className="bg-surface-container-high rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-surface-container-low font-body text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                  <th className="p-3 font-normal">Item</th>
                  <th className="p-3 font-normal">Type</th>
                  <th className="p-3 font-normal text-right">Qty</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {stats.ultimosMovimientos.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-on-surface-variant font-body text-xs">
                      Sin movimientos registrados.
                    </td>
                  </tr>
                ) : (
                  stats.ultimosMovimientos.slice(0, 6).map((mov) => (
                    <tr
                      key={mov.id}
                      className="border-b border-white/5 hover:bg-surface-container-highest transition-colors duration-150 cursor-default group"
                    >
                      <td className="p-3 text-on-surface truncate max-w-[120px]" title={mov.productoNombre}>
                        {mov.productoNombre}
                      </td>
                      <td className="p-3">
                        <TipoChip tipo={mov.tipo} />
                      </td>
                      <td className="p-3 text-right font-bold group-hover:-translate-y-[1px] transition-transform"
                        style={{ color: mov.cantidad >= 0 ? 'var(--color-primary)' : 'var(--color-error)' }}
                      >
                        {mov.cantidad >= 0 ? '+' : ''}{mov.cantidad}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {stats.ultimosMovimientos.length > 0 && (
              <div className="p-3 border-t border-white/5 text-center">
                <button
                  onClick={() => navigate('/deposito/movimientos')}
                  className="font-body text-xs text-primary hover:underline"
                >
                  View Audit Log
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
