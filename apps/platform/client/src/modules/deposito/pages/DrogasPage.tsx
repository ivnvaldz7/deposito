<<<<<<< Updated upstream
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
=======
import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
>>>>>>> Stashed changes
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Plus, Trash2, CalendarClock, Search, Filter, Pill, FlaskConical,
  Edit, Syringe,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { ApiError } from '../lib/api'
import { useDrogas, useCreateDroga, useDeleteDroga } from '../queries/use-drogas'
import { toast } from '../lib/toast'
import { fetchCatalogoProductos } from '../lib/catalogo-productos'
import { EmptyState, ErrorState, LoadingState } from '../components/inventory-shared/inventory-states'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '../components/ui/Dialog'

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

// ─── Agregar droga modal ──────────────────────────────────────────────────────

const agregarSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(100),
  lote: z.string().max(50).optional(),
  vencimiento: z.string().optional(),
  cantidad: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, 'Debe ser un número positivo'),
})

type AgregarFormData = z.infer<typeof agregarSchema>

function AgregarDrogaModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const createMutation = useCreateDroga()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AgregarFormData>({ resolver: zodResolver(agregarSchema) })

  async function onSubmit(data: AgregarFormData) {
    setServerError(null)
    try {
<<<<<<< Updated upstream
      const droga = await api.post<DrogaRecord>('/drogas', {
=======
      const droga = await createMutation.mutateAsync({
>>>>>>> Stashed changes
        nombre: data.nombre,
        cantidad: Number(data.cantidad),
        ...(data.lote ? { lote: data.lote } : {}),
        ...(data.vencimiento ? { vencimiento: data.vencimiento } : {}),
      })
<<<<<<< Updated upstream
      onCreated(droga)
=======
>>>>>>> Stashed changes
      toast.success(`Droga "${droga.nombre}" agregada.`)
      reset()
      onOpenChange(false)
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al guardar')
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) { reset(); setServerError(null) }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar droga</DialogTitle>
          <DialogDescription>
            Ingresá el nombre del principio activo. El lote y vencimiento son opcionales para registros heredados.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="agregar-droga-nombre" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Nombre
            </label>
            <input
              id="agregar-droga-nombre"
              {...register('nombre')}
              type="text"
              placeholder="Ej: Vitamina B12"
              className="input-field"
              autoFocus
            />
            {errors.nombre && <p className="font-body text-error text-xs">{errors.nombre.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="agregar-droga-lote" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                Lote <span className="normal-case tracking-normal opacity-60">(opcional)</span>
              </label>
              <input
                id="agregar-droga-lote"
                {...register('lote')}
                type="text"
                placeholder="Ej: L240901"
                className="input-field"
              />
              {errors.lote && <p className="font-body text-error text-xs">{errors.lote.message}</p>}
            </div>
            <div className="space-y-1">
              <label htmlFor="agregar-droga-vencimiento" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                Vencimiento <span className="normal-case tracking-normal opacity-60">(opcional)</span>
              </label>
              <input
                id="agregar-droga-vencimiento"
                {...register('vencimiento')}
                type="date"
                className="input-field"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="agregar-droga-cantidad" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Cantidad inicial
            </label>
            <input
              id="agregar-droga-cantidad"
              {...register('cantidad')}
              type="number"
              min="0"
              placeholder="0"
              className="input-field"
            />
            {errors.cantidad && <p className="font-body text-error text-xs">{errors.cantidad.message}</p>}
          </div>

          {serverError && (
            <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">{serverError}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1 py-2.5 text-sm">
              {createMutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
            <DialogClose asChild>
              <button type="button" className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-high hover:bg-surface-bright transition-colors">
                Cancelar
              </button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function DrogasPage() {
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.apps?.['deposito']?.rol === 'encargado'
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const { data: records = [], isLoading, error } = useDrogas()
  const deleteMutation = useDeleteDroga()
  const [catalogMap, setCatalogMap] = useState<Record<string, string>>({})
  const [agregarOpen, setAgregarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

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

  const stockBajoCount = groups.filter((g) => g.totalCantidad < STOCK_BAJO_THRESHOLD).length
  const porVencerCount = records.filter(
    (r) => r.vencimiento && diasHastaVencimiento(r.vencimiento) <= VENCE_PRONTO_DIAS
  ).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between mb-lg">
        <div className="flex items-center gap-md">
          <h1 className="font-heading text-xl font-semibold text-on-surface tracking-tight">
            Inventario de Drogas
          </h1>
          <span className="bg-surface-variant text-on-surface-variant font-mono text-xs px-2 py-1 rounded-md border border-white/5">
            Active: {groups.length}
          </span>
        </div>
        <div className="flex items-center gap-md">
          {/* Search Input */}
          <div className="relative group">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, Lot, Name..."
              className="w-64 bg-surface-container-high border border-outline-variant rounded-lg pl-10 pr-4 py-2 font-body text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
            />
          </div>
          {/* Filter Button */}
          <button className="flex items-center gap-2 bg-surface-container-high border border-outline-variant rounded-lg px-4 py-2 hover:bg-surface-variant transition-colors text-on-surface">
            <Filter size={16} />
            <span className="font-body text-xs font-semibold">Filter</span>
          </button>
          {/* Primary Action */}
          {isEncargado && (
            <button
              onClick={() => setAgregarOpen(true)}
              className="flex items-center gap-2 bg-primary text-on-primary rounded-lg px-4 py-2 font-body text-xs font-semibold scale-hover shadow-float"
            >
              <Plus size={16} />
              <span>New Ingress</span>
            </button>
          )}
        </div>
      </header>

      {isEncargado ? (
        <AgregarDrogaModal
          open={agregarOpen}
          onOpenChange={setAgregarOpen}
        />
      ) : null}

      {/* Content */}
      {filteredGroups.length === 0 ? (
        <EmptyState message={searchQuery ? 'No se encontró esa droga en inventario.' : 'No hay drogas cargadas todavía.'} />
      ) : (
        <div className="bg-surface-container rounded-xl border border-outline-variant shadow-float overflow-hidden flex flex-col">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-md py-sm border-b border-outline-variant bg-surface-container-low font-body text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            <div className="col-span-3">Drug Profile</div>
            <div className="col-span-2">Lot Identifier</div>
            <div className="col-span-2">Storage Location</div>
            <div className="col-span-2 text-right">Quantity / Vol</div>
            <div className="col-span-2 text-center">Status</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>

          {/* Table Body */}
          <div className="flex flex-col">
            {filteredGroups.map((group) => (
              <div key={group.nombre} className="flex flex-col border-b border-outline-variant/50 last:border-0">
                {/* Group Header */}
                <div className="grid grid-cols-12 gap-4 px-md py-3 bg-surface-container-high/50 items-center">
                  <div className="col-span-12 flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-surface-variant flex items-center justify-center border border-white/5">
                      <DrugIcon nombre={group.nombre} />
                    </div>
                    <h3 className="font-heading text-sm font-semibold text-on-surface">{group.nombre}</h3>
                    <span className="bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded text-[10px] font-mono border border-white/5 uppercase tracking-wide">
                      Drug
                    </span>
                    <span className="font-body text-xs text-on-surface-variant ml-auto tabular-nums">
                      Total: <strong className="text-on-surface">{group.totalCantidad}</strong> uds
                    </span>
                  </div>
<<<<<<< Updated upstream
=======

                  {isEncargado && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          handleDelete(
                            lote.id,
                            `${lote.productoId ? (catalogMap[lote.productoId] ?? lote.nombre) : lote.nombre} (lote ${lote.lote ?? 'sin lote'})`
                          )
                        }
                        disabled={deleteMutation.isPending}
                        className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-40"
                        title="Eliminar lote"
                        aria-label={`Eliminar lote ${lote.lote ?? 'sin lote'} de ${lote.nombre}`}
                      >
                        <Trash2 size={13} strokeWidth={1.5} />
                      </button>
                    </div>
                  )}
>>>>>>> Stashed changes
                </div>

                {/* Batch Rows */}
                {group.lotes.map((lote, idx) => {
                  const displayName = lote.productoId
                    ? (catalogMap[lote.productoId] ?? lote.nombre)
                    : lote.nombre
                  return (
                    <div
                      key={lote.id}
                      className={`grid grid-cols-12 gap-4 px-md py-3 items-center cursor-default transition-all duration-200 hover:-translate-y-[2px] hover:bg-surface-variant/30 ${
                        idx < group.lotes.length - 1 ? 'border-t border-outline-variant/30' : ''
                      }`}
                    >
                      <div className="col-span-3 pl-11">
                        <span className="font-mono text-xs text-on-surface-variant">
                          Vial - {lote.cantidad}mL
                        </span>
                      </div>
                      <div className="col-span-2 font-mono text-xs text-on-surface">
                        {lote.lote ?? <span className="italic text-on-surface-variant">Sin lote</span>}
                      </div>
                      <div className="col-span-2 font-body text-sm text-on-surface-variant flex items-center gap-1">
                        <VencimientoChip vencimiento={lote.vencimiento} />
                      </div>
                      <div className="col-span-2 text-right font-mono text-xs text-on-surface font-medium">
                        {lote.cantidad} vials
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <StatusBadge
                          variant={getStatusVariant(lote.cantidad)}
                          label={getStatusVariant(lote.cantidad) === 'optimal' ? 'Optimal' : getStatusVariant(lote.cantidad) === 'low' ? 'Low Stock' : 'Critical'}
                          showDot={getStatusVariant(lote.cantidad) !== 'critical'}
                        />
                      </div>
                      <div className="col-span-1 flex justify-end gap-2 text-on-surface-variant">
                        {isEncargado && (
                          <button
                            type="button"
                            onClick={() => handleDelete(lote.id, `${displayName} (lote ${lote.lote ?? 'sin lote'})`)}
                            disabled={deletingId === lote.id}
                            className="hover:text-error transition-colors disabled:opacity-40"
                            title="Eliminar lote"
                            aria-label={`Eliminar lote ${lote.lote ?? 'sin lote'} de ${lote.nombre}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                        <button className="hover:text-primary transition-colors" title="Edit">
                          <Edit size={16} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-4 flex justify-between items-center px-2 pb-2">
            <span className="font-body text-xs text-on-surface-variant">
              Showing {filteredGroups.length} of {groups.length} Active Records
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
