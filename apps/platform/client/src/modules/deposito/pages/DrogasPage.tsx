import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Trash2, CalendarClock, Search, Pill, FlaskConical,
  Edit, Syringe, Check, X,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { ApiError } from '../lib/api'
import { useDrogas, useDeleteDroga, useUpdateDroga } from '../queries/use-drogas'
import { toast } from '../lib/toast'
import { fetchCatalogoProductos } from '../lib/catalogo-productos'
import { EmptyState, ErrorState, LoadingState } from '../components/inventory-shared/inventory-states'
import { StatusBadge } from '@/components/ui/StatusBadge'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DrogaGroup {
  nombre: string
  totalCantidad: number
  lotes: DrogaRecord[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STOCK_BAJO_THRESHOLD = 10
const VENCE_PRONTO_DIAS = 30
const VENCE_MEDIO_DIAS = 60

function diasHastaVencimiento(vencimiento: string): number {
  return Math.floor((new Date(vencimiento).getTime() - Date.now()) / 86_400_000)
}

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
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

function normalizeProducto(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

function getStatusVariant(cantidad: number): 'optimal' | 'low' | 'critical' {
  if (cantidad < 5) return 'critical'
  if (cantidad < STOCK_BAJO_THRESHOLD) return 'low'
  return 'optimal'
}

// ─── Vencimiento chip ─────────────────────────────────────────────────────────

function VencimientoChip({ vencimiento }: { vencimiento: string | null }) {
  if (!vencimiento) return null
  const dias = diasHastaVencimiento(vencimiento)
  const fecha = new Date(vencimiento).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })

  let variant: 'optimal' | 'warning' | 'error' = 'optimal'
  if (dias < 0 || dias <= VENCE_PRONTO_DIAS) {
    variant = 'error'
  } else if (dias <= VENCE_MEDIO_DIAS) {
    variant = 'warning'
  }

  return (
    <span
      className={`inline-flex items-center gap-1 font-body text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
        variant === 'error'
          ? 'bg-error-container/10 text-error'
          : variant === 'warning'
          ? 'bg-tertiary-container/10 text-tertiary'
          : 'bg-primary-container/10 text-primary'
      }`}
      title={dias < 0 ? 'VENCIDO' : `Vence en ${dias} días`}
    >
      <CalendarClock size={10} strokeWidth={1.5} />
      {fecha}
    </span>
  )
}

// ─── Drug category icons ─────────────────────────────────────────────────────

function DrugIcon({ nombre }: { nombre: string }) {
  const lower = nombre.toLowerCase()
  if (lower.includes('vacuna') || lower.includes('vaccine')) return <Syringe size={18} />
  if (lower.includes('reagent') || lower.includes('reactivo')) return <FlaskConical size={18} />
  return <Pill size={18} />
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function DrogasPage() {
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.apps?.['deposito']?.rol === 'encargado'
  const [searchParams] = useSearchParams()

  const { data: records = [], isLoading, error } = useDrogas()
  const deleteMutation = useDeleteDroga()
  const updateMutation = useUpdateDroga()
  const [catalogMap, setCatalogMap] = useState<Record<string, string>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [editingLote, setEditingLote] = useState<string | null>(null)
  const [loteValue, setLoteValue] = useState('')

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

  const productoFiltro = searchParams.get('producto') ?? ''
  const filteredGroups = useMemo(() => {
    if (productoFiltro) {
      const target = normalizeProducto(productoFiltro)
      return groups.filter((group) => normalizeProducto(group.nombre) === target)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return groups.filter(
        (g) =>
          g.nombre.toLowerCase().includes(q) ||
          g.lotes.some((l) => l.lote?.toLowerCase().includes(q))
      )
    }
    return groups
  }, [groups, productoFiltro, searchQuery])

  async function handleDelete(id: string, nombre: string) {
    try {
      await deleteMutation.mutateAsync(id)
      toast.success(`Droga "${nombre}" eliminada.`)
    } catch {
      toast.error('No se pudo eliminar la droga.')
    }
  }

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message={error instanceof ApiError ? error.message : 'No se pudo cargar el inventario'} />

  function startEditLote(id: string, current: string | null) {
    setEditingLote(id)
    setLoteValue(current ?? '')
  }

  async function saveLote(id: string) {
    try {
      await updateMutation.mutateAsync({ id, lote: loteValue.trim() || null })
      toast.success('Lote actualizado')
      setEditingLote(null)
    } catch {
      toast.error('No se pudo actualizar el lote')
    }
  }

  function cancelEditLote() {
    setEditingLote(null)
    setLoteValue('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between mb-lg">
        <div className="flex items-center gap-md">
          <h1 className="font-heading text-xl font-semibold text-on-surface tracking-tight">
            Drogas
          </h1>
          <span className="bg-surface-variant text-on-surface-variant font-mono text-xs px-2 py-1 rounded-md border border-white/5">
            {groups.length} activas
          </span>
        </div>
        <div className="relative group">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre o lote..."
            className="w-64 bg-surface-container-high border border-outline-variant rounded-lg pl-10 pr-4 py-2 font-body text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
          />
        </div>
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
                  return (
                    <div
                      key={lote.id}
                      style={{ animationDelay: `${idx * 0.03}s` }}
                      className={`grid grid-cols-12 gap-4 px-4 py-3 items-center transition-all duration-200 hover:bg-surface-variant/30 animate-fade-up ${
                        idx > 0 ? 'border-t border-outline-variant/20' : ''
                      }`}
                    >
                      <div className="col-span-4 flex items-center gap-2 min-w-0">
                        <DrugIcon nombre={group.nombre} />
                        <span className="font-body text-sm font-medium text-on-surface truncate">
                          {lote.productoId ? (catalogMap[lote.productoId] ?? group.nombre) : group.nombre}
                        </span>
                      </div>
                      <div className="col-span-3 font-mono text-sm text-on-surface">
                        {editingLote === lote.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={loteValue}
                              onChange={(e) => setLoteValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveLote(lote.id)
                                if (e.key === 'Escape') cancelEditLote()
                              }}
                              className="w-full bg-surface-container-high border border-outline-variant rounded px-2 py-1 text-sm font-mono text-on-surface focus:outline-none focus:border-primary"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => saveLote(lote.id)}
                              className="shrink-0 p-1 rounded text-primary hover:bg-primary-container/20 transition-colors"
                              title="Confirmar"
                            >
                              <Check size={16} strokeWidth={2} />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditLote}
                              className="shrink-0 p-1 rounded text-on-surface-variant hover:text-error hover:bg-error-container/10 transition-colors"
                              title="Cancelar"
                            >
                              <X size={16} strokeWidth={2} />
                            </button>
                          </div>
                        ) : (
                          lote.lote ?? <span className="italic text-on-surface-variant">Sin lote</span>
                        )}
                      </div>
                      <div className="col-span-2 text-right font-mono text-sm text-on-surface font-medium tabular-nums">
                        {lote.cantidad}
                      </div>
                      <div className="col-span-3 flex items-center justify-center gap-2">
                        <StatusBadge
                          variant={getStatusVariant(lote.cantidad)}
                          label={getStatusVariant(lote.cantidad) === 'optimal' ? 'Optimo' : getStatusVariant(lote.cantidad) === 'low' ? 'Bajo' : 'Crítico'}
                          showDot={getStatusVariant(lote.cantidad) !== 'critical'}
                        />
                        <VencimientoChip vencimiento={lote.vencimiento} />
                        <button
                          type="button"
                          onClick={() => startEditLote(lote.id, lote.lote)}
                          className="hover:text-primary transition-colors shrink-0 ml-1 p-1 rounded hover:bg-surface-variant"
                          title="Editar lote"
                        >
                          <Edit size={14} />
                        </button>
                      </div>
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
                return (
                  <div
                    key={lote.id}
                    style={{ animationDelay: `${idx * 0.03}s` }}
                    className="bg-surface-container-high rounded-lg px-4 py-3 border border-white/10 flex items-center gap-3 animate-fade-up"
                  >
                    <DrugIcon nombre={group.nombre} />
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="font-body text-sm font-medium text-on-surface truncate">
                        {lote.productoId ? (catalogMap[lote.productoId] ?? group.nombre) : group.nombre}
                      </span>
                      {editingLote === lote.id ? (
                        <input
                          type="text"
                          value={loteValue}
                          onChange={(e) => setLoteValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveLote(lote.id)
                            if (e.key === 'Escape') cancelEditLote()
                          }}
                          className="w-20 bg-surface-container-high border border-outline-variant rounded px-1.5 py-0.5 text-xs font-mono text-on-surface focus:outline-none focus:border-primary"
                          autoFocus
                        />
                      ) : (
                        <span className="font-mono text-xs text-on-surface-variant shrink-0">
                          {lote.lote ?? '—'}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-sm font-bold text-on-surface tabular-nums shrink-0">
                      {lote.cantidad}
                    </span>
                    <StatusBadge
                      variant={getStatusVariant(lote.cantidad)}
                      label={getStatusVariant(lote.cantidad) === 'optimal' ? 'Optimo' : getStatusVariant(lote.cantidad) === 'low' ? 'Bajo' : 'Crítico'}
                      showDot={getStatusVariant(lote.cantidad) !== 'critical'}
                    />
                    {isEncargado && (
                      <button
                        type="button"
                        onClick={() => handleDelete(lote.id, `${lote.nombre} (lote ${lote.lote ?? 'sin lote'})`)}
                        disabled={deleteMutation.isPending}
                        className="hover:text-error transition-colors disabled:opacity-40 shrink-0"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <button className="hover:text-primary transition-colors shrink-0" title="Editar">
                      <Edit size={14} />
                    </button>
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
