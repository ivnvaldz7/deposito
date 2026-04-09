import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient, ApiError } from '@/lib/api-client'
import { toast } from '@/lib/toast'
import { EstadoChip } from './estado-chip'
import type { Acta, ActaItem } from './types'

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const CATEGORIA_LABEL: Record<string, string> = {
  droga: 'Droga',
  estuche: 'Estuche',
  etiqueta: 'Etiqueta',
  frasco: 'Frasco',
}

const CONDICION_LABEL: Record<string, string> = {
  bueno: 'Bueno',
  regular: 'Regular',
  malo: 'Malo',
}

interface DrogaLote {
  id: string
  lote: string | null
  vencimiento: string | null
  cantidad: number
}

function ProgressBar({ distribuida, ingresada }: { distribuida: number; ingresada: number }) {
  const pct = ingresada === 0 ? 0 : Math.round((distribuida / ingresada) * 100)
  const color = pct === 100 ? '#00AE42' : pct > 0 ? '#2196F3' : '#FF9800'

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

function ItemRow({
  item,
  actaId,
  isEncargado,
  onDistribuido,
}: {
  item: ActaItem
  actaId: string
  isEncargado: boolean
  onDistribuido: (updated: ActaItem) => void
}) {
  const token = useAuthStore((s) => s.token)
  const remaining = item.cantidadIngresada - item.cantidadDistribuida
  const [distributing, setDistributing] = useState(false)
  const [value, setValue] = useState(String(remaining))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [lotes, setLotes] = useState<DrogaLote[]>([])
  const [loadingLotes, setLoadingLotes] = useState(false)
  const [selectedLoteId, setSelectedLoteId] = useState('')
  const [justificacion, setJustificacion] = useState('')

  const defaultLoteId = lotes[0]?.id ?? ''
  const isOverride = selectedLoteId !== '' && selectedLoteId !== defaultLoteId

  useEffect(() => {
    setValue(String(item.cantidadIngresada - item.cantidadDistribuida))
  }, [item.cantidadDistribuida, item.cantidadIngresada])

  useEffect(() => {
    if (!distributing || item.categoria !== 'droga') return
    setLoadingLotes(true)
    apiClient
      .get<DrogaLote[]>(`/drogas?nombre=${encodeURIComponent(item.productoNombre)}`, token)
      .then((data) => {
        const sorted = [...data].sort((a, b) => {
          if (!a.vencimiento && !b.vencimiento) return 0
          if (!a.vencimiento) return 1
          if (!b.vencimiento) return -1
          return new Date(a.vencimiento).getTime() - new Date(b.vencimiento).getTime()
        })
        setLotes(sorted)
        setSelectedLoteId(sorted[0]?.id ?? '')
      })
      .catch(() => {})
      .finally(() => setLoadingLotes(false))
  }, [distributing, item.categoria, item.productoNombre, token])

  function handleCancelDistribuir() {
    setDistributing(false)
    setError(null)
    setLotes([])
    setSelectedLoteId('')
    setJustificacion('')
  }

  async function confirm() {
    const num = Number(value)
    const rem = item.cantidadIngresada - item.cantidadDistribuida
    if (!Number.isInteger(num) || num <= 0) {
      setError('Debe ser entero positivo')
      return
    }
    if (num > rem) {
      setError(`Máximo disponible: ${rem}`)
      return
    }
    if (item.categoria === 'droga' && isOverride && !justificacion.trim()) {
      setError('Justificación requerida al cambiar el lote FIFO')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = { cantidad: num }
      if (item.categoria === 'droga' && selectedLoteId) {
        payload.loteId = selectedLoteId
        if (isOverride && justificacion.trim()) {
          payload.justificacion = justificacion.trim()
        }
      }
      const res = await apiClient.post<{ item: ActaItem }>(
        `/actas/${actaId}/items/${item.id}/distribuir`,
        payload,
        token
      )
      onDistribuido(res.item)
      toast.success(`Distribución registrada para "${item.productoNombre}".`)
      setDistributing(false)
      setLotes([])
      setSelectedLoteId('')
      setJustificacion('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al distribuir')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-surface-low rounded px-4 py-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-body text-on-surface text-sm truncate">{item.productoNombre}</p>
          <p className="font-body text-on-surface-variant text-xs mt-0.5">
            {CATEGORIA_LABEL[item.categoria] ?? item.categoria} · Lote: {item.lote}
            {item.vencimiento && (
              <> · Vence: {new Date(item.vencimiento).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {remaining === 0 && (
            <span
              className="inline-block font-body text-xs font-medium px-2 py-0.5 rounded"
              style={{ color: '#00AE42', backgroundColor: 'rgba(0,174,66,0.10)' }}
            >
              Distribuido
            </span>
          )}
          {remaining > 0 && item.cantidadDistribuida > 0 && (
            <span
              className="inline-block font-body text-xs font-medium px-2 py-0.5 rounded"
              title="Distribución parcial — quedan unidades por distribuir"
              style={{ color: '#2196F3', backgroundColor: 'rgba(33,150,243,0.10)' }}
            >
              Parcial
            </span>
          )}
          {remaining > 0 && item.cantidadDistribuida === 0 && (
            <span
              className="inline-block font-body text-xs font-medium px-2 py-0.5 rounded"
              style={{ color: '#FF9800', backgroundColor: 'rgba(255,152,0,0.10)' }}
            >
              Pendiente
            </span>
          )}
          {isEncargado && remaining > 0 && !distributing && (
            <button
              type="button"
              onClick={() => {
                setDistributing(true)
                setError(null)
              }}
              className="px-3 py-1 rounded font-heading font-semibold text-xs transition-colors"
              style={{ background: 'rgba(84,225,109,0.15)', color: '#54e16d' }}
            >
              Distribuir
            </button>
          )}
        </div>
      </div>

      <ProgressBar distribuida={item.cantidadDistribuida} ingresada={item.cantidadIngresada} />

      <div className="bg-surface-high/40 rounded px-3 py-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="font-heading text-on-surface text-xs uppercase tracking-widest font-semibold">
            Control de Calidad
          </p>
          <span
            className="inline-block font-body text-xs font-medium px-2 py-0.5 rounded"
            style={
              item.aprobadoCalidad
                ? { color: '#00AE42', backgroundColor: 'rgba(0,174,66,0.10)' }
                : { color: '#f44336', backgroundColor: 'rgba(244,67,54,0.10)' }
            }
          >
            {item.aprobadoCalidad ? 'Aprobado' : 'No aprobado'}
          </span>
        </div>

        {item.temperaturaTransporte && (
          <div className="flex items-center justify-between gap-3">
            <span className="font-body text-on-surface-variant text-xs uppercase tracking-widest">
              Transporte
            </span>
            <span className="font-body text-on-surface text-sm">{item.temperaturaTransporte}</span>
          </div>
        )}

        {item.condicionEmbalaje && (
          <div className="flex items-center justify-between gap-3">
            <span className="font-body text-on-surface-variant text-xs uppercase tracking-widest">
              Embalaje
            </span>
            <span className="font-body text-on-surface text-sm">
              {CONDICION_LABEL[item.condicionEmbalaje] ?? item.condicionEmbalaje}
            </span>
          </div>
        )}

        {item.observacionesCalidad && (
          <div className="space-y-1">
            <span className="font-body text-on-surface-variant text-xs uppercase tracking-widest block">
              Observaciones
            </span>
            <p className="font-body text-on-surface text-sm">{item.observacionesCalidad}</p>
          </div>
        )}
      </div>

      {distributing && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label htmlFor={`acta-detalle-distribuir-${item.id}`} className="sr-only">
              Cantidad a distribuir para {item.productoNombre}
            </label>
            <input
              id={`acta-detalle-distribuir-${item.id}`}
              type="number"
              min="1"
              max={remaining}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirm()
                if (e.key === 'Escape') handleCancelDistribuir()
              }}
              className="input-field w-28 py-1.5 text-sm"
              autoFocus
              disabled={saving}
            />
            <button
              type="button"
              onClick={confirm}
              disabled={saving}
              className="px-3 py-1.5 rounded font-heading font-semibold text-xs transition-opacity disabled:opacity-50"
              style={{
                background: 'linear-gradient(180deg, #54e16d 0%, #00AE42 100%)',
                color: '#003918',
              }}
            >
              {saving ? '...' : 'Confirmar'}
            </button>
            <button
              type="button"
              onClick={handleCancelDistribuir}
              disabled={saving}
              className="font-body text-on-surface-variant text-xs hover:text-on-surface transition-colors"
            >
              Cancelar
            </button>
          </div>

          {item.categoria === 'droga' && (
            <div className="space-y-2 pl-1">
              {loadingLotes ? (
                <p className="font-body text-xs text-on-surface-variant">Cargando lotes...</p>
              ) : lotes.length > 0 ? (
                <div className="space-y-1">
                  <label
                    htmlFor={`acta-lote-select-${item.id}`}
                    className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium"
                  >
                    Lote destino
                  </label>
                  <select
                    id={`acta-lote-select-${item.id}`}
                    value={selectedLoteId}
                    onChange={(e) => {
                      setSelectedLoteId(e.target.value)
                      setJustificacion('')
                    }}
                    className="input-field text-sm"
                    disabled={saving}
                  >
                    {lotes.map((l, idx) => (
                      <option key={l.id} value={l.id}>
                        {l.lote ?? 'Sin lote'}
                        {l.vencimiento
                          ? ` · ${new Date(l.vencimiento).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}`
                          : ''}
                        {' '}· {l.cantidad} uds
                        {idx === 0 ? ' — FIFO' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {isOverride && (
                <div className="space-y-1">
                  <label
                    htmlFor={`acta-justificacion-${item.id}`}
                    className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium"
                  >
                    Justificación <span className="normal-case tracking-normal opacity-60">(requerida)</span>
                  </label>
                  <textarea
                    id={`acta-justificacion-${item.id}`}
                    value={justificacion}
                    onChange={(e) => setJustificacion(e.target.value)}
                    rows={2}
                    placeholder="Explicá por qué se cambia el lote FIFO..."
                    className="input-field text-sm resize-none"
                    disabled={saving}
                  />
                </div>
              )}
            </div>
          )}

          {error && <p className="font-body text-error text-xs">{error}</p>}
        </div>
      )}
    </div>
  )
}

export function ActaDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.role === 'encargado'

  const [acta, setActa] = useState<Acta | null>(null)
  const [items, setItems] = useState<ActaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!id) return
    apiClient
      .get<Acta>(`/actas/${id}`, token)
      .then((data) => {
        setActa(data)
        setItems(data.items ?? [])
      })
      .catch(() => setError('No se pudo cargar el acta'))
      .finally(() => setLoading(false))
  }, [id, token])

  useEffect(() => {
    load()
  }, [load])

  function handleDistribuido(updated: ActaItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
    const updatedItems = items.map((i) => (i.id === updated.id ? updated : i))
    const todosCompletos = updatedItems.every((i) => i.cantidadDistribuida >= i.cantidadIngresada)
    const hayDistribucion = updatedItems.some((i) => i.cantidadDistribuida > 0)
    const nuevoEstado = todosCompletos ? 'completada' : hayDistribucion ? 'parcial' : 'pendiente'
    setActa((prev) => (prev ? { ...prev, estado: nuevoEstado } : prev))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="font-body text-on-surface-variant text-sm">Cargando...</p>
      </div>
    )
  }

  if (error || !acta) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="font-body text-error text-sm">{error ?? 'Acta no encontrada'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/actas')}
        className="flex items-center gap-2 font-body text-on-surface-variant text-sm hover:text-on-surface transition-colors"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Volver a actas
      </button>

      <div className="bg-surface-low rounded px-5 py-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-on-surface font-semibold text-xl">
              Acta {formatFecha(acta.fecha)}
            </h1>
            <p className="font-body text-on-surface-variant text-xs mt-1">
              Creada por {acta.user.name}
            </p>
          </div>
          <EstadoChip estado={acta.estado} />
        </div>
        {acta.notas && <p className="font-body text-on-surface-variant text-sm">{acta.notas}</p>}
        <p className="font-body text-on-surface-variant text-xs">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center justify-center h-24 bg-surface-low rounded">
          <p className="font-body text-on-surface-variant text-sm">Sin items registrados.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              actaId={acta.id}
              isEncargado={isEncargado}
              onDistribuido={handleDistribuido}
            />
          ))}
        </div>
      )}
    </div>
  )
}
