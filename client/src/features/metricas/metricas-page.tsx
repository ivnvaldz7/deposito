import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TrendingUp, TrendingDown, Scale, Activity, FileDown, BarChart2 } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/lib/toast'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetricasData {
  totalIngresos: number
  totalEgresos: number
  balance: number
  movimientosPeriodo: number
  ingresosPorCategoria: { categoria: string; total: number }[]
  topProductosIngresados: { productoNombre: string; total: number }[]
  topProductosSolicitados: { productoNombre: string; total: number }[]
}

const CATEGORIAS = [
  { value: '', label: 'Todas las categorías' },
  { value: 'droga', label: 'Drogas' },
  { value: 'estuche', label: 'Estuches' },
  { value: 'etiqueta', label: 'Etiquetas' },
  { value: 'frasco', label: 'Frascos' },
]

const CATEGORIA_LABELS: Record<string, string> = {
  droga: 'Drogas',
  estuche: 'Estuches',
  etiqueta: 'Etiquetas',
  frasco: 'Frascos',
}

// ─── Metric card ─────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
  loading,
}: {
  label: string
  value: number | null
  icon: React.ElementType
  color: string
  loading: boolean
}) {
  return (
    <div className="bg-surface-low rounded p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon size={14} strokeWidth={1.5} style={{ color }} />
        <span className="font-heading text-xs uppercase tracking-widest text-on-surface-variant">
          {label}
        </span>
      </div>
      {loading ? (
        <div className="h-7 w-24 bg-surface-high rounded animate-pulse" />
      ) : (
        <p className="font-heading text-2xl font-bold text-on-surface tabular-nums">
          {value?.toLocaleString() ?? '—'}
          <span className="font-body text-sm font-normal text-on-surface-variant ml-1">uds</span>
        </p>
      )}
    </div>
  )
}

// ─── Top table ────────────────────────────────────────────────────────────────

