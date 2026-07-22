import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useMovimientos } from '../queries'
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

interface Movimiento {
  id: string
  tipo: TipoMovimiento
  categoria: string
  productoNombre: string
  cantidad: number
  referenciaId: string | null
  justificacion: string | null
  createdAt: string
  user: { name: string }
}

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

function DirectionIcon({ tipo }: { tipo: TipoMovimiento }) {
  if (tipo === 'ingreso_acta') {
    return <ArrowDown size={20} className="text-primary" strokeWidth={2} />
  }
  return <ArrowUp size={20} className="text-tertiary" strokeWidth={2} />
}

function CantidadCell({ cantidad, tipo }: { cantidad: number; tipo: TipoMovimiento }) {
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

// ─── Filters bar ─────────────────────────────────────────────────────────────

interface Filters {
  tipo: string
  producto: string
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

  function handleProductoChange(v: string) {
    setProductoLocal(v)
    if (productoTimer.current) clearTimeout(productoTimer.current)
    productoTimer.current = setTimeout(() => {
      onChange({ ...filters, producto: v })
    }, 350)
  }

  const hasFilters = filters.tipo || filters.producto || filters.desde || filters.hasta

  return (
    <div className="bg-surface-container-high rounded-lg p-md border border-white/10 flex flex-wrap gap-md items-end">
      {/* Product Search */}
      <div className="flex-1 min-w-[200px]">
        <label className="block font-body text-xs text-on-surface-variant mb-xs font-medium">
          Product Search
        </label>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <input
            type="text"
            value={productoLocal}
            onChange={(e) => handleProductoChange(e.target.value)}
            placeholder="Scan or type ID..."
            className="w-full bg-surface-container border border-outline-variant rounded-lg pl-[36px] pr-3 py-2 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono text-xs outline-none"
          />
        </div>
      </div>

      {/* Movement Type */}
      <div className="w-[180px]">
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

      {/* Date Range */}
      <div className="w-[220px]">
        <label className="block font-body text-xs text-on-surface-variant mb-xs font-medium">
          Date Range
        </label>
        <div className="flex items-center bg-surface-container border border-outline-variant rounded-lg px-3 py-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all gap-2">
          <Calendar size={16} className="text-outline shrink-0" />
          <input
            type="date"
            value={filters.desde}
            onChange={(e) => onChange({ ...filters, desde: e.target.value })}
            className="bg-transparent border-none p-0 text-on-surface font-body text-sm outline-none w-full [color-scheme:dark]"
            placeholder="Desde"
          />
          <span className="text-outline">—</span>
          <input
            type="date"
            value={filters.hasta}
            onChange={(e) => onChange({ ...filters, hasta: e.target.value })}
            className="bg-transparent border-none p-0 text-on-surface font-body text-sm outline-none w-full [color-scheme:dark]"
            placeholder="Hasta"
          />
        </div>
      </div>

      {/* Clear */}
      {hasFilters && (
        <button
          onClick={() => {
            setProductoLocal('')
            onChange({ tipo: '', producto: '', desde: '', hasta: '' })
          }}
          className="font-body text-xs text-on-surface-variant hover:text-on-surface transition-colors py-2"
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
    filters.tipo || filters.producto || filters.desde || filters.hasta ? filters : undefined
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
          <p className="font-body text-error text-sm">{error}</p>
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
