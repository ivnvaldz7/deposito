import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronRight, Plus, Check, ArrowLeft, ArrowRight, FileText, Calendar, Building2, Truck, ChevronDown } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { useCreateActa, useAddActaItem, useDistribuirItem } from '../queries/use-actas'
import { ProductoSelector } from '../components/ProductoSelector'
import type { Acta, ActaItem, Categoria, CondicionEmbalaje, Mercado } from '../lib/actas-types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function currentMonthISO(): string {
  return new Date().toISOString().slice(0, 7)
}

// ─── Step indicator (Stitch design) ───────────────────────────────────────────

const STEPS = [
  { label: 'Cabecera', subtitle: 'Datos del acta' },
  { label: 'Ítems', subtitle: 'Agregar items' },
  { label: 'Revisión', subtitle: 'Distribuir' },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="max-w-4xl mx-auto mb-xl">
      <div className="flex items-center justify-between relative">
        {/* Connecting Lines */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-[2px] bg-surface-container-high -z-10" />
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] bg-primary-container -z-10 transition-all duration-300"
          style={{ width: `${((current - 1) / (STEPS.length - 1)) * 100}%` }}
        />

        {STEPS.map((step, i) => {
          const num = i + 1
          const done = num < current
          const active = num === current

          return (
            <div key={i} className="flex flex-col items-center gap-1 relative bg-background px-2">
              {done ? (
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-[0_0_15px_rgba(163,209,182,0.3)]">
                  <Check size={18} className="text-on-primary" strokeWidth={2.5} />
                </div>
              ) : active ? (
                <div className="w-10 h-10 rounded-full bg-surface border-2 border-primary-container flex items-center justify-center shadow-[0_0_15px_rgba(163,209,182,0.3)] relative">
                  <div className="w-3 h-3 rounded-full bg-primary-container animate-pulse" style={{ animation: 'pulse-dot 2s ease-in-out infinite' }} />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-surface-container-high border-2 border-surface-variant flex items-center justify-center text-on-surface-variant font-mono text-sm font-semibold">
                  {num}
                </div>
              )}
              <span className={`font-body text-xs font-semibold ${active ? 'text-primary' : 'text-on-surface-variant'}`}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Step 1: datos del acta (Cabecera) ────────────────────────────────────────

const paso1Schema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  notas: z.string().max(500).optional(),
})

type Paso1Data = z.infer<typeof paso1Schema>

function Paso1({
  onCreated,
  onCancel,
}: {
  onCreated: (acta: Acta) => void
  onCancel: () => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const createActa = useCreateActa()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Paso1Data>({
    resolver: zodResolver(paso1Schema),
    defaultValues: { fecha: todayISO(), notas: '' },
  })

  async function onSubmit(data: Paso1Data) {
    setServerError(null)
    try {
      const acta = await createActa.mutateAsync(
        { fecha: data.fecha, notas: data.notas || undefined }
      )
      onCreated(acta)
      toast.info('Acta creada. Ya podés cargar los items.')
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al crear el acta')
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-surface-container border border-primary-container/30 rounded-xl shadow-float overflow-hidden relative">
        {/* Gradient top border */}
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary-container to-transparent opacity-50" />

        <div className="p-lg">
          <div className="mb-lg">
            <h2 className="font-heading text-lg font-semibold text-on-surface mb-1">Datos del Remito</h2>
            <p className="font-body text-sm text-on-surface-variant">
              Complete la información general del ingreso de mercadería.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit, () => toast.error('Completá la fecha del acta antes de continuar.'))} noValidate className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
            {/* Invoice / Remito */}
            <div className="flex flex-col gap-1 col-span-1">
              <label htmlFor="acta-remito" className="font-body text-xs font-medium text-on-surface-variant">
                Nº de Remito / Factura *
              </label>
              <div className="relative">
                <FileText size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  id="acta-remito"
                  type="text"
                  placeholder="Ej: R-0001-000456"
                  className="input-field pl-10"
                  disabled
                />
              </div>
            </div>

            {/* Date */}
            <div className="flex flex-col gap-1 col-span-1">
              <label htmlFor="acta-fecha" className="font-body text-xs font-medium text-on-surface-variant">
                Fecha de Recepción *
              </label>
              <div className="relative">
                <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  id="acta-fecha"
                  {...register('fecha')}
                  type="date"
                  className="input-field pl-10 [color-scheme:dark]"
                  autoFocus
                />
              </div>
              {errors.fecha && (
                <p className="font-body text-error text-xs">{errors.fecha.message}</p>
              )}
            </div>

            {/* Provider (simulated) */}
            <div className="flex flex-col gap-1 col-span-1 md:col-span-2">
              <label className="font-body text-xs font-medium text-on-surface-variant">
                Proveedor *
              </label>
              <div className="relative">
                <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <select className="input-field pl-10 appearance-none" disabled>
                  <option>Seleccione un proveedor...</option>
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
              </div>
            </div>

            {/* Transport (simulated) */}
            <div className="flex flex-col gap-1 col-span-1 md:col-span-2">
              <label className="font-body text-xs font-medium text-on-surface-variant">
                Empresa de Transporte <span className="font-normal opacity-60">(Opcional)</span>
              </label>
              <div className="relative">
                <Truck size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input type="text" placeholder="Nombre del transporte o chofer" className="input-field pl-10" disabled />
              </div>
            </div>

            {/* Observations */}
            <div className="flex flex-col gap-1 col-span-1 md:col-span-2">
              <label htmlFor="acta-notas" className="font-body text-xs font-medium text-on-surface-variant">
                Observaciones <span className="font-normal opacity-60">(Opcional)</span>
              </label>
              <div className="relative">
                <textarea
                  id="acta-notas"
                  {...register('notas')}
                  rows={3}
                  placeholder="Detalles sobre el estado del empaque, temperatura de llegada, etc."
                  className="input-field resize-none"
                />
              </div>
              {errors.notas && (
                <p className="font-body text-error text-xs">{errors.notas.message}</p>
              )}
            </div>

            {serverError && (
              <div className="col-span-full bg-error/10 text-error font-body text-sm px-4 py-3 rounded">
                {serverError}
              </div>
            )}
          </form>
        </div>

        {/* Action Footer */}
        <div className="bg-surface-container-low border-t border-white/5 p-md flex items-center justify-between">
          <button
            type="button"
            onClick={onCancel}
            className="px-lg py-2 rounded-lg font-body text-sm text-on-surface-variant hover:bg-surface-variant transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={createActa.isPending}
            className="px-lg py-2 rounded-lg bg-primary-container text-on-primary-container font-body text-sm font-semibold flex items-center gap-2 scale-hover transition-transform shadow-[0_0_15px_rgba(163,209,182,0.2)]"
          >
            {createActa.isPending ? 'Creando...' : 'Siguiente: Ítems'}
            {!createActa.isPending && <ArrowRight size={18} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Mercado config ───────────────────────────────────────────────────────────

const MERCADOS_CONFIG: { value: Mercado; label: string; color: string }[] = [
  { value: 'argentina',    label: 'Argentina',    color: '#00AE42' },
  { value: 'colombia',     label: 'Colombia',     color: '#FF9800' },
  { value: 'mexico',       label: 'México',       color: '#2196F3' },
  { value: 'ecuador',      label: 'Ecuador',      color: '#9C27B0' },
  { value: 'bolivia',      label: 'Bolivia',      color: '#F44336' },
  { value: 'paraguay',     label: 'Paraguay',     color: '#00BCD4' },
  { value: 'no_exportable', label: 'No exportable', color: '#757575' },
]

const CONDICION_EMBALAJE_OPTIONS: { value: CondicionEmbalaje; label: string; color: string }[] = [
  { value: 'bueno', label: 'Bueno', color: '#00AE42' },
  { value: 'regular', label: 'Regular', color: '#FF9800' },
  { value: 'malo', label: 'Malo', color: '#F44336' },
]

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: 'droga',    label: 'Droga' },
  { value: 'estuche',  label: 'Estuche' },
  { value: 'etiqueta', label: 'Etiqueta' },
  { value: 'frasco',   label: 'Frasco' },
]

// ─── Step 2: agregar items ────────────────────────────────────────────────────

const itemSchema = z
  .object({
    categoria: z.enum(['droga', 'estuche', 'etiqueta', 'frasco']),
    productoId: z.string().uuid().optional(),
    productoNombre: z.string().min(2, 'Mínimo 2 caracteres').max(100),
    lote: z.string().max(50, 'Máximo 50 caracteres').optional(),
    vencimiento: z.string().regex(/^\d{4}-\d{2}$/, 'Usá formato MM/AAAA').optional(),
    temperaturaTransporte: z.string().max(50, 'Máximo 50 caracteres').optional(),
    condicionEmbalaje: z.enum(['bueno', 'regular', 'malo']).optional(),
    observacionesCalidad: z.string().max(1000, 'Máximo 1000 caracteres').optional(),
    aprobadoCalidad: z.boolean(),
    cantidadIngresada: z
      .string()
      .min(1, 'Requerido')
      .refine((v) => Number.isInteger(Number(v)) && Number(v) > 0, 'Debe ser entero positivo'),
    mercado: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if ((data.categoria === 'estuche' || data.categoria === 'etiqueta') && !data.mercado) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `El mercado es requerido para ${data.categoria}s`,
        path: ['mercado'],
      })
    }
    if (data.categoria === 'droga' && !data.lote?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El lote es obligatorio para drogas',
        path: ['lote'],
      })
    }
    if (data.categoria === 'droga' && !data.vencimiento) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El vencimiento es obligatorio para drogas',
        path: ['vencimiento'],
      })
    }
  })

