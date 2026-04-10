import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TrendingUp, TrendingDown, Scale, Activity, FileDown, BarChart2, Search, Check } from 'lucide-react'
import Fuse from 'fuse.js'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/lib/toast'

interface MetricasData {
  totalIngresos: number
  totalEgresos: number
  balance: number
  movimientosPeriodo: number
  ingresosPorCategoria: { categoria: string; total: number }[]
  topProductosIngresados: { productoNombre: string; total: number }[]
  topProductosSolicitados: { productoNombre: string; total: number }[]
}

interface MovimientoListItem {
  productoNombre: string
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
    <div className="bg-surface-low rounded p-4 flex flex-col gap-2 shadow-[inset_0_0_0_1px_rgba(61,74,60,0.12)]">
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
    <div className="bg-surface-low rounded p-4 shadow-[inset_0_0_0_1px_rgba(61,74,60,0.12)]">
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

function ProductFilter({
  options,
  query,
  selected,
  onQueryChange,
  onSelect,
}: {
  options: string[]
  query: string
  selected: string
  onQueryChange: (value: string) => void
  onSelect: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const fuse = useMemo(
    () =>
      new Fuse(options.map((producto) => ({ producto })), {
        keys: ['producto'],
        threshold: 0.35,
      }),
    [options]
  )

  const results = useMemo(() => {
    if (!query.trim()) return options.slice(0, 8)
    return fuse
      .search(query.trim())
      .slice(0, 8)
      .map((result) => result.item.producto)
  }, [fuse, options, query])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="flex flex-col gap-1 min-w-[240px] flex-1">
      <label htmlFor="metricas-producto" className="font-heading text-xs uppercase tracking-widest text-on-surface-variant">
        Producto
      </label>
      <div className="relative">
        <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
        <input
          id="metricas-producto"
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onQueryChange(event.target.value)
            setOpen(true)
          }}
          placeholder="Buscar producto..."
          className="input-field pl-9 pr-9"
          autoComplete="off"
        />
        {selected && query === selected && (
          <Check size={14} strokeWidth={1.75} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#00AE42]" />
        )}
        {open && results.length > 0 && (
          <div className="absolute z-30 left-0 right-0 mt-1 rounded bg-surface-highest/95 backdrop-blur-[12px] shadow-lg overflow-hidden border border-outline-variant/15">
            {results.map((producto) => (
              <button
                key={producto}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  onSelect(producto)
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-2.5 font-body text-sm text-on-surface hover:bg-surface-bright transition-colors"
              >
                {producto}
              </button>
            ))}
          </div>
        )}
      </div>
      {query && query !== selected && (
        <p className="font-body text-xs text-on-surface-variant">
          Seleccioná un producto del listado para aplicar el filtro.
        </p>
      )}
    </div>
  )
}

