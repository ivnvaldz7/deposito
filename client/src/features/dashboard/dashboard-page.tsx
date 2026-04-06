import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'

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
}

interface InventorySummaryCardProps {
  title: string
  total: number
  enStock: number
  sinStock: number
  stockBajo: number
  stockBajoLabel: string
  accentColor: string
  onOpen: () => void
}

interface LowStockPanelProps {
  title: string
  hrefLabel: string
  onOpen: () => void
  threshold: string
  children: ReactNode
}

type ChipTone = 'success' | 'warning' | 'neutral'

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatMercado(mercado: string): string {
  return mercado.split('_').join(' ')
}

const TIPO_CONFIG: Record<TipoMovimiento, { label: string; color: string; bg: string }> = {
  ingreso_acta: { label: 'Ingreso', color: '#00AE42', bg: 'rgba(0,174,66,0.10)' },
  egreso_orden: { label: 'Egreso', color: '#FF9800', bg: 'rgba(255,152,0,0.10)' },
  ajuste_manual: { label: 'Ajuste', color: '#2196F3', bg: 'rgba(33,150,243,0.10)' },
}

function TelemetryChip({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone: ChipTone
}) {
  const styles: Record<ChipTone, { color: string; backgroundColor: string }> = {
    success: { color: '#00AE42', backgroundColor: 'rgba(0,174,66,0.10)' },
    warning: { color: '#FF9800', backgroundColor: 'rgba(255,152,0,0.10)' },
    neutral: { color: '#bccbb8', backgroundColor: 'rgba(188,203,184,0.10)' },
  }

  const toneStyle = styles[tone]

  return (
    <span
      className="inline-flex items-center gap-2 rounded px-2.5 py-1 font-body text-xs font-medium"
      style={toneStyle}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  )
}

function TipoChip({ tipo }: { tipo: TipoMovimiento }) {
  const c = TIPO_CONFIG[tipo]
  return (
    <span
      className="inline-block shrink-0 rounded px-2 py-0.5 font-body text-xs font-medium"
      style={{ color: c.color, backgroundColor: c.bg }}
    >
      {c.label}
    </span>
  )
}

