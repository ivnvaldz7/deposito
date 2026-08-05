import { useState } from 'react'
import { type Transportista } from '../lib/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/auth-store'
import { useTransportistas, useCreateTransportista, useUpdateTransportista } from '../queries'
import { toast } from '@/lib/toast'

interface TransportistaFormState {
  nombre: string
  direccion: string
}

const FORM_VACIO: TransportistaFormState = { nombre: '', direccion: '' }

type ModalEstado = 'nuevo' | { transportista: Transportista } | null

interface TransportistaFormModalProps {
  open: boolean
  transportista: Transportista | null
  form: TransportistaFormState
  error: string | null
  guardando: boolean
  esNuevo: boolean
  onChange: (campo: keyof TransportistaFormState, valor: string) => void
  onClose: () => void
  onGuardar: () => void
  onToggleActivo: () => void
}

function TransportistaFormModal({
  open,
  transportista,
  form,
  error,
  guardando,
  esNuevo,
  onChange,
  onClose,
  onGuardar,
  onToggleActivo,
}: TransportistaFormModalProps) {
  if (!open) return null
  const titulo = esNuevo ? 'Nuevo transportista' : 'Editar transportista'

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/60 lg:flex lg:items-center lg:justify-center lg:p-6"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        data-testid="transportista-form-modal"
        className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-surface-container-low shadow-float animate-slide-up lg:static lg:mx-auto lg:max-h-[calc(100dvh-3rem)] lg:w-full lg:max-w-md lg:animate-none lg:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
          <h3 className="text-[15px] font-bold text-on-surface">{titulo}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-surface-high hover:text-on-surface"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[max(env(safe-area-inset-bottom),1rem)] lg:pb-6">
          {error && (
            <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body text-[12px] font-medium text-error">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="Nombre" className="font-body text-[11px] text-outline">
              Nombre
            </label>
            <input
              id="Nombre"
              value={form.nombre}
              maxLength={160}
              onChange={(e) => onChange('nombre', e.target.value)}
              className="input-field mt-1"
            />
          </div>
          <div>
            <label htmlFor="Dirección" className="font-body text-[11px] text-outline">
              Dirección
            </label>
            <input
              id="Dirección"
              value={form.direccion}
              maxLength={240}
              onChange={(e) => onChange('direccion', e.target.value)}
              className="input-field mt-1"
            />
          </div>
        </div>

        <div className="shrink-0 border-t border-white/10 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] lg:pb-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!esNuevo && (
              <button
                type="button"
                onClick={onToggleActivo}
                disabled={guardando}
                className="mr-auto rounded-full border border-error/40 px-4 py-2 font-body text-[12px] font-semibold text-error transition hover:bg-error/10"
              >
                {transportista !== null && transportista.activo ? 'Desactivar' : 'Activar'}
              </button>
            )}
            <Button variant="outline" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={onGuardar} loading={guardando}>
              {esNuevo ? 'Crear' : 'Guardar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TransportistasPage() {
  const user = useAuthStore((state) => state.user)
  const rol = user?.apps?.['ale-bet']?.rol ?? ''
  const sinAcceso = rol !== 'admin' && rol !== 'facturacion'

  const { data: transportistas = [], isLoading, error } = useTransportistas({ enabled: !sinAcceso })
  const createMutation = useCreateTransportista()
  const updateMutation = useUpdateTransportista()

  const [busqueda, setBusqueda] = useState('')
  const [modal, setModal] = useState<ModalEstado>(null)
  const [form, setForm] = useState<TransportistaFormState>(FORM_VACIO)
  const [formError, setFormError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState<Transportista | null>(null)
  const [ejecutando, setEjecutando] = useState(false)

  if (sinAcceso) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-on-surface">Transportistas</h1>
          <p className="font-body text-[13px] text-on-surface-variant">Gestión de transportistas</p>
        </div>
        <p className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center font-body text-[13px] text-on-surface-variant">
          Sin acceso a esta sección.
        </p>
      </div>
    )
  }

  const q = busqueda.trim().toLowerCase()
  const filtrados = q
    ? transportistas.filter((t) => t.nombre.toLowerCase().includes(q))
    : transportistas

  function abrirNuevo() {
    setModal('nuevo')
    setForm(FORM_VACIO)
    setFormError(null)
  }

  function abrirEdicion(t: Transportista) {
    setModal({ transportista: t })
    setForm({ nombre: t.nombre, direccion: t.direccion })
    setFormError(null)
  }

  function cerrarModal() {
    setModal(null)
    setFormError(null)
  }

  function validarFormulario(): string | null {
    if (form.nombre.trim().length < 2) return 'El nombre debe tener al menos 2 caracteres'
    if (form.direccion.trim().length < 2) return 'La dirección debe tener al menos 2 caracteres'
    return null
  }

  async function guardar() {
    const invalido = validarFormulario()
    if (invalido) {
      setFormError(invalido)
      return
    }
    setGuardando(true)
    try {
      if (modal === 'nuevo') {
        await createMutation.mutateAsync({ nombre: form.nombre.trim(), direccion: form.direccion.trim() })
        toast.success('Transportista creado')
      } else if (modal) {
        await updateMutation.mutateAsync({
          id: modal.transportista.id,
          nombre: form.nombre.trim(),
          direccion: form.direccion.trim(),
        })
        toast.success('Transportista actualizado')
      }
      cerrarModal()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  async function toggleActivo(transportista: Transportista) {
    setEjecutando(true)
    try {
      await updateMutation.mutateAsync({ id: transportista.id, activo: !transportista.activo })
      toast.success(transportista.activo ? 'Transportista desactivado' : 'Transportista activado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setEjecutando(false)
      setConfirmar(null)
    }
  }

  if (isLoading) return <p className="font-body text-sm text-on-surface-variant">Cargando transportistas...</p>
  if (error) return <p className="font-body text-sm text-error">{error instanceof Error ? error.message : 'Error al cargar transportistas'}</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-on-surface">Transportistas</h1>
          <p className="font-body text-[13px] text-on-surface-variant">Gestión de transportistas</p>
        </div>
        <button
          type="button"
          onClick={abrirNuevo}
          className="shrink-0 rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20"
        >
          + Nuevo transportista
        </button>
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="input-field max-w-sm"
      />

      {filtrados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center font-body text-[13px] text-on-surface-variant">
          {transportistas.length === 0 ? 'No hay transportistas.' : 'No hay resultados.'}
        </p>
      ) : (
        <>
          <div className="space-y-3 md:hidden" data-testid="transportistas-mobile">
            {filtrados.map((t) => (
              <article key={t.id} className="rounded-xl border border-white/10 bg-surface-container-high p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-on-surface">{t.nombre}</p>
                    <p className="mt-0.5 truncate font-body text-[11px] text-outline">{t.direccion}</p>
                  </div>
                  <Badge variant={t.activo ? 'success' : 'default'}>{t.activo ? 'Activo' : 'Inactivo'}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-end border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={() => abrirEdicion(t)}
                    className="min-h-11 rounded-full border border-primary px-4 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20"
                  >
                    Editar
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-xl bg-surface-container-high md:block" data-testid="transportistas-table">
            <table className="w-full text-left font-body text-[12px]">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.8px] text-outline">
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-5 py-3 font-medium">Dirección</th>
                  <th className="px-5 py-3 font-medium text-center">Estado</th>
                  <th className="px-5 py-3 font-medium text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((t) => (
                  <tr key={t.id} className="border-b border-white/10 last:border-0">
                    <td className="px-5 py-4 font-semibold text-on-surface">{t.nombre}</td>
                    <td className="px-5 py-4 text-outline">{t.direccion}</td>
                    <td className="px-5 py-4 text-center">
                      <Badge variant={t.activo ? 'success' : 'default'}>{t.activo ? 'Activo' : 'Inactivo'}</Badge>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => abrirEdicion(t)}
                        className="rounded-full border border-primary px-4 py-2 font-body text-[11px] font-semibold text-primary transition hover:bg-primary/20"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <TransportistaFormModal
        open={modal !== null}
        transportista={modal !== null && modal !== 'nuevo' ? modal.transportista : null}
        form={form}
        error={formError}
        guardando={guardando}
        esNuevo={modal === 'nuevo'}
        onChange={(campo, valor) => setForm((prev) => ({ ...prev, [campo]: valor }))}
        onClose={cerrarModal}
        onGuardar={() => void guardar()}
        onToggleActivo={() => {
          if (modal !== null && modal !== 'nuevo') {
            setConfirmar(modal.transportista)
            cerrarModal()
          }
        }}
      />

      {confirmar && (
        <div
          data-testid="confirm-dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmar(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cambiar estado del transportista"
            className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container-low p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[16px] font-bold text-on-surface">
              {confirmar.activo ? 'Desactivar transportista' : 'Activar transportista'}
            </h2>
            <p className="mt-2 font-body text-[13px] leading-relaxed text-on-surface-variant">
              {confirmar.activo
                ? `Se desactivará a ${confirmar.nombre}. Dejará de aparecer en la lista y en nuevas búsquedas.`
                : `Se volverá a activar a ${confirmar.nombre}.`}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setConfirmar(null)} disabled={ejecutando}>
                Volver
              </Button>
              <Button onClick={() => void toggleActivo(confirmar)} loading={ejecutando}>
                {confirmar.activo ? 'Desactivar' : 'Activar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
