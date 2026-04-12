import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import Fuse from 'fuse.js'
import { Check, ChevronDown, PackagePlus, Plus } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient, ApiError } from '@/lib/api-client'
import { toast } from '@/lib/toast'
import { PageHeader } from '@/components/layout/page-header'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type EstadoPendiente = 'en_esterilizacion' | 'recibido'

interface InsumoPendiente {
  id: string
  categoria: string
  articulo: string
  cantidad: number
  destino: string
  estado: EstadoPendiente
  fechaEnvio: string
  fechaRetornoEstimada: string | null
  fechaRecibido: string | null
  notas: string | null
  createdAt: string
  user: { name: string }
}

interface Frasco {
  id: string
  articulo: string
  unidadesPorCaja: number
  cantidadCajas: number
  total: number
}

interface RecibirPendienteResponse {
  recibido: InsumoPendiente
  pendienteRestante: InsumoPendiente | null
}

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function EstadoChip({ estado }: { estado: EstadoPendiente }) {
  const en = estado === 'en_esterilizacion'
  return (
    <span
      className="inline-block shrink-0 rounded px-2 py-0.5 font-body text-xs font-medium"
      style={
        en
          ? { color: '#FF9800', backgroundColor: 'rgba(255,152,0,0.10)' }
          : { color: '#00AE42', backgroundColor: 'rgba(0,174,66,0.10)' }
      }
    >
      {en ? 'En esterilización' : 'Recibido'}
    </span>
  )
}

const enviarSchema = z.object({
  articulo: z.string().min(2, 'Mínimo 2 caracteres').max(150),
  cantidad: z.string().refine((v) => Number.isInteger(Number(v)) && Number(v) > 0, {
    message: 'Cantidad debe ser un entero positivo',
  }),
  destino: z.string().min(2, 'Mínimo 2 caracteres').max(200),
  fechaEnvio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  fechaRetornoEstimada: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
    .optional()
    .or(z.literal('')),
  notas: z.string().max(500).optional(),
})

type EnviarFormData = z.infer<typeof enviarSchema>

const recibirSchema = z.object({
  cantidadRecibida: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => Number.isInteger(Number(v)) && Number(v) > 0, 'Debe ser un entero positivo'),
})

type RecibirFormData = z.infer<typeof recibirSchema>

