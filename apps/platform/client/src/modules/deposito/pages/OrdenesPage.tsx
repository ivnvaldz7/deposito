import { useState, useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Check, X, ChevronDown } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { api, ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import {
  useOrdenes,
  useCreateOrden,
  useAprobarOrden,
  useRechazarOrden,
} from '../queries'
import { ProductoSelector } from '../components/ProductoSelector'
import { MERCADOS as MERCADOS_COMPARTIDOS, formatMercadoLabel } from '../components/inventory-shared/mercados'
import { InventoryPageHeader } from '../components/inventory-shared/InventoryPageHeader'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '../components/ui/Dialog'

import type { OrdenProduccion, Categoria, EstadoOrden, OrdenInput } from '../queries/use-ordenes'
import type { Mercado } from '../components/inventory-shared/mercados'
// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORIA_LABELS: Record<Categoria, string> = {
  droga: 'Droga',
  estuche: 'Estuche',
  etiqueta: 'Etiqueta',
  frasco: 'Frasco',
}

const MERCADOS_POR_PAIS = MERCADOS_COMPARTIDOS.filter(({ value }) => value !== 'no_exportable')

function needsMercado(cat: Categoria) {
  return cat === 'estuche' || cat === 'etiqueta'
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ─── Chips ────────────────────────────────────────────────────────────────────

const ESTADO_CLASSES: Record<EstadoOrden, string> = {
  solicitada: 'text-warning bg-warning/10',
  aprobada:   'text-primary bg-primary-container/10',
  ejecutada:  'text-success bg-success/10',
  completada: 'text-success bg-success/15',
  rechazada:  'text-error bg-error/10',
}

const ESTADO_LABELS: Record<EstadoOrden, string> = {
  solicitada: 'Solicitada',
  aprobada: 'Aprobada',
  ejecutada: 'Ejecutada',
  completada: 'Completada',
  rechazada: 'Rechazada',
}

function EstadoChip({ estado }: { estado: EstadoOrden }) {
  return (
    <span
      className={`inline-block font-body text-xs font-medium px-2 py-0.5 rounded shrink-0 ${ESTADO_CLASSES[estado]}`}
    >
      {ESTADO_LABELS[estado]}
    </span>
  )
}

// ─── Modal Nueva Orden ────────────────────────────────────────────────────────

const nuevaOrdenSchema = z.object({
  categoria: z.enum(['droga', 'estuche', 'etiqueta', 'frasco']),
  productoId: z.string().uuid('Seleccioná un producto del catálogo'),
  productoNombre: z.string().min(2, 'Seleccioná un producto'),
  mercado: z.string().optional(),
  cantidad: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, 'Debe ser una cantidad positiva'),
}).superRefine((data, ctx) => {
  if (data.categoria !== 'droga' && !Number.isInteger(Number(data.cantidad))) {
    ctx.addIssue({ code: 'custom', path: ['cantidad'], message: 'Debe ser un entero para materiales de empaque' })
  }
  if (needsMercado(data.categoria) && !data.mercado) {
    ctx.addIssue({ code: 'custom', path: ['mercado'], message: 'Seleccioná el país' })
  }
})


type NuevaOrdenForm = z.infer<typeof nuevaOrdenSchema>

function NuevaOrdenModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [familia, setFamilia] = useState<'droga' | 'empaque' | null>(null)
  const createMutation = useCreateOrden()

  const {
    register,
    control,
    setValue,
    getValues,
    trigger,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NuevaOrdenForm>({
    resolver: zodResolver(nuevaOrdenSchema),
    defaultValues: { categoria: 'droga', productoId: '', productoNombre: '', mercado: '', cantidad: '' },
  })

  const categoria = useWatch({ control, name: 'categoria' })
  const productoId = useWatch({ control, name: 'productoId' })
  const productoNombre = useWatch({ control, name: 'productoNombre' })
  const mercado = useWatch({ control, name: 'mercado' })
  const [lineas, setLineas] = useState<Array<OrdenInput & { key: string; productoNombre: string }>>([])
  useEffect(() => {
    if (!open) return
    setValue('productoId', '')
    setValue('productoNombre', '')
    setValue('mercado', '')
  }, [categoria, open, setValue])

  function seleccionarMercado(nuevoMercado: Mercado) {
    setValue('mercado', nuevoMercado, { shouldValidate: true })
    setValue('productoId', '', { shouldValidate: true })
    setValue('productoNombre', '', { shouldValidate: true })
  }

  async function agregarLinea(): Promise<void> {
    const valid = await trigger()
    if (!valid) return
    const data = getValues()
    if (needsMercado(data.categoria) && !data.mercado) {
      setServerError('Seleccioná el país')
      return
    }
    setLineas((current) => [...current, {
      key: `${data.productoId}-${Date.now()}`,
      categoria: data.categoria,
      productoId: data.productoId,
      productoNombre: data.productoNombre,
      cantidad: Number(data.cantidad),
      ...(needsMercado(data.categoria) && data.mercado ? { mercado: data.mercado as Mercado } : {}),
    }])
    setValue('productoId', '')
    setValue('productoNombre', '')
    setValue('cantidad', '')
    setServerError(null)
  }

  async function onSubmit() {
    setServerError(null)
    if (lineas.length === 0) {
      setServerError('Agregá al menos un producto a la solicitud')
      return
    }
    try {
      const solicitud = await createMutation.mutateAsync({ items: lineas.map(({ key: _key, productoNombre: _nombre, ...linea }) => linea) })
      toast.info(`Solicitud creada con ${solicitud.ordenes.length} producto${solicitud.ordenes.length === 1 ? '' : 's'}.`)
      reset()
      setFamilia(null)
      setLineas([])
      onOpenChange(false)
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al crear la orden')
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) { reset(); setServerError(null); setFamilia(null); setLineas([]) }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva orden de producción</DialogTitle>
          <DialogDescription>
            Solicitá insumos al encargado. La orden quedará pendiente de aprobación.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => { event.preventDefault(); void onSubmit() }} noValidate className="space-y-4">
          {/* Categoría */}
          <div className="space-y-1">
            <label className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              ¿Qué necesitás?
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setFamilia('droga'); setValue('categoria', 'droga') }} className={`input-field ${familia === 'droga' ? 'ring-1 ring-primary' : ''}`}>Drogas</button>
              <button type="button" onClick={() => { setFamilia('empaque'); setValue('categoria', categoria === 'droga' ? 'frasco' : categoria) }} className={`input-field ${familia === 'empaque' ? 'ring-1 ring-primary' : ''}`}>Material de Empaque</button>
            </div>
            {familia === 'empaque' && (
              <div className="flex gap-2 pt-2">
                {(['frasco', 'estuche', 'etiqueta'] as const).map((tipo) => (
                  <button key={tipo} type="button" onClick={() => setValue('categoria', tipo)} className={`px-3 py-2 rounded text-xs capitalize ${categoria === tipo ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'}`}>{tipo}</button>
                ))}
              </div>
            )}
          </div>

          {familia && <>
          {needsMercado(categoria) && (
            <fieldset className="space-y-2">
              <legend className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                País
              </legend>
              <div className="flex flex-wrap gap-2" aria-label="Elegí el país del insumo">
                {MERCADOS_POR_PAIS.map(({ value, label }) => {
                  const selected = mercado === value
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => seleccionarMercado(value)}
                      className={`rounded-lg border px-3 py-2 font-body text-xs font-medium transition-colors ${
                        selected
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-outline-variant bg-surface-container-high text-on-surface hover:border-primary'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              {errors.mercado && <p className="font-body text-error text-xs">{errors.mercado.message}</p>}
            </fieldset>
          )}

          {/* Producto (fuzzy search) */}
          <div className="space-y-1">
            <label className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Producto
            </label>
            <ProductoSelector
              key={`${categoria}-${mercado || 'sin-pais'}-${productoId ?? 'empty'}`}
              categoria={categoria}
              expandirMercados={false}
              mercadoFiltro={needsMercado(categoria) && mercado ? mercado as Mercado : null}
              displayValue={productoNombre}
              onChange={(id, nombre) => {
                setValue('productoId', id ?? '', { shouldValidate: true })
                setValue('productoNombre', nombre, { shouldValidate: true })
              }}
              placeholder={needsMercado(categoria) && !mercado
                ? 'Primero seleccioná un país'
                : `Buscá un ${CATEGORIA_LABELS[categoria].toLowerCase()}...`}
              disabled={needsMercado(categoria) && !mercado}
            />
            {errors.productoNombre && (
              <p className="font-body text-error text-xs">{errors.productoNombre.message}</p>
            )}
          </div>

          {/* Cantidad */}
          <div className="space-y-1">
            <label htmlFor="orden-cantidad" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Cantidad
            </label>
            <input
              id="orden-cantidad"
              {...register('cantidad')}
              type="number"
              min="1"
              step={categoria === 'droga' ? 'any' : '1'}
              placeholder="0"
              className="input-field"
            />
            {errors.cantidad && <p className="font-body text-error text-xs">{errors.cantidad.message}</p>}
          </div>

          <button type="button" onClick={() => void agregarLinea()} className="btn-secondary w-full py-2.5 text-sm">
            + Agregar producto a la solicitud
          </button>

          {lineas.length > 0 && (
            <section aria-label="Productos de la solicitud" className="rounded-xl border border-outline-variant/50 bg-surface-container-low p-3">
              <div className="mb-2 flex items-center justify-between gap-2"><p className="font-body text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Productos agregados</p><span className="font-body text-xs text-primary">{lineas.length}</span></div>
              <div className="space-y-2">
                {lineas.map((linea) => <div key={linea.key} className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-high px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-semibold text-on-surface">{linea.productoNombre}</p><p className="text-xs text-on-surface-variant">{CATEGORIA_LABELS[linea.categoria]}{linea.mercado ? ` · ${formatMercadoLabel(linea.mercado)}` : ''} · {linea.cantidad}</p></div><button type="button" aria-label={`Quitar ${linea.productoNombre}`} onClick={() => setLineas((current) => current.filter((candidate) => candidate.key !== linea.key))} className="rounded p-1.5 text-error hover:bg-error/10"><X size={16} /></button></div>)}
              </div>
            </section>
          )}

          {serverError && (
            <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">{serverError}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={isSubmitting || lineas.length === 0} className="btn-primary flex-1 py-2.5 text-sm">
              {isSubmitting ? 'Enviando...' : `Enviar solicitud${lineas.length > 0 ? ` (${lineas.length})` : ''}`}
            </button>
            <DialogClose asChild>
              <button type="button" className="flex-1 py-2.5 text-sm font-semibold rounded text-on-surface-variant bg-surface-container-high hover:bg-surface-bright transition-colors">
                Cancelar
              </button>
            </DialogClose>
          </div>
          </>}
          {!familia && <div className="flex justify-end pt-1"><DialogClose asChild><button type="button" className="px-4 py-2 text-sm rounded text-on-surface-variant bg-surface-container-high">Cancelar</button></DialogClose></div>}
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Modal Rechazar ───────────────────────────────────────────────────────────

function RechazarModal({
  orden,
  actionBusy,
  onPendingChange,
}: {
  orden: OrdenProduccion
  actionBusy: boolean
  onPendingChange: (pending: boolean) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rejectMutation = useRechazarOrden()

  async function handleRechazar() {
    setError(null)
    onPendingChange(true)
    try {
      await rejectMutation.mutateAsync({ id: orden.id })
      toast.success(`Orden "${orden.productoNombre}" rechazada.`)
      setConfirming(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al rechazar')
    } finally {
      onPendingChange(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setConfirming(true); setError(null) }}
        disabled={actionBusy || rejectMutation.isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold text-xs transition-colors text-error bg-error/10"
      >
        <X size={12} strokeWidth={2} />
        Rechazar
      </button>
      {confirming && <div className="flex items-center gap-2">
        <span className="text-xs text-on-surface-variant">¿Rechazar esta orden?</span>
        <button type="button" onClick={handleRechazar} disabled={rejectMutation.isPending} className="px-3 py-1.5 rounded text-xs bg-error text-white disabled:opacity-50">{rejectMutation.isPending ? 'Rechazando…' : 'Confirmar'}</button>
        <button type="button" onClick={() => setConfirming(false)} disabled={rejectMutation.isPending} className="px-3 py-1.5 rounded text-xs bg-surface-container-high text-on-surface">Cancelar</button>
      </div>}
      {error && <div className="text-xs text-error">{error}</div>}
    </>
  )
}

// ─── Orden card ───────────────────────────────────────────────────────────────

function OrdenCard({
  orden,
  canAprobarPerm,
  canRechazarPerm,
}: {
  orden: OrdenProduccion
  canAprobarPerm: boolean
  canRechazarPerm: boolean
}) {
  const approveMutation = useAprobarOrden()
  const [rejectPending, setRejectPending] = useState(false)
  const actionBusy = approveMutation.isPending || rejectPending

  async function handleAction() {
    try {
      await approveMutation.mutateAsync(orden.id)
      toast.success(`Orden "${orden.productoNombre}" aprobada.`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al procesar la acción')
    }
  }

  const canAprobar = canAprobarPerm && orden.estado === 'solicitada'
  const canRechazar = canRechazarPerm && orden.estado === 'solicitada'

  return (
    <div className="bg-surface-container-low rounded px-4 py-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-body text-on-surface text-sm font-medium truncate">{orden.productoNombre}</p>
          <p className="font-body text-on-surface-variant text-xs mt-0.5">
            {CATEGORIA_LABELS[orden.categoria]}
            {orden.mercado && ` · ${formatMercadoLabel(orden.mercado)}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <EstadoChip estado={orden.estado} />
        </div>
      </div>

      {/* Data */}
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <div>
          <p className="font-body text-on-surface-variant text-xs uppercase tracking-widest">Cantidad</p>
          <p className="font-body text-on-surface text-sm tabular-nums font-medium">{orden.cantidad}</p>
        </div>
        <div>
          <p className="font-body text-on-surface-variant text-xs uppercase tracking-widest">Solicitante</p>
          <p className="font-body text-on-surface text-sm">{orden.solicitante.name}</p>
        </div>
        <div>
          <p className="font-body text-on-surface-variant text-xs uppercase tracking-widest">Fecha</p>
          <p className="font-body text-on-surface text-sm tabular-nums">{formatFecha(orden.createdAt)}</p>
        </div>
        {orden.aprobador && (
          <div>
            <p className="font-body text-on-surface-variant text-xs uppercase tracking-widest">
              {orden.estado === 'rechazada' ? 'Rechazada por' : 'Aprobada por'}
            </p>
            <p className="font-body text-on-surface text-sm">{orden.aprobador.name}</p>
          </div>
        )}
      </div>

      {orden.motivoRechazo && (
        <div className="rounded px-3 py-2 bg-error/5">
          <p className="font-body text-xs text-error">
            <span className="font-semibold">Motivo: </span>
            {orden.motivoRechazo}
          </p>
        </div>
      )}

      {/* Actions */}
      {(canAprobar || canRechazar) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {canAprobar && (
            <button
              type="button"
              onClick={handleAction}
              disabled={actionBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold text-xs disabled:opacity-50 transition-opacity text-primary bg-primary-container/10"
            >
              <Check size={12} strokeWidth={2} />
              {approveMutation.isPending ? 'Aprobando...' : 'Aprobar'}
            </button>
          )}
          {canRechazar && (
            <RechazarModal orden={orden} actionBusy={actionBusy} onPendingChange={setRejectPending} />
          )}
        </div>
      )}
    </div>
  )
}

function SolicitudCard({
  grupoId,
  ordenes,
  canAprobarPerm,
  canRechazarPerm,
}: {
  grupoId: string
  ordenes: OrdenProduccion[]
  canAprobarPerm: boolean
  canRechazarPerm: boolean
}) {
  const confirmadas = ordenes.filter((orden) => ['aprobada', 'ejecutada', 'completada'].includes(orden.estado)).length
  const pendientes = ordenes.filter((orden) => orden.estado === 'solicitada').length
  const rechazadas = ordenes.filter((orden) => orden.estado === 'rechazada').length
  const porcentaje = ordenes.length === 0 ? 0 : Math.round((confirmadas / ordenes.length) * 100)
  const fecha = ordenes[0]?.createdAt ? formatFecha(ordenes[0].createdAt) : ''

  return (
    <section className="rounded-xl border border-outline-variant/50 bg-surface-container-low p-3 sm:p-4" aria-label={`Solicitud ${grupoId}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="font-body text-sm font-bold text-on-surface">Solicitud de producción</h2><p className="text-xs text-on-surface-variant">{ordenes.length} producto{ordenes.length === 1 ? '' : 's'} · {fecha}</p></div>
        <div className="text-right"><p className="text-sm font-bold tabular-nums text-primary">{porcentaje}%</p><p className="text-xs text-on-surface-variant">{confirmadas}/{ordenes.length} confirmados</p></div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-container-high" aria-label={`${porcentaje}% cumplido`}><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${porcentaje}%` }} /></div>
      <p className="mt-2 text-xs text-on-surface-variant">{pendientes > 0 ? `${pendientes} pendiente${pendientes === 1 ? '' : 's'} de disponibilidad o aprobación` : rechazadas > 0 ? `${rechazadas} sin completar` : 'Solicitud completada'}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordenes.map((orden) => <OrdenCard key={orden.id} orden={orden} canAprobarPerm={canAprobarPerm} canRechazarPerm={canRechazarPerm} />)}
      </div>
    </section>
  )
}

// ─── Filtro de estado ─────────────────────────────────────────────────────────

const TODOS_LOS_ESTADOS: EstadoOrden[] = ['solicitada', 'aprobada', 'ejecutada', 'completada', 'rechazada']

function FiltroEstado({
  value,
  onChange,
}: {
  value: EstadoOrden | 'todas'
  onChange: (v: EstadoOrden | 'todas') => void
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="filtro-estado" className="sr-only">Filtrar por estado</label>
      <div className="relative">
        <select
          id="filtro-estado"
          value={value}
          onChange={(e) => onChange(e.target.value as EstadoOrden | 'todas')}
          className="appearance-none bg-surface-container-high text-on-surface font-body text-sm rounded px-3 py-1.5 pr-8 border-0 outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="todas">Todas</option>
          {TODOS_LOS_ESTADOS.map((e) => (
            <option key={e} value={e}>{ESTADO_LABELS[e]}</option>
          ))}
        </select>
        <ChevronDown size={14} strokeWidth={1.5} className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

import { can } from '@/lib/permissions'

export default function OrdenesPage({ archivadas = false }: { archivadas?: boolean }) {
  const user = useAuthStore((s) => s.user)
  const canCreate = can(user, 'deposito', 'ordenes.create')

  const [filtroEstado, setFiltroEstado] = useState<EstadoOrden | 'todas'>('todas')
  const [nuevaOrdenOpen, setNuevaOrdenOpen] = useState(false)

  const { data: ordenes = [], isLoading, error } = useOrdenes({
    ...(filtroEstado !== 'todas' ? { estado: filtroEstado } : {}),
    ...(archivadas ? { archivadas: true } : {}),
  })

  const pendientesAprobacion = ordenes.filter((o) => o.estado === 'solicitada').length
  const confirmadas = ordenes.filter((o) => ['aprobada', 'ejecutada', 'completada'].includes(o.estado)).length
  const ordenesOrdenadas = [...ordenes].sort((a, b) => {
    const dateDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    if (dateDiff !== 0) return dateDiff
    if (a.estado === b.estado) return 0
    if (a.estado === 'solicitada') return -1
    if (b.estado === 'solicitada') return 1
    return 0
  })
  const solicitudes = Array.from(ordenesOrdenadas.reduce((groups, orden) => {
    const id = orden.grupoId || orden.id
    const existing = groups.get(id)
    if (existing) existing.push(orden)
    else groups.set(id, [orden])
    return groups
  }, new Map<string, OrdenProduccion[]>()).entries())

  return (
    <div className="space-y-5">
      <InventoryPageHeader
        title={archivadas ? 'Órdenes archivadas' : 'Órdenes'}
        description={archivadas ? 'Historial de órdenes finalizadas y cerradas.' : 'Solicitudes de producción, aprobación y despacho.'}
        stats={[
          { label: 'solicitudes', value: isLoading ? '...' : solicitudes.length },
          { label: 'pendientes', value: isLoading ? '...' : pendientesAprobacion, warning: pendientesAprobacion > 0 && !isLoading },
          { label: 'confirmadas', value: isLoading ? '...' : confirmadas },
        ]}
        primaryAction={
          canCreate && !archivadas
            ? {
                label: 'Nueva orden',
                onClick: () => setNuevaOrdenOpen(true),
                icon: <Plus size={14} strokeWidth={2} />,
              }
            : undefined
        }
      >
        <FiltroEstado value={filtroEstado} onChange={setFiltroEstado} />
      </InventoryPageHeader>

      {canCreate && !archivadas ? (
        <NuevaOrdenModal
          open={nuevaOrdenOpen}
          onOpenChange={setNuevaOrdenOpen}
        />
      ) : null}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <p className="font-body text-on-surface-variant text-sm">Cargando...</p>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-20">
          <p className="font-body text-sm text-warning">{error instanceof Error ? error.message : 'Error'}</p>
        </div>
      ) : ordenesOrdenadas.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <p className="font-body text-on-surface-variant text-sm">
            {filtroEstado !== 'todas'
              ? `No hay órdenes archivadas en estado "${ESTADO_LABELS[filtroEstado]}".`
              : archivadas ? 'No hay órdenes archivadas.' : 'No hay órdenes registradas.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {solicitudes.map(([grupoId, ordenesDeSolicitud]) => (
            <SolicitudCard
              key={grupoId}
              grupoId={grupoId}
              ordenes={ordenesDeSolicitud}
              canAprobarPerm={can(user, 'deposito', 'ordenes.approve')}
              canRechazarPerm={can(user, 'deposito', 'ordenes.reject')}
            />
          ))}
        </div>
      )}
    </div>
  )
}
