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
  useEjecutarOrden,
  useCompletarOrden,
} from '../queries'
import { ProductoSelector } from '../components/ProductoSelector'
import { PageHeader } from '../components/layout/PageHeader'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '../components/ui/Dialog'

// ─── Types ────────────────────────────────────────────────────────────────────

type Categoria = 'droga' | 'estuche' | 'etiqueta' | 'frasco'
type Mercado = 'argentina' | 'colombia' | 'mexico' | 'ecuador' | 'bolivia' | 'paraguay' | 'no_exportable'
type EstadoOrden = 'solicitada' | 'aprobada' | 'ejecutada' | 'completada' | 'rechazada'
type Urgencia = 'normal' | 'urgente'

interface OrdenProduccion {
  id: string
  categoria: Categoria
  productoNombre: string
  mercado: Mercado | null
  cantidad: number
  urgencia: Urgencia
  estado: EstadoOrden
  motivoRechazo: string | null
  createdAt: string
  updatedAt: string
  solicitante: { id: string; name: string; role: string }
  aprobador: { id: string; name: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORIA_LABELS: Record<Categoria, string> = {
  droga: 'Droga',
  estuche: 'Estuche',
  etiqueta: 'Etiqueta',
  frasco: 'Frasco',
}

const MERCADO_LABELS: Record<Mercado, string> = {
  argentina: 'Argentina',
  colombia: 'Colombia',
  mexico: 'México',
  ecuador: 'Ecuador',
  bolivia: 'Bolivia',
  paraguay: 'Paraguay',
  no_exportable: 'No exportable',
}

const MERCADOS = Object.keys(MERCADO_LABELS) as Mercado[]

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

function UrgenciaChip({ urgencia }: { urgencia: Urgencia }) {
  if (urgencia === 'normal') return null
  return (
    <span
      className="inline-block font-body text-xs font-medium px-2 py-0.5 rounded shrink-0 animate-pulse text-error bg-error/10"
    >
      Urgente
    </span>
  )
}

// ─── Modal Nueva Orden ────────────────────────────────────────────────────────

const nuevaOrdenSchema = z.object({
  categoria: z.enum(['droga', 'estuche', 'etiqueta', 'frasco']),
  productoId: z.string().uuid().optional(),
  productoNombre: z.string().min(2, 'Seleccioná un producto'),
  mercado: z.string().optional(),
  cantidad: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => Number.isInteger(Number(v)) && Number(v) > 0, 'Debe ser un entero positivo'),
  urgencia: z.enum(['normal', 'urgente']),
})

type NuevaOrdenForm = z.infer<typeof nuevaOrdenSchema>

function NuevaOrdenModal({
  onCreated,
  open,
  onOpenChange,
}: {
  onCreated: (o: OrdenProduccion) => void
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const createMutation = useCreateOrden()

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NuevaOrdenForm>({
    resolver: zodResolver(nuevaOrdenSchema),
    defaultValues: { categoria: 'droga', productoId: undefined, productoNombre: '', mercado: '', cantidad: '', urgencia: 'normal' },
  })

  const categoria = useWatch({ control, name: 'categoria' })
  const productoId = useWatch({ control, name: 'productoId' })
  const productoNombre = useWatch({ control, name: 'productoNombre' })
  useEffect(() => {
    if (!open) return
    setValue('productoId', undefined)
    setValue('productoNombre', '')
    setValue('mercado', '')
  }, [categoria, open, setValue])

  async function onSubmit(data: NuevaOrdenForm) {
    setServerError(null)
    if (needsMercado(data.categoria) && !data.mercado) {
      setServerError('Seleccioná el mercado')
      return
    }
    try {
      const body: Record<string, unknown> = {
        categoria: data.categoria,
        productoNombre: data.productoNombre,
        cantidad: Number(data.cantidad),
        urgencia: data.urgencia,
      }
      if (data.productoId) {
        body.productoId = data.productoId
      }
      if (needsMercado(data.categoria) && data.mercado) {
        body.mercado = data.mercado
      }
      const orden = await createMutation.mutateAsync(body)
      onCreated(orden)
      toast.info(`Orden creada para "${orden.productoNombre}".`)
      reset()
      onOpenChange(false)
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al crear la orden')
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
          <DialogTitle>Nueva orden de producción</DialogTitle>
          <DialogDescription>
            Solicitá insumos al encargado. La orden quedará pendiente de aprobación.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {/* Categoría */}
          <div className="space-y-1">
            <label htmlFor="orden-categoria" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Categoría
            </label>
            <select id="orden-categoria" {...register('categoria')} className="input-field">
              <option value="droga">Droga</option>
              <option value="estuche">Estuche</option>
              <option value="etiqueta">Etiqueta</option>
              <option value="frasco">Frasco</option>
            </select>
          </div>

          {/* Producto (fuzzy search) */}
          <div className="space-y-1">
            <label className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Producto
            </label>
            <ProductoSelector
              key={`${categoria}-${productoId ?? 'empty'}`}
              categoria={categoria}
              displayValue={productoNombre}
              onChange={(id, nombre) => {
                setValue('productoId', id || undefined, { shouldValidate: true })
                setValue('productoNombre', nombre, { shouldValidate: true })
              }}
              placeholder={`Buscá un ${CATEGORIA_LABELS[categoria].toLowerCase()}...`}
            />
            {errors.productoNombre && (
              <p className="font-body text-error text-xs">{errors.productoNombre.message}</p>
            )}
          </div>

          {/* Mercado (solo estuche/etiqueta) */}
          {needsMercado(categoria) && (
            <div className="space-y-1">
              <label htmlFor="orden-mercado" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                Mercado
              </label>
              <select id="orden-mercado" {...register('mercado')} className="input-field">
                <option value="">Seleccioná mercado</option>
                {MERCADOS.map((m) => (
                  <option key={m} value={m}>{MERCADO_LABELS[m]}</option>
                ))}
              </select>
            </div>
          )}

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
              placeholder="0"
              className="input-field"
            />
            {errors.cantidad && <p className="font-body text-error text-xs">{errors.cantidad.message}</p>}
          </div>

          {/* Urgencia */}
          <div className="space-y-1">
            <label htmlFor="orden-urgencia" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Urgencia
            </label>
            <select id="orden-urgencia" {...register('urgencia')} className="input-field">
              <option value="normal">Normal</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>

          {serverError && (
            <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">{serverError}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 py-2.5 text-sm">
              {isSubmitting ? 'Enviando...' : 'Enviar orden'}
            </button>
            <DialogClose asChild>
              <button type="button" className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-container-high hover:bg-surface-bright transition-colors">
                Cancelar
              </button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Modal Rechazar ───────────────────────────────────────────────────────────

function RechazarModal({
  orden,
  onRechazada,
}: {
  orden: OrdenProduccion
  onRechazada: (o: OrdenProduccion) => void
}) {
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const rejectMutation = useRechazarOrden()

  async function handleRechazar() {
    if (motivo.trim().length < 5) {
      setError('El motivo debe tener al menos 5 caracteres')
      return
    }
    setError(null)
    try {
      await rejectMutation.mutateAsync({ id: orden.id, motivo: motivo.trim() })
      toast.info(`Orden "${orden.productoNombre}" rechazada.`)
      setOpen(false)
      setMotivo('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al rechazar')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setError(null) }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded font-heading font-semibold text-xs transition-colors text-error bg-error/10"
      >
        <X size={12} strokeWidth={2} />
        Rechazar
      </button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setMotivo(''); setError(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar orden</DialogTitle>
            <DialogDescription>
              Ingresá el motivo del rechazo para que el solicitante pueda entender la decisión.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="motivo-rechazo" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                Motivo de rechazo
              </label>
              <textarea
                id="motivo-rechazo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Ej: Stock insuficiente en este momento..."
                className="input-field resize-none"
              />
            </div>
            {error && <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">{error}</div>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleRechazar}
                disabled={rejectMutation.isPending}
                className="flex-1 py-2.5 text-sm font-heading font-semibold rounded transition-colors bg-error text-white disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Rechazando...' : 'Confirmar rechazo'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-container-high hover:bg-surface-bright transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Orden card ───────────────────────────────────────────────────────────────

function OrdenCard({
  orden,
  isEncargado,
  onUpdated,
}: {
  orden: OrdenProduccion
  isEncargado: boolean
  onUpdated: (o: OrdenProduccion) => void
}) {
  const approveMutation = useAprobarOrden()
  const executeMutation = useEjecutarOrden()
  const completeMutation = useCompletarOrden()

  async function handleAction(action: 'aprobar' | 'ejecutar' | 'completar') {
    try {
      if (action === 'aprobar') {
        await approveMutation.mutateAsync(orden.id)
        toast.success(`Orden "${orden.productoNombre}" aprobada.`)
      } else if (action === 'ejecutar') {
        await executeMutation.mutateAsync(orden.id)
        toast.success(`Orden "${orden.productoNombre}" ejecutada.`)
      } else {
        await completeMutation.mutateAsync(orden.id)
        toast.info(`Orden "${orden.productoNombre}" marcada como completada.`)
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al procesar la acción')
    }
  }

  const canAprobar = isEncargado && orden.estado === 'solicitada'
  const canEjecutar = isEncargado && orden.estado === 'aprobada'
  const canRechazar = isEncargado && (orden.estado === 'solicitada' || orden.estado === 'aprobada')
  const canCompletar = isEncargado && orden.estado === 'ejecutada'

  return (
    <div className="bg-surface-container-low rounded px-4 py-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-body text-on-surface text-sm font-medium truncate">{orden.productoNombre}</p>
          <p className="font-body text-on-surface-variant text-xs mt-0.5">
            {CATEGORIA_LABELS[orden.categoria]}
            {orden.mercado && ` · ${MERCADO_LABELS[orden.mercado]}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <UrgenciaChip urgencia={orden.urgencia} />
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
      {isEncargado && (canAprobar || canEjecutar || canCompletar || canRechazar) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {canAprobar && (
            <button
              type="button"
              onClick={() => handleAction('aprobar')}
              disabled={approveMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded font-heading font-semibold text-xs disabled:opacity-50 transition-opacity text-primary bg-primary-container/10"
            >
              <Check size={12} strokeWidth={2} />
              {approveMutation.isPending ? 'Aprobando...' : 'Aprobar'}
            </button>
          )}
          {canEjecutar && (
            <button
              type="button"
              onClick={() => handleAction('ejecutar')}
              disabled={executeMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded font-heading font-semibold text-xs disabled:opacity-50 transition-opacity bg-primary text-on-primary"
            >
              <Check size={12} strokeWidth={2} />
              {executeMutation.isPending ? 'Ejecutando...' : 'Ejecutar'}
            </button>
          )}
          {canCompletar && (
            <button
              type="button"
              onClick={() => handleAction('completar')}
              disabled={completeMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded font-heading font-semibold text-xs bg-surface-container-high hover:bg-surface-bright transition-colors disabled:opacity-50"
            >
              {completeMutation.isPending ? 'Completando...' : 'Marcar completada'}
            </button>
          )}
          {canRechazar && (
            <RechazarModal orden={orden} onRechazada={onUpdated} />
          )}
        </div>
      )}
    </div>
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

export default function OrdenesPage() {
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.apps?.['deposito']?.rol === 'encargado'
  const isSolicitante = user?.apps?.['deposito']?.rol === 'solicitante'
  const canCreate = isEncargado || isSolicitante

  const [filtroEstado, setFiltroEstado] = useState<EstadoOrden | 'todas'>('todas')
  const [nuevaOrdenOpen, setNuevaOrdenOpen] = useState(false)

  const { data: ordenes = [], isLoading, error } = useOrdenes(
    filtroEstado !== 'todas' ? { estado: filtroEstado } : undefined
  )

  function handleCreated(_o: OrdenProduccion) {}

  function handleUpdated(_o: OrdenProduccion) {}

  const urgentes = ordenes.filter((o) => o.urgencia === 'urgente')
  const pendientesAprobacion = ordenes.filter((o) => o.estado === 'solicitada').length
  const ordenesOrdenadas = [...ordenes].sort((a, b) => {
    const dateDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    if (dateDiff !== 0) return dateDiff
    if (a.estado === b.estado) return 0
    if (a.estado === 'solicitada') return -1
    if (b.estado === 'solicitada') return 1
    return 0
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="ÓRDENES"
        stats={[
          { label: 'órdenes', value: isLoading ? '...' : ordenes.length },
          { label: 'urgentes', value: isLoading ? '...' : urgentes.length, warning: urgentes.length > 0 && !isLoading },
          { label: 'por aprobar', value: isLoading ? '...' : pendientesAprobacion, warning: pendientesAprobacion > 0 && !isLoading },
        ]}
        primaryAction={
          canCreate
            ? {
                label: 'Nueva orden',
                onClick: () => setNuevaOrdenOpen(true),
                icon: <Plus size={14} strokeWidth={2} />,
              }
            : undefined
        }
      >
        <FiltroEstado value={filtroEstado} onChange={setFiltroEstado} />
      </PageHeader>

      {canCreate ? (
        <NuevaOrdenModal
          onCreated={handleCreated}
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
              ? `No hay órdenes en estado "${ESTADO_LABELS[filtroEstado]}".`
              : 'No hay órdenes registradas.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ordenesOrdenadas.map((o) => (
            <OrdenCard
              key={o.id}
              orden={o}
              isEncargado={isEncargado}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      )}
    </div>
  )
}
