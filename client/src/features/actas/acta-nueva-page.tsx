import { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import Fuse from 'fuse.js'
import { ChevronRight, Plus, Check, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient, ApiError } from '@/lib/api-client'
import { toast } from '@/lib/toast'
import type { Acta, ActaItem, Categoria, CondicionEmbalaje, Mercado } from './types'

// ─── Tipos locales para autocompletes ────────────────────────────────────────

interface Estuche {
  id: string
  articulo: string
  mercado: Mercado
  cantidad: number
}

interface Etiqueta {
  id: string
  articulo: string
  mercado: Mercado
  cantidad: number
}

interface Frasco {
  id: string
  articulo: string
  unidadesPorCaja: number
  cantidadCajas: number
  total: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ['Datos del acta', 'Agregar items', 'Distribuir']

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => {
        const num = i + 1
        const done = num < current
        const active = num === current
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div
                className="flex items-center justify-center w-6 h-6 rounded font-heading font-semibold text-xs shrink-0"
                style={{
                  background: done
                    ? 'linear-gradient(180deg, #54e16d 0%, #00AE42 100%)'
                    : active
                    ? 'rgba(84,225,109,0.15)'
                    : 'transparent',
                  color: done ? '#003918' : active ? '#54e16d' : '#bccbb8',
                  border: !done && !active ? '1px solid rgba(61,74,60,0.4)' : 'none',
                }}
              >
                {done ? <Check size={12} strokeWidth={2.5} /> : num}
              </div>
              <span
                className="font-body text-xs hidden sm:block"
                style={{ color: active ? '#e2ece0' : '#bccbb8' }}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <ChevronRight size={14} strokeWidth={1.5} className="text-outline-variant shrink-0" />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Step 1: datos del acta ───────────────────────────────────────────────────

const paso1Schema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  notas: z.string().max(500).optional(),
})

type Paso1Data = z.infer<typeof paso1Schema>

function Paso1({
  onCreated,
}: {
  onCreated: (acta: Acta) => void
}) {
  const token = useAuthStore((s) => s.token)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Paso1Data>({
    resolver: zodResolver(paso1Schema),
    defaultValues: { fecha: todayISO(), notas: '' },
  })

  async function onSubmit(data: Paso1Data) {
    setServerError(null)
    try {
      const acta = await apiClient.post<Acta>(
        '/actas',
        { fecha: data.fecha, notas: data.notas || undefined },
        token
      )
      onCreated(acta)
      toast.info('Acta creada. Ya podés cargar los items.')
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al crear el acta')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, () => toast.error('Completá la fecha del acta antes de continuar.'))} noValidate className="space-y-5 max-w-md">
      <div className="space-y-1">
        <label htmlFor="acta-fecha" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
          Fecha
        </label>
        <input
          id="acta-fecha"
          {...register('fecha')}
          type="date"
          className="input-field"
          autoFocus
        />
        {errors.fecha && (
          <p className="font-body text-error text-xs">{errors.fecha.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="acta-notas" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
          Notas{' '}
          <span className="normal-case tracking-normal opacity-60">(opcional)</span>
        </label>
        <textarea
          id="acta-notas"
          {...register('notas')}
          rows={3}
          placeholder="Observaciones del acta..."
          className="input-field resize-none"
        />
        {errors.notas && (
          <p className="font-body text-error text-xs">{errors.notas.message}</p>
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
        className="btn-primary flex items-center justify-center gap-2 py-2.5 text-sm"
      >
        {isSubmitting ? 'Creando...' : 'Continuar'}
        {!isSubmitting && <ChevronRight size={14} strokeWidth={2} />}
      </button>
    </form>
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

// ─── Droga autocomplete ───────────────────────────────────────────────────────

const CONDICION_EMBALAJE_OPTIONS: {
  value: CondicionEmbalaje
  label: string
  color: string
}[] = [
  { value: 'bueno', label: 'Bueno', color: '#00AE42' },
  { value: 'regular', label: 'Regular', color: '#FF9800' },
  { value: 'malo', label: 'Malo', color: '#F44336' },
]

function DrogaAutocomplete({
  id,
  drogas,
  value,
  onChange,
}: {
  id: string
  drogas: string[]
  value: string
  onChange: (v: string) => void
}) {
  const [results, setResults] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const fuseRef = useRef<Fuse<string>>(new Fuse(drogas, { threshold: 0.45, keys: [] }))

  useEffect(() => {
    fuseRef.current = new Fuse(drogas, { threshold: 0.45, keys: [] })
  }, [drogas])

  function handleInput(q: string) {
    onChange(q)
    if (q.length < 1) {
      setResults([])
      setOpen(false)
      return
    }
    const res = fuseRef.current.search(q).map((r) => r.item).slice(0, 8)
    setResults(res)
    setOpen(res.length > 0)
  }

  function select(name: string) {
    onChange(name)
    setResults([])
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar droga del inventario..."
        className="input-field"
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 w-full mt-1 bg-surface-highest/90 backdrop-blur-[12px] rounded shadow-float overflow-hidden">
          {results.map((name) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); select(name) }}
              className="w-full text-left px-4 py-2.5 font-body text-sm text-on-surface hover:bg-surface-bright transition-colors"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Estuche autocomplete ─────────────────────────────────────────────────────

function EstucheAutocomplete({
  id,
  estuches,
  value,
  onChange,
  onMercadoDetected,
}: {
  id: string
  estuches: Estuche[]
  value: string
  onChange: (v: string) => void
  onMercadoDetected: (m: Mercado) => void
}) {
  const [results, setResults] = useState<Estuche[]>([])
  const [open, setOpen] = useState(false)
  // Unique article names for search
  const articulos = useMemo(
    () => [...new Set(estuches.map((e) => e.articulo))],
    [estuches]
  )
  const fuseRef = useRef<Fuse<string>>(new Fuse(articulos, { threshold: 0.45, keys: [] }))

  useEffect(() => {
    fuseRef.current = new Fuse(articulos, { threshold: 0.45, keys: [] })
  }, [articulos])

  function handleInput(q: string) {
    onChange(q)
    if (q.length < 1) { setResults([]); setOpen(false); return }
    const matched = fuseRef.current.search(q).map((r) => r.item).slice(0, 8)
    // deduplicate by articulo, keeping first entry per articulo
    const seen = new Set<string>()
    const deduped = estuches.filter((e) => {
      if (!matched.includes(e.articulo) || seen.has(e.articulo)) return false
      seen.add(e.articulo)
      return true
    })
    setResults(deduped)
    setOpen(deduped.length > 0)
  }

  function select(estuche: Estuche) {
    onChange(estuche.articulo)
    onMercadoDetected(estuche.mercado)
    setResults([])
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar estuche del inventario..."
        className="input-field"
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 w-full mt-1 bg-surface-highest/90 backdrop-blur-[12px] rounded shadow-float overflow-hidden">
          {results.map((e) => (
            <button
              key={e.id}
              type="button"
              onMouseDown={(ev) => { ev.preventDefault(); select(e) }}
              className="w-full text-left px-4 py-2.5 font-body text-sm text-on-surface hover:bg-surface-bright transition-colors"
            >
              {e.articulo}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Etiqueta autocomplete ────────────────────────────────────────────────────

function EtiquetaAutocomplete({
  id,
  etiquetas,
  value,
  onChange,
  onMercadoDetected,
}: {
  id: string
  etiquetas: Etiqueta[]
  value: string
  onChange: (v: string) => void
  onMercadoDetected: (m: Mercado) => void
}) {
  const [results, setResults] = useState<Etiqueta[]>([])
  const [open, setOpen] = useState(false)
  const articulos = useMemo(
    () => [...new Set(etiquetas.map((e) => e.articulo))],
    [etiquetas]
  )
  const fuseRef = useRef<Fuse<string>>(new Fuse(articulos, { threshold: 0.45, keys: [] }))

  useEffect(() => {
    fuseRef.current = new Fuse(articulos, { threshold: 0.45, keys: [] })
  }, [articulos])

  function handleInput(q: string) {
    onChange(q)
    if (q.length < 1) { setResults([]); setOpen(false); return }
    const matched = fuseRef.current.search(q).map((r) => r.item).slice(0, 8)
    const seen = new Set<string>()
    const deduped = etiquetas.filter((e) => {
      if (!matched.includes(e.articulo) || seen.has(e.articulo)) return false
      seen.add(e.articulo)
      return true
    })
    setResults(deduped)
    setOpen(deduped.length > 0)
  }

  function select(etiqueta: Etiqueta) {
    onChange(etiqueta.articulo)
    onMercadoDetected(etiqueta.mercado)
    setResults([])
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar etiqueta del inventario..."
        className="input-field"
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 w-full mt-1 bg-surface-highest/90 backdrop-blur-[12px] rounded shadow-float overflow-hidden">
          {results.map((e) => (
            <button
              key={e.id}
              type="button"
              onMouseDown={(ev) => { ev.preventDefault(); select(e) }}
              className="w-full text-left px-4 py-2.5 font-body text-sm text-on-surface hover:bg-surface-bright transition-colors"
            >
              {e.articulo}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Frasco autocomplete ──────────────────────────────────────────────────────

function FrascoAutocomplete({
  id,
  frascos,
  value,
  onChange,
  onFrascoSelected,
}: {
  id: string
  frascos: Frasco[]
  value: string
  onChange: (v: string) => void
  onFrascoSelected: (f: Frasco | null) => void
}) {
  const [results, setResults] = useState<Frasco[]>([])
  const [open, setOpen] = useState(false)
  const fuseRef = useRef<Fuse<Frasco>>(new Fuse(frascos, { keys: ['articulo'], threshold: 0.45 }))

  useEffect(() => {
    fuseRef.current = new Fuse(frascos, { keys: ['articulo'], threshold: 0.45 })
  }, [frascos])

  function handleInput(q: string) {
    onChange(q)
    onFrascoSelected(null)
    if (q.length < 1) { setResults([]); setOpen(false); return }
    const res = fuseRef.current.search(q).map((r) => r.item).slice(0, 8)
    setResults(res)
    setOpen(res.length > 0)
  }

  function select(frasco: Frasco) {
    onChange(frasco.articulo)
    onFrascoSelected(frasco)
    setResults([])
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar frasco del inventario..."
        className="input-field"
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 w-full mt-1 bg-surface-highest/90 backdrop-blur-[12px] rounded shadow-float overflow-hidden">
          {results.map((f) => (
            <button
              key={f.id}
              type="button"
              onMouseDown={(ev) => { ev.preventDefault(); select(f) }}
              className="w-full text-left px-4 py-2.5 font-body text-sm text-on-surface hover:bg-surface-bright transition-colors"
            >
              <span>{f.articulo}</span>
              <span className="ml-2 text-on-surface-variant text-xs">{f.unidadesPorCaja} uds/caja</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Step 2: agregar items ────────────────────────────────────────────────────

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: 'droga',    label: 'Droga' },
  { value: 'estuche',  label: 'Estuche' },
  { value: 'etiqueta', label: 'Etiqueta' },
  { value: 'frasco',   label: 'Frasco' },
]

const itemSchema = z
  .object({
    categoria: z.enum(['droga', 'estuche', 'etiqueta', 'frasco']),
    productoNombre: z.string().min(2, 'Mínimo 2 caracteres').max(100),
    lote: z.string().max(50, 'Máximo 50 caracteres').optional(),
    vencimiento: z.string().optional(),
    temperaturaTransporte: z.string().max(50, 'MÃ¡ximo 50 caracteres').optional(),
    condicionEmbalaje: z.enum(['bueno', 'regular', 'malo']).optional(),
    observacionesCalidad: z.string().max(1000, 'MÃ¡ximo 1000 caracteres').optional(),
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
  drogas,
  estuches,
  etiquetas,
  frascos,
  items,
  onItemAdded,
  onNext,
  prefillItem,
}: {
  actaId: string
  drogas: string[]
  estuches: Estuche[]
  etiquetas: Etiqueta[]
  frascos: Frasco[]
  items: ActaItem[]
  onItemAdded: (item: ActaItem) => void
  onNext: () => void
  prefillItem?: { categoria: Categoria; productoNombre: string; cantidadIngresada: string } | null
}) {
  const token = useAuthStore((s) => s.token)
  const [serverError, setServerError] = useState<string | null>(null)
  const [, setFrascoInfo] = useState<Frasco | null>(null)
  const [qualityOpen, setQualityOpen] = useState(false)
  const prefillAppliedRef = useRef(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      categoria: 'droga',
      productoNombre: '',
      lote: '',
      vencimiento: '',
      temperaturaTransporte: '',
      condicionEmbalaje: undefined,
      observacionesCalidad: '',
      aprobadoCalidad: false,
      cantidadIngresada: '',
      mercado: undefined,
    },
  })

  const categoria = useWatch({ control, name: 'categoria' })
  const productoNombre = useWatch({ control, name: 'productoNombre' })
  const mercado = useWatch({ control, name: 'mercado' })
  const cantidadVal = useWatch({ control, name: 'cantidadIngresada' })
  const condicionEmbalaje = useWatch({ control, name: 'condicionEmbalaje' })
  const aprobadoCalidad = useWatch({ control, name: 'aprobadoCalidad' })
  const displayedFrascoInfo =
    categoria === 'frasco' && productoNombre
      ? frascos.find((frasco) => frasco.articulo === productoNombre) ?? null
      : null

  useEffect(() => {
    if (!prefillItem || prefillAppliedRef.current) return

    reset({
      categoria: prefillItem.categoria,
      productoNombre: prefillItem.productoNombre,
      lote: '',
      vencimiento: '',
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
      const item = await apiClient.post<ActaItem>(
        `/actas/${actaId}/items`,
        {
          categoria: data.categoria,
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
        },
        token
      )
      onItemAdded(item)
      toast.info(`Item "${item.productoNombre}" agregado al acta.`)
      reset({
        categoria: data.categoria,
        productoNombre: '',
        lote: '',
        vencimiento: '',
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
    <div className="space-y-8 max-w-lg">
      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit, () => toast.error('Completá categoría, producto y cantidad antes de agregar el item.'))} noValidate className="space-y-4">
        {/* Categoría */}
        <div className="space-y-1">
          <label className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
            Categoría
          </label>
          <div className="flex gap-2 flex-wrap">
            {CATEGORIAS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setValue('categoria', value)
                  setValue('productoNombre', '')
                  setValue('mercado', undefined)
                  if (value !== 'frasco') {
                    setFrascoInfo(null)
                  }
                }}
                className="px-3 py-1.5 rounded font-body text-sm transition-colors"
                style={
                  categoria === value
                    ? { background: 'rgba(84,225,109,0.15)', color: '#54e16d' }
                    : { background: 'var(--color-surface-high)', color: '#bccbb8' }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Producto */}
        <div className="space-y-1">
          <label htmlFor="acta-item-producto" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
            Producto
          </label>
          {categoria === 'droga' ? (
            <DrogaAutocomplete
              id="acta-item-producto"
              drogas={drogas}
              value={productoNombre}
              onChange={(v) => setValue('productoNombre', v, { shouldValidate: true })}
            />
          ) : categoria === 'estuche' ? (
            <EstucheAutocomplete
              id="acta-item-producto"
              estuches={estuches}
              value={productoNombre}
              onChange={(v) => setValue('productoNombre', v, { shouldValidate: true })}
              onMercadoDetected={(m) => setValue('mercado', m, { shouldValidate: true })}
            />
          ) : categoria === 'etiqueta' ? (
            <EtiquetaAutocomplete
              id="acta-item-producto"
              etiquetas={etiquetas}
              value={productoNombre}
              onChange={(v) => setValue('productoNombre', v, { shouldValidate: true })}
              onMercadoDetected={(m) => setValue('mercado', m, { shouldValidate: true })}
            />
          ) : categoria === 'frasco' ? (
            <FrascoAutocomplete
              id="acta-item-producto"
              frascos={frascos}
              value={productoNombre}
              onChange={(v) => setValue('productoNombre', v, { shouldValidate: true })}
              onFrascoSelected={setFrascoInfo}
            />
          ) : (
            <input
              id="acta-item-producto"
              {...register('productoNombre')}
              type="text"
              placeholder="Nombre del producto"
              className="input-field"
            />
          )}
          {errors.productoNombre && (
            <p className="font-body text-error text-xs">{errors.productoNombre.message}</p>
          )}
        </div>

        {/* Info frasco — solo para frascos */}
        {categoria === 'frasco' && displayedFrascoInfo && (
          <div className="bg-surface-low rounded px-3 py-2 font-body text-xs text-on-surface-variant space-y-0.5">
            <p>{displayedFrascoInfo.unidadesPorCaja} uds/caja</p>
            {Number(cantidadVal) > 0 && (
              <p>
                Total:{' '}
                <span className="text-on-surface font-medium tabular-nums">
                  {(displayedFrascoInfo.unidadesPorCaja * Number(cantidadVal)).toLocaleString()} unidades
                </span>
              </p>
            )}
          </div>
        )}

        {/* Mercado — para estuches y etiquetas */}
        {(categoria === 'estuche' || categoria === 'etiqueta') && (
          <div className="space-y-1">
            <label className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Mercado
            </label>
            <div className="flex gap-2 flex-wrap">
              {MERCADOS_CONFIG.map(({ value, label, color }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValue('mercado', value, { shouldValidate: true })}
                  className="px-3 py-1.5 rounded font-body text-xs transition-colors"
                  style={
                    mercado === value
                      ? { background: `${color}26`, color, border: `1px solid ${color}40` }
                      : { background: 'var(--color-surface-high)', color: '#bccbb8', border: '1px solid transparent' }
                  }
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
              <label htmlFor="acta-item-lote" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
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
              <label className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                Lote
              </label>
              <div className="bg-surface-low rounded px-3 py-2.5 font-body text-xs text-on-surface-variant leading-relaxed">
                <span>Se asignará automáticamente</span>
                <br />
                <span className="font-mono" style={{ color: '#54e16d99' }}>
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
            <label htmlFor="acta-item-cantidad" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
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

        {/* Vencimiento — solo para drogas */}
        {categoria === 'droga' && (
          <div className="space-y-1">
            <label htmlFor="acta-item-vencimiento" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Vencimiento
            </label>
            <input
              id="acta-item-vencimiento"
              {...register('vencimiento')}
              type="date"
              className="input-field"
            />
            {errors.vencimiento && (
              <p className="font-body text-error text-xs">{errors.vencimiento.message}</p>
            )}
          </div>
        )}

        <div className="bg-surface-low rounded overflow-hidden">
          <button
            type="button"
            onClick={() => setQualityOpen((current) => !current)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-high"
          >
            <div>
              <p className="font-heading text-on-surface text-sm font-semibold">
                Control de Calidad
              </p>
              <p className="font-body text-on-surface-variant text-xs mt-0.5">
                Transporte, embalaje, observaciones y aprobación
              </p>
            </div>
            <ChevronRight
              size={16}
              strokeWidth={1.5}
              className={`text-on-surface-variant transition-transform ${qualityOpen ? 'rotate-90' : ''}`}
            />
          </button>

          {qualityOpen && (
            <div className="px-4 pb-4 space-y-4 bg-surface-high/40">
              <div className="space-y-1 pt-1">
                <label htmlFor="acta-item-temperatura" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
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
                <label className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                  Condición de embalaje
                </label>
                <div className="flex flex-wrap gap-2">
                  {CONDICION_EMBALAJE_OPTIONS.map(({ value, label, color }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setValue('condicionEmbalaje', value, { shouldValidate: true })}
                      className="px-3 py-1.5 rounded font-body text-xs transition-colors"
                      style={
                        condicionEmbalaje === value
                          ? { background: `${color}1A`, color, boxShadow: `inset 0 0 0 1px ${color}40` }
                          : { background: 'rgba(49,54,49,0.8)', color: '#bccbb8', boxShadow: 'inset 0 0 0 1px rgba(61,74,60,0.15)' }
                      }
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
                <label htmlFor="acta-item-observaciones-calidad" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
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
                <label className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                  Estado de calidad
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setValue('aprobadoCalidad', true, { shouldValidate: true })}
                    className="px-3 py-2 rounded font-body text-sm transition-colors"
                    style={
                      aprobadoCalidad
                        ? { background: 'rgba(0,174,66,0.10)', color: '#00AE42', boxShadow: 'inset 0 0 0 1px rgba(0,174,66,0.15)' }
                        : { background: 'rgba(49,54,49,0.8)', color: '#bccbb8', boxShadow: 'inset 0 0 0 1px rgba(61,74,60,0.15)' }
                    }
                  >
                    Aprobado
                  </button>
                  <button
                    type="button"
                    onClick={() => setValue('aprobadoCalidad', false, { shouldValidate: true })}
                    className="px-3 py-2 rounded font-body text-sm transition-colors"
                    style={
                      !aprobadoCalidad
                        ? { background: 'rgba(244,67,54,0.10)', color: '#f44336', boxShadow: 'inset 0 0 0 1px rgba(244,67,54,0.15)' }
                        : { background: 'rgba(49,54,49,0.8)', color: '#bccbb8', boxShadow: 'inset 0 0 0 1px rgba(61,74,60,0.15)' }
                    }
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
          className="btn-primary flex items-center justify-center gap-2 py-2.5 text-sm"
        >
          <Plus size={14} strokeWidth={2} />
          {isSubmitting ? 'Agregando...' : 'Agregar item'}
        </button>
      </form>

      {/* Items agregados */}
      {items.length > 0 && (
        <div className="space-y-3">
          <p className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
            Items agregados ({items.length})
          </p>
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-surface-low rounded px-4 py-3 flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-body text-on-surface text-sm truncate">
                    {item.productoNombre}
                  </p>
                  <p className="font-body text-on-surface-variant text-xs mt-0.5">
                    {CATEGORIAS.find((c) => c.value === item.categoria)?.label}
                    {item.mercado
                      ? ` · ${MERCADOS_CONFIG.find((m) => m.value === item.mercado)?.label ?? item.mercado}`
                      : ''}
                    {' · '}Lote: {item.lote}
                  </p>
                </div>
                <span className="font-body text-on-surface tabular-nums text-sm shrink-0">
                  {item.cantidadIngresada} uds
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onNext}
            className="btn-primary flex items-center justify-center gap-2 py-2.5 text-sm mt-2"
          >
            Continuar a distribución
            <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ distribuida, ingresada }: { distribuida: number; ingresada: number }) {
  const pct = ingresada === 0 ? 0 : Math.round((distribuida / ingresada) * 100)
  const color =
    pct === 100 ? '#00AE42' : pct > 0 ? '#2196F3' : '#FF9800'
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1 bg-surface-high rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-body text-xs text-on-surface-variant tabular-nums shrink-0">
        {distribuida}/{ingresada}
      </span>
    </div>
  )
}

// ─── Step 3: distribuir ───────────────────────────────────────────────────────

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
  const token = useAuthStore((s) => s.token)
  const [distributingId, setDistributingId] = useState<string | null>(null)
  const [distributeValues, setDistributeValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  function startDistribute(item: ActaItem) {
    const remaining = item.cantidadIngresada - item.cantidadDistribuida
    setDistributingId(item.id)
    setDistributeValues((prev) => ({ ...prev, [item.id]: String(remaining) }))
    setErrors((prev) => ({ ...prev, [item.id]: '' }))
  }

  async function confirmDistribute(item: ActaItem) {
    const raw = distributeValues[item.id] ?? ''
    const num = Number(raw)
    const remaining = item.cantidadIngresada - item.cantidadDistribuida

    if (!Number.isInteger(num) || num <= 0) {
      setErrors((prev) => ({ ...prev, [item.id]: 'Debe ser entero positivo' }))
      return
    }
    if (num > remaining) {
      setErrors((prev) => ({ ...prev, [item.id]: `Máximo disponible: ${remaining}` }))
      return
    }

    setSaving(true)
    try {
      const res = await apiClient.post<{ item: ActaItem }>(
        `/actas/${actaId}/items/${item.id}/distribuir`,
        { cantidad: num },
        token
      )
      onItemDistribuido(res.item)
      toast.success(`Distribución registrada para "${item.productoNombre}".`)
      setDistributingId(null)
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [item.id]: err instanceof ApiError ? err.message : 'Error al distribuir',
      }))
    } finally {
      setSaving(false)
    }
  }

  const todosDistribuidos = items.every(
    (i) => i.cantidadDistribuida >= i.cantidadIngresada
  )

  return (
    <div className="space-y-6 max-w-lg">
      <div className="space-y-2">
        {items.map((item) => {
          const remaining = item.cantidadIngresada - item.cantidadDistribuida
          const isDistributing = distributingId === item.id

          return (
            <div key={item.id} className="bg-surface-low rounded px-4 py-4 space-y-3">
              {/* Header del item */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-body text-on-surface text-sm truncate">
                    {item.productoNombre}
                  </p>
                  <p className="font-body text-on-surface-variant text-xs mt-0.5">
                    {CATEGORIAS.find((c) => c.value === item.categoria)?.label} · Lote: {item.lote}
                  </p>
                </div>
                {remaining > 0 && !isDistributing && (
                  <button
                    type="button"
                    onClick={() => startDistribute(item)}
                    disabled={distributingId !== null}
                    className="shrink-0 px-3 py-1 rounded font-heading font-semibold text-xs transition-colors disabled:opacity-40"
                    style={{ background: 'rgba(84,225,109,0.15)', color: '#54e16d' }}
                  >
                    Distribuir
                  </button>
                )}
                {remaining === 0 && (
                  <span
                    className="shrink-0 inline-block font-body text-xs font-medium px-2 py-0.5 rounded"
                    style={{ color: '#00AE42', backgroundColor: 'rgba(0, 174, 66, 0.10)' }}
                  >
                    Distribuido
                  </span>
                )}
              </div>

              {/* Progreso */}
              <ProgressBar
                distribuida={item.cantidadDistribuida}
                ingresada={item.cantidadIngresada}
              />

              {/* Inline distribute form */}
              {isDistributing && (
                <div className="space-y-2">
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
                      disabled={saving}
                    />
                    <button
                      type="button"
                      onClick={() => confirmDistribute(item)}
                      disabled={saving}
                      className="px-3 py-1.5 rounded font-heading font-semibold text-xs transition-opacity disabled:opacity-50"
                      style={{ background: 'linear-gradient(180deg, #54e16d 0%, #00AE42 100%)', color: '#003918' }}
                    >
                      {saving ? '...' : 'Confirmar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDistributingId(null)}
                      disabled={saving}
                      className="font-body text-on-surface-variant text-xs hover:text-on-surface transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                  {errors[item.id] && (
                    <p className="font-body text-error text-xs">{errors[item.id]}</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onFinalizar}
        className="btn-primary flex items-center justify-center gap-2 py-2.5 text-sm"
      >
        {todosDistribuidos ? 'Ver acta completa' : 'Finalizar y ver acta'}
        <ChevronRight size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function ActaNuevaPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const pendingPrefill = (location.state as {
    productoNombre?: string
    categoria?: Categoria
    cantidadIngresada?: string
  } | null) ?? null

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [acta, setActa] = useState<Acta | null>(null)
  const [items, setItems] = useState<ActaItem[]>([])
  const [drogas, setDrogas] = useState<string[]>([])
  const [estuches, setEstuches] = useState<Estuche[]>([])
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([])
  const [frascos, setFrascos] = useState<Frasco[]>([])

  useEffect(() => {
    apiClient
      .get<{ id: string; nombre: string }[]>('/drogas', token)
      .then((list) => setDrogas([...new Set(list.map((d) => d.nombre))]))
      .catch(() => {})
    apiClient.get<Estuche[]>('/estuches', token).then(setEstuches).catch(() => {})
    apiClient.get<Etiqueta[]>('/etiquetas', token).then(setEtiquetas).catch(() => {})
    apiClient.get<Frasco[]>('/frascos', token).then(setFrascos).catch(() => {})
  }, [token])

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
    <div>
      {/* Back */}
      <button
        onClick={() => navigate('/actas')}
        className="flex items-center gap-2 font-body text-on-surface-variant text-sm hover:text-on-surface transition-colors mb-6"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Volver a actas
      </button>

      <h1 className="font-heading text-on-surface font-semibold text-xl mb-6">
        Nueva Acta
      </h1>

      <StepIndicator current={step} />

      {step === 1 && <Paso1 onCreated={handleActaCreada} />}
      {step === 2 && acta && (
        <Paso2
          actaId={acta.id}
          drogas={drogas}
          estuches={estuches}
          etiquetas={etiquetas}
          frascos={frascos}
          items={items}
          onItemAdded={handleItemAdded}
          onNext={() => setStep(3)}
          prefillItem={
            pendingPrefill?.categoria && pendingPrefill?.productoNombre && pendingPrefill?.cantidadIngresada
              ? {
                  categoria: pendingPrefill.categoria,
                  productoNombre: pendingPrefill.productoNombre,
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
  )
}

