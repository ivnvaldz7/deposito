import { useState, useEffect, useMemo, useRef } from 'react'
import { formatUnit, formatCantidad } from '../lib/format-units'
import { useNavigate } from 'react-router-dom'
import { useForm, useWatch, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Package, Hash, FileText, ArrowLeft, Building2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { ApiError } from '../lib/api'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { ProductoSelector } from '../components/ProductoSelector'
import type { CategoriaProducto, Producto as ProductoCatalogo } from '../components/ProductoSelector'
import { type Mercado, MERCADOS } from '../components/inventory-shared/mercados'
import { DatePickerInput } from '../components/ui/DatePickerInput'
import { validateExpirySelection } from '../lib/expiry-month'
import { useFrascos } from '../queries/use-frascos'
import { useQuery } from '@tanstack/react-query'

const ingresoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  productoId: z.string().uuid('Seleccioná un producto del catálogo'),
  productoNombre: z.string().min(1),
  categoria: z.enum(['droga', 'estuche', 'etiqueta', 'frasco']),
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
    const num = Number(candidate)
    if (Number.isNaN(num) || num <= 0) return false
    
    // Check if it has more than 3 decimal places
    const str = candidate.trim()
    const decimalIndex = str.indexOf('.')
    if (decimalIndex !== -1 && str.length - decimalIndex - 1 > 3) {
      return false
    }
    return true
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

  if ((value.categoria === 'etiqueta' || value.categoria === 'estuche') && !value.mercado) {
    ctx.addIssue({ code: 'custom', path: ['mercado'], message: 'El mercado es obligatorio' })
  }
})

type IngresoFormData = z.infer<typeof ingresoSchema>

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

type TipoIngreso = 'MP' | 'ME'

const CATEGORIAS_ME: { label: string; value: CategoriaProducto }[] = [
  { label: 'Estuche', value: 'estuche' },
  { label: 'Frasco', value: 'frasco' },
  { label: 'Etiqueta', value: 'etiqueta' },
]