function FrascoCombobox({
  frascos,
  loading,
  value,
  onChange,
  onSelect,
}: {
  frascos: Frasco[]
  loading: boolean
  value: string
  onChange: (next: string) => void
  onSelect: (frasco: Frasco | null) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const fuse = useMemo(
    () =>
      frascos.length
        ? new Fuse(frascos, {
            keys: ['articulo'],
            threshold: 0.42,
            includeScore: true,
          })
        : null,
    [frascos]
  )

  const results = useMemo(() => {
    if (!fuse || !value.trim()) return frascos.slice(0, 8)
    return fuse.search(value).slice(0, 8).map((result) => result.item)
  }, [frascos, fuse, value])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelect(frasco: Frasco) {
    onChange(frasco.articulo)
    onSelect(frasco)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          id="pendiente-articulo"
          type="text"
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            onSelect(null)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={loading ? 'Cargando frascos...' : 'Buscá un frasco del inventario...'}
          className="input-field w-full pr-9 text-sm"
          autoComplete="off"
          disabled={loading}
        />
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
        />
      </div>

      {open && !loading && (
        <div
          className="absolute z-20 mt-1 max-h-56 w-full overflow-hidden rounded bg-surface-highest/90 shadow-float"
          style={{ backdropFilter: 'blur(12px)' }}
        >
          {results.length > 0 ? (
            <ul className="max-h-56 overflow-y-auto py-1">
              {results.map((frasco) => (
                <li key={frasco.id}>
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      handleSelect(frasco)
                    }}
                    className="w-full px-4 py-2.5 text-left transition-colors hover:bg-surface-bright"
                  >
                    <span className="block font-body text-sm text-on-surface">{frasco.articulo}</span>
                    <span className="block font-body text-xs text-on-surface-variant">
                      {frasco.unidadesPorCaja} uds/caja · {frasco.cantidadCajas} cajas en inventario
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-3 font-body text-sm text-on-surface-variant">
              No se encontraron frascos para esa búsqueda.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EnviarModal({
  onCreated,
  open,
  onOpenChange,
}: {
  onCreated: (p: InsumoPendiente) => void
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const token = useAuthStore((s) => s.token)
  const [serverError, setServerError] = useState<string | null>(null)
  const [frascos, setFrascos] = useState<Frasco[]>([])
  const [loadingFrascos, setLoadingFrascos] = useState(false)
  const [selectedFrasco, setSelectedFrasco] = useState<Frasco | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EnviarFormData>({
    resolver: zodResolver(enviarSchema),
    defaultValues: {
      articulo: '',
      cantidad: '',
      destino: 'Planta de esterilización',
      fechaEnvio: today,
      fechaRetornoEstimada: '',
      notas: '',
    },
  })

  const articulo = useWatch({ control, name: 'articulo' })
  const fechaRetorno = useWatch({ control, name: 'fechaRetornoEstimada' })

  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function loadFrascos() {
      setLoadingFrascos(true)
      try {
        const data = await apiClient.get<Frasco[]>('/frascos', token)
        if (!cancelled) {
          setFrascos(data)
        }
      } catch {
        if (!cancelled) {
          setFrascos([])
          setServerError('No se pudo cargar el inventario de frascos.')
        }
      } finally {
        if (!cancelled) {
          setLoadingFrascos(false)
        }
      }
    }

    loadFrascos()

    return () => {
      cancelled = true
    }
  }, [open, token])

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset({
        articulo: '',
        cantidad: '',
        destino: 'Planta de esterilización',
        fechaEnvio: today,
        fechaRetornoEstimada: '',
        notas: '',
      })
      setSelectedFrasco(null)
      setServerError(null)
    }
    onOpenChange(next)
  }

  async function onSubmit(data: EnviarFormData) {
    setServerError(null)

    if (!selectedFrasco || selectedFrasco.articulo !== data.articulo) {
      setServerError('Seleccioná un frasco existente del inventario.')
      toast.error('Seleccioná un frasco existente del inventario.')
      return
    }

    try {
      const body: Record<string, unknown> = {
        articulo: data.articulo,
        cantidad: Number(data.cantidad),
        destino: data.destino,
        fechaEnvio: data.fechaEnvio,
      }
      if (data.fechaRetornoEstimada) body.fechaRetornoEstimada = data.fechaRetornoEstimada
      if (data.notas?.trim()) body.notas = data.notas.trim()

      const pendiente = await apiClient.post<InsumoPendiente>('/pendientes', body, token)
      onCreated(pendiente)
      toast.info(`Pendiente creado para "${pendiente.articulo}".`)
      handleOpenChange(false)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'No se pudo crear el pendiente. Intentá de nuevo.'
      setServerError(message)
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar a esterilización</DialogTitle>
            <DialogDescription>
              Seleccioná un frasco existente del inventario y registrá cuántas cajas salieron.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="pendiente-articulo" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                Artículo
              </label>
              <FrascoCombobox
                frascos={frascos}
                loading={loadingFrascos}
                value={articulo}
                onChange={(next) => {
                  setValue('articulo', next, { shouldValidate: true })
                  setServerError(null)
                }}
                onSelect={(frasco) => {
                  setSelectedFrasco(frasco)
                  if (frasco) {
                    setValue('articulo', frasco.articulo, { shouldValidate: true })
                    setServerError(null)
                  }
                }}
              />
              {errors.articulo && (
                <p className="font-body text-xs" style={{ color: '#FF9800' }}>{errors.articulo.message}</p>
              )}
            </div>

            {selectedFrasco && (
              <div className="rounded bg-surface-low px-4 py-3">
                <p className="font-body text-xs uppercase tracking-widest text-on-surface-variant">
                  Referencia del inventario
                </p>
                <p className="mt-1 font-body text-sm text-on-surface">
                  {selectedFrasco.unidadesPorCaja} unidades por caja
                </p>
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor="pendiente-cantidad" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                Cantidad (cajas)
              </label>
              <input
                id="pendiente-cantidad"
                {...register('cantidad')}
                type="number"
                min="1"
                placeholder="0"
                className="input-field w-full py-2 text-sm"
              />
              {errors.cantidad && (
                <p className="font-body text-xs" style={{ color: '#FF9800' }}>{errors.cantidad.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="pendiente-destino" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                Destino
              </label>
              <input
                id="pendiente-destino"
                {...register('destino')}
                type="text"
                className="input-field w-full py-2 text-sm"
              />
              {errors.destino && (
                <p className="font-body text-xs" style={{ color: '#FF9800' }}>{errors.destino.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="pendiente-fecha-envio" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                  Fecha envío
                </label>
                <input
                  id="pendiente-fecha-envio"
                  {...register('fechaEnvio')}
                  type="date"
                  className="input-field w-full py-2 text-sm"
                />
                {errors.fechaEnvio && (
                  <p className="font-body text-xs" style={{ color: '#FF9800' }}>{errors.fechaEnvio.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="pendiente-retorno" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                  Retorno estimado
                </label>
                <input
                  id="pendiente-retorno"
                  {...register('fechaRetornoEstimada')}
                  type="date"
                  className="input-field w-full py-2 text-sm"
                />
                {fechaRetorno === '__never__' && null}
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="pendiente-notas" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                Notas <span className="normal-case opacity-60">(opcional)</span>
              </label>
              <textarea
                id="pendiente-notas"
                {...register('notas')}
                rows={2}
                className="input-field w-full resize-none py-2 text-sm"
              />
            </div>

            {serverError && (
              <p className="font-body text-xs" style={{ color: '#FF9800' }}>{serverError}</p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <DialogClose asChild>
                <button
                  type="button"
                  className="px-3 py-2 font-heading text-sm font-semibold text-on-surface-variant transition-colors hover:text-on-surface"
                >
                  Cancelar
                </button>
              </DialogClose>
              <button
                type="submit"
                disabled={isSubmitting || !selectedFrasco}
                className="flex items-center gap-2 rounded px-4 py-2 font-heading text-sm font-semibold transition-opacity disabled:opacity-50"
                style={{ background: 'linear-gradient(180deg, #54e16d 0%, #00AE42 100%)', color: '#003918' }}
              >
                <Plus size={13} strokeWidth={2} />
                {isSubmitting ? 'Guardando...' : 'Enviar'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
  )
}

function RecibirModal({
  pendiente,
  onRecibido,
}: {
  pendiente: InsumoPendiente
  onRecibido: (response: RecibirPendienteResponse) => void
}) {
  const token = useAuthStore((s) => s.token)
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RecibirFormData>({
    resolver: zodResolver(recibirSchema),
    defaultValues: { cantidadRecibida: String(pendiente.cantidad) },
  })

  const cantidadRecibidaValue = useWatch({ control, name: 'cantidadRecibida' })
  const cantidadRecibida = Number(cantidadRecibidaValue || 0)
  const cantidadRestante = Number.isFinite(cantidadRecibida)
    ? Math.max(pendiente.cantidad - cantidadRecibida, 0)
    : pendiente.cantidad

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset({ cantidadRecibida: String(pendiente.cantidad) })
      setServerError(null)
    }
    setOpen(next)
  }

  async function onSubmit(data: RecibirFormData) {
    setServerError(null)

    const cantidad = Number(data.cantidadRecibida)
    if (cantidad > pendiente.cantidad) {
      const message = 'La cantidad recibida no puede superar la cantidad enviada.'
      setServerError(message)
      return
    }

    try {
      const response = await apiClient.put<RecibirPendienteResponse>(
        `/pendientes/${pendiente.id}/recibir`,
        { cantidadRecibida: cantidad },
        token
      )

      onRecibido(response)

      if (response.pendienteRestante) {
        toast.warning(
          `Se recibieron ${response.recibido.cantidad} cajas y ${response.pendienteRestante.cantidad} siguen en esterilización.`
        )
      } else {
        toast.success(`"${response.recibido.articulo}" marcado como recibido.`)
      }

      handleOpenChange(false)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'No se pudo registrar la recepción.'
      setServerError(message)
      toast.error(message)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="flex items-center gap-1.5 rounded px-3 py-1.5 font-heading text-xs font-semibold transition-opacity"
        style={{ background: 'linear-gradient(180deg, #54e16d 0%, #00AE42 100%)', color: '#003918' }}
      >
        <Check size={12} strokeWidth={2} />
        Marcar como recibido
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar recepción</DialogTitle>
            <DialogDescription>
              Indicá cuántas cajas volvieron realmente de esterilización.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded bg-surface-low px-3 py-3">
                <p className="font-body text-xs uppercase tracking-widest text-on-surface-variant">Enviadas</p>
                <p className="mt-1 font-heading text-lg font-semibold text-on-surface tabular-nums">
                  {pendiente.cantidad}
                </p>
              </div>
              <div className="rounded bg-surface-low px-3 py-3">
                <p className="font-body text-xs uppercase tracking-widest text-on-surface-variant">Recibidas</p>
                <p className="mt-1 font-heading text-lg font-semibold text-on-surface tabular-nums">
                  {Number.isFinite(cantidadRecibida) ? cantidadRecibida : 0}
                </p>
              </div>
              <div className="rounded bg-surface-low px-3 py-3">
                <p className="font-body text-xs uppercase tracking-widest text-on-surface-variant">Siguen afuera</p>
                <p className="mt-1 font-heading text-lg font-semibold text-on-surface tabular-nums">
                  {cantidadRestante}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor={`recibir-pendiente-${pendiente.id}`} className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                Cantidad recibida
              </label>
              <input
                id={`recibir-pendiente-${pendiente.id}`}
                {...register('cantidadRecibida')}
                type="number"
                min="1"
                max={pendiente.cantidad}
                className="input-field w-full py-2 text-sm"
                autoFocus
              />
              {errors.cantidadRecibida && (
                <p className="font-body text-xs" style={{ color: '#FF9800' }}>
                  {errors.cantidadRecibida.message}
                </p>
              )}
            </div>

            {serverError && (
              <p className="font-body text-xs" style={{ color: '#FF9800' }}>{serverError}</p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <DialogClose asChild>
                <button
                  type="button"
                  className="px-3 py-2 font-heading text-sm font-semibold text-on-surface-variant transition-colors hover:text-on-surface"
                >
                  Cancelar
                </button>
              </DialogClose>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded px-4 py-2 font-heading text-sm font-semibold transition-opacity disabled:opacity-50"
                style={{ background: 'linear-gradient(180deg, #54e16d 0%, #00AE42 100%)', color: '#003918' }}
              >
                <Check size={13} strokeWidth={2} />
                {isSubmitting ? 'Guardando...' : 'Confirmar recepción'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function PendienteCard({
  pendiente,
  onRecibido,
  onCrearIngreso,
}: {
  pendiente: InsumoPendiente
  onRecibido?: (response: RecibirPendienteResponse) => void
  onCrearIngreso?: (p: InsumoPendiente) => void
}) {
  return (
    <div className="space-y-3 rounded bg-surface-low px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-body text-sm font-medium text-on-surface">{pendiente.articulo}</p>
          <p className="mt-0.5 font-body text-xs text-on-surface-variant">{pendiente.destino}</p>
        </div>
        <EstadoChip estado={pendiente.estado} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <div>
          <p className="font-body text-xs uppercase tracking-widest text-on-surface-variant">Cajas</p>
          <p className="font-body text-sm font-medium tabular-nums text-on-surface">{pendiente.cantidad}</p>
        </div>
        <div>
          <p className="font-body text-xs uppercase tracking-widest text-on-surface-variant">Enviado</p>
          <p className="font-body text-sm tabular-nums text-on-surface">{formatFecha(pendiente.fechaEnvio)}</p>
        </div>
        {pendiente.fechaRetornoEstimada && (
          <div>
            <p className="font-body text-xs uppercase tracking-widest text-on-surface-variant">Retorno est.</p>
            <p className="font-body text-sm tabular-nums text-on-surface">{formatFecha(pendiente.fechaRetornoEstimada)}</p>
          </div>
        )}
        {pendiente.fechaRecibido && (
          <div>
            <p className="font-body text-xs uppercase tracking-widest text-on-surface-variant">Recibido</p>
            <p className="font-body text-sm tabular-nums text-on-surface">{formatFecha(pendiente.fechaRecibido)}</p>
          </div>
        )}
      </div>

      {pendiente.notas && <p className="font-body text-xs italic text-on-surface-variant">{pendiente.notas}</p>}

      <div className="flex items-center gap-2 pt-1">
        {pendiente.estado === 'en_esterilizacion' && onRecibido && (
          <RecibirModal pendiente={pendiente} onRecibido={onRecibido} />
        )}
        {pendiente.estado === 'recibido' && onCrearIngreso && (
          <button
            type="button"
            onClick={() => onCrearIngreso(pendiente)}
            className="flex items-center gap-1.5 rounded bg-surface-high px-3 py-1.5 font-heading text-xs font-semibold text-on-surface transition-colors hover:bg-surface-bright"
          >
            <PackagePlus size={12} strokeWidth={1.5} />
            Crear ingreso
          </button>
        )}
      </div>
    </div>
  )
}

export function PendientesPage() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.role === 'encargado'
  const navigate = useNavigate()

  const [pendientes, setPendientes] = useState<InsumoPendiente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviarOpen, setEnviarOpen] = useState(false)

  useEffect(() => {
    apiClient
      .get<InsumoPendiente[]>('/pendientes', token)
      .then(setPendientes)
      .catch(() => setError('No se pudo cargar los pendientes'))
      .finally(() => setLoading(false))
  }, [token])

  const enEsterilizacion = pendientes.filter((p) => p.estado === 'en_esterilizacion')
  const recibidos = pendientes.filter((p) => p.estado === 'recibido')
  const cajasEnEsterilizacion = enEsterilizacion.reduce((sum, pendiente) => sum + pendiente.cantidad, 0)

  function handleCreated(pendiente: InsumoPendiente) {
    setPendientes((prev) => [pendiente, ...prev])
  }

  function handleRecibido(response: RecibirPendienteResponse) {
    setPendientes((prev) => {
      const withoutCurrent = prev.filter((pendiente) => pendiente.id !== response.recibido.id)
      return response.pendienteRestante
        ? [response.pendienteRestante, response.recibido, ...withoutCurrent]
        : [response.recibido, ...withoutCurrent]
    })
  }

  function handleCrearIngreso(pendiente: InsumoPendiente) {
    toast.info(`Abriendo ingreso para "${pendiente.articulo}".`)
    navigate('/ingresos', {
      state: {
        productoNombre: pendiente.articulo,
        categoria: 'frasco',
        cantidadIngresada: String(pendiente.cantidad),
      },
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="PENDIENTES"
        stats={[
          { label: 'en esterilización', value: loading ? '...' : enEsterilizacion.length, warning: enEsterilizacion.length > 0 && !loading },
          { label: 'recibidos', value: loading ? '...' : recibidos.length },
          { label: 'cajas afuera', value: loading ? '...' : cajasEnEsterilizacion, warning: cajasEnEsterilizacion > 0 && !loading },
        ]}
        primaryAction={
          isEncargado
            ? {
                label: 'Enviar a esterilización',
                onClick: () => setEnviarOpen(true),
                icon: <Plus size={14} strokeWidth={2} />,
              }
            : undefined
        }
      />

      {isEncargado ? (
        <EnviarModal
          onCreated={handleCreated}
          open={enviarOpen}
          onOpenChange={setEnviarOpen}
        />
      ) : null}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <p className="font-body text-sm text-on-surface-variant">Cargando...</p>
        </div>
      ) : error ? (
        <div className="flex h-48 items-center justify-center">
          <p className="font-body text-sm" style={{ color: '#FF9800' }}>{error}</p>
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="font-heading text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
              En esterilización
              {enEsterilizacion.length > 0 && (
                <span
                  className="ml-2 inline-block rounded px-2 py-0.5 font-body text-xs font-medium"
                  style={{ color: '#FF9800', backgroundColor: 'rgba(255,152,0,0.10)' }}
                >
                  {enEsterilizacion.length}
                </span>
              )}
            </h2>

            {enEsterilizacion.length === 0 ? (
              <div className="rounded bg-surface-low px-4 py-8 text-center">
                <p className="font-body text-sm text-on-surface-variant">
                  No hay frascos en esterilización.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {enEsterilizacion.map((pendiente) => (
                  <PendienteCard
                    key={pendiente.id}
                    pendiente={pendiente}
                    onRecibido={isEncargado ? handleRecibido : undefined}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
              Recibidos
              {recibidos.length > 0 && (
                <span
                  className="ml-2 inline-block rounded px-2 py-0.5 font-body text-xs font-medium"
                  style={{ color: '#00AE42', backgroundColor: 'rgba(0,174,66,0.10)' }}
                >
                  {recibidos.length}
                </span>
              )}
            </h2>

            {recibidos.length === 0 ? (
              <div className="rounded bg-surface-low px-4 py-8 text-center">
                <p className="font-body text-sm text-on-surface-variant">
                  No hay insumos recibidos todavía.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recibidos.map((pendiente) => (
                  <PendienteCard
                    key={pendiente.id}
                    pendiente={pendiente}
                    onCrearIngreso={isEncargado ? handleCrearIngreso : undefined}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
