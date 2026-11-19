import type { ActaListItem } from '../lib/actas-types'
import { useState, useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { formatUnit, formatCantidad } from '../lib/format-units'
import { useNavigate } from 'react-router-dom'
import { useForm, useWatch, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Package, Hash, FileText, ArrowLeft, Building2, Printer } from 'lucide-react'
import { ApiError } from '../lib/api'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { ProductoSelector } from '../components/ProductoSelector'
import type { CategoriaProducto, Producto as ProductoCatalogo } from '../components/ProductoSelector'
import { type Mercado, MERCADOS } from '../components/inventory-shared/mercados'
import { DatePickerInput } from '../components/ui/DatePickerInput'
import { validateExpirySelection } from '../lib/expiry-month'
import { maskExpiryMonth } from '@/lib/expiry-month'
import { useFrascos } from '../queries/use-frascos'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/Dialog'

const ingresoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  productoId: z.string().uuid('Seleccioná un producto del catálogo'),
  productoNombre: z.string().min(1),
  categoria: z.enum(['droga', 'estuche', 'etiqueta', 'frasco', 'material_empaque']),
  lote: z.string().max(50).optional(),
  vencimientoMes: z.string().optional(),
  vencimientoAnio: z.string().optional(),
  mercado: z.enum(['argentina', 'colombia', 'mexico', 'ecuador', 'bolivia', 'paraguay', 'VENEZUELA', 'no_exportable']).optional(),
  cantidad: z.string().optional(),
  cantidadCajas: z.string().optional(),
  unidadesPorCaja: z.string().optional(),
  observaciones: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  const positiveInteger = (candidate: string | undefined) => Number.isInteger(Number(candidate)) && Number(candidate) > 0
  const positiveDecimalMax3 = (candidate: string | undefined) => {
    if (candidate === undefined || candidate === '') return false
    const normalized = normalizeKgInput(candidate)
    return /^\d+(?:\.\d{1,3})?$/.test(normalized) && Number(normalized) > 0
  }

  if (value.categoria === 'frasco') {
    if (!positiveInteger(value.cantidadCajas)) ctx.addIssue({ code: 'custom', path: ['cantidadCajas'], message: 'Las cajas son obligatorias' })
    if (!positiveInteger(value.unidadesPorCaja)) ctx.addIssue({ code: 'custom', path: ['unidadesPorCaja'], message: 'Unidades por caja son requeridas (configurá el frasco primero)' })
    return
  }
  
  if (value.categoria === 'droga') {
    if (!positiveDecimalMax3(value.cantidad)) ctx.addIssue({ code: 'custom', path: ['cantidad'], message: 'La cantidad es obligatoria, debe ser mayor a 0 y tener como máximo 3 decimales' })
    if (!value.lote?.trim()) ctx.addIssue({ code: 'custom', path: ['lote'], message: 'El lote es obligatorio para MP' })
    const expiryError = validateExpirySelection(value.vencimientoMes, value.vencimientoAnio)
    if (expiryError) ctx.addIssue({ code: 'custom', path: ['vencimientoMes'], message: expiryError })
  } else {
    if (!positiveInteger(value.cantidad)) ctx.addIssue({ code: 'custom', path: ['cantidad'], message: 'La cantidad es obligatoria y debe ser un número entero' })
  }

  if (value.categoria === 'material_empaque' && materialEmpaqueRequiereLote(value.productoNombre) && !value.lote?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['lote'], message: 'El lote es obligatorio para Tapas y Prospectos' })
  }

  if ((value.categoria === 'etiqueta' || value.categoria === 'estuche') && !value.mercado) {
    ctx.addIssue({ code: 'custom', path: ['mercado'], message: 'El mercado es obligatorio' })
  }
})

type IngresoFormData = z.infer<typeof ingresoSchema>

function normalizeKgInput(value: string | undefined): string {
  const normalized = (value ?? '').trim().replace(',', '.')
  return normalized.startsWith('.') ? `0${normalized}` : normalized
}

function parseKg(value: string | undefined): number {
  return Number(normalizeKgInput(value))
}