export default function ActaNuevaPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submitInFlight = useRef(false)
  const [tipoIngreso, setTipoIngreso] = useState<TipoIngreso>('MP')
  const [mercadoCat, setMercadoCat] = useState<CategoriaProducto>('estuche')
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoCatalogo | null>(null)
  const [isExpiryBlockTouched, setIsExpiryBlockTouched] = useState(false)

  const resolvedCategoria: CategoriaProducto = tipoIngreso === 'MP' ? 'droga' : mercadoCat
  const esME = tipoIngreso === 'ME'
  const frascosQuery = useFrascos()
  const nextLoteQuery = useQuery({
    queryKey: ['deposito', 'lotes', 'siguiente'],
    queryFn: () => api.get<{ lote: string }>('/lotes/siguiente'),
    enabled: esME,
  })

  const {
    register,
    handleSubmit,
    setValue,
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
  const mercadoSeleccionado = useWatch({ control, name: 'mercado' }) as Mercado | undefined
  const cantidadCajas = Number(useWatch({ control, name: 'cantidadCajas' })) || 0
  const unidadesPorCaja = Number(useWatch({ control, name: 'unidadesPorCaja' })) || 0
  const cantidadManual = Number(useWatch({ control, name: 'cantidad' })) || 0
  
  const currentYear = new Date().getUTCFullYear()
  const currentMonth = new Date().getUTCMonth() + 1
  const vencMes = useWatch({ control, name: 'vencimientoMes' })
  const vencAnio = Number(useWatch({ control, name: 'vencimientoAnio' }))

  const showExpiryError = isSubmitted || isExpiryBlockTouched || (Boolean(vencMes) && Boolean(vencAnio))

  // Keep hidden categoria in sync
  useEffect(() => {
    setValue('categoria', resolvedCategoria, { shouldValidate: true })
    clearErrors()
  }, [resolvedCategoria, setValue, clearErrors])

  useEffect(() => {
    setProductoSeleccionado(null)
    setValue('productoId', '', { shouldValidate: false })
    setValue('productoNombre', '', { shouldValidate: false })
    setValue('mercado', undefined, { shouldValidate: false })
    setValue('cantidad', '', { shouldValidate: false })
    setValue('cantidadCajas', '', { shouldValidate: false })
    setValue('unidadesPorCaja', '', { shouldValidate: false })
  }, [resolvedCategoria, setValue])

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

  async function onSubmit(data: IngresoFormData) {
    if (submitInFlight.current) return
    submitInFlight.current = true
    setServerError(null)
    setSubmitting(true)
    try {
      const acta = await api.post<{ id: string }>('/ingresos', {
        fecha: data.fecha,
        productoId: data.productoId,
        lote: data.categoria === 'droga' ? data.lote?.trim() : undefined,
        vencimientoMes: data.categoria === 'droga' ? `${data.vencimientoAnio}-${data.vencimientoMes}` : undefined,
        mercado: data.categoria === 'etiqueta' || data.categoria === 'estuche' ? data.mercado : undefined,
        cantidad: data.categoria === 'frasco' 
          ? undefined 
          : (data.categoria === 'droga' ? Math.round(Number(data.cantidad) * 1000) : Number(data.cantidad)),
        cantidadCajas: data.categoria === 'frasco' ? Number(data.cantidadCajas) : undefined,
        unidadesPorCaja: data.categoria === 'frasco' ? Number(data.unidadesPorCaja) : undefined,
        observaciones: data.observaciones?.trim() || undefined,
      })
      toast.success('Ingreso registrado correctamente')
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

  const isFormValid = isValid && isDirty

  return (
    <div className="min-h-screen bg-surface font-sans text-on-surface pb-24 relative overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-surface/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/deposito/actas')}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
            >
              <ArrowLeft size={20} className="text-on-surface-variant" />
            </button>
            <div>
              <h1 className="font-display font-medium text-lg">Nuevo Ingreso</h1>
              <p className="font-body text-xs text-on-surface-variant/70">
                {user?.name ? `Responsable: ${user.name}` : 'Registrar entrada a depósito'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 md:px-6 pt-8 relative z-10">
        <div className="bg-surface-high rounded-xl border border-white/5 shadow-float overflow-hidden">
          <div className="p-6 md:p-8">
            <div className="max-w-xl mx-auto">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-8" noValidate>
                
                {/* 1. Fecha */}
                <div className="space-y-1">
                  <label className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                    Fecha del acta
                  </label>
                  <Controller
                    name="fecha"
                    control={control}
                    render={({ field }) => (
                      <DatePickerInput 
                        value={field.value}
                        onChange={field.onChange} 
                      />
                    )}
                  />
                  {errors.fecha && <p className="font-body text-error text-xs">{errors.fecha.message}</p>}
                </div>

                {/* 2. Categoría */}
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">Clasificación</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTipoIngreso('MP')}
                        className={`py-3 px-4 rounded-lg font-body text-sm transition-all border ${
                          tipoIngreso === 'MP'
                            ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                            : 'bg-surface-container border-white/5 text-on-surface-variant hover:bg-surface-bright'
                        }`}
                      >
                        Materia Prima
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipoIngreso('ME')}
                        className={`py-3 px-4 rounded-lg font-body text-sm transition-all border ${
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
                    <div className="grid grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                      {CATEGORIAS_ME.map((cat) => (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => setMercadoCat(cat.value)}
                          className={`py-2 px-3 rounded-lg font-body text-sm transition-all border ${
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
                </div>

                <div className="h-px bg-white/5 w-full" />

                {/* 3. Mercado (Before Producto) */}
                {(categoria === 'etiqueta' || categoria === 'estuche') && (
                  <div className="space-y-1">
                    <label htmlFor="ingreso-mercado" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                      Mercado <span className="text-error">*</span>
                    </label>
                    <select
                      id="ingreso-mercado"
                      {...register('mercado')}
                      className="input-field"
                    >
                      <option value="">Seleccioná un mercado para filtrar productos</option>
                      {MERCADOS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    {errors.mercado && <p className="font-body text-error text-xs">{errors.mercado.message}</p>}
                  </div>
                )}

                {/* 4. Producto */}
                <div className="space-y-1">
                  <label htmlFor="ingreso-producto" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                    Producto <span className="text-error">*</span>
                  </label>
                  <ProductoSelector
                    id="ingreso-producto"
                    categoria={categoria}
                    mercadoFiltro={mercadoSeleccionado}
                    displayValue={productoNombre}
                    onChange={(id, nombre, producto, mercadoCtx) => {
                      setValue('productoId', id || '', { shouldValidate: true })
                      setValue('productoNombre', nombre, { shouldValidate: true })
                      setProductoSeleccionado(producto ?? null)
                      if (mercadoCtx) {
                        setValue('mercado', mercadoCtx, { shouldValidate: true })
                      } else if (producto && producto.mercadosHabilitados?.length === 1 && (categoria === 'estuche' || categoria === 'etiqueta')) {
                        setValue('mercado', producto.mercadosHabilitados[0], { shouldValidate: true })
                      }
                      clearErrors('productoId')
                    }}
                  />
                  {errors.productoId && <p className="font-body text-error text-xs">{errors.productoId.message}</p>}
                  
                  {/* Mercado Badge if auto-filled and we didn't have one before */}
                  {productoSeleccionado && mercadoSeleccionado && (categoria === 'estuche' || categoria === 'etiqueta') && (
                    <div className="mt-2 text-xs font-body text-on-surface-variant flex items-center gap-2 bg-surface-container-high px-2 py-1 rounded inline-flex border border-white/5">
                       Mercado seleccionado: <span className="font-medium text-on-surface capitalize">{mercadoSeleccionado}</span>
                    </div>
                  )}
                </div>

                {/* 5. Datos Específicos */}
                <div className="space-y-5 bg-surface-container/30 p-5 rounded-lg border border-white/5">
                  <h3 className="font-display text-sm font-medium text-on-surface mb-2">Detalles del Ingreso</h3>
                  
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
                            {...register('lote')}
                            type="text"
                            placeholder="Ej: L240901"
                            className="input-field pl-10"
                          />
                        </div>
                        {errors.lote && <p className="font-body text-error text-xs">{errors.lote.message}</p>}
                      </div>

                      <div className="space-y-1">
                        <span className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">Vencimiento</span>
                        <div 
                          className="grid grid-cols-[1fr_7rem] gap-2"
                          onBlur={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                              setIsExpiryBlockTouched(true)
                            }
                          }}
                        >
                          <Controller
                            control={control}
                            name="vencimientoMes"
                            render={({ field }) => (
                              <select 
                                aria-label="Mes de vencimiento" 
                                value={field.value || ''}
                                onChange={(e) => {
                                  field.onChange(e.target.value)
                                  if (vencAnio) trigger('vencimientoMes')
                                }}
                                className="input-field"
                              >
                                <option value="">Mes</option>
                                {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((label, index) => (
                                  <option key={label} value={String(index + 1).padStart(2, '0')}>{label}</option>
                                ))}
                              </select>
                            )}
                          />
                          <Controller
                            control={control}
                            name="vencimientoAnio"
                            render={({ field }) => (
                              <select 
                                aria-label="Año de vencimiento" 
                                value={field.value || ''}
                                onChange={(e) => {
                                  field.onChange(e.target.value)
                                  if (vencMes) trigger('vencimientoMes')
                                }}
                                className="input-field"
                              >
                                <option value="">Año</option>
                                {Array.from({ length: 11 }, (_, i) => currentYear + i).map(year => (
                                  <option key={year} value={String(year)}>{year}</option>
                                ))}
                              </select>
                            )}
                          />
                        </div>
                        {(errors.vencimientoMes && showExpiryError) && <p className="font-body text-error text-xs">{errors.vencimientoMes.message}</p>}
                      </div>
                    </>
                  )}

                  {esME && (
                    <div className="space-y-1">
                      <label htmlFor="ingreso-lote-sugerido" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                        Lote Sugerido (Automático)
                      </label>
                      <div className="relative">
                        <Hash size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-50" />
                        <input
                          id="ingreso-lote-sugerido"
                          type="text"
                          readOnly
                          disabled
                          value={nextLoteQuery.isLoading ? 'Generando...' : nextLoteQuery.data?.lote || ''}
                          className="input-field pl-10 opacity-70 bg-surface-container-high"
                        />
                      </div>
                      <p className="font-body text-xs text-on-surface-variant/60">El lote correlativo se asignará automáticamente al guardar.</p>
                    </div>
                  )}

                  {categoria !== 'frasco' && (
                    <div className="space-y-1">
                      <label htmlFor="ingreso-cantidad" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                        Cantidad <span className="text-error">*</span>
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
                              let val = e.target.value
                              if (val.startsWith('.')) {
                                val = '0' + val
                                setValue('cantidad', val, { shouldValidate: true })
                              }
                            }
                          })}
                        />
                      </div>
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
                        <div className="bg-primary-container/10 p-3 rounded text-center border border-primary/20">
                          <span className="font-body text-sm text-on-surface-variant">
                            {cantidadCajas} cajas × {unidadesPorCaja} uds = <strong className="text-primary font-semibold font-display text-base ml-1">{(cantidadCajas * unidadesPorCaja).toLocaleString()} unidades</strong> totales
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 6. Observaciones */}
                <div className="space-y-1">
                  <label htmlFor="ingreso-obs" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                    Observaciones <span className="font-normal opacity-60">(opcional)</span>
                  </label>
                  <div className="relative">
                    <FileText size={18} className="absolute left-3 top-3 text-on-surface-variant" />
                    <textarea
                      id="ingreso-obs"
                      {...register('observaciones')}
                      rows={3}
                      placeholder="Notas sobre el proveedor, remito u otro detalle..."
                      className="input-field pl-10 resize-none"
                    />
                  </div>
                  {errors.observaciones && <p className="font-body text-error text-xs">{errors.observaciones.message}</p>}
                </div>

                {serverError && (
                  <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded border border-error/20">
                    {serverError}
                  </div>
                )}

                {/* Resumen Final & Actions */}
                <div className="pt-4 mt-8 border-t border-white/5 space-y-4">
                  {isFormValid && (
                    <div className="bg-surface-container-high p-4 rounded-lg flex flex-col md:flex-row items-center justify-between gap-4">
                      <div>
                        <p className="font-body text-xs text-on-surface-variant uppercase tracking-widest mb-1">Resumen a Registrar</p>
                        <p className="font-display font-medium text-on-surface text-lg leading-tight">
                          {productoNombre || 'Producto'}
                          {mercadoSeleccionado && ` — ${MERCADOS.find(m => m.value === mercadoSeleccionado)?.label || mercadoSeleccionado}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display font-bold text-2xl text-primary leading-none">
                          {categoria === 'frasco' 
                            ? formatCantidad(cantidadCajas * unidadesPorCaja, categoria)
                            : formatCantidad(categoria === 'droga' ? Math.round(cantidadManual * 1000) : cantidadManual, categoria)
                          }
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn-primary flex-1 py-3 text-sm"
                    >
                      {submitting ? 'Registrando...' : 'Registrar ingreso'}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/deposito/actas')}
                      className="flex-1 py-3 text-sm font-semibold rounded text-on-surface-variant bg-surface-high hover:bg-surface-bright transition-colors border border-white/5"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Ambient glow */}
      <div className="fixed bottom-0 right-0 w-96 h-96 bg-primary-container/5 rounded-full blur-[100px] pointer-events-none -z-10" />
    </div>
  )
}