function TopTable({
  title,
  rows,
  loading,
}: {
  title: string
  rows: { productoNombre: string; total: number }[]
  loading: boolean
}) {
  return (
    <div className="bg-surface-low rounded p-4">
      <h3 className="font-heading text-xs uppercase tracking-widest text-on-surface-variant mb-3">
        {title}
      </h3>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-5 bg-surface-high rounded animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="font-body text-sm text-on-surface-variant/60 py-4 text-center">
          Sin datos en este período
        </p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-outline-variant/15">
              <th className="text-left font-heading text-xs text-on-surface-variant pb-2 pr-2">#</th>
              <th className="text-left font-heading text-xs text-on-surface-variant pb-2">Producto</th>
              <th className="text-right font-heading text-xs text-on-surface-variant pb-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.productoNombre} className="border-b border-outline-variant/10 last:border-0">
                <td className="py-2 pr-2 font-body text-xs text-on-surface-variant tabular-nums">
                  {i + 1}
                </td>
                <td className="py-2 font-body text-sm text-on-surface truncate max-w-[180px]">
                  {row.productoNombre}
                </td>
                <td className="py-2 text-right font-body text-sm tabular-nums text-on-surface">
                  {row.total.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Métricas Page ────────────────────────────────────────────────────────────

export function MetricasPage() {
  const token = useAuthStore((s) => s.token)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Init from URL params (command palette can pre-fill these)
  const [desde, setDesde] = useState(searchParams.get('desde') ?? '')
  const [hasta, setHasta] = useState(searchParams.get('hasta') ?? '')
  const [categoria, setCategoria] = useState(searchParams.get('categoria') ?? '')

  const [data, setData] = useState<MetricasData | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const buildQS = useCallback(() => {
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    if (categoria) params.set('categoria', categoria)
    return params.toString()
  }, [desde, hasta, categoria])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setData(null)
      try {
        const qs = buildQS()
        const result = await apiClient.get<MetricasData>(
          `/metricas${qs ? `?${qs}` : ''}`,
          token
        )
        setData(result)
      } catch {
        toast.error('Error al cargar métricas')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [desde, hasta, categoria, token, buildQS])

  async function handleExportPdf() {
    setExporting(true)
    try {
      const qs = buildQS()
      const url = `/api/metricas/exportar-pdf${qs ? `?${qs}` : ''}`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `metricas-${desde || 'inicio'}-${hasta || 'hoy'}.pdf`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      toast.error('Error al exportar PDF')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <BarChart2 size={20} strokeWidth={1.5} className="text-primary-container" />
          <h1 className="font-heading font-bold text-xl text-on-surface">Métricas</h1>
        </div>
        <button
          onClick={handleExportPdf}
          disabled={exporting || loading}
          className="flex items-center gap-2 px-3 py-2 rounded font-heading font-semibold text-sm transition-colors disabled:opacity-50"
          style={{ background: 'rgba(0,174,66,0.12)', color: '#00AE42' }}
        >
          <FileDown size={14} strokeWidth={1.5} />
          {exporting ? 'Exportando…' : 'Exportar PDF'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="font-heading text-xs uppercase tracking-widest text-on-surface-variant">
            Desde
          </label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="bg-surface-low border border-outline-variant/30 rounded px-3 py-2 font-body text-sm text-on-surface outline-none focus:border-primary-container transition-colors"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-heading text-xs uppercase tracking-widest text-on-surface-variant">
            Hasta
          </label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="bg-surface-low border border-outline-variant/30 rounded px-3 py-2 font-body text-sm text-on-surface outline-none focus:border-primary-container transition-colors"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-heading text-xs uppercase tracking-widest text-on-surface-variant">
            Categoría
          </label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="bg-surface-low border border-outline-variant/30 rounded px-3 py-2 font-body text-sm text-on-surface outline-none focus:border-primary-container transition-colors"
          >
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {(desde || hasta || categoria) && (
          <button
            onClick={() => { setDesde(''); setHasta(''); setCategoria('') }}
            className="font-body text-xs text-on-surface-variant hover:text-on-surface transition-colors py-2 underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Ingresos"
          value={data?.totalIngresos ?? null}
          icon={TrendingUp}
          color="#00AE42"
          loading={loading}
        />
        <MetricCard
          label="Egresos"
          value={data?.totalEgresos ?? null}
          icon={TrendingDown}
          color="#ef4444"
          loading={loading}
        />
        <MetricCard
          label="Balance"
          value={data?.balance ?? null}
          icon={Scale}
          color={data && data.balance >= 0 ? '#60a5fa' : '#ef4444'}
          loading={loading}
        />
        <MetricCard
          label="Movimientos"
          value={data?.movimientosPeriodo ?? null}
          icon={Activity}
          color="#FF9800"
          loading={loading}
        />
      </div>

      {/* Ingresos por categoría */}
      {!loading && data && data.ingresosPorCategoria.length > 0 && (
        <div className="bg-surface-low rounded p-4">
          <h3 className="font-heading text-xs uppercase tracking-widest text-on-surface-variant mb-3">
            Ingresos por categoría
          </h3>
          <div className="flex flex-wrap gap-3">
            {data.ingresosPorCategoria.map(({ categoria: cat, total }) => (
              <button
                key={cat}
                onClick={() => { setCategoria(cat); navigate(`/metricas?${new URLSearchParams({ desde, hasta, categoria: cat }).toString()}`) }}
                className="flex items-center gap-2 bg-surface-high rounded px-3 py-2 transition-colors hover:bg-surface-bright"
              >
                <span className="font-heading text-xs uppercase tracking-wider text-on-surface-variant">
                  {CATEGORIA_LABELS[cat] ?? cat}
                </span>
                <span className="font-body text-sm tabular-nums text-on-surface font-semibold">
                  {total.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Top products */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopTable
          title="Top 10 más ingresados"
          rows={data?.topProductosIngresados ?? []}
          loading={loading}
        />
        <TopTable
          title="Top 10 más solicitados (órdenes)"
          rows={data?.topProductosSolicitados ?? []}
          loading={loading}
        />
      </div>
    </div>
  )
}
