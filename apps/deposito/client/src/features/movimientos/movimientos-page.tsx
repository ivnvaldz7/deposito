import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient } from '@/lib/api-client'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

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
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatHora(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

const TIPO_CONFIG: Record<TipoMovimiento, { label: string; color: string; bg: string }> = {
  ingreso_acta:  { label: 'Ingreso Acta',  color: '#00AE42', bg: 'rgba(0,174,66,0.10)' },
  egreso_orden:  { label: 'Egreso Orden',  color: '#FF9800', bg: 'rgba(255,152,0,0.10)' },
  ajuste_manual: { label: 'Ajuste Manual', color: '#2196F3', bg: 'rgba(33,150,243,0.10)' },
}

// ─── Chips ────────────────────────────────────────────────────────────────────

function TipoChip({ tipo }: { tipo: TipoMovimiento }) {
  const c = TIPO_CONFIG[tipo]
  return (
    <span
      className="inline-block font-body text-xs font-medium px-2 py-0.5 rounded"
      style={{ color: c.color, backgroundColor: c.bg }}
    >
      {c.label}
    </span>
  )
}

function CantidadCell({ cantidad }: { cantidad: number }) {
  const positive = cantidad >= 0
  return (
    <span
      className="font-body text-sm tabular-nums font-medium"
      style={{ color: positive ? '#00AE42' : '#FF9800' }}
    >
      {positive ? '+' : ''}{cantidad}
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
  // Debounce producto input
  const productoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [productoLocal, setProductoLocal] = useState(filters.producto)

  function handleProductoChange(v: string) {
    setProductoLocal(v)
    if (productoTimer.current) clearTimeout(productoTimer.current)
    productoTimer.current = setTimeout(() => {
      onChange({ ...filters, producto: v })
    }, 350)
  }

  return (
    <div className="flex flex-wrap gap-3 items-end">
      {/* Tipo */}
      <div className="space-y-1">
        <label htmlFor="movimientos-tipo" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
          Tipo
        </label>
        <select
          id="movimientos-tipo"
          value={filters.tipo}
          onChange={(e) => onChange({ ...filters, tipo: e.target.value })}
          className="input-field w-44 py-2 text-sm cursor-pointer"
        >
          <option value="">Todos</option>
          <option value="ingreso_acta">Ingreso Acta</option>
          <option value="egreso_orden">Egreso Orden</option>
          <option value="ajuste_manual">Ajuste Manual</option>
        </select>
      </div>

      {/* Producto */}
      <div className="space-y-1">
        <label htmlFor="movimientos-producto" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
          Producto
        </label>
        <input
          id="movimientos-producto"
          type="text"
          value={productoLocal}
          onChange={(e) => handleProductoChange(e.target.value)}
          placeholder="Buscar producto..."
          className="input-field w-52 py-2 text-sm"
        />
      </div>

      {/* Desde */}
      <div className="space-y-1">
        <label htmlFor="movimientos-desde" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
          Desde
        </label>
        <input
          id="movimientos-desde"
          type="date"
          value={filters.desde}
          onChange={(e) => onChange({ ...filters, desde: e.target.value })}
          className="input-field w-40 py-2 text-sm"
        />
      </div>

      {/* Hasta */}
      <div className="space-y-1">
        <label htmlFor="movimientos-hasta" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
          Hasta
        </label>
        <input
          id="movimientos-hasta"
          type="date"
          value={filters.hasta}
          onChange={(e) => onChange({ ...filters, hasta: e.target.value })}
          className="input-field w-40 py-2 text-sm"
        />
      </div>

      {/* Clear */}
      {(filters.tipo || filters.producto || filters.desde || filters.hasta) && (
        <button
          onClick={() => {
            setProductoLocal('')
            onChange({ tipo: '', producto: '', desde: '', hasta: '' })
          }}
          className="font-body text-xs text-on-surface-variant hover:text-on-surface transition-colors py-2"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function MovimientosPage() {
  const token = useAuthStore((s) => s.token)
  const [searchParams] = useSearchParams()

  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filters, setFilters] = useState<Filters>({
    tipo: '',
    producto: searchParams.get('producto') ?? '',
    desde: '',
    hasta: '',
  })

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      producto: searchParams.get('producto') ?? '',
    }))
  }, [searchParams])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (filters.tipo) params.set('tipo', filters.tipo)
      if (filters.producto) params.set('producto', filters.producto)
      if (filters.desde) params.set('desde', filters.desde)
      if (filters.hasta) params.set('hasta', filters.hasta)
      const qs = params.toString()
      try {
        const data = await apiClient.get<Movimiento[]>(`/movimientos${qs ? `?${qs}` : ''}`, token)
        setMovimientos(data)
      } catch {
        setError('No se pudo cargar los movimientos')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [filters.tipo, filters.producto, filters.desde, filters.hasta, token])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-on-surface font-semibold text-xl">Movimientos</h1>
        <p className="font-body text-on-surface-variant text-sm mt-0.5">
          Historial de auditoría
          {!loading && !error && (
            <span className="ml-1">· {movimientos.length} registros</span>
          )}
        </p>
      </div>

      {/* Filters */}
      <FiltersBar key={filters.producto} filters={filters} onChange={setFilters} />

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <p className="font-body text-on-surface-variant text-sm">Cargando...</p>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-48">
          <p className="font-body text-error text-sm">{error}</p>
        </div>
      ) : movimientos.length === 0 ? (
        <div className="flex items-center justify-center h-48 bg-surface-low rounded">
          <p className="font-body text-on-surface-variant text-sm">
            Sin movimientos para los filtros aplicados.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-surface-low rounded overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="w-24">Cantidad</TableHead>
                  <TableHead className="w-28">Referencia</TableHead>
                  <TableHead>Usuario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimientos.map((mov) => (
                  <TableRow key={mov.id}>
                    <TableCell>
                      <p className="font-body text-on-surface text-sm tabular-nums">
                        {formatFecha(mov.createdAt)}
                      </p>
                      <p className="font-body text-on-surface-variant text-xs tabular-nums">
                        {formatHora(mov.createdAt)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <TipoChip tipo={mov.tipo} />
                    </TableCell>
                    <TableCell className="font-body text-on-surface text-sm max-w-xs truncate">
                      {mov.productoNombre}
                    </TableCell>
                    <TableCell>
                      <CantidadCell cantidad={mov.cantidad} />
                    </TableCell>
                    <TableCell className="font-body text-on-surface-variant text-xs tabular-nums">
                      {mov.referenciaId ? mov.referenciaId.slice(0, 8) + '…' : '—'}
                    </TableCell>
                    <TableCell className="font-body text-on-surface-variant text-sm">
                      {mov.user.name}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {movimientos.map((mov) => (
              <div
                key={mov.id}
                className="bg-surface-low rounded px-4 py-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <TipoChip tipo={mov.tipo} />
                  <span className="font-body text-xs text-on-surface-variant tabular-nums">
                    {formatFecha(mov.createdAt)} {formatHora(mov.createdAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-body text-on-surface text-sm flex-1 truncate min-w-0">
                    {mov.productoNombre}
                  </p>
                  <CantidadCell cantidad={mov.cantidad} />
                </div>
                <p className="font-body text-on-surface-variant text-xs">
                  {mov.user.name}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
