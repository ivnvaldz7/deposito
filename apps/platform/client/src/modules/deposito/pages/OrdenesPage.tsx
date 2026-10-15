import { useState, useEffect, useRef } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Check, X, ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { api, ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import {
  useOrdenes,
  useCreateOrden,
  useAgregarProductosOrden,
  useActualizarCantidadOrden,
  useQuitarOrden,
  useOrdenLotesDisponibles,
  useAprobarOrden,
  useRechazarOrden,
} from '../queries'
import { ProductoSelector, type Producto as ProductoCatalogo } from '../components/ProductoSelector'
import { MERCADOS as MERCADOS_COMPARTIDOS, formatMercadoLabel } from '../components/inventory-shared/mercados'
import { InventoryPageHeader } from '../components/inventory-shared/InventoryPageHeader'
import { LoadingState } from '../components/inventory-shared/inventory-states'
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

function formatVencimiento(iso: string | null): string {
  return iso ? formatFecha(iso) : 'Sin vencimiento'
}

function cantidadPendiente(orden: OrdenProduccion): number {
  return Math.max(0, Number((orden.cantidad - (orden.cantidadEntregada ?? 0)).toFixed(9)))
}

function esEntregaParcial(orden: OrdenProduccion): boolean {
  return orden.estado === 'solicitada' && (orden.cantidadEntregada ?? 0) > 0 && cantidadPendiente(orden) > 0
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

function EstadoChip({ orden }: { orden: OrdenProduccion }) {
  const { estado } = orden
  const parcial = esEntregaParcial(orden)
  return (
    <span
      className={`inline-block font-body text-xs font-medium px-2 py-0.5 rounded shrink-0 ${ESTADO_CLASSES[estado]}`}
    >
      {parcial ? 'Solicitada · parcial' : ESTADO_LABELS[estado]}
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

type OrdenDraft = {
  familia: 'droga' | 'empaque' | null
  form: NuevaOrdenForm
  lineas: Array<OrdenInput & { key: string; productoNombre: string }>
}

type OrdenLinea = OrdenInput & { key: string; productoNombre: string }

const ORDEN_DRAFT_KEY = 'deposito:orden-produccion:borrador:v1'
const EMPTY_ORDEN_FORM: NuevaOrdenForm = { categoria: 'droga', productoId: '', productoNombre: '', mercado: '', cantidad: '' }

function esMismoProducto(linea: OrdenInput, candidata: OrdenInput): boolean {
  return linea.productoId === candidata.productoId && (linea.mercado ?? '') === (candidata.mercado ?? '')
}

function combinarLineas(lineas: OrdenLinea[]): OrdenLinea[] {
  return lineas.reduce<OrdenLinea[]>((acumuladas, linea) => {
    const indiceExistente = acumuladas.findIndex((existente) => esMismoProducto(existente, linea))
    if (indiceExistente < 0) return [...acumuladas, linea]
    return acumuladas.map((existente, indice) => (
      indice === indiceExistente
        ? { ...existente, cantidad: existente.cantidad + linea.cantidad }
        : existente
    ))
  }, [])
}

function loadOrdenDraft(): OrdenDraft | null {
  try {
    const raw = window.localStorage.getItem(ORDEN_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OrdenDraft>
    if (!parsed.form || !Array.isArray(parsed.lineas)) return null
    return {
      familia: parsed.familia === 'droga' || parsed.familia === 'empaque' ? parsed.familia : null,
      form: { ...EMPTY_ORDEN_FORM, ...parsed.form },
      lineas: combinarLineas(parsed.lineas.filter((linea): linea is OrdenDraft['lineas'][number] =>
        Boolean(linea && typeof linea.key === 'string' && typeof linea.productoId === 'string' && typeof linea.productoNombre === 'string' && typeof linea.cantidad === 'number'),
      )),
    }
  } catch {
    return null
  }
}

function NuevaOrdenModal({
  open,
  onOpenChange,
  ordenBaseId,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  ordenBaseId?: string
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [lineaConfirmada, setLineaConfirmada] = useState<string | null>(null)
  const [familia, setFamilia] = useState<'droga' | 'empaque' | null>(null)
  const createMutation = useCreateOrden()
  const agregarMutation = useAgregarProductosOrden()
  const restoredDraft = useRef(false)
  const categoriaAnterior = useRef<Categoria | null>(null)

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
    defaultValues: EMPTY_ORDEN_FORM,
  })

  const categoria = useWatch({ control, name: 'categoria' })
  const productoId = useWatch({ control, name: 'productoId' })
  const productoNombre = useWatch({ control, name: 'productoNombre' })
  const mercado = useWatch({ control, name: 'mercado' })
  const cantidad = useWatch({ control, name: 'cantidad' })
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoCatalogo | null>(null)
  const [lineas, setLineas] = useState<OrdenLinea[]>([])
  useEffect(() => {
    if (!open || restoredDraft.current) return
    const draft = loadOrdenDraft()
    if (draft) {
      reset(draft.form)
      setFamilia(draft.familia)
      setLineas(draft.lineas)
    }
    restoredDraft.current = true
  }, [open, reset])

  useEffect(() => {
    if (!open || !restoredDraft.current) return
    const draft: OrdenDraft = { familia, form: getValues(), lineas }
    window.localStorage.setItem(ORDEN_DRAFT_KEY, JSON.stringify(draft))
  }, [familia, categoria, productoId, productoNombre, mercado, cantidad, lineas, getValues, open])

  useEffect(() => {
    if (!open || !restoredDraft.current) return
    const cambioCategoria = categoriaAnterior.current !== null && categoriaAnterior.current !== categoria
    categoriaAnterior.current = categoria
    if (!cambioCategoria) return
    setValue('productoId', '')
    setValue('productoNombre', '')
    if (needsMercado(categoria)) setValue('mercado', '')
    setProductoSeleccionado(null)
  }, [categoria, open, setValue])

  function seleccionarMercado(nuevoMercado: Mercado) {
    setValue('mercado', nuevoMercado, { shouldValidate: true })
    setValue('productoId', '', { shouldValidate: true })
    setValue('productoNombre', '', { shouldValidate: true })
    setProductoSeleccionado(null)
  }

  function hayProductoEnEdicion(data: NuevaOrdenForm): boolean {
    return Boolean(data.cantidad)
  }

  async function obtenerLineaEnEdicion(): Promise<OrdenLinea | null> {
    const valid = await trigger()
    if (!valid) return null
    const data = getValues()
    if (needsMercado(data.categoria) && !data.mercado) {
      setServerError('Seleccioná el país')
      return null
    }
    return {
      key: `${data.productoId}-${Date.now()}`,
      categoria: data.categoria,
      productoId: data.productoId,
      productoNombre: data.productoNombre,
      cantidad: Number(data.cantidad),
      ...(needsMercado(data.categoria) && data.mercado ? { mercado: data.mercado as Mercado } : {}),
    }
  }

  function limpiarLineaEnEdicion({ conservarProducto = false }: { conservarProducto?: boolean } = {}) {
    if (!conservarProducto) {
      setValue('productoId', '')
      setValue('productoNombre', '')
      setProductoSeleccionado(null)
    }
    setValue('cantidad', '')
  }

  async function agregarLinea(): Promise<void> {
    setServerError(null)
    setLineaConfirmada(null)
    const linea = await obtenerLineaEnEdicion()
    if (!linea) return
    const existente = lineas.find((candidata) => esMismoProducto(candidata, linea))
    if (existente) {
      const totalSolicitado = existente.cantidad + linea.cantidad
      setLineas((current) => combinarLineas([...current, linea]))
      setLineaConfirmada(`Se sumaron ${linea.cantidad}. Total solicitado: ${totalSolicitado}.`)
      limpiarLineaEnEdicion({ conservarProducto: true })
      return
    }
    setLineas((current) => [...current, linea])
    setLineaConfirmada('Producto agregado a la solicitud.')
    limpiarLineaEnEdicion({ conservarProducto: true })
  }

  async function onSubmit() {
    setServerError(null)
    setLineaConfirmada(null)
    const formActual = getValues()
    const lineaEnEdicion = hayProductoEnEdicion(formActual) ? await obtenerLineaEnEdicion() : null
    if (hayProductoEnEdicion(formActual) && !lineaEnEdicion) return
    const items = combinarLineas(lineaEnEdicion ? [...lineas, lineaEnEdicion] : lineas)
    if (items.length === 0) {
      setServerError('Agregá al menos un producto a la solicitud')
      return
    }
    try {
      const itemsParaEnviar = items.map(({ key: _key, productoNombre: _nombre, ...linea }) => linea)
      const solicitud = ordenBaseId
        ? await agregarMutation.mutateAsync({ id: ordenBaseId, items: itemsParaEnviar })
        : await createMutation.mutateAsync({ items: itemsParaEnviar })
      toast.info(ordenBaseId
        ? `${solicitud.ordenes.length} producto${solicitud.ordenes.length === 1 ? '' : 's'} agregado${solicitud.ordenes.length === 1 ? '' : 's'} a la solicitud.`
        : `Solicitud creada con ${solicitud.ordenes.length} producto${solicitud.ordenes.length === 1 ? '' : 's'}.`)
      window.localStorage.removeItem(ORDEN_DRAFT_KEY)
      reset(EMPTY_ORDEN_FORM)
      setFamilia(null)
      setLineas([])
      restoredDraft.current = false
      categoriaAnterior.current = null
      onOpenChange(false)
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al crear la orden')
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) { setServerError(null); setLineaConfirmada(null); setProductoSeleccionado(null); restoredDraft.current = false; categoriaAnterior.current = null }
    onOpenChange(next)
  }

  function discardDraft() {
    window.localStorage.removeItem(ORDEN_DRAFT_KEY)
    reset(EMPTY_ORDEN_FORM)
    setFamilia(null)
    setLineas([])
    setProductoSeleccionado(null)
    setServerError(null)
    setLineaConfirmada(null)
  }

  function cancelarOrden() {
    discardDraft()
    restoredDraft.current = false
    categoriaAnterior.current = null
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ordenBaseId ? 'Agregar productos a la solicitud' : 'Nueva orden de producción'}</DialogTitle>
          <DialogDescription>
            {ordenBaseId ? 'Los productos se agregan mientras la solicitud siga pendiente de aprobación.' : 'Solicitá insumos al encargado. La orden quedará pendiente de aprobación.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-high px-3 py-2 text-xs text-on-surface-variant">
          <span>El borrador se guarda automáticamente aunque cierres esta pantalla.</span>
          <button type="button" onClick={discardDraft} className="btn-press shrink-0 font-semibold text-error hover:underline">Descartar</button>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); void onSubmit() }} noValidate className="space-y-4">
          {/* Categoría */}
          <div className="space-y-1">
            <label className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              ¿Qué necesitás?
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setFamilia('droga'); setValue('categoria', 'droga') }} className={`btn-press input-field ${familia === 'droga' ? 'ring-1 ring-primary' : ''}`}>Drogas</button>
              <button type="button" onClick={() => { setFamilia('empaque'); setValue('categoria', categoria === 'droga' ? 'frasco' : categoria) }} className={`btn-press input-field ${familia === 'empaque' ? 'ring-1 ring-primary' : ''}`}>Material de Empaque</button>
            </div>
            {familia === 'empaque' && (
              <div className="flex gap-2 pt-2 animate-reveal">
                {(['frasco', 'estuche', 'etiqueta'] as const).map((tipo) => (
                  <button key={tipo} type="button" onClick={() => setValue('categoria', tipo)} className={`btn-press px-3 py-2 rounded text-xs capitalize ${categoria === tipo ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'}`}>{tipo}</button>
                ))}
              </div>
            )}
          </div>

          {familia && <>
          {needsMercado(categoria) && (
            <fieldset className="space-y-2 animate-reveal">
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
                      className={`btn-press rounded-lg border px-3 py-2 font-body text-xs font-medium transition-colors ${
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
              onChange={(id, nombre, producto) => {
                setValue('productoId', id ?? '', { shouldValidate: true })
                setValue('productoNombre', nombre, { shouldValidate: true })
                setProductoSeleccionado(producto ?? null)
              }}
              placeholder={needsMercado(categoria) && !mercado
                ? 'Primero seleccioná un país'
                : `Buscá un ${CATEGORIA_LABELS[categoria].toLowerCase()}...`}
              disabled={needsMercado(categoria) && !mercado}
            />
            {errors.productoNombre && (
              <p className="font-body text-error text-xs">{errors.productoNombre.message}</p>
            )}
            {productoSeleccionado && (
              <p role="status" className="mt-2 rounded-lg border border-primary/20 bg-primary-container/10 px-3 py-2 text-xs text-on-surface-variant animate-reveal">
                <strong className="text-on-surface">Seleccionado:</strong>{' '}
                {CATEGORIA_LABELS[productoSeleccionado.categoria as Categoria]} · {productoSeleccionado.codigo ?? 'sin código'}
                {mercado && needsMercado(categoria) && <>{' '}· {formatMercadoLabel(mercado as Mercado)} · Stock disponible: {productoSeleccionado.stockPorMercado?.[mercado as Mercado] ?? 0}</>}
              </p>
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
              min={categoria === 'droga' ? '0.001' : '1'}
              step={categoria === 'droga' ? 'any' : '1'}
              placeholder="0"
              autoComplete="off"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void agregarLinea()
                }
              }}
              className="input-field"
            />
            <p className="font-body text-xs text-on-surface-variant">Confirmá la cantidad para seguir cargando. Si repetís el producto, se suma al total. También podés usar la tecla Enter.</p>
            {errors.cantidad && <p className="font-body text-error text-xs">{errors.cantidad.message}</p>}
          </div>

          <button type="button" onClick={() => void agregarLinea()} className="btn-secondary btn-press w-full py-2.5 text-sm">
            + Confirmar producto y cargar otro
          </button>

          {lineas.length > 0 && (
            <section aria-label="Productos de la solicitud" className="rounded-xl border border-outline-variant/50 bg-surface-container-low p-3 animate-reveal">
              <div className="mb-2 flex items-center justify-between gap-2"><p className="font-body text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Productos agregados</p><span className="font-body text-xs text-primary">{lineas.length}</span></div>
              <div className="space-y-2">
                {lineas.map((linea) => <div key={linea.key} className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-high px-3 py-2 animate-reveal"><div className="min-w-0"><p className="truncate text-sm font-semibold text-on-surface">{linea.productoNombre}</p><p className="text-xs text-on-surface-variant">{CATEGORIA_LABELS[linea.categoria]}{linea.mercado ? ` · ${formatMercadoLabel(linea.mercado)}` : ''} · {linea.cantidad}</p></div><button type="button" aria-label={`Quitar ${linea.productoNombre}`} onClick={() => setLineas((current) => current.filter((candidate) => candidate.key !== linea.key))} className="btn-press rounded p-1.5 text-error hover:bg-error/10"><X size={16} /></button></div>)}
              </div>
            </section>
          )}

          {serverError && (
            <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded animate-reveal">{serverError}</div>
          )}
          {lineaConfirmada && (
            <div role="status" className="flex items-center gap-2 rounded bg-primary-container/15 px-4 py-3 font-body text-sm text-primary animate-reveal">
              <Check size={16} aria-hidden="true" className="animate-check-pop" />
              {lineaConfirmada}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={isSubmitting || createMutation.isPending || agregarMutation.isPending || (lineas.length === 0 && !hayProductoEnEdicion(getValues()))} className="btn-primary btn-press flex-1 py-2.5 text-sm">
              {isSubmitting || createMutation.isPending || agregarMutation.isPending
                ? 'Guardando...'
                : ordenBaseId ? `Agregar productos${lineas.length > 0 ? ` (${lineas.length})` : ''}` : `Enviar solicitud${lineas.length > 0 ? ` (${lineas.length})` : ''}`}
            </button>
            <button
              type="button"
              onClick={cancelarOrden}
              className="btn-press flex-1 py-2.5 text-sm font-semibold rounded text-on-surface-variant bg-surface-container-high hover:bg-surface-bright transition-colors"
            >
              Cancelar
            </button>
          </div>
          </>}
          {!familia && <div className="flex justify-end pt-1"><button type="button" onClick={cancelarOrden} className="btn-press px-4 py-2 text-sm rounded text-on-surface-variant bg-surface-container-high">Cancelar</button></div>}
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
        className="btn-press flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold text-xs transition-colors text-error bg-error/10"
      >
        <X size={12} strokeWidth={2} />
        Rechazar
      </button>
      {confirming && <div className="flex items-center gap-2 animate-reveal">
        <span className="text-xs text-on-surface-variant">¿Rechazar esta orden?</span>
        <button type="button" onClick={handleRechazar} disabled={rejectMutation.isPending} className="btn-press px-3 py-1.5 rounded text-xs bg-error text-white disabled:opacity-50">{rejectMutation.isPending ? 'Rechazando…' : 'Confirmar'}</button>
        <button type="button" onClick={() => setConfirming(false)} disabled={rejectMutation.isPending} className="btn-press px-3 py-1.5 rounded text-xs bg-surface-container-high text-on-surface">Cancelar</button>
      </div>}
      {error && <div className="text-xs text-error animate-reveal">{error}</div>}
    </>
  )
}

function EditarOrdenPendiente({ orden }: { orden: OrdenProduccion }) {
  const actualizarMutation = useActualizarCantidadOrden()
  const quitarMutation = useQuitarOrden()
  const [editing, setEditing] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [cantidad, setCantidad] = useState(String(orden.cantidad))
  const [error, setError] = useState<string | null>(null)

  async function guardarCantidad() {
    const nuevaCantidad = Number(cantidad)
    if (!Number.isFinite(nuevaCantidad) || nuevaCantidad <= 0 || (orden.categoria !== 'droga' && !Number.isInteger(nuevaCantidad))) {
      setError(orden.categoria === 'droga' ? 'Ingresá una cantidad positiva.' : 'Ingresá una cantidad entera positiva.')
      return
    }
    setError(null)
    try {
      await actualizarMutation.mutateAsync({ id: orden.id, cantidad: nuevaCantidad })
      toast.success(`Cantidad de "${orden.productoNombre}" actualizada.`)
      setEditing(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar la cantidad')
    }
  }

  async function quitarProducto() {
    setError(null)
    try {
      await quitarMutation.mutateAsync(orden.id)
      toast.success(`"${orden.productoNombre}" fue quitado de la solicitud.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo quitar el producto')
    }
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-lg border border-outline-variant/50 bg-surface-container-high p-3 animate-reveal">
        <label htmlFor={`editar-cantidad-${orden.id}`} className="block text-xs font-semibold text-on-surface">Cantidad solicitada</label>
        <input
          id={`editar-cantidad-${orden.id}`}
          type="number"
          min={orden.categoria === 'droga' ? '0.001' : '1'}
          step={orden.categoria === 'droga' ? 'any' : '1'}
          value={cantidad}
          onChange={(event) => setCantidad(event.target.value)}
          disabled={actualizarMutation.isPending}
          className="input-field w-full py-2 text-sm"
        />
        <div className="flex gap-2">
          <button type="button" onClick={() => void guardarCantidad()} disabled={actualizarMutation.isPending} className="btn-primary btn-press px-3 py-1.5 text-xs disabled:opacity-50">{actualizarMutation.isPending ? 'Guardando...' : 'Guardar'}</button>
          <button type="button" onClick={() => { setEditing(false); setCantidad(String(orden.cantidad)); setError(null) }} disabled={actualizarMutation.isPending} className="btn-press rounded bg-surface-bright px-3 py-1.5 text-xs text-on-surface">Cancelar</button>
        </div>
        {error && <p className="text-xs text-error animate-reveal">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setEditing(true); setConfirmingRemove(false); setError(null) }} disabled={quitarMutation.isPending} className="btn-press flex items-center gap-1.5 rounded bg-surface-container-high px-3 py-1.5 text-xs font-semibold text-on-surface-variant"><Pencil size={12} />Editar cantidad</button>
        <button type="button" onClick={() => { setConfirmingRemove(true); setError(null) }} disabled={quitarMutation.isPending} className="btn-press flex items-center gap-1.5 rounded bg-error/10 px-3 py-1.5 text-xs font-semibold text-error"><Trash2 size={12} />Quitar</button>
      </div>
      {confirmingRemove && <div className="flex flex-wrap items-center gap-2 animate-reveal"><span className="text-xs text-on-surface-variant">¿Quitar este producto?</span><button type="button" onClick={() => void quitarProducto()} disabled={quitarMutation.isPending} className="btn-press rounded bg-error px-3 py-1.5 text-xs text-white disabled:opacity-50">{quitarMutation.isPending ? 'Quitando...' : 'Confirmar'}</button><button type="button" onClick={() => setConfirmingRemove(false)} disabled={quitarMutation.isPending} className="btn-press rounded bg-surface-container-high px-3 py-1.5 text-xs text-on-surface">Cancelar</button></div>}
      {error && <p className="text-xs text-error animate-reveal">{error}</p>}
    </div>
  )
}

// ─── Orden card ───────────────────────────────────────────────────────────────

function OrdenCard({
  orden,
  canAprobarPerm,
  canRechazarPerm,
  canEditar,
}: {
  orden: OrdenProduccion
  canAprobarPerm: boolean
  canRechazarPerm: boolean
  canEditar: boolean
}) {
  const approveMutation = useAprobarOrden()
  const [rejectPending, setRejectPending] = useState(false)
  const [loteIdPreferido, setLoteIdPreferido] = useState('')
  const { data: lotesDisponibles = [], isLoading: cargandoLotes } = useOrdenLotesDisponibles(
    canAprobarPerm && orden.estado === 'solicitada' && orden.categoria === 'droga' ? orden.id : undefined,
  )
  const actionBusy = approveMutation.isPending || rejectPending

  async function handleAction() {
    try {
      const result = await approveMutation.mutateAsync({ id: orden.id, loteIdPreferido: loteIdPreferido || undefined })
      if (result.pendiente > 0) {
        if (result.cantidadDescontada > 0) {
          toast.info(`Entrega parcial: ${result.cantidadDescontada}. Quedan ${result.pendiente} de "${orden.productoNombre}".`)
        } else {
          toast.info(`Sin stock disponible. "${orden.productoNombre}" queda pendiente por ${result.pendiente}.`)
        }
      } else {
        toast.success(`Orden "${orden.productoNombre}" aprobada.`)
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al procesar la acción')
    }
  }

  const canAprobar = canAprobarPerm && orden.estado === 'solicitada'
  const canRechazar = canRechazarPerm && orden.estado === 'solicitada'

  return (
    <div className="animate-reveal bg-surface-container-low rounded px-4 py-4 space-y-3 transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-float">
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
          <EstadoChip orden={orden} />
        </div>
      </div>

      {/* Data */}
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <div>
          <p className="font-body text-on-surface-variant text-xs uppercase tracking-widest">Solicitada</p>
          <p className="font-body text-on-surface text-sm tabular-nums font-medium">{orden.cantidad}</p>
        </div>
        {(orden.cantidadEntregada ?? 0) > 0 && (
          <>
            <div>
              <p className="font-body text-on-surface-variant text-xs uppercase tracking-widest">Entregada</p>
              <p className="font-body text-sm tabular-nums font-medium text-primary">{orden.cantidadEntregada}</p>
            </div>
            {cantidadPendiente(orden) > 0 && (
              <div>
                <p className="font-body text-on-surface-variant text-xs uppercase tracking-widest">Pendiente</p>
                <p className="font-body text-sm tabular-nums font-medium text-warning">{cantidadPendiente(orden)}</p>
              </div>
            )}
          </>
        )}
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

      {canEditar && <EditarOrdenPendiente orden={orden} />}

      {canAprobar && orden.categoria === 'droga' && (
        <div className="space-y-1.5 rounded-lg border border-outline-variant/50 bg-surface-container-high px-3 py-2.5 animate-reveal">
          <label htmlFor={`orden-lote-${orden.id}`} className="font-body text-xs font-semibold text-on-surface">
            Lote a descontar primero
          </label>
          <select
            id={`orden-lote-${orden.id}`}
            value={loteIdPreferido}
            onChange={(event) => setLoteIdPreferido(event.target.value)}
            disabled={actionBusy || cargandoLotes}
            className="input-field w-full py-2 text-sm"
          >
            <option value="">Automático (FEFO)</option>
            {lotesDisponibles.map((lote) => (
              <option key={lote.id} value={lote.id}>
                {lote.lote ?? 'Sin número'} · {lote.cantidad} disponibles · Vto. {formatVencimiento(lote.vencimiento)}
              </option>
            ))}
          </select>
          <p className="font-body text-xs text-on-surface-variant">
            {cargandoLotes ? 'Cargando lotes…' : loteIdPreferido ? 'Se descontará este lote antes de continuar con los demás.' : 'Sin selección, se descuenta por vencimiento más próximo.'}
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
              className="btn-press flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold text-xs disabled:opacity-50 transition-opacity text-primary bg-primary-container/10"
            >
              <Check size={12} strokeWidth={2} />
              {approveMutation.isPending ? 'Entregando...' : esEntregaParcial(orden) ? 'Entregar saldo' : 'Aprobar'}
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
  onAgregarProductos,
  userId,
}: {
  grupoId: string
  ordenes: OrdenProduccion[]
  canAprobarPerm: boolean
  canRechazarPerm: boolean
  onAgregarProductos: (ordenId: string) => void
  userId?: string
}) {
  const confirmadas = ordenes.filter((orden) => ['aprobada', 'ejecutada', 'completada'].includes(orden.estado)).length
  const pendientes = ordenes.filter((orden) => orden.estado === 'solicitada').length
  const rechazadas = ordenes.filter((orden) => orden.estado === 'rechazada').length
  const cantidadSolicitada = ordenes.filter((orden) => orden.estado !== 'rechazada').reduce((total, orden) => total + orden.cantidad, 0)
  const cantidadEntregada = ordenes.reduce((total, orden) => total + (orden.cantidadEntregada ?? (['aprobada', 'ejecutada', 'completada'].includes(orden.estado) ? orden.cantidad : 0)), 0)
  const porcentaje = cantidadSolicitada === 0 ? 0 : Math.round((cantidadEntregada / cantidadSolicitada) * 100)
  const fecha = ordenes[0]?.createdAt ? formatFecha(ordenes[0].createdAt) : ''
  const ordenEditable = ordenes.find((orden) => orden.solicitante.id === userId && orden.estado === 'solicitada' && (orden.cantidadEntregada ?? 0) === 0)

  return (
    <section className="rounded-xl border border-outline-variant/50 bg-surface-container-low p-3 sm:p-4 animate-reveal" aria-label={`Solicitud ${grupoId}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="font-body text-sm font-bold text-on-surface">Solicitud de producción</h2><p className="text-xs text-on-surface-variant">{ordenes.length} producto{ordenes.length === 1 ? '' : 's'} · {fecha}</p>{ordenEditable && <button type="button" onClick={() => onAgregarProductos(ordenEditable.id)} className="btn-press mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Plus size={13} />Agregar productos</button>}</div>
        <div className="text-right"><p className="text-sm font-bold tabular-nums text-primary">{porcentaje}%</p><p className="text-xs text-on-surface-variant">{confirmadas}/{ordenes.length} completos</p></div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-container-high" aria-label={`${porcentaje}% cumplido`}><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${porcentaje}%` }} /></div>
      <p className="mt-2 text-xs text-on-surface-variant">{pendientes > 0 ? `${pendientes} pendiente${pendientes === 1 ? '' : 's'} de disponibilidad o aprobación` : rechazadas > 0 ? `${rechazadas} sin completar` : 'Solicitud completada'}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordenes.map((orden) => <OrdenCard key={orden.id} orden={orden} canAprobarPerm={canAprobarPerm} canRechazarPerm={canRechazarPerm} canEditar={orden.solicitante.id === userId && orden.estado === 'solicitada' && (orden.cantidadEntregada ?? 0) === 0} />)}
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
  const [ordenBaseParaAgregar, setOrdenBaseParaAgregar] = useState<string | null>(null)

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
                onClick: () => { setOrdenBaseParaAgregar(null); setNuevaOrdenOpen(true) },
                icon: <Plus size={14} strokeWidth={2} />,
              }
            : undefined
        }
      >
        <FiltroEstado value={filtroEstado} onChange={setFiltroEstado} />
      </InventoryPageHeader>

      {canCreate && !archivadas ? (
        <NuevaOrdenModal
          open={nuevaOrdenOpen || ordenBaseParaAgregar !== null}
          ordenBaseId={ordenBaseParaAgregar ?? undefined}
          onOpenChange={(next) => {
            if (!next) {
              setNuevaOrdenOpen(false)
              setOrdenBaseParaAgregar(null)
            }
          }}
        />
      ) : null}

      {/* Content */}
      {isLoading ? <LoadingState /> : error ? (
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
              userId={user?.id}
              onAgregarProductos={(ordenId) => { setNuevaOrdenOpen(false); setOrdenBaseParaAgregar(ordenId) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