function InventorySummaryCard({
  title,
  total,
  enStock,
  sinStock,
  stockBajo,
  stockBajoLabel,
  accentColor,
  onOpen,
}: InventorySummaryCardProps) {
  return (
    <section className="rounded bg-surface-low p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="font-body text-xs uppercase tracking-widest text-on-surface-variant">
            {title}
          </p>
          <p
            className="font-heading font-bold leading-none text-on-surface tabular-nums"
            style={{ fontSize: '3.5rem', color: accentColor }}
          >
            {total}
          </p>
        </div>

        <TelemetryChip
          label="Stock bajo"
          value={stockBajo}
          tone={stockBajo > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <TelemetryChip label="En stock" value={enStock} tone="success" />
        <TelemetryChip label="Sin stock" value={sinStock} tone={sinStock > 0 ? 'warning' : 'neutral'} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="font-body text-xs text-on-surface-variant">{stockBajoLabel}</p>
        <button
          onClick={onOpen}
          className="flex items-center gap-1 font-body text-xs text-on-surface-variant transition-colors hover:text-on-surface"
        >
          Ver detalle
          <ArrowRight size={12} strokeWidth={1.5} />
        </button>
      </div>
    </section>
  )
}

function LowStockPanel({ title, hrefLabel, onOpen, threshold, children }: LowStockPanelProps) {
  return (
    <section className="rounded bg-surface-low p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-heading text-sm font-semibold uppercase tracking-widest text-on-surface">
            {title}
          </h3>
          <p className="font-body text-xs text-on-surface-variant">{threshold}</p>
        </div>

        <button
          onClick={onOpen}
          className="flex items-center gap-1 font-body text-xs text-on-surface-variant transition-colors hover:text-on-surface"
        >
          {hrefLabel}
          <ArrowRight size={12} strokeWidth={1.5} />
        </button>
      </div>

      <div className="mt-4 space-y-2">{children}</div>
    </section>
  )
}

export function DashboardPage() {
  const token = useAuthStore((s) => s.token)
  const navigate = useNavigate()

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiClient
      .get<DashboardStats>('/dashboard/stats', token)
      .then(setStats)
      .catch(() => setError('No se pudo cargar el dashboard'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="font-body text-sm text-on-surface-variant">Cargando...</p>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="font-body text-sm text-error">{error ?? 'Error desconocido'}</p>
      </div>
    )
  }

  const hayStockBajo =
    stats.stockBajo.length > 0 ||
    stats.stockBajoEstuches.length > 0 ||
    stats.stockBajoEtiquetas.length > 0 ||
    stats.stockBajoFrascos.length > 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-xl font-semibold text-on-surface">Dashboard</h1>
        <p className="mt-0.5 font-body text-sm text-on-surface-variant">
          Vista general del depósito por categoría
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <InventorySummaryCard
          title="Drogas"
          total={stats.totalDrogas}
          enStock={stats.drogasEnStock}
          sinStock={stats.drogasSinStock}
          stockBajo={stats.stockBajo.length}
          stockBajoLabel="Alerta por cantidad menor a 10"
          accentColor="var(--color-on-surface)"
          onOpen={() => navigate('/drogas')}
        />
        <InventorySummaryCard
          title="Estuches"
          total={stats.totalEstuches}
          enStock={stats.totalEstuches - stats.estuchesSinStock}
          sinStock={stats.estuchesSinStock}
          stockBajo={stats.stockBajoEstuches.length}
          stockBajoLabel="Alerta por cantidad menor a 100"
          accentColor="#54e16d"
          onOpen={() => navigate('/estuches')}
        />
        <InventorySummaryCard
          title="Etiquetas"
          total={stats.totalEtiquetas}
          enStock={stats.totalEtiquetas - stats.etiquetasSinStock}
          sinStock={stats.etiquetasSinStock}
          stockBajo={stats.stockBajoEtiquetas.length}
          stockBajoLabel="Alerta por cantidad menor a 100"
          accentColor="#9cf0ad"
          onOpen={() => navigate('/etiquetas')}
        />
        <InventorySummaryCard
          title="Frascos"
          total={stats.totalFrascos}
          enStock={stats.totalFrascos - stats.frascosSinStock}
          sinStock={stats.frascosSinStock}
          stockBajo={stats.stockBajoFrascos.length}
          stockBajoLabel="Alerta por menos de 5 cajas"
          accentColor="#d4f7db"
          onOpen={() => navigate('/frascos')}
        />
      </div>

      {hayStockBajo && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} strokeWidth={1.5} style={{ color: '#FF9800' }} />
            <h2 className="font-heading text-sm font-semibold uppercase tracking-widest text-on-surface">
              Stock Bajo
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <LowStockPanel
              title="Drogas"
              hrefLabel="Ver drogas"
              threshold="Productos con cantidad menor a 10"
              onOpen={() => navigate('/drogas')}
            >
              {stats.stockBajo.length === 0 ? (
                <p className="font-body text-sm text-on-surface-variant">
                  Sin alertas en esta categoría.
                </p>
              ) : (
                stats.stockBajo.map((droga) => (
                  <div
                    key={droga.id}
                    className="flex items-center justify-between gap-3 rounded bg-surface-high px-4 py-3"
                  >
                    <p className="min-w-0 flex-1 truncate font-body text-sm text-on-surface">
                      {droga.nombre}
                    </p>
                    <TelemetryChip label="Stock" value={`${droga.cantidad} uds`} tone="warning" />
                  </div>
                ))
              )}
            </LowStockPanel>

            <LowStockPanel
              title="Estuches"
              hrefLabel="Ver estuches"
              threshold="Productos con cantidad menor a 100"
              onOpen={() => navigate('/estuches')}
            >
              {stats.stockBajoEstuches.length === 0 ? (
                <p className="font-body text-sm text-on-surface-variant">
                  Sin alertas en esta categoría.
                </p>
              ) : (
                stats.stockBajoEstuches.map((estuche) => (
                  <div
                    key={estuche.id}
                    className="flex items-center justify-between gap-3 rounded bg-surface-high px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-body text-sm text-on-surface">{estuche.articulo}</p>
                      <p className="mt-0.5 font-body text-xs uppercase tracking-widest text-on-surface-variant">
                        {formatMercado(estuche.mercado)}
                      </p>
                    </div>
                    <TelemetryChip label="Stock" value={`${estuche.cantidad} uds`} tone="warning" />
                  </div>
                ))
              )}
            </LowStockPanel>

            <LowStockPanel
              title="Etiquetas"
              hrefLabel="Ver etiquetas"
              threshold="Productos con cantidad menor a 100"
              onOpen={() => navigate('/etiquetas')}
            >
              {stats.stockBajoEtiquetas.length === 0 ? (
                <p className="font-body text-sm text-on-surface-variant">
                  Sin alertas en esta categoría.
                </p>
              ) : (
                stats.stockBajoEtiquetas.map((etiqueta) => (
                  <div
                    key={etiqueta.id}
                    className="flex items-center justify-between gap-3 rounded bg-surface-high px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-body text-sm text-on-surface">{etiqueta.articulo}</p>
                      <p className="mt-0.5 font-body text-xs uppercase tracking-widest text-on-surface-variant">
                        {formatMercado(etiqueta.mercado)}
                      </p>
                    </div>
                    <TelemetryChip label="Stock" value={`${etiqueta.cantidad} uds`} tone="warning" />
                  </div>
                ))
              )}
            </LowStockPanel>

            <LowStockPanel
              title="Frascos"
              hrefLabel="Ver frascos"
              threshold="Productos con menos de 5 cajas"
              onOpen={() => navigate('/frascos')}
            >
              {stats.stockBajoFrascos.length === 0 ? (
                <p className="font-body text-sm text-on-surface-variant">
                  Sin alertas en esta categoría.
                </p>
              ) : (
                stats.stockBajoFrascos.map((frasco) => (
                  <div
                    key={frasco.id}
                    className="flex items-center justify-between gap-3 rounded bg-surface-high px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-body text-sm text-on-surface">{frasco.articulo}</p>
                      <p className="mt-0.5 font-body text-xs uppercase tracking-widest text-on-surface-variant">
                        {frasco.total} uds totales · {frasco.unidadesPorCaja} por caja
                      </p>
                    </div>
                    <TelemetryChip label="Cajas" value={frasco.cantidadCajas} tone="warning" />
                  </div>
                ))
              )}
            </LowStockPanel>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-widest text-on-surface">
            Últimos Movimientos
          </h2>
          <button
            onClick={() => navigate('/movimientos')}
            className="flex items-center gap-1 font-body text-xs text-on-surface-variant transition-colors hover:text-on-surface"
          >
            Ver todos
            <ArrowRight size={12} strokeWidth={1.5} />
          </button>
        </div>

        {stats.ultimosMovimientos.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded bg-surface-low">
            <p className="font-body text-sm text-on-surface-variant">
              Sin movimientos registrados todavía.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded bg-surface-low">
            {stats.ultimosMovimientos.map((mov, i) => (
              <div
                key={mov.id}
                className={`flex items-center gap-4 px-4 py-3 ${
                  i < stats.ultimosMovimientos.length - 1
                    ? 'border-b border-outline-variant/10'
                    : ''
                }`}
              >
                <TipoChip tipo={mov.tipo} />
                <p className="min-w-0 flex-1 truncate font-body text-sm text-on-surface">
                  {mov.productoNombre}
                </p>
                <span
                  className="shrink-0 font-body text-sm tabular-nums"
                  style={{ color: mov.cantidad >= 0 ? '#00AE42' : '#FF9800' }}
                >
                  {mov.cantidad >= 0 ? '+' : ''}
                  {mov.cantidad}
                </span>
                <span className="hidden shrink-0 font-body text-xs text-on-surface-variant sm:block">
                  {formatFecha(mov.createdAt)}
                </span>
                <span className="hidden shrink-0 font-body text-xs text-on-surface-variant md:block">
                  {mov.user.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