function newIngressKey(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

type TipoIngreso = 'MP' | 'ME'

type EtiquetaCuarentena = {
  itemId: string
  producto: string
  lote: string
  fecha: string
}

type LoteDrogaExistente = {
  id: string
  lote: string
  vencimientoMes: string | null
}

type DrugIngressLine = {
  productoId: string
  productoNombre: string
  lote: string
  vencimientoMes: string
  cantidad: number
}

export function EtiquetaCuarentenaDialog({ etiqueta, printing, error, onPrint, onSkip }: {
  etiqueta: EtiquetaCuarentena
  printing: boolean
  error: string | null
  onPrint: (copias: number) => void
  onSkip: () => void
}) {
  const [copies, setCopies] = useState(1)
  const copiesRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !printing) onSkip() }} initialFocusRef={copiesRef}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Imprimir etiqueta de ingreso?</DialogTitle>
          <DialogDescription>El ingreso ya quedó registrado. Elegí si querés imprimir ahora y cuántas copias enviar a la Brother QL-800.</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-white/10 bg-surface-container p-4 space-y-2 text-sm">
          <p><span className="text-on-surface-variant">Producto:</span> <strong>{etiqueta.producto}</strong></p>
          <p><span className="text-on-surface-variant">Lote:</span> <strong>{etiqueta.lote}</strong></p>
          <p><span className="text-on-surface-variant">Fecha de ingreso:</span> <strong>{etiqueta.fecha.split('-').reverse().join('/')}</strong></p>
        </div>
        <label className="mt-5 block font-body text-sm text-on-surface">
          Copias
          <input
            ref={copiesRef}
            aria-label="Copias de etiqueta"
            type="number"
            min={1}
            max={100}
            value={copies}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setCopies(Math.min(100, Math.max(1, Number(event.target.value) || 1)))}
            className="input-field mt-2"
            disabled={printing}
          />
        </label>
        {error && <p role="alert" className="mt-3 rounded border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onSkip} disabled={printing} tabIndex={-1} className="flex-1 rounded bg-surface-container-high py-3 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-bright disabled:opacity-50">Ahora no</button>
          <button type="button" onClick={() => onPrint(copies)} disabled={printing} className="btn-primary flex-1 min-h-11 py-3 text-sm disabled:opacity-50">
            <Printer size={16} className="mr-2 inline" />{printing ? 'Enviando...' : 'Imprimir'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const CATEGORIAS_ME: { label: string; value: CategoriaProducto }[] = [
  { label: 'Estuche', value: 'estuche' },
  { label: 'Frasco', value: 'frasco' },
  { label: 'Etiqueta', value: 'etiqueta' },
  { label: 'Material auxiliar', value: 'material_empaque' },
]

const MERCADO_SIGLAS: Record<Mercado, string> = {
  argentina: 'AR',
  colombia: 'CO',
  mexico: 'MX',
  ecuador: 'EC',
  bolivia: 'BO',
  paraguay: 'PY',
  VENEZUELA: 'VE',
  no_exportable: 'NE',
}

function materialEmpaqueRequiereLote(nombre: string): boolean {
  return /^(TAPA|PROSPECTO)\b/i.test(nombre.trim())
}

export default function ActaNuevaPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const recent = useQuery({
    queryKey: ['deposito', 'actas', 'list', undefined],
    queryFn: () => api.get<ActaListItem[]>('/actas'),
    refetchOnMount: 'always',
    select: actas => actas.find(acta => acta.items?.length),
  })
  const lastActa = recent.data
  const lastItem = lastActa?.items?.[0]
  const automaticLoteRef = useRef('')
  const manualLoteRef = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const firstMercadoRef = useRef<HTMLButtonElement>(null)
  const shouldFocusMercadoRef = useRef(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submitInFlight = useRef(false)
  const lastDrugSubmissionRef = useRef<{ fingerprint: string; key: string } | null>(null)
  const [tipoIngreso, setTipoIngreso] = useState<TipoIngreso>('MP')
  const [mercadoCat, setMercadoCat] = useState<CategoriaProducto>('estuche')
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoCatalogo | null>(null)
  const [isExpiryBlockTouched, setIsExpiryBlockTouched] = useState(false)
  const [etiquetaCuarentena, setEtiquetaCuarentena] = useState<EtiquetaCuarentena | null>(null)
  const [printingLabel, setPrintingLabel] = useState(false)
  const [labelError, setLabelError] = useState<string | null>(null)
  const [pendingLabels, setPendingLabels] = useState<EtiquetaCuarentena[]>([])
  const [drugLines, setDrugLines] = useState<DrugIngressLine[]>([])
  const [productSelectorVersion, setProductSelectorVersion] = useState(0)

  const resolvedCategoria: CategoriaProducto = tipoIngreso === 'MP' ? 'droga' : mercadoCat
  const esME = tipoIngreso === 'ME'
  const frascosQuery = useFrascos()

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    control,
    formState: { errors, isValid, isDirty, isSubmitted },
    clearErrors,
    setError,
    trigger
  } = useForm<IngresoFormData>({
    resolver: zodResolver(ingresoSchema),
    mode: 'onBlur',
    defaultValues: {
      fecha: todayISO(),
      productoId: '',
      productoNombre: '',
      categoria: resolvedCategoria,
      lote: '',
      vencimientoMes: '',
      vencimientoAnio: '',
      mercado: undefined,
      cantidad: '',
      cantidadCajas: '',
      unidadesPorCaja: '',
      observaciones: '',
    },
  })

  const categoria = useWatch({ control, name: 'categoria' })
  const productoId = useWatch({ control, name: 'productoId' })
  const productoNombre = useWatch({ control, name: 'productoNombre' })
  const loteIngresado = useWatch({ control, name: 'lote' })
  const loteNormalizado = loteIngresado?.trim().replace(/\s+/g, ' ').toUpperCase() ?? ''
  const mercadoSeleccionado = useWatch({ control, name: 'mercado' }) as Mercado | undefined
  const cantidadCajas = Number(useWatch({ control, name: 'cantidadCajas' })) || 0
  const unidadesPorCaja = Number(useWatch({ control, name: 'unidadesPorCaja' })) || 0
  const cantidadRaw = useWatch({ control, name: 'cantidad' })
  const cantidadManual = (categoria === 'droga' ? parseKg(cantidadRaw) : Number(cantidadRaw)) || 0
  const requiereLoteMaterial = resolvedCategoria === 'material_empaque' && materialEmpaqueRequiereLote(productoNombre)
  const usaLoteDeReferencia = esME && (resolvedCategoria !== 'material_empaque' || requiereLoteMaterial)
  const nextLoteQuery = useQuery({
    queryKey: ['deposito', 'lotes', 'siguiente'],
    queryFn: () => api.get<{ lote: string }>('/lotes/siguiente'),
    enabled: usaLoteDeReferencia,
    staleTime: 0,
    refetchOnMount: 'always',
  })
  const existingLotQuery = useQuery({
    queryKey: ['deposito', 'ingresos', 'lote-existente', productoId, loteNormalizado],
    queryFn: () => api.get<LoteDrogaExistente | null>(
      `/ingresos/lote-existente?productoId=${encodeURIComponent(productoId)}&lote=${encodeURIComponent(loteNormalizado)}`,
    ),
    enabled: categoria === 'droga' && Boolean(productoId && loteNormalizado),
    staleTime: 30_000,
  })
  const existingLot = existingLotQuery.data?.id && existingLotQuery.data.lote === loteNormalizado
    ? existingLotQuery.data
    : null
  
  const currentMonth = new Date().getUTCMonth() + 1
  const vencMes = useWatch({ control, name: 'vencimientoMes' })
  const vencAnio = Number(useWatch({ control, name: 'vencimientoAnio' }))

  const showExpiryError = isSubmitted || isExpiryBlockTouched || (Boolean(vencMes) && Boolean(vencAnio))

  useEffect(() => {
    if (!existingLot?.vencimientoMes) return
    const [year, month] = existingLot.vencimientoMes.split('-')
    if (!year || !month) return
    setValue('vencimientoAnio', year, { shouldDirty: true, shouldValidate: true })
    setValue('vencimientoMes', month, { shouldDirty: true, shouldValidate: true })
    clearErrors('vencimientoMes')
  }, [existingLot?.id, existingLot?.vencimientoMes, setValue, clearErrors])

  // Keep hidden categoria in sync
  useEffect(() => {
    setValue('categoria', resolvedCategoria, { shouldValidate: true })
    clearErrors()
  }, [resolvedCategoria, setValue, clearErrors])

  useEffect(() => {
    setProductoSeleccionado(null)
    setDrugLines([])
    setValue('productoId', '', { shouldValidate: false })
    setValue('productoNombre', '', { shouldValidate: false })
    setValue('mercado', undefined, { shouldValidate: false })
    setValue('cantidad', '', { shouldValidate: false })
    setValue('cantidadCajas', '', { shouldValidate: false })
    setValue('unidadesPorCaja', '', { shouldValidate: false })
    setValue('lote', '', { shouldValidate: false })
    automaticLoteRef.current = ''
    manualLoteRef.current = false
  }, [resolvedCategoria, setValue])

  async function addDrugLine() {
    const valid = await trigger(['productoId', 'productoNombre', 'lote', 'vencimientoMes', 'vencimientoAnio', 'cantidad'])
    if (!valid) return
    const current = getValues()
    const line: DrugIngressLine = {
      productoId: current.productoId,
      productoNombre: current.productoNombre,
      lote: current.lote!.trim().replace(/\s+/g, ' ').toUpperCase(),
      vencimientoMes: `${current.vencimientoAnio}-${current.vencimientoMes}`,
      cantidad: parseKg(current.cantidad),
    }
    setDrugLines((lines) => [...lines, line])
    setProductoSeleccionado(null)
    setValue('productoId', '', { shouldDirty: true, shouldValidate: false })
    setValue('productoNombre', '', { shouldDirty: true, shouldValidate: false })
    setValue('lote', '', { shouldDirty: true, shouldValidate: false })
    setValue('vencimientoMes', '', { shouldDirty: true, shouldValidate: false })
    setValue('vencimientoAnio', '', { shouldDirty: true, shouldValidate: false })
    setValue('cantidad', '', { shouldDirty: true, shouldValidate: false })
    clearErrors()
    setIsExpiryBlockTouched(false)
    setProductSelectorVersion((version) => version + 1)
  }

  useEffect(() => {
    if (!shouldFocusMercadoRef.current || (categoria !== 'etiqueta' && categoria !== 'estuche')) return

    const frame = window.requestAnimationFrame(() => {
      firstMercadoRef.current?.focus()
      shouldFocusMercadoRef.current = false
    })
    return () => window.cancelAnimationFrame(frame)
  }, [categoria])

  useEffect(() => {
    const suggestedLote = nextLoteQuery.data?.lote
    const current = getValues('lote') ?? ''
    if (usaLoteDeReferencia && !nextLoteQuery.isFetching && !nextLoteQuery.isError && !manualLoteRef.current && suggestedLote && (!current || current === automaticLoteRef.current)) {
      setValue('lote', suggestedLote, { shouldDirty: false, shouldValidate: true })
      automaticLoteRef.current = suggestedLote
    }
  }, [getValues, nextLoteQuery.data?.lote, nextLoteQuery.isFetching, nextLoteQuery.isError, resolvedCategoria, setValue, usaLoteDeReferencia])

  useEffect(() => {
    if (categoria === 'frasco' && productoId) {
      const frasco = frascosQuery.data?.find(f => f.productoId === productoId)
      if (frasco) {
        setValue('unidadesPorCaja', String(frasco.unidadesPorCaja), { shouldValidate: true })
      } else {
        setValue('unidadesPorCaja', '', { shouldValidate: true })
      }
    }
  }, [categoria, productoId, frascosQuery.data, setValue])

  useEffect(() => {
    function volverConEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || etiquetaCuarentena || submitting) return
      if (event.target instanceof HTMLSelectElement) return
      navigate('/deposito/actas')
    }

    window.addEventListener('keydown', volverConEscape)
    return () => window.removeEventListener('keydown', volverConEscape)
  }, [etiquetaCuarentena, navigate, submitting])

  async function onSubmit(data: IngresoFormData) {
    if (data.categoria === 'droga' && existingLot?.vencimientoMes &&
        `${data.vencimientoAnio}-${data.vencimientoMes}` !== existingLot.vencimientoMes) {
      const [year, month] = existingLot.vencimientoMes.split('-')
      setError('vencimientoMes', { type: 'validate', message: `El lote existente vence en ${month}/${year}` })
      return
    }
    if (submitInFlight.current) return
    submitInFlight.current = true
    setServerError(null)
    setSubmitting(true)
    try {
      const drugPayload = data.categoria === 'droga' ? {
        fecha: data.fecha,
        observaciones: data.observaciones?.trim() || undefined,
        items: [...drugLines, {
          productoId: data.productoId,
          lote: data.lote!.trim().replace(/\s+/g, ' ').toUpperCase(),
          vencimientoMes: `${data.vencimientoAnio}-${data.vencimientoMes}`,
          cantidad: parseKg(data.cantidad),
        }].map(({ productoId: id, lote, vencimientoMes, cantidad }) => ({ productoId: id, lote, vencimientoMes, cantidad })),
      } : null
      const fingerprint = drugPayload ? JSON.stringify(drugPayload) : ''
      if (drugPayload && lastDrugSubmissionRef.current?.fingerprint !== fingerprint) {
        lastDrugSubmissionRef.current = { fingerprint, key: newIngressKey() }
      }
      const acta = data.categoria === 'droga'
        ? await api.post<{ id: string; etiquetasCuarentena?: EtiquetaCuarentena[] }>(
          '/ingresos/drogas', drugPayload, undefined,
          { headers: { 'Idempotency-Key': lastDrugSubmissionRef.current!.key } },
        )
        : await api.post<{ id: string; etiquetaCuarentena?: EtiquetaCuarentena | null }>('/ingresos', {
        fecha: data.fecha,
        productoId: data.productoId,
        lote: data.lote?.trim() || undefined,
        mercado: data.categoria === 'etiqueta' || data.categoria === 'estuche' ? data.mercado : undefined,
        cantidad: data.categoria === 'frasco' ? undefined : Number(data.cantidad),
        cantidadCajas: data.categoria === 'frasco' ? Number(data.cantidadCajas) : undefined,
        unidadesPorCaja: data.categoria === 'frasco' ? Number(data.unidadesPorCaja) : undefined,
        observaciones: data.observaciones?.trim() || undefined,
      })
      void queryClient.invalidateQueries({ queryKey: ['deposito', 'actas'] })
      void queryClient.invalidateQueries({ queryKey: ['deposito', 'lotes', 'siguiente'] })
      toast.success('Ingreso registrado correctamente')
      submitInFlight.current = false
      setSubmitting(false)
      const labels = 'etiquetasCuarentena' in acta
        ? acta.etiquetasCuarentena ?? []
        : 'etiquetaCuarentena' in acta && acta.etiquetaCuarentena ? [acta.etiquetaCuarentena] : []
      if (labels.length > 0) {
        setEtiquetaCuarentena(labels[0]!)
        setPendingLabels(labels.slice(1))
        return
      }
      navigate('/deposito/dashboard')
    } catch (err) {
      submitInFlight.current = false
      setSubmitting(false)
      if (err instanceof ApiError) {
        if (err.details) {
          console.error('Mapped backend errors:', err.details)
          Object.entries(err.details).forEach(([field, messages]) => {
            setError(field as keyof IngresoFormData, { type: 'server', message: messages[0] })
          })
          setServerError('Verificá los errores en el formulario')
        } else {
          setServerError(err.message)
        }
      } else {
        setServerError('Error inesperado de red')
      }
    }
  }

  async function handlePrintCuarentena(copias: number) {
    if (!etiquetaCuarentena || printingLabel) return
    setPrintingLabel(true)
    setLabelError(null)
    try {
      const result = await api.post<{ message: string }>('/labels/cuarentena', { itemId: etiquetaCuarentena.itemId, copias })
      toast.success(result.message)
      advanceLabel()
    } catch (error) {
      setLabelError(error instanceof ApiError ? error.message : 'No se pudo comunicar con la impresora.')
    } finally {
      setPrintingLabel(false)
    }
  }

  function advanceLabel() {
    const [next, ...rest] = pendingLabels
    if (next) {
      setEtiquetaCuarentena(next)
      setPendingLabels(rest)
      setLabelError(null)
    } else {
      navigate('/deposito/dashboard')
    }
  }

  const currentDrugLineComplete = Boolean(productoId && productoNombre && loteNormalizado && cantidadManual > 0) &&
    !validateExpirySelection(vencMes, vencAnio ? String(vencAnio) : '')
  const isFormValid = isValid && isDirty && (categoria !== 'droga' || currentDrugLineComplete)

  function handleFormTab(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return
    const target = event.target
    if (event.key === 'Escape' && target instanceof HTMLInputElement && target.getAttribute('aria-expanded') === 'true') {
      event.preventDefault()
      return
    }
    if (target instanceof HTMLButtonElement && ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      const group = target.closest('[data-choice]')
      if (group) {
        const buttons = Array.from(group.querySelectorAll('button'))
        const step = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1
        buttons[(buttons.indexOf(target) + step + buttons.length) % buttons.length]?.focus()
        event.preventDefault()
      }
      return
    }
    if (event.key === 'Enter' && target instanceof HTMLInputElement) {
      event.preventDefault()
      if (target.getAttribute('role') === 'combobox') return
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled), summary, button:not(:disabled), textarea'))
        .filter(el => el.tabIndex >= 0 && (!el.closest('details:not([open])') || el.tagName === 'SUMMARY'))
      controls[controls.indexOf(target) + 1]?.focus()
      return
    }
    if (event.key !== 'Tab') return

    const focusables = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hasAttribute('hidden') && element.tabIndex >= 0)
    if (focusables.length === 0) return

    const currentIndex = focusables.indexOf(document.activeElement as HTMLElement)
    const next = event.shiftKey ? currentIndex <= 0 : currentIndex === -1 || currentIndex === focusables.length - 1
    if (!next) return

    event.preventDefault()
    focusables[event.shiftKey ? focusables.length - 1 : 0]?.focus()
  }

  return (
    <div className="min-h-screen bg-surface font-sans text-on-surface pb-[calc(env(safe-area-inset-bottom)+5.5rem)] md:pb-24 relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 relative z-10">
        <div className="relative bg-surface-high rounded-xl border border-white/5 shadow-float overflow-hidden">
          <button
            type="button"
            onClick={() => navigate('/deposito/actas')}
            aria-label="Volver a actas"
            title="Volver a actas (Esc)"
            className="btn-press absolute left-2 top-2 z-10 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={20} className="text-on-surface-variant" />
          </button>
          <div className="p-4 pt-14 sm:p-5 sm:pt-5 lg:p-6">
              <form ref={formRef} onSubmit={handleSubmit(onSubmit)} onKeyDown={handleFormTab} className="space-y-4 sm:pl-10" noValidate>
                
                <div className="space-y-4">
                <div className="space-y-4">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3"><h1 className="text-lg font-semibold">Registrar ingreso</h1><div className="w-full space-y-1 sm:w-auto">
                  <label htmlFor="fecha-ingreso" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                    Fecha del acta
                  </label>
                  <Controller
                    name="fecha"
                    control={control}
                    render={({ field }) => (
                      <DatePickerInput id="fecha-ingreso"
                        value={field.value}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  {errors.fecha && <p className="font-body text-error text-xs">{errors.fecha.message}</p>}
                </div></header>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">Clasificación</label>
                    <div role="group" aria-label="Clasificación" data-choice="" className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        autoFocus
                        onClick={() => setTipoIngreso('MP')}
                        aria-pressed={tipoIngreso === 'MP'} tabIndex={tipoIngreso === 'MP' ? 0 : -1}
                        className={`btn-press py-3 px-4 rounded-lg font-body text-sm transition-all border ${
                          tipoIngreso === 'MP'
                            ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                            : 'bg-surface-container border-white/5 text-on-surface-variant hover:bg-surface-bright'
                        }`}
                      >
                        Materia Prima
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          shouldFocusMercadoRef.current = event.detail !== 0
                          setTipoIngreso('ME')
                        }}
                        aria-pressed={tipoIngreso === 'ME'} tabIndex={tipoIngreso === 'ME' ? 0 : -1}
                        className={`btn-press py-3 px-4 rounded-lg font-body text-sm transition-all border ${
                          tipoIngreso === 'ME'
                            ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                            : 'bg-surface-container border-white/5 text-on-surface-variant hover:bg-surface-bright'
                        }`}
                      >
                        Material de Empaque
                      </button>
                    </div>
                  </div>

                  {esME && (
                    <div role="group" aria-label="Tipo de empaque" data-choice="" className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
                      {CATEGORIAS_ME.map((cat) => (
                        <button
                          key={cat.value} aria-pressed={mercadoCat === cat.value} tabIndex={mercadoCat === cat.value ? 0 : -1}
                          type="button"
                          onClick={() => {
                            shouldFocusMercadoRef.current = cat.value === 'estuche' || cat.value === 'etiqueta'
                            setMercadoCat(cat.value)
                          }}
                          className={`btn-press py-2 px-3 rounded-lg font-body text-sm transition-all border ${
                            mercadoCat === cat.value
                              ? 'bg-secondary/10 border-secondary/30 text-secondary font-medium'
                              : 'bg-surface-container border-white/5 text-on-surface-variant hover:bg-surface-bright'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  )}
                {(categoria === 'etiqueta' || categoria === 'estuche') && (
                  <div className="space-y-1 animate-reveal">
                    <p id="ingreso-mercado-label" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                      Mercado <span className="text-error">*</span>
                    </p>
                    <div
                      role="group"
                      aria-labelledby="ingreso-mercado-label" data-choice=""
                      className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-surface-container p-2"
                    >
                      {MERCADOS.map((m) => (
                        <button
                          key={m.value} tabIndex={(mercadoSeleccionado ?? MERCADOS[0]?.value) === m.value ? 0 : -1}
                          ref={m.value === MERCADOS[0]?.value ? firstMercadoRef : undefined}
                          type="button"
                          aria-pressed={mercadoSeleccionado === m.value}
                          aria-label={`Seleccionar mercado ${m.label}`}
                          title={m.label}
                          onClick={() => {
                            setValue('mercado', m.value, { shouldDirty: true, shouldValidate: true })
                            clearErrors('mercado')
                          }}
                          className={`btn-press flex min-h-11 min-w-9 shrink-0 items-center justify-center rounded-md border font-body text-xs font-semibold transition-colors ${
                            mercadoSeleccionado === m.value
                              ? 'border-primary/60 bg-primary/15 text-primary'
                              : 'border-white/10 bg-surface-high text-on-surface-variant hover:border-white/25 hover:bg-surface-bright'
                          }`}
                        >
                          <span aria-hidden="true">{MERCADO_SIGLAS[m.value]}</span>
                        </button>
                      ))}
                    </div>
                    {errors.mercado && <p className="font-body text-error text-xs">{errors.mercado.message}</p>}
                  </div>
                )}

                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="ingreso-producto" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                    Producto <span className="text-error">*</span>
                  </label>
                  <ProductoSelector
                    key={productSelectorVersion}
                    id="ingreso-producto"
                    categoria={categoria}
                    mercadoFiltro={mercadoSeleccionado}
                    displayValue={productoNombre}
                    onChange={(id, nombre, producto, mercadoCtx) => {
                      if (categoria === 'droga' && id !== productoId) {
                        setValue('lote', '', { shouldDirty: true, shouldValidate: false })
                        setValue('vencimientoMes', '', { shouldDirty: true, shouldValidate: false })
                        setValue('vencimientoAnio', '', { shouldDirty: true, shouldValidate: false })
                      }
                      setValue('productoId', id || '', { shouldValidate: true })
                      setValue('productoNombre', nombre, { shouldValidate: true })
                      setProductoSeleccionado(producto ?? null)
                      if (mercadoCtx) {
                        setValue('mercado', mercadoCtx, { shouldValidate: true })
                      } else if (producto && producto.mercadosHabilitados?.length === 1 && (categoria === 'estuche' || categoria === 'etiqueta')) {
                        setValue('mercado', producto.mercadosHabilitados[0], { shouldValidate: true })
                      }
                      if (id) requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('#ingreso-lote, #ingreso-lote-sugerido, #ingreso-cantidad-cajas')?.focus())
                      clearErrors('productoId')
                    }}
                  />
                  {errors.productoId && <p className="font-body text-error text-xs">{errors.productoId.message}</p>}
                  
                  {/* Mercado Badge if auto-filled and we didn't have one before */}
                  {productoSeleccionado && mercadoSeleccionado && (categoria === 'estuche' || categoria === 'etiqueta') && (
                    <div className="mt-2 text-xs font-body text-on-surface-variant flex items-center gap-2 bg-surface-container-high px-2 py-1 rounded inline-flex border border-white/5 animate-reveal">
                       Mercado seleccionado: <span className="font-medium text-on-surface capitalize">{mercadoSeleccionado}</span>
                    </div>
                  )}
                </div>
                </div>

                </div>

                <div key={`detalles-${categoria}`} className="grid gap-3 sm:grid-flow-col sm:auto-cols-fr sm:items-start">

                  
                  {categoria === 'droga' && (
                    <>
                      <div className="space-y-1">
                        <label htmlFor="ingreso-lote" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                          Lote <span className="text-error">*</span>
                        </label>
                        <div className="relative">
                          <Hash size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                          <input
                            id="ingreso-lote"
                            {...register('lote', { onChange: (event) => {
                              const nextLot = String(event.target.value).trim().replace(/\s+/g, ' ').toUpperCase()
                              if (nextLot === loteNormalizado) return
                              setValue('vencimientoMes', '', { shouldDirty: true, shouldValidate: false })
                              setValue('vencimientoAnio', '', { shouldDirty: true, shouldValidate: false })
                            } })}
                            type="text"
                            placeholder="Ej: L240901"
                            className="input-field pl-10"
                          />
                        </div>
                        {errors.lote && <p className="font-body text-error text-xs">{errors.lote.message}</p>}
                        {existingLot?.vencimientoMes && (
                          <p className="font-body text-xs text-on-surface-variant" role="status">
                            Lote existente · vence {existingLot.vencimientoMes.slice(5)}/{existingLot.vencimientoMes.slice(0, 4)}. Este ingreso se sumará al lote existente.
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <span className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">Vencimiento</span>
                        <Controller
                          control={control}
                          name="vencimientoMes"
                          render={({ field }) => (
                            <input
                              ref={field.ref}
                              name={field.name}
                              aria-label="Vencimiento (MM/AA)"
                              placeholder="MM/AA"
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              maxLength={7}
                              value={vencMes ? vencMes + (vencAnio ? '/' + String(vencAnio).slice(2) : '') : ''}
                              disabled={Boolean(existingLot?.vencimientoMes)}
                              onChange={(event) => {
                                const [month = '', year = ''] = maskExpiryMonth(event.target.value).split('/')
                                setValue('vencimientoAnio', year ? '20' + year : '', { shouldDirty: true })
                                field.onChange(month)
                              }}
                              onBlur={() => { field.onBlur(); setIsExpiryBlockTouched(true); void trigger('vencimientoMes') }}
                              className="input-field w-full text-[16px]"
                            />
                          )}
                        />
                        {(errors.vencimientoMes && showExpiryError) && <p className="font-body text-error text-xs">{errors.vencimientoMes.message}</p>}
                      </div>
                    </>
                  )}

                  {usaLoteDeReferencia && (
                    <div className="space-y-1">
                      <label htmlFor="ingreso-lote-sugerido" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                        {requiereLoteMaterial ? <>Lote <span className="text-error">*</span></> : 'Lote sugerido'}
                      </label>
                      <div className="relative">
                        <Hash size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-50" />
                        <input
                          id="ingreso-lote-sugerido"
                          type="text"
                          placeholder={nextLoteQuery.isLoading ? 'Generando...' : 'Ej: 1'}
                          className="input-field pl-10"
                          {...register('lote', { onChange: () => { manualLoteRef.current = true } })}
                        />
                      </div>
                      <p className="font-body text-xs text-on-surface-variant/60">{requiereLoteMaterial ? 'El lote es obligatorio para Tapas y Prospectos.' : 'Podés editarlo para indicar desde qué número comienza la referencia. Si lo dejás vacío, se asignará el correlativo disponible.'}</p>
                      {nextLoteQuery.isError && <p role="alert" className="font-body text-error text-xs">No se pudo consultar el lote sugerido. Revisá la conexión o ingresá el número manualmente.</p>}
                      {errors.lote && <p className="font-body text-error text-xs">{errors.lote.message}</p>}
                    </div>
                  )}

                  {categoria !== 'frasco' && (
                    <div className="space-y-1">
                      <label htmlFor="ingreso-cantidad" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                        Cantidad {categoria === 'droga' && '(kg)'} <span className="text-error">*</span>
                      </label>
                      <div className="relative">
                        <Package size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                        <input
                          id="ingreso-cantidad"
                          type="text"
                          inputMode="decimal"
                          placeholder={categoria === 'droga' ? 'Ej: 25 | 0.400 | 1.250' : '0'}
                          className="input-field pl-10"
                          {...register('cantidad', {
                            onBlur: (e) => {
                              if (categoria === 'droga') {
                                const val = normalizeKgInput(e.target.value)
                                setValue('cantidad', val, { shouldValidate: true })
                              }
                            }
                          })}
                        />
                      </div>
                      {categoria === 'droga' && <p className="font-body text-xs text-on-surface-variant/60">Ingresá el valor en kg. Ej.: 80, 0,2 o 0.200.</p>}
                      {errors.cantidad && <p className="font-body text-error text-xs">{errors.cantidad.message}</p>}
                    </div>
                  )}

                  {categoria === 'frasco' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label htmlFor="ingreso-cantidad-cajas" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                            Cantidad de Cajas <span className="text-error">*</span>
                          </label>
                          <input id="ingreso-cantidad-cajas" {...register('cantidadCajas')} type="number" min="1" placeholder="0" className="input-field" />
                          {errors.cantidadCajas && <p className="font-body text-error text-xs">{errors.cantidadCajas.message}</p>}
                        </div>
                        <div className="space-y-1">
                          <label htmlFor="ingreso-unidades-por-caja" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                            Unidades x Caja
                          </label>
                          <input 
                            id="ingreso-unidades-por-caja" 
                            {...register('unidadesPorCaja')} 
                            type="number" 
                            disabled 
                            readOnly 
                            className="input-field bg-surface-container-high opacity-70 cursor-not-allowed" 
                          />
                          {errors.unidadesPorCaja && <p className="font-body text-error text-xs">{errors.unidadesPorCaja.message}</p>}
                        </div>
                      </div>
                      
                      {cantidadCajas > 0 && unidadesPorCaja > 0 && (
                        <div className="bg-primary-container/10 p-3 rounded text-center border border-primary/20 animate-reveal">
                          <span className="font-body text-sm text-on-surface-variant">
                            {cantidadCajas} cajas × {unidadesPorCaja} uds = <strong className="text-primary font-semibold font-display text-base ml-1">{(cantidadCajas * unidadesPorCaja).toLocaleString()} unidades</strong> totales
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                </div>

                {categoria === 'droga' && (
                  <div className="space-y-3">
                    {drugLines.length > 0 && (
                      <div className="rounded-lg border border-white/10 bg-surface-container/30 p-3 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Renglones de esta acta</p>
                        {drugLines.map((line, index) => (
                          <div key={`${line.productoId}-${line.lote}-${index}`} className="flex items-center justify-between gap-3 text-sm text-on-surface">
                            <span>{line.productoNombre} · {line.lote} · {line.vencimientoMes.slice(5)}/{line.vencimientoMes.slice(0, 4)}</span>
                            <span className="shrink-0 tabular-nums">{formatCantidad(line.cantidad, 'droga')}</span>
                            <button type="button" aria-label={`Quitar lote ${line.lote}`} onClick={() => setDrugLines((lines) => lines.filter((_, position) => position !== index))} className="text-xs text-on-surface-variant hover:text-error">Quitar</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button type="button" onClick={() => void addDrugLine()} className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-bright">
                      Agregar otro lote
                    </button>
                  </div>
                )}

                <details className="space-y-2"><summary className="cursor-pointer py-2 text-sm">Agregar observación (opcional)</summary>
                  <label htmlFor="ingreso-obs" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                    Observaciones <span className="font-normal opacity-60">(opcional)</span>
                  </label>
                  <div className="relative">
                    <FileText size={18} className="absolute left-3 top-3 text-on-surface-variant" />
                    <textarea
                      id="ingreso-obs"
                      {...register('observaciones')}
                      rows={2}
                      placeholder="Notas sobre el proveedor, remito u otro detalle..."
                      className="input-field pl-10 resize-none"
                    />
                  </div>
                  {errors.observaciones && <p className="font-body text-error text-xs">{errors.observaciones.message}</p>}
                </details>

                {serverError && (
                  <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded border border-error/20 animate-reveal">
                    {serverError}
                  </div>
                )}

                <div className="pt-2 mt-1 border-t border-white/5 space-y-3">
                  {isFormValid && (
                    <div className="bg-surface-container-high p-4 rounded-lg flex flex-col md:flex-row items-center justify-between gap-4 animate-reveal">
                      <div>
                        <p className="font-body text-xs text-on-surface-variant uppercase tracking-widest mb-1">Resumen a Registrar</p>
                        <p className="font-display font-medium text-on-surface text-lg leading-tight">
                          {categoria === 'droga' && drugLines.length > 0
                            ? `${drugLines.length + 1} renglones de drogas`
                            : <>{productoNombre || 'Producto'}{mercadoSeleccionado && ` — ${MERCADOS.find(m => m.value === mercadoSeleccionado)?.label || mercadoSeleccionado}`}</>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display font-bold text-2xl text-primary leading-none">
                          {categoria === 'frasco' 
                            ? formatCantidad(cantidadCajas * unidadesPorCaja, categoria)
                            : formatCantidad(categoria === 'droga'
                              ? drugLines.reduce((total, line) => total + line.cantidad, cantidadManual)
                              : cantidadManual, categoria)
                          }
                        </p>
                      </div>
                    </div>
                  )}

                  <aside aria-label="Último ingreso registrado" className="rounded-lg border-l-4 border-primary bg-primary/10 px-4 py-3 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">Último ingreso registrado</p>
                    {lastActa && lastItem ? <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <strong className="break-words">{lastItem.productoNombre}</strong>
                      {lastItem.mercado && <span>{MERCADO_SIGLAS[lastItem.mercado]}</span>}
                      <span>Lote {lastItem.lote || '—'}</span>
                      <span>{formatCantidad(lastItem.cantidadIngresada, lastItem.categoria)}</span>
                      {(lastActa.items?.length ?? 0) > 1 && <span>+{(lastActa.items?.length ?? 1) - 1} renglones</span>}
                      <time className="text-xs text-on-surface-variant" dateTime={lastActa.createdAt}>{new Date(lastActa.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</time>
                    </div> : <p>{recent.isError ? 'No se pudo consultar el último ingreso.' : recent.isLoading ? 'Consultando…' : 'Todavía no hay ingresos registrados.'}</p>}
                  </aside>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn-primary btn-press flex-1 min-h-11 py-3 text-sm"
                    >
                      {submitting ? 'Registrando...' : 'Registrar ingreso'}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/deposito/actas')}
                      className="btn-press flex-1 min-h-11 py-3 text-sm font-semibold rounded text-on-surface-variant bg-surface-high hover:bg-surface-bright transition-colors border border-white/5"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </form>
          </div>
        </div>
      </div>

      {/* Ambient glow */}
      <div className="fixed bottom-0 right-0 w-96 h-96 bg-primary-container/5 rounded-full blur-[100px] pointer-events-none -z-10" />
      {etiquetaCuarentena && (
        <EtiquetaCuarentenaDialog
          key={etiquetaCuarentena.itemId}
          etiqueta={etiquetaCuarentena}
          printing={printingLabel}
          error={labelError}
          onPrint={handlePrintCuarentena}
          onSkip={advanceLabel}
        />
      )}
    </div>
  )
}
