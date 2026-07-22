import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Calendar, X } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useActas } from '../queries/use-actas'
import { ApiError } from '../lib/api'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/Table'
import { EstadoChip } from '../components/EstadoChip'
import type { ActaListItem } from '../lib/actas-types'

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function uniqueJoined(values: string[]): string {
  return [...new Set(values)].join(', ')
}

export default function ActasPage() {
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.apps?.['deposito']?.rol === 'encargado'
  const navigate = useNavigate()

  const { data: actas = [], isLoading, error } = useActas()

  const [searchQuery, setSearchQuery] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  const filtered = useMemo(() => {
    let result = actas

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((acta) =>
        acta.items?.some((item) => item.productoNombre.toLowerCase().includes(q))
      )
    }

    if (fechaDesde) {
      result = result.filter((acta) => acta.fecha >= fechaDesde)
    }
    if (fechaHasta) {
      result = result.filter((acta) => acta.fecha <= fechaHasta)
    }

    return result
  }, [actas, searchQuery, fechaDesde, fechaHasta])

  const hasFilters = searchQuery || fechaDesde || fechaHasta

  function clearFilters() {
    setSearchQuery('')
    setFechaDesde('')
    setFechaHasta('')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="font-body text-on-surface-variant text-sm">Cargando...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="font-body text-error text-sm">{error instanceof ApiError ? error.message : 'No se pudieron cargar las actas'}</p>
      </div>
    )
  }

  const completadasCount = actas.filter((a) => a.estado === 'completada').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-on-surface tracking-tight">
            Actas
          </h1>
          <p className="font-body text-sm text-on-surface-variant mt-1">
            {actas.length} actas · {completadasCount} completadas
          </p>
        </div>
        {isEncargado && (
          <button
            onClick={() => navigate('/ingresos')}
            className="flex items-center gap-2 bg-primary text-on-primary font-body text-sm font-semibold px-lg py-sm rounded-lg scale-hover transition-transform duration-200 hover:brightness-110 shadow-float"
          >
            <Plus size={16} strokeWidth={2} />
            Nuevo ingreso
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por producto..."
            className="input-field pl-9 py-2 text-sm"
          />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-on-surface-variant shrink-0" />
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="input-field py-2 text-sm [color-scheme:dark]"
            title="Fecha desde"
          />
          <span className="text-on-surface-variant text-xs">a</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="input-field py-2 text-sm [color-scheme:dark]"
            title="Fecha hasta"
          />
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <X size={14} />
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 bg-surface-low rounded gap-3">
          <p className="font-body text-on-surface-variant text-sm">
            {hasFilters ? 'No se encontraron actas con esos filtros.' : 'No hay actas registradas todavía.'}
          </p>
          {isEncargado && !hasFilters && (
            <p className="font-body text-on-surface-variant/60 text-xs">
              Usá "Nuevo Ingreso" para empezar.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-surface-low rounded overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((acta) => {
                const items = acta.items ?? []
                const firstItem = items[0]

                return (
                  <TableRow
                    key={acta.id}
                    onClick={() => navigate(`/actas/${acta.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-body text-on-surface tabular-nums whitespace-nowrap">
                      {formatFecha(acta.fecha)}
                    </TableCell>
                    <TableCell
                      className="font-body text-on-surface text-sm max-w-[200px] truncate"
                      title={firstItem?.productoNombre ?? '—'}
                    >
                      {firstItem?.productoNombre ?? '—'}
                      {items.length > 1 && (
                        <span className="text-on-surface-variant text-xs ml-1">
                          +{items.length - 1} más
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-body text-on-surface-variant text-sm font-mono">
                      {firstItem?.lote ?? '—'}
                    </TableCell>
                    <TableCell className="font-body text-on-surface tabular-nums">
                      {firstItem?.cantidadIngresada ?? '—'} uds
                    </TableCell>
                    <TableCell>
                      <EstadoChip estado={acta.estado} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
