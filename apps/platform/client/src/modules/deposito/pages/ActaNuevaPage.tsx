import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Package, Hash, FileText, ArrowLeft, Building2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { ApiError } from '../lib/api'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { ProductoSelector } from '../components/ProductoSelector'
import type { CategoriaProducto } from '../components/ProductoSelector'
import { DatePickerInput } from '../components/ui/DatePickerInput'

const ingresoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  productoId: z.string().uuid('Seleccioná un producto del catálogo'),
  productoNombre: z.string().min(1),
  categoria: z.string().min(1),
  lote: z.string().max(50).optional(),
  cantidad: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => Number.isInteger(Number(v)) && Number(v) > 0, 'Debe ser un número entero positivo'),
  observaciones: z.string().max(500).optional(),
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
  const [tipoIngreso, setTipoIngreso] = useState<TipoIngreso>('MP')
  const [mercadoCat, setMercadoCat] = useState<CategoriaProducto>('estuche')

  const resolvedCategoria: CategoriaProducto = tipoIngreso === 'MP' ? 'droga' : mercadoCat
  const esME = tipoIngreso === 'ME'

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<IngresoFormData>({
    resolver: zodResolver(ingresoSchema),
    defaultValues: {
      fecha: todayISO(),
      productoId: '',
      productoNombre: '',
      categoria: resolvedCategoria,
      lote: '',
      cantidad: '',
      observaciones: '',
    },
  })

  const categoria = watch('categoria')
  const productoId = watch('productoId')
  const productoNombre = watch('productoNombre')

  // Keep hidden categoria in sync
  useEffect(() => {
    setValue('categoria', resolvedCategoria, { shouldValidate: true })
  }, [resolvedCategoria, setValue])

  // Auto-popular lote cuando cambia a ME
  useEffect(() => {
    if (!esME) return
    api.get<{ lote: string }>('/lotes/siguiente')
      .then((data) => setValue('lote', data.lote, { shouldValidate: false }))
      .catch(() => {
        // Si falla el endpoint, dejar el campo vacío
      })
  }, [esME, mercadoCat, setValue])

  async function onSubmit(data: IngresoFormData) {
    setServerError(null)
    setSubmitting(true)
    try {
      await api.post('/ingresos', {
        fecha: data.fecha,
        productoId: data.productoId,
        lote: data.lote?.trim() || undefined,
        cantidad: Number(data.cantidad),
        observaciones: data.observaciones?.trim() || undefined,
      })
      toast.success('Ingreso registrado correctamente.')
      navigate('/actas')
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al registrar el ingreso')
    } finally {
      setSubmitting(false)
    }
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
          <h1 className="font-heading text-lg font-semibold text-primary">Nuevo Ingreso</h1>
        </div>
      </header>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-margin-desktop py-lg">
        <div className="max-w-xl mx-auto">
          <div className="bg-surface-container border border-primary-container/30 rounded-xl shadow-float overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary-container to-transparent opacity-50" />

            <div className="p-lg">
              <div className="mb-lg">
                <h2 className="font-heading text-lg font-semibold text-on-surface mb-1">Registrar ingreso</h2>
                <p className="font-body text-sm text-on-surface-variant">
                  Completá los datos del producto que ingresa al depósito.
                </p>
              </div>

              {/* MP / ME Switch */}
              <div className="flex flex-col gap-3 mb-6">
                <div className="flex rounded-lg bg-surface-high p-0.5">
                  {(['MP', 'ME'] as TipoIngreso[]).map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setTipoIngreso(tipo)}
                      className={`flex-1 py-2 text-sm font-heading font-semibold rounded-md transition-all duration-200 ${
                        tipoIngreso === tipo
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {tipo === 'MP' ? 'Drogas' : 'Material de Empaque'}
                    </button>
                  ))}
                </div>

                {tipoIngreso === 'ME' && (
                  <div className="flex gap-1.5">
                    {CATEGORIAS_ME.map((cat) => (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => setMercadoCat(cat.value)}
                        className={`flex-1 py-1.5 text-xs font-heading font-semibold rounded-md transition-all duration-200 ${
                          mercadoCat === cat.value
                            ? 'bg-secondary-container text-secondary'
                            : 'bg-surface-high text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
                {/* Fecha */}
                <div className="space-y-1">
                  <label htmlFor="ingreso-fecha" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                    Fecha
                  </label>
                  <DatePickerInput
                    id="ingreso-fecha"
                    value={watch('fecha')}
                    onChange={(iso) => setValue('fecha', iso, { shouldValidate: true })}
                    error={errors.fecha?.message}
                    autoFocus
                  />
                </div>

                {/* Producto */}
                <div className="space-y-1">
                  <label htmlFor="ingreso-producto" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                    Producto
                  </label>
                  <ProductoSelector
                    key={`${resolvedCategoria}-${productoId ?? 'empty'}`}
                    id="ingreso-producto"
                    categoria={resolvedCategoria}
                    displayValue={productoNombre}
                    onChange={(id, nombre) => {
                      setValue('productoId', id || '', { shouldValidate: true })
                      setValue('productoNombre', nombre, { shouldValidate: true })
                    }}
                    placeholder={tipoIngreso === 'MP' ? 'Buscá una droga del catálogo...' : `Buscá ${mercadoCat === 'estuche' ? 'un estuche' : mercadoCat === 'frasco' ? 'un frasco' : 'una etiqueta'} del catálogo...`}
                  />
                  <input type="hidden" {...register('productoId')} />
                  <input type="hidden" {...register('productoNombre')} />
                  <input type="hidden" {...register('categoria')} value={resolvedCategoria} />
                  {errors.productoId && <p className="font-body text-error text-xs">{errors.productoId.message}</p>}
                </div>

                {/* Proveedor (auto) */}
                <div className="space-y-1">
                  <label className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                    Proveedor
                  </label>
                  <div className="relative">
                    <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                    <input
                      type="text"
                      value="Proveedor pendiente de configuración"
                      disabled
                      className="input-field pl-10 opacity-60"
                    />
                  </div>
                  <p className="font-body text-xs text-on-surface-variant mt-0.5">
                    Se cargará automáticamente cuando tengamos el módulo de proveedores.
                  </p>
                </div>

                {/* Lote */}
                <div className="space-y-1">
                  <label htmlFor="ingreso-lote" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                    Lote
                  </label>
                  <div className="relative">
                    <Hash size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                    <input
                      id="ingreso-lote"
                      {...register('lote')}
                      type="text"
                      placeholder={categoria === 'droga' ? 'Ej: L240901 (obligatorio para drogas)' : 'Auto-generado, editable'}
                      className="input-field pl-10"
                    />
                  </div>
                  {errors.lote && <p className="font-body text-error text-xs">{errors.lote.message}</p>}
                  {categoria === 'droga' && (
                    <p className="font-body text-xs text-on-surface-variant mt-0.5">
                      El lote es obligatorio para drogas.
                    </p>
                  )}
                </div>

                {/* Cantidad */}
                <div className="space-y-1">
                  <label htmlFor="ingreso-cantidad" className="font-body text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                    Cantidad
                  </label>
                  <div className="relative">
                    <Package size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                    <input
                      id="ingreso-cantidad"
                      {...register('cantidad')}
                      type="number"
                      min="1"
                      placeholder="0"
                      className="input-field pl-10"
                    />
                  </div>
                  {errors.cantidad && <p className="font-body text-error text-xs">{errors.cantidad.message}</p>}
                </div>

                {/* Observaciones */}
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
                      placeholder="Notas sobre el ingreso..."
                      className="input-field pl-10 resize-none"
                    />
                  </div>
                  {errors.observaciones && <p className="font-body text-error text-xs">{errors.observaciones.message}</p>}
                </div>

                {serverError && (
                  <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">
                    {serverError}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary flex-1 py-2.5"
                  >
                    {submitting ? 'Registrando...' : 'Registrar ingreso'}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/actas')}
                    className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-high hover:bg-surface-bright transition-colors"
                  >
                    Cancelar
                  </button>
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


