import { useState, useEffect, useMemo, useRef } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Check, X, ChevronDown } from 'lucide-react'
import Fuse from 'fuse.js'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient, ApiError } from '@/lib/api-client'
import { toast } from '@/lib/toast'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'

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

interface InventarioItem {
  id: string
  nombre?: string   // drogas
  articulo?: string // estuches, etiquetas, frascos
  mercado?: Mercado
  cantidad?: number
  cantidadCajas?: number
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

function getItemName(item: InventarioItem): string {
  return item.nombre ?? item.articulo ?? ''
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ─── Chips ────────────────────────────────────────────────────────────────────

const ESTADO_STYLES: Record<EstadoOrden, React.CSSProperties> = {
  solicitada: { color: '#FF9800', backgroundColor: 'rgba(255,152,0,0.10)' },
  aprobada:   { color: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.10)' },
  ejecutada:  { color: '#00AE42', backgroundColor: 'rgba(0,174,66,0.10)' },
  completada: { color: '#00802f', backgroundColor: 'rgba(0,128,47,0.12)' },
  rechazada:  { color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.10)' },
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
      className="inline-block font-body text-xs font-medium px-2 py-0.5 rounded shrink-0"
      style={ESTADO_STYLES[estado]}
    >
      {ESTADO_LABELS[estado]}
    </span>
  )
}

function UrgenciaChip({ urgencia }: { urgencia: Urgencia }) {
  if (urgencia === 'normal') return null
  return (
    <span
      className="inline-block font-body text-xs font-medium px-2 py-0.5 rounded shrink-0 animate-pulse"
      style={{ color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.10)' }}
    >
      Urgente
    </span>
  )
}

// ─── Product search combobox ──────────────────────────────────────────────────

function ProductSearch({
  items,
  value,
  onChange,
  placeholder,
}: {
  items: InventarioItem[]
  value: string
  onChange: (name: string) => void
  placeholder: string
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const fuse = useMemo(
    () =>
      items.length
        ? new Fuse(items, {
            keys: ['nombre', 'articulo'],
            threshold: 0.45,
            includeScore: true,
          })
        : null,
    [items]
  )

  const results = useMemo(() => {
    if (!fuse || !query.trim()) return items.slice(0, 8)
    return fuse
      .search(query)
      .slice(0, 8)
      .map((r) => r.item)
  }, [fuse, items, query])

  function handleSelect(item: InventarioItem) {
    const name = getItemName(item)
    setQuery(name)
    onChange(name)
    setOpen(false)
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="input-field w-full"
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 rounded overflow-hidden shadow-lg max-h-52 overflow-y-auto"
          style={{ background: 'rgba(49,54,49,0.98)', backdropFilter: 'blur(12px)' }}
        >
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 font-body text-sm text-on-surface hover:bg-surface-bright transition-colors"
                onMouseDown={() => handleSelect(item)}
              >
                {getItemName(item)}
                {item.mercado && (
                  <span className="ml-2 font-body text-xs text-on-surface-variant">
                    {MERCADO_LABELS[item.mercado]}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Modal Nueva Orden ────────────────────────────────────────────────────────

const nuevaOrdenSchema = z.object({
  categoria: z.enum(['droga', 'estuche', 'etiqueta', 'frasco']),
  productoNombre: z.string().min(2, 'Seleccioná un producto'),
  mercado: z.string().optional(),
  cantidad: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => Number.isInteger(Number(v)) && Number(v) > 0, 'Debe ser un entero positivo'),
  urgencia: z.enum(['normal', 'urgente']),
})

type NuevaOrdenForm = z.infer<typeof nuevaOrdenSchema>

function NuevaOrdenModal({ onCreated }: { onCreated: (o: OrdenProduccion) => void }) {
  const token = useAuthStore((s) => s.token)
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [inventarioItems, setInventarioItems] = useState<InventarioItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NuevaOrdenForm>({
    resolver: zodResolver(nuevaOrdenSchema),
    defaultValues: { categoria: 'droga', productoNombre: '', mercado: '', cantidad: '', urgencia: 'normal' },
  })

  const categoria = useWatch({ control, name: 'categoria' })
  const productoNombre = useWatch({ control, name: 'productoNombre' })

  // Cargar inventario cuando cambia la categoría
  useEffect(() => {
    if (!open) return

    const path = categoria === 'droga'
      ? '/drogas'
      : categoria === 'estuche'
      ? '/estuches'
      : categoria === 'etiqueta'
      ? '/etiquetas'
      : '/frascos'

    async function load() {
      setInventarioItems([])
      setValue('productoNombre', '')
      setValue('mercado', '')
      setLoadingItems(true)
      try {
        const items = await apiClient.get<InventarioItem[]>(path, token)
        setInventarioItems(items)
      } catch {
        setInventarioItems([])
      } finally {
        setLoadingItems(false)
      }
    }

    load()
  }, [categoria, open, token, setValue])

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
      if (needsMercado(data.categoria) && data.mercado) {
        body.mercado = data.mercado
      }
      const orden = await apiClient.post<OrdenProduccion>('/ordenes', body, token)
      onCreated(orden)
      toast.info(`Orden creada para "${orden.productoNombre}".`)
      reset()
      setOpen(false)
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al crear la orden')
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) { reset(); setServerError(null); setInventarioItems([]) }
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className="btn-primary flex items-center gap-2 w-auto px-4 py-2 text-sm">
          <Plus size={14} strokeWidth={2} />
          Nueva orden
        </button>
      </DialogTrigger>

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
            {loadingItems ? (
              <div className="input-field text-on-surface-variant text-sm">Cargando productos...</div>
            ) : (
              <ProductSearch
                items={inventarioItems}
                value={productoNombre}
                onChange={(name) => setValue('productoNombre', name, { shouldValidate: true })}
                placeholder={`Buscá un ${CATEGORIA_LABELS[categoria].toLowerCase()}...`}
              />
            )}
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

// ─── Modal Rechazar ───────────────────────────────────────────────────────────

function RechazarModal({
  orden,
  onRechazada,
}: {
  orden: OrdenProduccion
  onRechazada: (o: OrdenProduccion) => void
}) {
  const token = useAuthStore((s) => s.token)
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleRechazar() {
    if (motivo.trim().length < 5) {
      setError('El motivo debe tener al menos 5 caracteres')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const updated = await apiClient.put<OrdenProduccion>(
        `/ordenes/${orden.id}/rechazar`,
        { motivoRechazo: motivo.trim() },
        token
      )
      onRechazada(updated)
      toast.info(`Orden "${updated.productoNombre}" rechazada.`)
      setOpen(false)
      setMotivo('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al rechazar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setMotivo(''); setError(null) } }}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded font-heading font-semibold text-xs transition-colors"
          style={{ color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.10)' }}
        >
          <X size={12} strokeWidth={2} />
          Rechazar
        </button>
      </DialogTrigger>
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
              disabled={loading}
              className="flex-1 py-2.5 text-sm font-heading font-semibold rounded transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#ef4444', color: '#fff' }}
            >
              {loading ? 'Rechazando...' : 'Confirmar rechazo'}
            </button>
            <DialogClose asChild>
              <button type="button" className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-high hover:bg-surface-bright transition-colors">
                Cancelar
              </button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
  const token = useAuthStore((s) => s.token)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  async function handleAction(action: 'aprobar' | 'ejecutar' | 'completar') {
    setActionLoading(action)
    try {
      const updated = await apiClient.put<OrdenProduccion>(
        `/ordenes/${orden.id}/${action}`,
        {},
        token
      )
      onUpdated(updated)
      if (action === 'aprobar') {
        toast.success(`Orden "${updated.productoNombre}" aprobada.`)
      } else if (action === 'ejecutar') {
        toast.success(`Orden "${updated.productoNombre}" ejecutada.`)
      } else {
        toast.info(`Orden "${updated.productoNombre}" marcada como completada.`)
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al procesar la acción')
    } finally {
      setActionLoading(null)
    }
  }

  const canAprobar = isEncargado && orden.estado === 'solicitada'
  const canEjecutar = isEncargado && orden.estado === 'aprobada'
  const canRechazar = isEncargado && orden.estado !== 'completada' && orden.estado !== 'rechazada'
  const canCompletar = isEncargado && orden.estado === 'ejecutada'

  return (
    <div className="bg-surface-low rounded px-4 py-4 space-y-3">
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
        <div className="rounded px-3 py-2" style={{ backgroundColor: 'rgba(239,68,68,0.07)' }}>
          <p className="font-body text-xs" style={{ color: '#ef4444' }}>
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
              disabled={actionLoading === 'aprobar'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded font-heading font-semibold text-xs disabled:opacity-50 transition-opacity"
              style={{ color: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.10)' }}
            >
              <Check size={12} strokeWidth={2} />
              {actionLoading === 'aprobar' ? 'Aprobando...' : 'Aprobar'}
            </button>
          )}
          {canEjecutar && (
            <button
              type="button"
              onClick={() => handleAction('ejecutar')}
              disabled={actionLoading === 'ejecutar'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded font-heading font-semibold text-xs disabled:opacity-50 transition-opacity"
              style={{ background: 'linear-gradient(180deg, #54e16d 0%, #00AE42 100%)', color: '#003918' }}
            >
              <Check size={12} strokeWidth={2} />
              {actionLoading === 'ejecutar' ? 'Ejecutando...' : 'Ejecutar'}
            </button>
          )}
          {canCompletar && (
            <button
              type="button"
              onClick={() => handleAction('completar')}
              disabled={actionLoading === 'completar'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded font-heading font-semibold text-xs bg-surface-high hover:bg-surface-bright transition-colors disabled:opacity-50"
            >
              {actionLoading === 'completar' ? 'Completando...' : 'Marcar completada'}
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
          className="appearance-none bg-surface-high text-on-surface font-body text-sm rounded px-3 py-1.5 pr-8 border-0 outline-none focus:ring-1 focus:ring-primary"
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

export function OrdenesPage() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.role === 'encargado'
  const isSolicitante = user?.role === 'solicitante'
  const canCreate = isEncargado || isSolicitante

  const [ordenes, setOrdenes] = useState<OrdenProduccion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<EstadoOrden | 'todas'>('todas')

  useEffect(() => {
    const query = filtroEstado !== 'todas' ? `?estado=${filtroEstado}` : ''

    async function load() {
      setLoading(true)
      try {
        const data = await apiClient.get<OrdenProduccion[]>(`/ordenes${query}`, token)
        setOrdenes(data)
        setError(null)
      } catch {
        setError('No se pudo cargar las órdenes')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [token, filtroEstado])

  function handleCreated(o: OrdenProduccion) {
    setOrdenes((prev) => [o, ...prev])
  }

  function handleUpdated(o: OrdenProduccion) {
    setOrdenes((prev) => prev.map((x) => (x.id === o.id ? o : x)))
  }

  const urgentes = ordenes.filter((o) => o.urgencia === 'urgente')
  const normales = ordenes.filter((o) => o.urgencia === 'normal')
  const ordenesOrdenadas = [...urgentes, ...normales]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-on-surface font-semibold text-xl">Órdenes de Producción</h1>
          <p className="font-body text-on-surface-variant text-sm mt-0.5">
            {loading ? '...' : `${ordenes.length} ${ordenes.length === 1 ? 'orden' : 'órdenes'}`}
            {urgentes.length > 0 && !loading && (
              <span className="ml-2" style={{ color: '#ef4444' }}>
                · {urgentes.length} urgente{urgentes.length > 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <FiltroEstado value={filtroEstado} onChange={setFiltroEstado} />
          {canCreate && <NuevaOrdenModal onCreated={handleCreated} />}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="font-body text-on-surface-variant text-sm">Cargando...</p>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-20">
          <p className="font-body text-sm" style={{ color: '#FF9800' }}>{error}</p>
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
