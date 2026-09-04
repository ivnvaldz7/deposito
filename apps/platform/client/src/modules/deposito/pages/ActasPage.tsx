import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useActas } from '../queries/use-actas'
import { ApiError } from '../lib/api'
import { formatCantidad } from '../lib/format-units'

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function DateIconButton({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const hasValue = !!value
  return (
    <div className="w-[48px]">
      <label className="block font-body text-[11px] text-on-surface-variant mb-xs font-medium tracking-wider uppercase">
        {label}
      </label>
      <div className="relative">
        <div
          className={`w-full h-[38px] border rounded-lg flex items-center justify-center transition-all pointer-events-none ${
            hasValue
              ? 'border-primary text-primary bg-primary/5'
              : 'border-outline-variant text-on-surface-variant'
          }`}
        >
          <Calendar size={18} />
        </div>
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

import { can } from '@/lib/permissions'

export default function ActasPage() {
  const user = useAuthStore((s) => s.user)
  const canCreate = can(user, 'deposito', 'ingresos.create')
  const navigate = useNavigate()

  const { data: actas = [], isLoading, error } = useActas()

  const [searchQuery, setSearchQuery] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const perPage = 20

  const filtered = useMemo(() => {
    let result = actas

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((acta) =>
        acta.items?.some((item) => item.productoNombre.toLowerCase().includes(q))
      )
    }

    if (fechaDesde) {
      result = result.filter((acta) => acta.fecha.split('T')[0] >= fechaDesde)
    }
    if (fechaHasta) {
      result = result.filter((acta) => acta.fecha.split('T')[0] <= fechaHasta)
    }

    return result
  }, [actas, searchQuery, fechaDesde, fechaHasta])

  const totalPages = Math.ceil(filtered.length / perPage)
  const paginatedActas = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)

  const hasFilters = searchQuery || fechaDesde || fechaHasta

  function clearFilters() {
    setSearchQuery('')
    setFechaDesde('')
    setFechaHasta('')
    setCurrentPage(1)
  }

  return (
    <div className="flex flex-col h-full space-y-lg">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface tracking-tight">
            Actas
          </h1>
          <p className="font-body text-sm text-on-surface-variant mt-1">
            Comprobantes de ingresos al depósito
            {!isLoading && !error && (
              <span className="ml-1">· {actas.length} registros</span>
            )}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => navigate('/deposito/ingresos')}
            className="flex items-center gap-2 bg-primary text-on-primary font-body text-sm font-semibold px-lg py-sm rounded-lg scale-hover transition-transform duration-200 hover:brightness-110 shadow-float"
          >
            <Plus size={16} strokeWidth={2} />
            Nuevo ingreso
          </button>
        )}
      </div>

      <div className="bg-surface-container-high rounded-lg p-md border border-white/10 flex flex-wrap gap-x-md gap-y-sm items-end">
        <div className="flex-1 min-w-[200px] relative">
          <label className="block font-body text-[11px] text-on-surface-variant mb-xs font-medium tracking-wider uppercase">
            Buscar
          </label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              placeholder="Buscar producto..."
              className="w-full bg-surface-container border border-outline-variant rounded-lg pl-[36px] pr-3 h-[38px] text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-all text-xs outline-none"
            />
          </div>
        </div>

        <DateIconButton
          label="Desde"
          value={fechaDesde}
          onChange={(v) => {
            setFechaDesde(v)
            setCurrentPage(1)
          }}
        />
        <DateIconButton
          label="Hasta"
          value={fechaHasta}
          onChange={(v) => {
            setFechaHasta(v)
            setCurrentPage(1)
          }}
        />

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="h-[38px] font-body text-xs text-on-surface-variant hover:text-on-surface transition-colors px-2"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <p className="font-body text-on-surface-variant text-sm">Cargando...</p>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-48">
          <p className="font-body text-error text-sm">{error instanceof ApiError ? error.message : 'No se pudieron cargar las actas'}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 rounded-lg bg-surface-container-high border border-white/10 gap-3">
          <p className="font-body text-on-surface-variant text-sm">
            {hasFilters ? 'No se encontraron actas con esos filtros.' : 'No hay actas registradas todavía.'}
          </p>
          {canCreate && !hasFilters && (
            <p className="font-body text-on-surface-variant/60 text-xs">
              Usá "Nuevo Ingreso" para empezar.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-surface-container border border-white/10 rounded-xl overflow-hidden flex-1 shadow-float flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-surface-container-highest border-b border-white/10">
                <tr>
                  <th className="p-3 font-body text-[11px] font-medium text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Fecha</th>
                  <th className="p-3 font-body text-[11px] font-medium text-on-surface-variant uppercase tracking-wider w-1/3">Producto</th>
                  <th className="p-3 font-body text-[11px] font-medium text-on-surface-variant uppercase tracking-wider">Lote</th>
                  <th className="p-3 font-body text-[11px] font-medium text-on-surface-variant uppercase tracking-wider text-right">Cantidad</th>
                  <th className="p-3 font-body text-[11px] font-medium text-on-surface-variant uppercase tracking-wider text-center">Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedActas.map((acta) => {
                  const items = acta.items ?? []
                  const firstItem = items[0]

                  return (
                    <tr
                      key={acta.id}
                      className="hover:bg-surface-variant/30 transition-colors"
                    >
                      <td className="p-3 font-body text-on-surface tabular-nums whitespace-nowrap">
                        {formatFecha(acta.fecha)}
                      </td>
                      <td className="p-3 font-body text-sm font-medium text-on-surface max-w-[200px] truncate" title={firstItem?.productoNombre ?? '—'}>
                        {firstItem?.productoNombre ?? '—'}
                        {items.length > 1 && (
                          <span className="text-on-surface-variant text-xs ml-2 font-normal">
                            +{items.length - 1} más
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-body text-on-surface-variant">
                        {firstItem?.lote ?? '—'}
                      </td>
                      <td className="p-3 font-body text-on-surface tabular-nums text-right font-medium">
                        {firstItem?.cantidadIngresada ? formatCantidad(firstItem.cantidadIngresada, firstItem.categoria) : '—'}
                      </td>
                      <td className="p-3 font-body text-outline text-center truncate max-w-[100px]" title={acta.user.name}>
                        {acta.user.name}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="border-t border-white/10 p-3 flex items-center justify-end bg-surface-container-low mt-auto">
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setCurrentPage((p) => Math.max(1, p - 1))
                  }}
                  disabled={currentPage === 1}
                  className="w-8 h-8 rounded-lg border border-outline-variant flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-variant disabled:opacity-50 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }}
                  disabled={currentPage === totalPages}
                  className="w-8 h-8 rounded-lg border border-outline-variant flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-variant disabled:opacity-50 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
