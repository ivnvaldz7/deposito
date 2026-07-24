import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useMovimientos } from '../queries'
import { api } from '../lib/api'
import type { Producto } from '../components/ProductoSelector'
import { ArrowDown, ArrowUp, Search, Calendar, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/Table'

// ─── Types ────────────────────────────────────────────────────────────────────

type TipoMovimiento = 'ingreso_acta' | 'egreso_orden' | 'ajuste_manual'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function formatHora(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function formatFechaCompleta(iso: string): string {
  return `${formatFecha(iso)} ${formatHora(iso)}`
}

const TIPO_CONFIG: Record<TipoMovimiento, { label: string; variant: 'primary' | 'error' | 'info' }> = {
  ingreso_acta:  { label: 'Ingreso',  variant: 'primary' },
  egreso_orden:  { label: 'Egreso',   variant: 'error' },
  ajuste_manual: { label: 'Ajuste',   variant: 'info' },
}

// ─── Chips ────────────────────────────────────────────────────────────────────

function DirectionIcon({ tipo }: { tipo: string }) {
  if (tipo === 'ingreso_acta') {
    return <ArrowDown size={20} className="text-primary" strokeWidth={2} />
  }
  return <ArrowUp size={20} className="text-tertiary" strokeWidth={2} />
}

function CantidadCell({ cantidad, tipo }: { cantidad: number; tipo: string }) {
  const color = tipo === 'ingreso_acta' ? 'var(--color-primary)' : 'var(--color-tertiary)'
  const prefix = tipo === 'ingreso_acta' ? '+' : '-'
  return (
    <span
      className="font-mono text-sm font-bold tabular-nums"
      style={{ color }}
    >
      {prefix}{Math.abs(cantidad)}
    </span>
  )
}

// ─── Date Icon Button ────────────────────────────────────────────────────────

function DateIconButton({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const hasValue = !!value

  return (
    <div className="w-[48px]">
      <label className="block font-body text-[11px] text-on-surface-variant mb-xs font-medium tracking-wider uppercase">
        {label}
      </label>
      <div className="relative">
        {/* Visible icon button */}
        <div
          className={`w-full h-[38px] border rounded-lg flex items-center justify-center transition-all pointer-events-none ${
            hasValue
              ? 'border-primary text-primary'
              : 'border-outline-variant text-on-surface-variant'
          }`}
        >
          <Calendar size={18} />
        </div>
        {/* Invisible date input covers the whole area — opens native picker on click */}
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer [color-scheme:dark]"
          aria-label={label}
        />
      </div>
    </div>
  )
}

// ─── Filters bar ─────────────────────────────────────────────────────────────

interface Filters {
  tipo: string
  producto: string
  tipoProducto: string     // '' | 'mp' | 'me'
  categoria: string        // '' | 'estuche' | 'etiqueta' | 'frasco'
  desde: string
  hasta: string
}

interface FiltersBarProps {
  filters: Filters
  onChange: (next: Filters) => void
}

function FiltersBar({ filters, onChange }: FiltersBarProps) {
  const productoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [productoLocal, setProductoLocal] = useState(filters.producto)
  const [suggestions, setSuggestions] = useState<Producto[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch product suggestions
  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    try {
      const data = await api.get<Producto[]>(`/productos?buscar=${encodeURIComponent(q)}`)
      setSuggestions(data.slice(0, 8))
      setShowSuggestions(data.length > 0)
      setHighlightIdx(-1)
    } catch {
      // silencioso
    }
  }, [])

  function handleProductoChange(v: string) {
    setProductoLocal(v)
    if (productoTimer.current) clearTimeout(productoTimer.current)
    productoTimer.current = setTimeout(() => {
      onChange({ ...filters, producto: v })
    }, 500)
    fetchSuggestions(v)
  }

  function selectProduct(p: Producto) {
    setProductoLocal(p.nombreCompleto)
    onChange({ ...filters, producto: p.nombreCompleto })
    setSuggestions([])
    setShowSuggestions(false)
  }

  // Close suggestions on outside click
  useEffect(() => {
    if (!showSuggestions) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showSuggestions])

  const esME = filters.tipoProducto === 'me'
  const hasFilters = filters.tipo || filters.producto || filters.tipoProducto || filters.categoria || filters.desde || filters.hasta

  return (
    <div className="bg-surface-container-high rounded-lg p-md border border-white/10 flex flex-wrap gap-x-md gap-y-sm items-end">
      {/* Product Search */}
      <div ref={containerRef} className="flex-1 min-w-[200px] relative">
        <label className="block font-body text-xs text-on-surface-variant mb-xs font-medium">
          Producto
        </label>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <input
            type="text"
            value={productoLocal}
            onChange={(e) => handleProductoChange(e.target.value)}
            onKeyDown={(e) => {
              if (!showSuggestions) return
              if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx((i) => Math.min(i + 1, suggestions.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx((i) => Math.max(i - 1, 0)) }
              else if (e.key === 'Enter' && highlightIdx >= 0) { e.preventDefault(); selectProduct(suggestions[highlightIdx]!) }
              else if (e.key === 'Escape') { setShowSuggestions(false) }
            }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Buscar producto..."
            className="w-full bg-surface-container border border-outline-variant rounded-lg pl-[36px] pr-3 py-2 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono text-xs outline-none"
            autoComplete="off"
          />
        </div>
        {showSuggestions && (
          <div className="absolute z-30 w-full mt-1 bg-surface-highest/95 backdrop-blur-[8px] rounded-lg shadow-float overflow-hidden border border-white/10">
            {suggestions.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); selectProduct(p) }}
                className={`w-full text-left px-3 py-2 font-body text-sm transition-colors ${
                  i === highlightIdx ? 'bg-primary-container/30 text-on-surface' : 'text-on-surface hover:bg-surface-bright'
                }`}
              >
                <span className="font-medium">{p.nombreCompleto}</span>
                <span className="ml-2 text-[11px] text-on-surface-variant uppercase">{p.categoria}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Movement Type */}
      <div className="w-[150px]">
        <label className="block font-body text-xs text-on-surface-variant mb-xs font-medium">
          Movement Type
        </label>
        <select
          value={filters.tipo}
          onChange={(e) => onChange({ ...filters, tipo: e.target.value })}
          className="w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-all font-body text-sm outline-none appearance-none"
        >
          <option value="">All Types</option>
          <option value="ingreso_acta">Ingress</option>
          <option value="egreso_orden">Egress</option>
          <option value="ajuste_manual">Adjustment</option>
        </select>
      </div>

      {/* Product category: MP / ME */}
      <div className="w-[110px]">
        <label className="block font-body text-xs text-on-surface-variant mb-xs font-medium">
          Producto
        </label>
        <select
          value={filters.tipoProducto}
          onChange={(e) => onChange({ ...filters, tipoProducto: e.target.value, categoria: '' })}
          className="w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-all font-body text-sm outline-none appearance-none"
        >
          <option value="">All</option>
          <option value="mp">MP</option>
          <option value="me">ME</option>
        </select>
      </div>

      {/* Sub-category (only when ME is selected) */}
      {esME && (
        <div className="w-[130px]">
          <label className="block font-body text-xs text-on-surface-variant mb-xs font-medium">
            Categoría
          </label>
          <select
            value={filters.categoria}
            onChange={(e) => onChange({ ...filters, categoria: e.target.value })}
            className="w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-all font-body text-sm outline-none appearance-none"
          >
            <option value="">Todas</option>
            <option value="estuche">Estuches</option>
            <option value="etiqueta">Etiquetas</option>
            <option value="frasco">Frascos</option>
          </select>
        </div>
      )}

      {/* Date Range — icon-only buttons with invisible native date picker */}
      <DateIconButton
        label="Desde"
        value={filters.desde}
        onChange={(v) => onChange({ ...filters, desde: v })}
      />
      <DateIconButton
        label="Hasta"
        value={filters.hasta}
        onChange={(v) => onChange({ ...filters, hasta: v })}
      />

      {/* Clear */}
      {hasFilters && (
        <button
          onClick={() => {
            setProductoLocal('')
            onChange({ tipo: '', producto: '', tipoProducto: '', categoria: '', desde: '', hasta: '' })
          }}
          className="font-body text-xs text-on-surface-variant hover:text-on-surface transition-colors py-2 mb-0"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function MovimientosPage() {
  const [searchParams] = useSearchParams()

  const [filters, setFilters] = useState<Filters>({
    tipo: '',
    producto: searchParams.get('producto') ?? '',
    tipoProducto: '',
    categoria: '',
    desde: '',
    hasta: '',
  })

  const [currentPage, setCurrentPage] = useState(1)
  const perPage = 20

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      producto: searchParams.get('producto') ?? '',
    }))
  }, [searchParams])

  const { data: movimientos = [], isLoading: loading, error } = useMovimientos(
    filters.tipo || filters.producto || filters.tipoProducto || filters.categoria || filters.desde || filters.hasta ? filters : undefined
  )

  // Pagination
  const totalPages = Math.ceil(movimientos.length / perPage)
  const paginatedMovs = movimientos.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage,
  )

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters])

  return (
    <div className="flex flex-col h-full space-y-lg">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-semibold text-on-surface tracking-tight">
          Auditoría de Movimientos
        </h1>
        <p className="font-body text-sm text-on-surface-variant mt-1">
          Registro inmutable de transacciones del depósito central.
          {!loading && !error && (
            <span className="ml-1">· {movimientos.length} registros</span>
          )}
        </p>
      </div>

      <FiltersBar key={filters.producto} filters={filters} onChange={setFilters} />

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <p className="font-body text-on-surface-variant text-sm">Cargando...</p>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-48">
          <p className="font-body text-error text-sm">{error instanceof Error ? error.message : 'Error al cargar movimientos'}</p>
        </div>
      ) : movimientos.length === 0 ? (
        <div className="flex items-center justify-center h-48 rounded-lg bg-surface-container-high border border-white/10">
          <p className="font-body text-on-surface-variant text-sm">
            Sin movimientos para los filtros aplicados.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-surface-container border border-white/10 rounded-xl overflow-hidden flex-1 shadow-float">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead className="bg-surface-container-highest border-b border-white/10">
                <tr>
                  <th className="p-sm font-body text-xs font-semibold text-on-surface-variant w-12 text-center">Dir</th>
                  <th className="p-sm font-body text-xs font-semibold text-on-surface-variant w-32">Tx ID</th>
                  <th className="p-sm font-body text-xs font-semibold text-on-surface-variant">Product / Item</th>
                  <th className="p-sm font-body text-xs font-semibold text-on-surface-variant w-48">Date &amp; Time</th>
                  <th className="p-sm font-body text-xs font-semibold text-on-surface-variant w-24 text-right">Qty</th>
                  <th className="p-sm font-body text-xs font-semibold text-on-surface-variant w-24 text-center">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedMovs.map((mov) => {
                  const isFlagged = mov.justificacion?.toLowerCase().includes('discrepanc') ?? false
                  return (
                    <tr
                      key={mov.id}
                      className={`hover:-translate-y-[2px] hover:bg-surface-variant/30 transition-transform cursor-default group ${
                        isFlagged ? 'border-l-2 border-l-error bg-error-container/5' : ''
                      }`}
                    >
                      <td className="p-sm text-center">
                        <DirectionIcon tipo={mov.tipo} />
                      </td>
                      <td className={`p-sm ${isFlagged ? 'text-error' : 'text-outline'}`}>
                        <span className="font-mono text-xs">TX-{mov.id.slice(0, 5).toUpperCase()}</span>
                      </td>
                      <td className="p-sm">
                        <div className={`font-body text-sm font-medium group-hover:text-primary transition-colors ${isFlagged ? 'text-error' : 'text-on-surface'} flex items-center gap-2`}>
                          {mov.productoNombre}
                          {isFlagged && (
                            <span className="px-1.5 py-0.5 rounded bg-error-container text-on-error-container text-[10px] uppercase font-bold tracking-wider flex items-center gap-1">
                              <AlertTriangle size={10} />
                              Flagged
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-outline-variant mt-0.5">
                          {mov.categoria} · Ref: {mov.referenciaId ? mov.referenciaId.slice(0, 8) : '—'}
                        </div>
                      </td>
                      <td className="p-sm text-on-surface-variant font-mono text-xs">
                        {formatFechaCompleta(mov.createdAt)}
                      </td>
                      <td className="p-sm text-right">
                        <CantidadCell cantidad={mov.cantidad} tipo={mov.tipo} />
                      </td>
                      <td className="p-sm text-center text-outline font-mono text-xs">
                        {mov.user.name.length > 4
                          ? mov.user.name.split(' ').map((n) => n[0]).join('').slice(0, 3).toUpperCase()
                          : mov.user.name}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="border-t border-white/10 p-sm flex items-center justify-between bg-surface-container-low">
              <span className="font-mono text-xs text-outline-variant">
                Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, movimientos.length)} of {movimientos.length} entries
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-8 h-8 rounded border border-outline-variant flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-variant disabled:opacity-50 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="w-8 h-8 rounded border border-outline-variant flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-variant disabled:opacity-50 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Card Layout */}
          <div className="md:hidden space-y-2">
            {paginatedMovs.map((mov) => (
              <div
                key={mov.id}
                className="bg-surface-container-high rounded-xl border border-white/10 px-4 py-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <DirectionIcon tipo={mov.tipo} />
                    <span className="font-mono text-xs text-outline">
                      TX-{mov.id.slice(0, 5).toUpperCase()}
                    </span>
                  </div>
                  <CantidadCell cantidad={mov.cantidad} tipo={mov.tipo} />
                </div>
                <p className="font-body text-on-surface text-sm font-medium">
                  {mov.productoNombre}
                </p>
                <div className="flex items-center justify-between text-xs text-on-surface-variant">
                  <span>{formatFechaCompleta(mov.createdAt)}</span>
                  <span className="font-mono text-outline">{mov.user.name}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