export function MetricasPage() {
  const token = useAuthStore((s) => s.token)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [desde, setDesde] = useState(searchParams.get('desde') ?? '')
  const [hasta, setHasta] = useState(searchParams.get('hasta') ?? '')
  const [categoria, setCategoria] = useState(searchParams.get('categoria') ?? '')
  const initialProducto = searchParams.get('producto') ?? ''
  const [producto, setProducto] = useState(initialProducto)
  const [productoQuery, setProductoQuery] = useState(initialProducto)

  const [data, setData] = useState<MetricasData | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [productOptions, setProductOptions] = useState<string[]>([])

  const buildQS = useCallback(() => {
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    if (categoria) params.set('categoria', categoria)
    if (producto) params.set('producto', producto)
    return params.toString()
  }, [desde, hasta, categoria, producto])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setData(null)
      try {
        const qs = buildQS()
        const result = await apiClient.get<MetricasData>(`/metricas${qs ? `?${qs}` : ''}`, token)
        setData(result)
      } catch {
        toast.error('Error al cargar métricas')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [token, buildQS])

  useEffect(() => {
    async function loadProducts() {
      try {
        const params = new URLSearchParams()
        if (desde) params.set('desde', desde)
        if (hasta) params.set('hasta', hasta)
        if (productoQuery.trim()) params.set('producto', productoQuery.trim())

        const movimientos = await apiClient.get<MovimientoListItem[]>(
          `/movimientos${params.toString() ? `?${params.toString()}` : ''}`,
          token
        )

        const unique = [...new Set(movimientos.map((movimiento) => movimiento.productoNombre.trim()).filter(Boolean))]
        setProductOptions(unique)
      } catch {
        setProductOptions([])
      }
    }

    loadProducts()
  }, [desde, hasta, productoQuery, token])

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
      link.download = `movimientos-${desde || 'inicio'}-${hasta || 'hoy'}.pdf`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      toast.error('Error al exportar PDF')
    } finally {
      setExporting(false)
    }
  }

  function handleClearFilters() {
    setDesde('')
    setHasta('')
    setCategoria('')
    setProducto('')
    setProductoQuery('')
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <BarChart2 size={20} strokeWidth={1.5} className="text-primary-container" />
          <div>
            <h1 className="font-heading font-bold text-xl text-on-surface">Métricas</h1>
            <p className="font-body text-sm text-on-surface-variant">
              Movimientos, balance y ranking de productos del período.
            </p>
          </div>
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

      <div className="bg-surface-low rounded p-4 shadow-[inset_0_0_0_1px_rgba(61,74,60,0.12)]">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor="metricas-desde" className="font-heading text-xs uppercase tracking-widest text-on-surface-variant">
              Desde
            </label>
            <input
              id="metricas-desde"
              type="date"
              value={desde}
              onChange={(event) => setDesde(event.target.value)}
              className="input-field"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="metricas-hasta" className="font-heading text-xs uppercase tracking-widest text-on-surface-variant">
              Hasta
            </label>
            <input
              id="metricas-hasta"
              type="date"
              value={hasta}
              onChange={(event) => setHasta(event.target.value)}
              className="input-field"
            />
          </div>

          <div className="flex flex-col gap-1 min-w-[220px]">
            <label htmlFor="metricas-categoria" className="font-heading text-xs uppercase tracking-widest text-on-surface-variant">
              Categoría
            </label>
            <select
              id="metricas-categoria"
              value={categoria}
              onChange={(event) => setCategoria(event.target.value)}
              className="input-field"
            >
              {CATEGORIAS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <ProductFilter
            options={productOptions}
            query={productoQuery}
            selected={producto}
            onQueryChange={(value) => {
              setProductoQuery(value)
              if (value !== producto) setProducto('')
            }}
            onSelect={(value) => {
              setProducto(value)
              setProductoQuery(value)
            }}
          />

          {(desde || hasta || categoria || producto || productoQuery) && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="font-body text-xs text-on-surface-variant hover:text-on-surface transition-colors py-2 underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Ingresos" value={data?.totalIngresos ?? null} icon={TrendingUp} color="#00AE42" loading={loading} />
        <MetricCard label="Egresos" value={data?.totalEgresos ?? null} icon={TrendingDown} color="#f44336" loading={loading} />
        <MetricCard label="Balance" value={data?.balance ?? null} icon={Scale} color={data && data.balance >= 0 ? '#2196f3' : '#f44336'} loading={loading} />
        <MetricCard label="Movimientos" value={data?.movimientosPeriodo ?? null} icon={Activity} color="#FF9800" loading={loading} />
      </div>

      {!loading && data && data.ingresosPorCategoria.length > 0 && (
        <div className="bg-surface-low rounded p-4 shadow-[inset_0_0_0_1px_rgba(61,74,60,0.12)]">
          <h3 className="font-heading text-xs uppercase tracking-widest text-on-surface-variant mb-3">
            Ingresos por categoría
          </h3>
          <div className="flex flex-wrap gap-3">
            {data.ingresosPorCategoria.map(({ categoria: cat, total }) => (
              <button
                key={cat}
                onClick={() => {
                  setCategoria(cat)
                  const next = new URLSearchParams()
                  if (desde) next.set('desde', desde)
                  if (hasta) next.set('hasta', hasta)
                  next.set('categoria', cat)
                  if (producto) next.set('producto', producto)
                  navigate(`/metricas?${next.toString()}`)
                }}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopTable title="Top 10 más ingresados" rows={data?.topProductosIngresados ?? []} loading={loading} />
        <TopTable title="Top 10 más solicitados (órdenes)" rows={data?.topProductosSolicitados ?? []} loading={loading} />
      </div>
    </div>
  )
}
