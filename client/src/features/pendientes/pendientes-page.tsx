import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, PackagePlus, Check } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient } from '@/lib/api-client'

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Chips ────────────────────────────────────────────────────────────────────

function EstadoChip({ estado }: { estado: EstadoPendiente }) {
  const en = estado === 'en_esterilizacion'
  return (
    <span
      className="inline-block font-body text-xs font-medium px-2 py-0.5 rounded shrink-0"
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

// ─── Form schema ──────────────────────────────────────────────────────────────

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

// ─── Modal "Enviar a esterilización" ─────────────────────────────────────────

function EnviarModal({ onCreated }: { onCreated: (p: InsumoPendiente) => void }) {
  const token = useAuthStore((s) => s.token)
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const {
    register,
    handleSubmit,
    control,
    reset,
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

  // watch fechaRetornoEstimada for display only (no useMemo needed)
  const fechaRetorno = useWatch({ control, name: 'fechaRetornoEstimada' })

  async function onSubmit(data: EnviarFormData) {
    setServerError(null)
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
      reset()
      setOpen(false)
    } catch {
      setServerError('No se pudo crear el pendiente. Intentá de nuevo.')
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded font-heading font-semibold text-sm transition-colors"
        style={{ background: 'linear-gradient(180deg, #54e16d 0%, #00AE42 100%)', color: '#003918' }}
      >
        <Plus size={14} strokeWidth={2} />
        Enviar a esterilización
      </button>
    )
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={() => { reset(); setOpen(false) }}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-[10vh] z-50 mx-auto max-w-md rounded overflow-hidden"
        style={{ background: 'rgba(49,54,49,0.95)', backdropFilter: 'blur(12px)' }}
      >
        <div className="px-6 py-5">
          <h2 className="font-heading text-on-surface font-semibold text-base mb-4">
            Enviar a esterilización
          </h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Artículo */}
            <div className="space-y-1">
              <label htmlFor="pendiente-articulo" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                Artículo
              </label>
              <input
                id="pendiente-articulo"
                {...register('articulo')}
                type="text"
                placeholder="Ej: Dorado 500 ML"
                className="input-field w-full py-2 text-sm"
              />
              {errors.articulo && (
                <p className="font-body text-xs" style={{ color: '#FF9800' }}>{errors.articulo.message}</p>
              )}
            </div>

            {/* Cantidad */}
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

            {/* Destino */}
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

            {/* Fechas — row */}
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
                {/* suppress unused warning */}
                {fechaRetorno === '__never__' && null}
              </div>
            </div>

            {/* Notas */}
            <div className="space-y-1">
              <label htmlFor="pendiente-notas" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                Notas <span className="normal-case opacity-60">(opcional)</span>
              </label>
              <textarea
                id="pendiente-notas"
                {...register('notas')}
                rows={2}
                className="input-field w-full py-2 text-sm resize-none"
              />
            </div>

            {serverError && (
              <p className="font-body text-xs" style={{ color: '#FF9800' }}>{serverError}</p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { reset(); setOpen(false) }}
                className="font-heading font-semibold text-sm text-on-surface-variant hover:text-on-surface transition-colors px-3 py-2"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 px-4 py-2 rounded font-heading font-semibold text-sm disabled:opacity-50 transition-opacity"
                style={{ background: 'linear-gradient(180deg, #54e16d 0%, #00AE42 100%)', color: '#003918' }}
              >
                <Plus size={13} strokeWidth={2} />
                {isSubmitting ? 'Guardando...' : 'Enviar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

// ─── Card de pendiente ────────────────────────────────────────────────────────

function PendienteCard({
  pendiente,
  onRecibir,
  onCrearIngreso,
}: {
  pendiente: InsumoPendiente
  onRecibir?: (id: string) => void
  onCrearIngreso?: (p: InsumoPendiente) => void
}) {
  const [loading, setLoading] = useState(false)

  async function handleRecibir() {
    if (!onRecibir) return
    setLoading(true)
    try {
      await onRecibir(pendiente.id)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-surface-low rounded px-4 py-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-body text-on-surface text-sm font-medium truncate">
            {pendiente.articulo}
          </p>
          <p className="font-body text-on-surface-variant text-xs mt-0.5">
            {pendiente.destino}
          </p>
        </div>
        <EstadoChip estado={pendiente.estado} />
      </div>

      {/* Data row */}
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <div>
          <p className="font-body text-on-surface-variant text-xs uppercase tracking-widest">Cajas</p>
          <p className="font-body text-on-surface text-sm tabular-nums font-medium">{pendiente.cantidad}</p>
        </div>
        <div>
          <p className="font-body text-on-surface-variant text-xs uppercase tracking-widest">Enviado</p>
          <p className="font-body text-on-surface text-sm tabular-nums">{formatFecha(pendiente.fechaEnvio)}</p>
        </div>
        {pendiente.fechaRetornoEstimada && (
          <div>
            <p className="font-body text-on-surface-variant text-xs uppercase tracking-widest">Retorno est.</p>
            <p className="font-body text-on-surface text-sm tabular-nums">{formatFecha(pendiente.fechaRetornoEstimada)}</p>
          </div>
        )}
        {pendiente.fechaRecibido && (
          <div>
            <p className="font-body text-on-surface-variant text-xs uppercase tracking-widest">Recibido</p>
            <p className="font-body text-on-surface text-sm tabular-nums">{formatFecha(pendiente.fechaRecibido)}</p>
          </div>
        )}
      </div>

      {pendiente.notas && (
        <p className="font-body text-on-surface-variant text-xs italic">{pendiente.notas}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {pendiente.estado === 'en_esterilizacion' && onRecibir && (
          <button
            onClick={handleRecibir}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded font-heading font-semibold text-xs disabled:opacity-50 transition-opacity"
            style={{ background: 'linear-gradient(180deg, #54e16d 0%, #00AE42 100%)', color: '#003918' }}
          >
            <Check size={12} strokeWidth={2} />
            {loading ? 'Marcando...' : 'Marcar como recibido'}
          </button>
        )}
        {pendiente.estado === 'recibido' && onCrearIngreso && (
          <button
            onClick={() => onCrearIngreso(pendiente)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded font-heading font-semibold text-xs bg-surface-high hover:bg-surface-bright transition-colors text-on-surface"
          >
            <PackagePlus size={12} strokeWidth={1.5} />
            Crear ingreso
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PendientesPage() {
  const token = useAuthStore((s) => s.token)
  const navigate = useNavigate()

  const [pendientes, setPendientes] = useState<InsumoPendiente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiClient
      .get<InsumoPendiente[]>('/pendientes', token)
      .then(setPendientes)
      .catch(() => setError('No se pudo cargar los pendientes'))
      .finally(() => setLoading(false))
  }, [token])

  const enEsterilizacion = pendientes.filter((p) => p.estado === 'en_esterilizacion')
  const recibidos = pendientes.filter((p) => p.estado === 'recibido')

  function handleCreated(p: InsumoPendiente) {
    setPendientes((prev) => [p, ...prev])
  }

  async function handleRecibir(id: string) {
    const updated = await apiClient.put<InsumoPendiente>(`/pendientes/${id}/recibir`, {}, token)
    setPendientes((prev) => prev.map((p) => (p.id === id ? updated : p)))
  }

  function handleCrearIngreso(p: InsumoPendiente) {
    navigate('/ingresos', {
      state: { productoNombre: p.articulo, categoria: 'frasco' },
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-on-surface font-semibold text-xl">Insumos Pendientes</h1>
          <p className="font-body text-on-surface-variant text-sm mt-0.5">
            Frascos enviados a esterilización
            {!loading && !error && (
              <span className="ml-1">
                · {enEsterilizacion.length} en esterilización · {recibidos.length} recibidos
              </span>
            )}
          </p>
        </div>
        <EnviarModal onCreated={handleCreated} />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <p className="font-body text-on-surface-variant text-sm">Cargando...</p>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-48">
          <p className="font-body text-sm" style={{ color: '#FF9800' }}>{error}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* En esterilización */}
          <section className="space-y-3">
            <h2 className="font-heading text-on-surface-variant text-xs uppercase tracking-widest font-semibold">
              En esterilización
              {enEsterilizacion.length > 0 && (
                <span
                  className="ml-2 inline-block font-body text-xs font-medium px-2 py-0.5 rounded"
                  style={{ color: '#FF9800', backgroundColor: 'rgba(255,152,0,0.10)' }}
                >
                  {enEsterilizacion.length}
                </span>
              )}
            </h2>
            {enEsterilizacion.length === 0 ? (
              <div className="bg-surface-low rounded px-4 py-8 text-center">
                <p className="font-body text-on-surface-variant text-sm">
                  No hay frascos en esterilización.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {enEsterilizacion.map((p) => (
                  <PendienteCard
                    key={p.id}
                    pendiente={p}
                    onRecibir={handleRecibir}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Recibidos */}
          <section className="space-y-3">
            <h2 className="font-heading text-on-surface-variant text-xs uppercase tracking-widest font-semibold">
              Recibidos
              {recibidos.length > 0 && (
                <span
                  className="ml-2 inline-block font-body text-xs font-medium px-2 py-0.5 rounded"
                  style={{ color: '#00AE42', backgroundColor: 'rgba(0,174,66,0.10)' }}
                >
                  {recibidos.length}
                </span>
              )}
            </h2>
            {recibidos.length === 0 ? (
              <div className="bg-surface-low rounded px-4 py-8 text-center">
                <p className="font-body text-on-surface-variant text-sm">
                  No hay insumos recibidos todavía.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recibidos.map((p) => (
                  <PendienteCard
                    key={p.id}
                    pendiente={p}
                    onCrearIngreso={handleCrearIngreso}
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
