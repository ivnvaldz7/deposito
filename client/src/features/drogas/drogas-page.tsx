import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, CalendarClock } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient, ApiError } from '@/lib/api-client'
import { toast } from '@/lib/toast'
import { fetchCatalogoProductos } from '@/lib/catalogo-productos'
import { EmptyState, ErrorState, LoadingState } from '@/features/inventory/shared/inventory-states'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/layout/page-header'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DrogaRecord {
  id: string
  productoId?: string | null
  nombre: string
  lote: string | null
  vencimiento: string | null
  cantidad: number
  updatedAt: string
}

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

// ─── Vencimiento chip ─────────────────────────────────────────────────────────

function VencimientoChip({ vencimiento }: { vencimiento: string | null }) {
  if (!vencimiento) return null
  const dias = diasHastaVencimiento(vencimiento)
  const fecha = new Date(vencimiento).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })

  let color = '#00AE42'
  let bg = 'rgba(0,174,66,0.10)'
  if (dias < 0) {
    color = '#ef4444'; bg = 'rgba(239,68,68,0.10)'
  } else if (dias <= VENCE_PRONTO_DIAS) {
    color = '#ef4444'; bg = 'rgba(239,68,68,0.10)'
  } else if (dias <= VENCE_MEDIO_DIAS) {
    color = '#FF9800'; bg = 'rgba(255,152,0,0.10)'
  }

  return (
    <span
      className="inline-flex items-center gap-1 font-body text-xs font-medium px-2 py-0.5 rounded shrink-0"
      style={{ color, backgroundColor: bg }}
      title={dias < 0 ? 'VENCIDO' : `Vence en ${dias} días`}
    >
      <CalendarClock size={10} strokeWidth={1.5} />
      {fecha}
    </span>
  )
}

// ─── Stock chip ───────────────────────────────────────────────────────────────