type ItemFormData = z.infer<typeof itemSchema>

function Paso2({
  actaId,
  items,
  onItemAdded,
  onNext,
  prefillItem,
}: {
  actaId: string
  items: ActaItem[]
  onItemAdded: (item: ActaItem) => void
  onNext: () => void
  prefillItem?: { categoria: Categoria; productoNombre: string; productoId?: string; cantidadIngresada: string } | null
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [qualityOpen, setQualityOpen] = useState(false)
  const addActaItem = useAddActaItem()
  const prefillAppliedRef = useRef(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      categoria: 'droga',
      productoId: undefined,
      productoNombre: '',
      lote: '',
      vencimiento: currentMonthISO(),
      temperaturaTransporte: '',
      condicionEmbalaje: undefined,
      observacionesCalidad: '',
      aprobadoCalidad: false,
      cantidadIngresada: '',
      mercado: undefined,
    },
  })

  const categoria = useWatch({ control, name: 'categoria' })
  const selectedProductoId = useWatch({ control, name: 'productoId' })
  const productoNombre = useWatch({ control, name: 'productoNombre' })
  const mercado = useWatch({ control, name: 'mercado' })
  const condicionEmbalaje = useWatch({ control, name: 'condicionEmbalaje' })
  const aprobadoCalidad = useWatch({ control, name: 'aprobadoCalidad' })

  useEffect(() => {
    if (!prefillItem || prefillAppliedRef.current) return

    const pid = prefillItem.productoId ?? ''
    reset({
      categoria: prefillItem.categoria,
      productoId: pid || undefined,
      productoNombre: prefillItem.productoNombre,
      lote: '',
      vencimiento: currentMonthISO(),
      temperaturaTransporte: '',
      condicionEmbalaje: undefined,
      observacionesCalidad: '',
      aprobadoCalidad: false,
      cantidadIngresada: prefillItem.cantidadIngresada,
      mercado: undefined,
    })
    prefillAppliedRef.current = true
  }, [prefillItem, reset])

  async function onSubmit(data: ItemFormData) {
    setServerError(null)
    try {
      const item = await addActaItem.mutateAsync({
        actaId,
        categoria: data.categoria,
        ...(data.productoId ? { productoId: data.productoId } : {}),
        productoNombre: data.productoNombre,
        ...(data.categoria === 'droga' ? { lote: data.lote } : {}),
        cantidadIngresada: Number(data.cantidadIngresada),
        ...(data.vencimiento ? { vencimiento: data.vencimiento } : {}),
        ...(data.temperaturaTransporte?.trim()
          ? { temperaturaTransporte: data.temperaturaTransporte.trim() }
          : {}),
        ...(data.condicionEmbalaje ? { condicionEmbalaje: data.condicionEmbalaje } : {}),
        ...(data.observacionesCalidad?.trim()
          ? { observacionesCalidad: data.observacionesCalidad.trim() }
          : {}),
        aprobadoCalidad: data.aprobadoCalidad,
        ...((data.categoria === 'estuche' || data.categoria === 'etiqueta') && data.mercado ? { mercado: data.mercado } : {}),
      })
      onItemAdded(item)
      toast.info(`Item "${item.productoNombre}" agregado al acta.`)
      reset({
        categoria: data.categoria,
        productoId: undefined,
        productoNombre: '',
        lote: '',
        vencimiento: currentMonthISO(),
        temperaturaTransporte: '',
        condicionEmbalaje: undefined,
        observacionesCalidad: '',
        aprobadoCalidad: false,
        cantidadIngresada: '',
        mercado: undefined,
      })
      setQualityOpen(false)
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al agregar item')
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-surface-container border border-primary-container/30 rounded-xl shadow-float overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary-container to-transparent opacity-50" />

        <div className="p-lg space-y-6">
          <div>
            <h2 className="font-heading text-lg font-semibold text-on-surface mb-1">Agregar Ítems</h2>
            <p className="font-body text-sm text-on-surface-variant">
              Seleccioná el producto y completá los datos del lote.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit, () => toast.error('Completá categoría, producto y cantidad antes de agregar el item.'))} noValidate className="space-y-4 max-w-lg">
            {/* Categoría */}
            <div className="space-y-1">
              <label className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                Categoría
              </label>
              <div className="flex gap-2 flex-wrap">
                {CATEGORIAS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setValue('categoria', value)
                      setValue('productoId', undefined)
                      setValue('productoNombre', '')
                      setValue('mercado', undefined)
                    }}
                    className={`px-3 py-1.5 rounded-lg font-body text-sm transition-colors ${
                      categoria === value
                        ? 'bg-primary-container/20 text-primary border border-primary-container/30'
                        : 'bg-surface-container-high text-on-surface-variant border border-white/10 hover:border-primary/30'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Producto */}
            <div className="space-y-1">
              <label htmlFor="acta-item-producto" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                Producto
              </label>
              <ProductoSelector
                key={`${categoria}-${selectedProductoId ?? 'empty'}`}
                id="acta-item-producto"
                categoria={categoria}
                displayValue={productoNombre}
                onChange={(id, nombre) => {
                  setValue('productoId', id || undefined, { shouldValidate: true })
                  setValue('productoNombre', nombre, { shouldValidate: true })
                }}
              />
              {errors.productoNombre && (
                <p className="font-body text-error text-xs">{errors.productoNombre.message}</p>
              )}
            </div>

            {/* Mercado */}
            {(categoria === 'estuche' || categoria === 'etiqueta') && (
              <div className="space-y-1">
                <label className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                  Mercado
                </label>
                <div className="flex gap-2 flex-wrap">
                  {MERCADOS_CONFIG.map(({ value, label, color }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setValue('mercado', value, { shouldValidate: true })}
                      className={`px-3 py-1.5 rounded-lg font-body text-xs transition-colors border ${
                        mercado === value
                          ? 'border-primary-container/30 bg-primary-container/10 text-primary'
                          : 'border-white/10 bg-surface-container-high text-on-surface-variant hover:border-primary/30'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {errors.mercado && (
                  <p className="font-body text-error text-xs">{errors.mercado.message}</p>
                )}
              </div>
            )}

            {/* Lote + Cantidad */}
            <div className="grid grid-cols-2 gap-3">
              {categoria === 'droga' ? (
                <div className="space-y-1">
                  <label htmlFor="acta-item-lote" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                    Lote
                  </label>
                  <input
                    id="acta-item-lote"
                    {...register('lote')}
                    type="text"
                    placeholder="Ej: L240901"
                    className="input-field"
                  />
                  {errors.lote && (
                    <p className="font-body text-error text-xs">{errors.lote.message}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                    Lote
                  </label>
                  <div className="bg-surface-container-high rounded-lg px-3 py-2.5 font-body text-xs text-on-surface-variant leading-relaxed border border-white/10">
                    <span>Se asignará automáticamente</span>
                    <br />
                    <span className="font-mono text-primary/60">
                      {categoria === 'estuche'
                        ? 'EST-XXXX'
                        : categoria === 'etiqueta'
                        ? 'ETQ-XXXX'
                        : 'FRA-XXXX'}
                    </span>
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <label htmlFor="acta-item-cantidad" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                  {categoria === 'frasco' ? 'Cajas' : 'Cantidad'}
                </label>
                <input
                  id="acta-item-cantidad"
                  {...register('cantidadIngresada')}
                  type="number"
                  min="1"
                  placeholder="0"
                  className="input-field"
                />
                {errors.cantidadIngresada && (
                  <p className="font-body text-error text-xs">{errors.cantidadIngresada.message}</p>
                )}
              </div>
            </div>

            {/* Vencimiento */}
            {categoria === 'droga' && (
              <div className="space-y-1">
                <label htmlFor="acta-item-vencimiento" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                  Vencimiento
                </label>
                <input
                  id="acta-item-vencimiento"
                  {...register('vencimiento')}
                  type="month"
                  className="input-field"
                />
                <p className="font-body text-xs text-on-surface-variant mt-0.5">
                  Mes y año. Se guardará el último día del mes.
                </p>
                {errors.vencimiento && (
                  <p className="font-body text-error text-xs">{errors.vencimiento.message}</p>
                )}
              </div>
            )}

            {/* Control de Calidad Accordion */}
            <div className="bg-surface-container-high rounded-lg overflow-hidden border border-white/10">
              <button
                type="button"
                onClick={() => setQualityOpen((current) => !current)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-variant/30"
              >
                <div>
                  <p className="font-heading text-sm font-semibold text-on-surface">
                    Control de Calidad
                  </p>
                  <p className="font-body text-xs text-on-surface-variant mt-0.5">
                    Transporte, embalaje, observaciones y aprobación
                  </p>
                </div>
                <ChevronRight
                  size={16}
                  strokeWidth={1.5}
                  className={`text-on-surface-variant transition-transform duration-200 ${qualityOpen ? 'rotate-90' : ''}`}
                />
              </button>

              {qualityOpen && (
                <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
                  <div className="space-y-1">
                    <label htmlFor="acta-item-temperatura" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                      Temperatura de transporte
                    </label>
                    <input
                      id="acta-item-temperatura"
                      {...register('temperaturaTransporte')}
                      type="text"
                      placeholder="Ej: 2-8°C"
                      className="input-field"
                    />
                    {errors.temperaturaTransporte && (
                      <p className="font-body text-error text-xs">{errors.temperaturaTransporte.message}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                      Condición de embalaje
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {CONDICION_EMBALAJE_OPTIONS.map(({ value, label, color }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setValue('condicionEmbalaje', value, { shouldValidate: true })}
                          className={`px-3 py-1.5 rounded-lg font-body text-xs transition-colors border ${
                            condicionEmbalaje === value
                              ? 'border-primary-container/30 bg-primary-container/10 text-primary'
                              : 'border-white/10 bg-surface-container-high text-on-surface-variant hover:border-primary/30'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {errors.condicionEmbalaje && (
                      <p className="font-body text-error text-xs">{errors.condicionEmbalaje.message}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="acta-item-observaciones-calidad" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                      Observaciones
                    </label>
                    <textarea
                      id="acta-item-observaciones-calidad"
                      {...register('observacionesCalidad')}
                      rows={3}
                      placeholder="Notas de recepción, embalaje o desvíos detectados..."
                      className="input-field resize-none"
                    />
                    {errors.observacionesCalidad && (
                      <p className="font-body text-error text-xs">{errors.observacionesCalidad.message}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                      Estado de calidad
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setValue('aprobadoCalidad', true, { shouldValidate: true })}
                        className={`px-3 py-2 rounded-lg font-body text-sm transition-colors border ${
                          aprobadoCalidad
                            ? 'bg-primary-container/10 text-primary border-primary-container/30'
                            : 'border-white/10 text-on-surface-variant hover:border-primary/30'
                        }`}
                      >
                        Aprobado
                      </button>
                      <button
                        type="button"
                        onClick={() => setValue('aprobadoCalidad', false, { shouldValidate: true })}
                        className={`px-3 py-2 rounded-lg font-body text-sm transition-colors border ${
                          !aprobadoCalidad
                            ? 'bg-error-container/10 text-error border-error-container/30'
                            : 'border-white/10 text-on-surface-variant hover:border-primary/30'
                        }`}
                      >
                        No aprobado
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {serverError && (
              <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
            >
              <Plus size={16} strokeWidth={2} />
              {isSubmitting ? 'Agregando...' : 'Agregar item'}
            </button>
          </form>

          {/* Items agregados */}
          {items.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-white/5">
              <p className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                Items agregados ({items.length})
              </p>
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="bg-surface-container-high rounded-lg px-4 py-3 flex items-center justify-between gap-4 border border-white/5"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-sm text-on-surface truncate font-medium">
                        {item.productoNombre}
                      </p>
                      <p className="font-body text-xs text-on-surface-variant mt-0.5">
                        {CATEGORIAS.find((c) => c.value === item.categoria)?.label}
                        {item.mercado
                          ? ` · ${MERCADOS_CONFIG.find((m) => m.value === item.mercado)?.label ?? item.mercado}`
                          : ''}
                        {' · '}Lote: {item.lote}
                      </p>
                    </div>
                    <span className="font-body text-on-surface tabular-nums text-sm shrink-0 font-semibold">
                      {item.cantidadIngresada} uds
                    </span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={onNext}
                className="btn-primary mt-2"
              >
                Continuar a distribución
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ distribuida, ingresada }: { distribuida: number; ingresada: number }) {
  const pct = ingresada === 0 ? 0 : Math.round((distribuida / ingresada) * 100)
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-surface-variant rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-body text-xs text-on-surface-variant tabular-nums shrink-0 font-mono">
        {distribuida}/{ingresada}
      </span>
    </div>
  )
}

// ─── Step 3: distribuir (Revisión) ───────────────────────────────────────────

function Paso3({
  actaId,
  items,
  onItemDistribuido,
  onFinalizar,
}: {
  actaId: string
  items: ActaItem[]
  onItemDistribuido: (updated: ActaItem) => void
  onFinalizar: () => void
}) {
  const [distributingId, setDistributingId] = useState<string | null>(null)
  const [distributeValues, setDistributeValues] = useState<Record<string, string>>({})
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const distribuirItem = useDistribuirItem()

  function startDistribute(item: ActaItem) {
    const remaining = item.cantidadIngresada - item.cantidadDistribuida
    setDistributingId(item.id)
    setDistributeValues((prev) => ({ ...prev, [item.id]: String(remaining) }))
    setErrs((prev) => ({ ...prev, [item.id]: '' }))
  }

  async function confirmDistribute(item: ActaItem) {
    const raw = distributeValues[item.id] ?? ''
    const num = Number(raw)
    const remaining = item.cantidadIngresada - item.cantidadDistribuida

    if (!Number.isInteger(num) || num <= 0) {
      setErrs((prev) => ({ ...prev, [item.id]: 'Debe ser entero positivo' }))
      return
    }
    if (num > remaining) {
      setErrs((prev) => ({ ...prev, [item.id]: `Máximo disponible: ${remaining}` }))
      return
    }

    try {
      const res = await distribuirItem.mutateAsync({
        actaId,
        itemId: item.id,
        cantidad: num,
      })
      onItemDistribuido(res.item)
      toast.success(`Distribución registrada para "${item.productoNombre}".`)
      setDistributingId(null)
    } catch (err) {
      setErrs((prev) => ({
        ...prev,
        [item.id]: err instanceof ApiError ? err.message : 'Error al distribuir',
      }))
    }
  }

  const todosDistribuidos = items.every((i) => i.cantidadDistribuida >= i.cantidadIngresada)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-surface-container border border-primary-container/30 rounded-xl shadow-float overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary-container to-transparent opacity-50" />

        <div className="p-lg">
          <div className="mb-lg">
            <h2 className="font-heading text-lg font-semibold text-on-surface mb-1">Revisión y Distribución</h2>
            <p className="font-body text-sm text-on-surface-variant">
              Distribuí los items ingresados a los mercados correspondientes.
            </p>
          </div>

          <div className="space-y-3 max-w-lg">
            {items.map((item) => {
              const remaining = item.cantidadIngresada - item.cantidadDistribuida
              const isDistributing = distributingId === item.id

              return (
                <div key={item.id} className="bg-surface-container-high rounded-lg px-4 py-4 space-y-3 border border-white/5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-sm text-on-surface font-medium truncate">
                        {item.productoNombre}
                      </p>
                      <p className="font-body text-xs text-on-surface-variant mt-0.5">
                        {CATEGORIAS.find((c) => c.value === item.categoria)?.label} · Lote: {item.lote}
                      </p>
                    </div>
                    {remaining > 0 && !isDistributing && (
                      <button
                        type="button"
                        onClick={() => startDistribute(item)}
                        disabled={distributingId !== null}
                        className="shrink-0 px-3 py-1.5 rounded-lg font-body text-xs font-semibold bg-primary-container/20 text-primary hover:bg-primary-container/30 transition-colors disabled:opacity-40"
                      >
                        Distribuir
                      </button>
                    )}
                    {remaining === 0 && (
                      <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-container/10 border border-primary-container/20 text-primary text-xs font-semibold">
                        <Check size={12} />
                        Distribuido
                      </span>
                    )}
                  </div>

                  <ProgressBar distribuida={item.cantidadDistribuida} ingresada={item.cantidadIngresada} />

                  {isDistributing && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2">
                        <label htmlFor={`acta-nueva-distribuir-${item.id}`} className="sr-only">
                          Cantidad a distribuir para {item.productoNombre}
                        </label>
                        <input
                          id={`acta-nueva-distribuir-${item.id}`}
                          type="number"
                          min="1"
                          max={remaining}
                          value={distributeValues[item.id] ?? ''}
                          onChange={(e) =>
                            setDistributeValues((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') confirmDistribute(item)
                            if (e.key === 'Escape') setDistributingId(null)
                          }}
                          className="input-field w-28 py-1.5 text-sm"
                          autoFocus
                          disabled={distribuirItem.isPending}
                        />
                        <button
                          type="button"
                          onClick={() => confirmDistribute(item)}
                          disabled={distribuirItem.isPending}
                          className="px-3 py-1.5 rounded-lg bg-primary-container text-on-primary-container font-body text-xs font-semibold scale-hover transition-transform disabled:opacity-50"
                        >
                          {distribuirItem.isPending ? '...' : 'Confirmar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDistributingId(null)}
                          disabled={distribuirItem.isPending}
                          className="font-body text-xs text-on-surface-variant hover:text-on-surface transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                      {errs[item.id] && (
                        <p className="font-body text-error text-xs">{errs[item.id]}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            <button
              type="button"
              onClick={onFinalizar}
              className="btn-primary w-full mt-4"
            >
              {todosDistribuidos ? 'Ver acta completa' : 'Finalizar y ver acta'}
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ActaNuevaPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const pendingPrefill = (location.state as {
    productoNombre?: string
    productoId?: string
    categoria?: Categoria
    cantidadIngresada?: string
  } | null) ?? null

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [acta, setActa] = useState<Acta | null>(null)
  const [items, setItems] = useState<ActaItem[]>([])

  function handleActaCreada(a: Acta) {
    setActa(a)
    setStep(2)
  }

  function handleItemAdded(item: ActaItem) {
    setItems((prev) => [...prev, item])
  }

  function handleItemDistribuido(updated: ActaItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  function handleFinalizar() {
    toast.info('Acta finalizada. Abriendo el detalle.')
    navigate(`/actas/${acta!.id}`)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="bg-surface/80 backdrop-blur-md border-b border-white/10 px-margin-desktop py-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-md">
          <button
            onClick={() => navigate('/actas')}
            className="text-on-surface-variant hover:text-primary transition-colors flex items-center"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="font-heading text-lg font-semibold text-primary">Nueva Acta de Ingreso</h1>
        </div>
        <div className="flex items-center gap-md">
          {acta && (
            <span className="font-body text-xs text-on-surface-variant bg-surface-container px-3 py-1 rounded-full border border-white/5 font-mono">
              ID: {acta.id.slice(0, 8).toUpperCase()}
            </span>
          )}
        </div>
      </header>

      {/* Wizard Content */}
      <div className="flex-1 overflow-y-auto px-margin-desktop py-lg">
        <StepIndicator current={step} />

        {step === 1 && <Paso1 onCreated={handleActaCreada} onCancel={() => navigate('/actas')} />}
        {step === 2 && acta && (
          <Paso2
            actaId={acta.id}
            items={items}
            onItemAdded={handleItemAdded}
            onNext={() => setStep(3)}
            prefillItem={
              pendingPrefill?.categoria && pendingPrefill?.productoNombre && pendingPrefill?.cantidadIngresada
                ? {
                    categoria: pendingPrefill.categoria,
                    productoNombre: pendingPrefill.productoNombre,
                    productoId: pendingPrefill.productoId,
                    cantidadIngresada: pendingPrefill.cantidadIngresada,
                  }
                : null
            }
          />
        )}
        {step === 3 && acta && (
          <Paso3
            actaId={acta.id}
            items={items}
            onItemDistribuido={handleItemDistribuido}
            onFinalizar={handleFinalizar}
          />
        )}
      </div>

      {/* Ambient glow */}
      <div className="fixed bottom-0 right-0 w-96 h-96 bg-primary-container/5 rounded-full blur-[100px] pointer-events-none -z-10" />
    </div>
  )
}
