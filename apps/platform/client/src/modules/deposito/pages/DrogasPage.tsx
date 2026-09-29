import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Pill, FlaskConical, Syringe
} from 'lucide-react'
import { ApiError } from '../lib/api'
import { useDrogas, type DrogaRecord } from '../queries/use-drogas'
import { fetchCatalogoProductos } from '../lib/catalogo-productos'
import { EmptyState, ErrorState, LoadingState } from '../components/inventory-shared/inventory-states'
import { useProductFocus } from '../hooks/use-product-focus'
import { DrugStatus, getDrugLotStatus, getDrugStatusDescription } from '../lib/drug-status'
import { StockChip } from '../components/inventory-shared/stock-chip'
import { compareProductsByNaturalPresentation } from '@/lib/natural-product-order'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DrogaGroup {
  nombre: string
  totalCantidad: number
  lotes: DrogaRecord[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupDrogas(records: DrogaRecord[], getDisplayName: (record: DrogaRecord) => string): DrogaGroup[] {
  const map = new Map<string, DrogaRecord[]>()
  for (const r of records) {
    const displayName = getDisplayName(r)
    if (!map.has(displayName)) map.set(displayName, [])
    map.get(displayName)!.push(r)
  }

  return Array.from(map.entries())
    .map(([nombre, lotes]) => ({
      nombre,
      totalCantidad: lotes.reduce((s, l) => s + l.cantidad, 0),
      lotes: [...lotes].sort((a, b) => {
        if (!a.vencimiento && !b.vencimiento) return 0
        if (!a.vencimiento) return 1
        if (!b.vencimiento) return -1
        return new Date(a.vencimiento).getTime() - new Date(b.vencimiento).getTime()
      }),
    }))
    .sort((a, b) => compareProductsByNaturalPresentation(a.nombre, b.nombre))
}

function normalizeProducto(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function DrugStatusBadge({ status }: { status: DrugStatus }) {
  const styles = {
    optimo: 'bg-primary-container/10 text-primary',
    en_seguimiento: 'bg-primary-container/5 text-primary/70',
    reanalizar_pronto: 'bg-yellow-500/10 text-yellow-600',
    reanalisis_proximo: 'bg-yellow-500/20 text-yellow-700',
    reanalisis_requerido: 'bg-amber-500/10 text-amber-600',
    vencido: 'bg-error-container/10 text-error',
    sin_informacion: 'bg-surface-variant/50 text-on-surface-variant'
  }
  
  const labels = {
    optimo: 'Óptimo',
    en_seguimiento: 'En seguimiento',
    reanalizar_pronto: 'Reanalizar pronto',
    reanalisis_proximo: 'Reanálisis próximo',
    reanalisis_requerido: 'Reanálisis requerido',
    vencido: 'Vencido',
    sin_informacion: 'Sin información',
  }

  return (
    <span className={`inline-flex items-center gap-1.5 font-body text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${styles[status]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {labels[status]}
    </span>
  )
}

function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '-'
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
}

function getDaysRemaining(isoDate: string | null | undefined): string {
  if (!isoDate) return '-'
  const target = new Date(isoDate)
  target.setHours(23, 59, 59, 999)
  const diff = Math.ceil((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return 'Superada'
  if (diff === 0) return 'Hoy'
  return `Faltan ${diff} días`
}

// ─── Drug category icons ─────────────────────────────────────────────────────

function DrugIcon({ nombre }: { nombre: string }) {
  const lower = nombre.toLowerCase()
  if (lower.includes('vacuna') || lower.includes('vaccine')) return <Syringe size={18} />
  if (lower.includes('reagent') || lower.includes('reactivo')) return <FlaskConical size={18} />
  return <Pill size={18} />
}

function DrugQuantityAdjustment({ lote }: { lote: DrogaRecord }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [cantidad, setCantidad] = useState(String(lote.cantidad))
  const [motivo, setMotivo] = useState('')

  const adjustment = useMutation({
    mutationFn: (data: { cantidad: number; motivo: string }) =>
      api.patch(`/drogas/${lote.id}/cantidad`, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['deposito'] })
      setEditing(false)
      setMotivo('')
    },
  })

  // Catalog-only zero rows do not identify a real lot. They must be entered
  // through an Acta so lote and vencimiento remain mandatory for drugs.
  if (lote.id.startsWith('catalog:')) return null

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setCantidad(String(lote.cantidad))
          setEditing(true)
        }}
        className="rounded-lg border border-primary/60 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
      >
        Ajustar cantidad
      </button>
    )
  }

  const cantidadNumerica = Number(cantidad)
  const cantidadInvalida = cantidad.trim() === '' || !Number.isFinite(cantidadNumerica) || cantidadNumerica < 0

  return (
    <form
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        if (cantidadInvalida || motivo.trim().length < 3) return
        adjustment.mutate({ cantidad: cantidadNumerica, motivo: motivo.trim() })
      }}
      className="mt-4 rounded-lg border border-primary/30 bg-surface-container p-3"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Ajustar cantidad del lote</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
        <label className="block text-xs text-on-surface-variant">
          Cantidad final
          <input
            aria-label="Cantidad final"
            type="number"
            min="0"
            step="any"
            value={cantidad}
            onChange={(event) => setCantidad(event.target.value)}
            className="input-field mt-1 w-full"
          />
        </label>
        <label className="block text-xs text-on-surface-variant">
          Motivo del ajuste
          <input
            aria-label="Motivo del ajuste"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Ej.: recuento físico"
            maxLength={500}
            className="input-field mt-1 w-full"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setEditing(false); setMotivo('') }}
            disabled={adjustment.isPending}
            className="rounded-lg border border-outline-variant px-3 py-2 text-xs font-semibold text-on-surface-variant"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={cantidadInvalida || motivo.trim().length < 3 || adjustment.isPending}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {adjustment.isPending ? 'Guardando…' : 'Guardar ajuste'}
          </button>
        </div>
      </div>
      {adjustment.error && (
        <p role="alert" className="mt-2 text-xs text-error">
          {adjustment.error instanceof ApiError ? adjustment.error.message : 'No se pudo guardar el ajuste.'}
        </p>
      )}
    </form>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function DrogasPage() {
  const [searchParams] = useSearchParams()

  const { data: records = [], isLoading, error } = useDrogas()
  const [catalogMap, setCatalogMap] = useState<Record<string, string>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  useEffect(() => {
    fetchCatalogoProductos('droga')
      .then((productos) => {
        setCatalogMap(
          Object.fromEntries(productos.map((producto) => [producto.id, producto.nombreCompleto]))
        )
      })
      .catch(() => {})
  }, [])

  const groups = useMemo(
    () =>
      groupDrogas(records, (record) =>
        record.productoId ? (catalogMap[record.productoId] ?? record.nombre) : record.nombre
      ),
    [records, catalogMap]
  )
  const activeProductCount = new Set(records.map((record) => record.productoId ?? normalizeProducto(record.nombre))).size

  const productoFiltro = searchParams.get('producto') ?? ''
  const productoIdFiltro = searchParams.get('productoId')
  const hasFocusSignal = Boolean(searchParams.get('focus'))
  const focus = useProductFocus(records.map((record) => ({ id: record.id, productoId: record.productoId, name: record.productoId ? (catalogMap[record.productoId] ?? record.nombre) : record.nombre })))
  
  const filteredGroups = useMemo(() => {
    const selectedRecord = hasFocusSignal
      ? records.find((record) =>
          (productoIdFiltro && record.productoId === productoIdFiltro)
          || (productoFiltro && normalizeProducto(record.productoId ? (catalogMap[record.productoId] ?? record.nombre) : record.nombre) === normalizeProducto(productoFiltro)))
      : undefined
    if (hasFocusSignal && (productoIdFiltro || productoFiltro) && !selectedRecord) return []
    if (selectedRecord) {
      return groups.filter((group) => normalizeProducto(group.nombre) === normalizeProducto(selectedRecord.productoId ? (catalogMap[selectedRecord.productoId] ?? selectedRecord.nombre) : selectedRecord.nombre))
    }
    if (productoFiltro) {
      const target = normalizeProducto(productoFiltro)
      return groups.filter((group) => normalizeProducto(group.nombre) === target)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return groups.filter(
        (g) =>
          g.nombre.toLowerCase().includes(q) ||
          g.lotes.some((l) => l.lote?.toLowerCase().includes(q) || l.codigo?.toLowerCase().includes(q))
      )
    }
    return groups
  }, [groups, records, productoFiltro, productoIdFiltro, hasFocusSignal, searchQuery, catalogMap])

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message={error instanceof ApiError ? error.message : 'No se pudo cargar el inventario'} />

  const toggleRow = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between mb-lg">
        <div className="flex items-center gap-md">
          <h1 className="text-xl font-semibold text-on-surface tracking-tight">
            Drogas
          </h1>
          <span className="bg-surface-variant text-on-surface-variant text-xs px-2 py-1 rounded-md border border-white/5">
            {activeProductCount} activas
          </span>
        </div>
        <div className="flex items-center gap-3"><div className="relative group">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre o lote..."
            className="w-64 bg-surface-container-high border border-outline-variant rounded-lg pl-10 pr-4 py-2 font-body text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
          />
        </div></div>
      </header>

      {filteredGroups.length === 0 ? (
        searchQuery ? (
          <div className="animate-fade-up flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 rounded-full bg-surface-variant flex items-center justify-center">
              <Search size={24} className="text-on-surface-variant" />
            </div>
            <p className="font-body text-base text-on-surface-variant">No se encontró <strong className="text-on-surface">{searchQuery}</strong></p>
            <p className="font-body text-sm text-on-surface-variant/60">Probá con otro nombre o número de lote</p>
          </div>
        ) : (
          <EmptyState message="No hay drogas cargadas todavía." />
        )
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-surface-container rounded-xl border border-outline-variant shadow-float overflow-hidden">
            <div className="grid grid-cols-12 gap-4 px-4 py-2.5 border-b border-outline-variant bg-surface-container-low font-body text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              <div className="col-span-4">Producto</div>
              <div className="col-span-3">Lote</div>
              <div className="col-span-2 text-right">Cantidad</div>
              <div className="col-span-3 text-center">Estado</div>
            </div>

            <div className="flex flex-col">
              {filteredGroups.map((group, gi) =>
                group.lotes.map((lote, li) => {
                  const idx = gi + li
                  const rowId = lote.id ? `lote:${lote.id}` : `droga:${lote.productoId || group.nombre}`
                  const isExpanded = expandedRowId === rowId
                  // We simulate reanalisis as null because the backend doesn't provide it yet
                  // but we pass updatedAt as ingreso.
                  const status = getDrugLotStatus({
                    lote: lote.lote,
                    vencimiento: lote.vencimiento,
                    ingreso: lote.updatedAt,
                    reanalisis: null,
                  })
                  
                  return (
                    <div key={rowId} className="flex flex-col border-b border-outline-variant/20 last:border-b-0">
                      <div
                        {...focus.targetProps(rowId)}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => toggleRow(rowId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            toggleRow(rowId)
                          }
                        }}
                        style={{ animationDelay: `${idx * 0.03}s` }}
                        className={`grid grid-cols-12 gap-4 px-4 py-3 items-center transition-all duration-200 hover:bg-surface-variant/30 animate-fade-up focus:outline-none cursor-pointer ${
                          focus.isFocused(rowId) ? 'bg-primary/10 ring-2 ring-inset ring-primary/50' : ''
                        } ${isExpanded ? 'bg-surface-variant/20' : ''}`}
                      >
                        <div className="col-span-4 flex items-center gap-2 min-w-0">
                          <DrugIcon nombre={group.nombre} />
                          <span className="font-body text-sm font-medium text-on-surface truncate">
                            {lote.productoId ? (catalogMap[lote.productoId] ?? group.nombre) : group.nombre}
                          </span>
                        </div>
                        <div className="col-span-3 text-sm text-on-surface">
                          {lote.lote ?? <span className="italic text-on-surface-variant">Sin lote</span>}
                        </div>
                        <div className="col-span-2 text-right text-sm text-on-surface font-medium tabular-nums">
                          <span>{lote.cantidad}</span>
                        </div>
                        <div className="col-span-3 flex items-center justify-center">
                          <div className="flex items-center gap-2">
                            <StockChip cantidad={lote.cantidad} stockMinimo={lote.stockMinimo} />
                            <DrugStatusBadge status={status} />
                          </div>
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="bg-surface-container-high border-t border-outline-variant/20 p-4 font-body text-sm text-on-surface transition-all animate-fade-in">
                          <div className="grid grid-cols-4 gap-6">
                            <div>
                              <p className="text-xs text-on-surface-variant mb-1 uppercase tracking-wider">Fecha de ingreso</p>
                              <p className="font-medium tabular-nums">{formatDate(lote.updatedAt)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-on-surface-variant mb-1 uppercase tracking-wider">Reanálisis</p>
                              <p className="font-medium tabular-nums">-</p>
                            </div>
                            <div>
                              <p className="text-xs text-on-surface-variant mb-1 uppercase tracking-wider">Vencimiento</p>
                              <p className="font-medium tabular-nums">{formatDate(lote.vencimiento)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-on-surface-variant mb-1 uppercase tracking-wider">Próximo control</p>
                              <p className="font-medium tabular-nums">{status === 'sin_informacion' || status === 'vencido' ? '-' : getDaysRemaining(null)}</p>
                            </div>
                          </div>
                          
                          <div className="mt-4 pt-4 border-t border-white/5 flex items-start gap-2">
                            <div className="mt-0.5"><DrugStatusBadge status={status} /></div>
                            <p className="text-on-surface-variant text-sm flex-1 leading-tight pt-0.5">
                              {getDrugStatusDescription(status)}
                            </p>
                          </div>
                          <div className="mt-4">
                            <DrugQuantityAdjustment lote={lote} />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden flex flex-col gap-2">
            {filteredGroups.map((group, gi) =>
              group.lotes.map((lote, li) => {
                const idx = gi + li
                const rowId = lote.id ? `lote:${lote.id}` : `droga:${lote.productoId || group.nombre}`
                const isExpanded = expandedRowId === rowId
                const status = getDrugLotStatus({
                  lote: lote.lote,
                  vencimiento: lote.vencimiento,
                  ingreso: lote.updatedAt,
                  reanalisis: null,
                })

                return (
                  <div
                    key={rowId}
                    {...focus.targetProps(rowId)}
                    style={{ animationDelay: `${idx * 0.03}s` }}
                    className={`bg-surface-container-high rounded-lg overflow-hidden border border-white/10 flex flex-col animate-fade-up focus:outline-none ${focus.isFocused(rowId) ? 'ring-2 ring-primary/60' : ''}`}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onClick={() => toggleRow(rowId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleRow(rowId)
                        }
                      }}
                      className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-surface-variant/20 transition-colors"
                    >
                      <DrugIcon nombre={group.nombre} />
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="font-body text-sm font-medium text-on-surface truncate">
                          {lote.productoId ? (catalogMap[lote.productoId] ?? group.nombre) : group.nombre}
                        </span>
                        <span className="text-xs text-on-surface-variant shrink-0">
                          {lote.lote ?? 'Sin lotes'}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-on-surface tabular-nums shrink-0">
                        {lote.cantidad}
                      </span>
                      <div className="flex items-center gap-2">
                        <StockChip cantidad={lote.cantidad} stockMinimo={lote.stockMinimo} />
                        <DrugStatusBadge status={status} />
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="bg-surface-container-highest border-t border-white/5 p-4 font-body text-sm transition-all">
                        <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                          <div>
                            <p className="text-xs text-on-surface-variant mb-1 uppercase tracking-wider">Ingreso</p>
                            <p className="font-medium tabular-nums">{formatDate(lote.updatedAt)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-on-surface-variant mb-1 uppercase tracking-wider">Vencimiento</p>
                            <p className="font-medium tabular-nums">{formatDate(lote.vencimiento)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-on-surface-variant mb-1 uppercase tracking-wider">Reanálisis</p>
                            <p className="font-medium tabular-nums">-</p>
                          </div>
                          <div>
                            <p className="text-xs text-on-surface-variant mb-1 uppercase tracking-wider">Próximo control</p>
                            <p className="font-medium tabular-nums">-</p>
                          </div>
                        </div>
                        
                        <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-2">
                          <div><DrugStatusBadge status={status} /></div>
                          <p className="text-on-surface-variant text-sm">
                            {getDrugStatusDescription(status)}
                          </p>
                        </div>
                        <div className="mt-4">
                          <DrugQuantityAdjustment lote={lote} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