function StockStatusChip({ cantidad }: { cantidad: number }) {
  const bajo = cantidad < STOCK_BAJO_THRESHOLD
  return (
    <span
      className="inline-block font-body text-xs font-medium px-2 py-0.5 rounded shrink-0"
      style={
        bajo
          ? { color: '#FF9800', backgroundColor: 'rgba(255,152,0,0.10)' }
          : { color: '#00AE42', backgroundColor: 'rgba(0,174,66,0.10)' }
      }
    >
      {bajo ? 'Stock bajo' : 'Normal'}
    </span>
  )
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
  onCreated,
  open,
  onOpenChange,
}: {
  onCreated: (d: DrogaRecord) => void
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const token = useAuthStore((s) => s.token)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AgregarFormData>({ resolver: zodResolver(agregarSchema) })

  async function onSubmit(data: AgregarFormData) {
    setServerError(null)
    try {
      const droga = await apiClient.post<DrogaRecord>(
        '/drogas',
        {
          nombre: data.nombre,
          cantidad: Number(data.cantidad),
          ...(data.lote ? { lote: data.lote } : {}),
          ...(data.vencimiento ? { vencimiento: data.vencimiento } : {}),
        },
        token
      )
      onCreated(droga)
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
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 py-2.5 text-sm">
              {isSubmitting ? 'Guardando...' : 'Guardar'}
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

export function DrogasPage() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.role === 'encargado'
  const [searchParams] = useSearchParams()

  const [records, setRecords] = useState<DrogaRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [catalogMap, setCatalogMap] = useState<Record<string, string>>({})
  const [agregarOpen, setAgregarOpen] = useState(false)

  useEffect(() => {
    apiClient
      .get<DrogaRecord[]>('/drogas', token)
      .then(setRecords)
      .catch(() => setError('No se pudo cargar el inventario'))
      .finally(() => setLoading(false))

    fetchCatalogoProductos('droga', token)
      .then((productos) => {
        setCatalogMap(
          Object.fromEntries(productos.map((producto) => [producto.id, producto.nombreCompleto]))
        )
      })
      .catch(() => {})
  }, [token])

  const groups = useMemo(
    () =>
      groupDrogas(records, (record) =>
        record.productoId ? (catalogMap[record.productoId] ?? record.nombre) : record.nombre
      ),
    [records, catalogMap]
  )
  const productoFiltro = searchParams.get('producto') ?? ''
  const filteredGroups = useMemo(() => {
    if (!productoFiltro) return groups
    const target = normalizeProducto(productoFiltro)
    return groups.filter((group) => normalizeProducto(group.nombre) === target)
  }, [groups, productoFiltro])

  function handleCreated(droga: DrogaRecord) {
    setRecords((prev) => [...prev, droga])
  }

  async function handleDelete(id: string, nombre: string) {
    setDeletingId(id)
    try {
      await apiClient.del<void>(`/drogas/${id}`, token)
      setRecords((prev) => prev.filter((r) => r.id !== id))
      toast.success(`Droga "${nombre}" eliminada.`)
    } catch {
      toast.error('No se pudo eliminar la droga.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} />

  const stockBajoCount = groups.filter((g) => g.totalCantidad < STOCK_BAJO_THRESHOLD).length
  const porVencerCount = records.filter(
    (r) => r.vencimiento && diasHastaVencimiento(r.vencimiento) <= VENCE_PRONTO_DIAS
  ).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="DROGAS"
        stats={[
          { label: 'productos', value: groups.length },
          { label: 'lotes', value: records.length },
          { label: 'stock bajo', value: stockBajoCount, warning: stockBajoCount > 0 },
          { label: 'vencen pronto', value: porVencerCount, warning: porVencerCount > 0 },
        ]}
        primaryAction={
          isEncargado
            ? {
                label: 'Agregar droga',
                onClick: () => setAgregarOpen(true),
                icon: <Plus size={14} strokeWidth={2} />,
              }
            : undefined
        }
      />

      {isEncargado ? (
        <AgregarDrogaModal
          onCreated={handleCreated}
          open={agregarOpen}
          onOpenChange={setAgregarOpen}
        />
      ) : null}

      {filteredGroups.length === 0 ? (
        <EmptyState message={productoFiltro ? 'No se encontró esa droga en inventario.' : 'No hay drogas cargadas todavía.'} />
      ) : (
        <div className="space-y-2">
          {filteredGroups.map((group) => (
            <div
              key={group.nombre}
              className={`bg-surface-low rounded overflow-hidden ${productoFiltro ? 'ring-1 ring-primary/30' : ''}`}
            >
              {/* Group header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
                <div className="flex items-center gap-3">
                  <p className="font-heading font-semibold text-sm text-on-surface">{group.nombre}</p>
                  <StockStatusChip cantidad={group.totalCantidad} />
                </div>
                <span className="font-body text-xs text-on-surface-variant tabular-nums">
                  Total: <strong className="text-on-surface">{group.totalCantidad}</strong> uds
                </span>
              </div>

              {/* Lotes */}
              {group.lotes.map((lote, idx) => (
                <div
                  key={lote.id}
                  className={`flex items-center gap-3 px-4 py-2.5 ${
                    idx < group.lotes.length - 1 ? 'border-b border-outline-variant/10' : ''
                  }`}
                >
                  {/* Lote info */}
                  <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
                    <span className="font-body text-xs text-on-surface-variant">
                      {lote.lote ? (
                        <>Lote <strong className="text-on-surface">{lote.lote}</strong></>
                      ) : (
                        <span className="italic">Sin lote</span>
                      )}
                    </span>
                    <VencimientoChip vencimiento={lote.vencimiento} />
                    <span className="font-body text-xs tabular-nums text-on-surface-variant">
                      <strong className="text-on-surface">{lote.cantidad}</strong> uds
                    </span>
                  </div>

                  {/* Actions */}
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
                        disabled={deletingId === lote.id}
                        className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-40"
                        title="Eliminar lote"
                        aria-label={`Eliminar lote ${lote.lote ?? 'sin lote'} de ${lote.nombre}`}
                      >
                        <Trash2 size={13} strokeWidth={1.5} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
