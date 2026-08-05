import { useState } from 'react'
import { type Cliente } from '../lib/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/auth-store'
import { useClientes, useCreateCliente, useUpdateCliente } from '../queries'
import { toast } from '@/lib/toast'
import { BottomSheet } from '../components/BottomSheet'
interface ClienteFormState {
  nombre: string
  contacto: string
  referencia: string
  direccion: string
  localidad: string
  provincia: string
  cuit: string
  condicionIva: string
  condicionVenta: string
}

const FORM_VACIO: ClienteFormState = {
  nombre: '',
  contacto: '',
  referencia: '',
  direccion: '',
  localidad: '',
  provincia: '',
  cuit: '',
  condicionIva: '',
  condicionVenta: '',
}

type ModalEstado = 'nuevo' | { cliente: Cliente } | null

function cuitValido(cuit: string): boolean {
  const t = cuit.trim()
  return t === '' || /^\d{11}$/.test(t)
}

function estadoBadge(estado: Cliente['estado']) {
  return estado === 'VALIDADO' ? (
    <Badge variant="success">Validado</Badge>
  ) : (
    <Badge variant="warning">Pendiente</Badge>
  )
}

interface CampoProps {
  label: string
  value: string
  maxLength?: number
  tipo?: 'text' | 'tel'
  onChange: (valor: string) => void
}

function Campo({ label, value, maxLength, tipo = 'text', onChange }: CampoProps) {
  return (
    <div>
      <label htmlFor={label} className="font-body text-[11px] text-outline">
        {label}
      </label>
      <input
        id={label}
        type={tipo}
        inputMode={tipo === 'tel' ? 'numeric' : undefined}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field mt-1"
      />
    </div>
  )
}

interface ClienteFormModalProps {
  open: boolean
  cliente: Cliente | null
  form: ClienteFormState
  error: string | null
  guardando: boolean
  esNuevo: boolean
  onChange: (campo: keyof ClienteFormState, valor: string) => void
  onClose: () => void
  onGuardar: (validar: boolean) => void
  onToggleActivo: () => void
}

function ClienteFormModal({
  open,
  cliente,
  form,
  error,
  guardando,
  esNuevo,
  onChange,
  onClose,
  onGuardar,
  onToggleActivo,
}: ClienteFormModalProps) {
  const pendiente = !esNuevo && cliente !== null && cliente.estado === 'PENDIENTE_CLIENTE'
  const titulo = esNuevo ? 'Nuevo cliente' : 'Editar cliente'

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={titulo}
      desktop="modal"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!esNuevo && (
            <button
              type="button"
              onClick={onToggleActivo}
              disabled={guardando}
              className="mr-auto rounded-full border border-error/40 px-4 py-2 font-body text-[12px] font-semibold text-error transition hover:bg-error/10"
            >
              {cliente !== null && cliente.activo ? 'Desactivar' : 'Activar'}
            </button>
          )}
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          {pendiente && (
            <Button onClick={() => onGuardar(true)} loading={guardando}>
              VALIDAR CLIENTE
            </Button>
          )}
          <Button variant="outline" onClick={() => onGuardar(false)} loading={guardando}>
            {esNuevo ? 'Crear' : 'Guardar'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        {error && (
          <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body text-[12px] font-medium text-error">
            {error}
          </p>
        )}
        <Campo label="Nombre" value={form.nombre} maxLength={120} onChange={(v) => onChange('nombre', v)} />
        <Campo label="Contacto" value={form.contacto} maxLength={120} onChange={(v) => onChange('contacto', v)} />
        <Campo label="Referencia" value={form.referencia} maxLength={120} onChange={(v) => onChange('referencia', v)} />
        <Campo label="Dirección" value={form.direccion} maxLength={200} onChange={(v) => onChange('direccion', v)} />
        {!esNuevo && (
          <>
            <Campo label="Localidad" value={form.localidad} maxLength={120} onChange={(v) => onChange('localidad', v)} />
            <Campo label="Provincia" value={form.provincia} maxLength={120} onChange={(v) => onChange('provincia', v)} />
            <Campo label="CUIT" value={form.cuit} maxLength={11} tipo="tel" onChange={(v) => onChange('cuit', v)} />
            <Campo label="Condición IVA" value={form.condicionIva} maxLength={80} onChange={(v) => onChange('condicionIva', v)} />
            <Campo label="Condición de venta" value={form.condicionVenta} maxLength={80} onChange={(v) => onChange('condicionVenta', v)} />
          </>
        )}
      </div>
    </BottomSheet>
  )
}

interface ClienteCardProps {
  cliente: Cliente
  puedeEditar: boolean
  onEditar: () => void
}

function ClienteCard({ cliente, puedeEditar, onEditar }: ClienteCardProps) {
  return (
    <article className="rounded-xl border border-white/10 bg-surface-container-high p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-on-surface">{cliente.nombre}</p>
          <p className="mt-0.5 truncate font-body text-[11px] text-on-surface-variant">
            {cliente.contacto ?? cliente.referencia ?? '—'}
          </p>
          {cliente.direccion && <p className="truncate font-body text-[11px] text-outline">{cliente.direccion}</p>}
        </div>
        {estadoBadge(cliente.estado)}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
        <Badge variant={cliente.activo ? 'success' : 'default'}>{cliente.activo ? 'Activo' : 'Inactivo'}</Badge>
        {puedeEditar && (
          <button
            type="button"
            onClick={onEditar}
            className="ml-auto min-h-11 rounded-full border border-primary px-4 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20"
          >
            Editar
          </button>
        )}
      </div>
    </article>
  )
}

export default function ClientesPage() {
  const user = useAuthStore((state) => state.user)
  const rol = user?.apps?.['ale-bet']?.rol ?? ''
  const esFacturacion = rol === 'admin' || rol === 'facturacion'
  const puedeCrear = esFacturacion || rol === 'vendedor'

  const { data: clientes = [], isLoading, error } = useClientes()
  const createMutation = useCreateCliente()
  const updateMutation = useUpdateCliente()

  const [busqueda, setBusqueda] = useState('')
  const [modal, setModal] = useState<ModalEstado>(null)
  const [form, setForm] = useState<ClienteFormState>(FORM_VACIO)
  const [formError, setFormError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState<Cliente | null>(null)
  const [ejecutando, setEjecutando] = useState(false)

  const pendientes = clientes.filter((c) => c.estado === 'PENDIENTE_CLIENTE')
  const validados = clientes.filter((c) => c.estado === 'VALIDADO')
  const q = busqueda.trim().toLowerCase()
  const filtrados = q
    ? validados.filter(
        (c) => c.nombre.toLowerCase().includes(q) || (c.contacto?.toLowerCase().includes(q) ?? false),
      )
    : validados

  function abrirNuevo() {
    setModal('nuevo')
    setForm(FORM_VACIO)
    setFormError(null)
  }

  function abrirEdicion(c: Cliente) {
    setModal({ cliente: c })
    setForm({
      nombre: c.nombre,
      contacto: c.contacto ?? '',
      referencia: c.referencia ?? '',
      direccion: c.direccion ?? '',
      localidad: c.localidad ?? '',
      provincia: c.provincia ?? '',
      cuit: c.cuit ?? '',
      condicionIva: c.condicionIva ?? '',
      condicionVenta: c.condicionVenta ?? '',
    })
    setFormError(null)
  }

  function cerrarModal() {
    setModal(null)
    setFormError(null)
  }

  function cambiarForm(campo: keyof ClienteFormState, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  function validarFormulario(): string | null {
    if (form.nombre.trim().length < 2) return 'El nombre debe tener al menos 2 caracteres'
    if (!cuitValido(form.cuit)) return 'El CUIT debe tener 11 dígitos'
    return null
  }

  async function guardar(validar: boolean) {
    const invalido = validarFormulario()
    if (invalido) {
      setFormError(invalido)
      return
    }
    setGuardando(true)
    try {
      if (modal === 'nuevo') {
        await createMutation.mutateAsync({
          nombre: form.nombre.trim(),
          contacto: form.contacto.trim() || undefined,
          referencia: form.referencia.trim() || undefined,
          direccion: form.direccion.trim() || undefined,
        })
        toast.success(rol === 'vendedor' ? 'Cliente creado · quedará pendiente de validación' : 'Cliente creado')
      } else if (modal) {
        await updateMutation.mutateAsync({
          id: modal.cliente.id,
          nombre: form.nombre.trim(),
          contacto: form.contacto.trim() || null,
          referencia: form.referencia.trim() || null,
          direccion: form.direccion.trim() || null,
          localidad: form.localidad.trim() || null,
          provincia: form.provincia.trim() || null,
          cuit: form.cuit.trim() || null,
          condicionIva: form.condicionIva.trim() || null,
          condicionVenta: form.condicionVenta.trim() || null,
          ...(validar ? { estado: 'VALIDADO' as const } : {}),
        })
        toast.success(validar ? 'Cliente validado' : 'Cliente actualizado')
      }
      cerrarModal()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  async function toggleActivo(cliente: Cliente) {
    setEjecutando(true)
    try {
      await updateMutation.mutateAsync({ id: cliente.id, activo: !cliente.activo })
      toast.success(cliente.activo ? 'Cliente desactivado' : 'Cliente activado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setEjecutando(false)
      setConfirmar(null)
    }
  }

  if (isLoading) return <p className="font-body text-sm text-on-surface-variant">Cargando clientes...</p>
  if (error) return <p className="font-body text-sm text-error">{error instanceof Error ? error.message : 'Error al cargar clientes'}</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-on-surface">Clientes</h1>
          <p className="font-body text-[13px] text-on-surface-variant">Gestión de clientes</p>
        </div>
        {puedeCrear && (
          <button
            type="button"
            onClick={abrirNuevo}
            className="shrink-0 rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20"
          >
            + Nuevo cliente
          </button>
        )}
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre o contacto..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="input-field max-w-sm"
      />

      {pendientes.length > 0 && (
        <section data-testid="clientes-pendientes" className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-bold text-on-surface">Clientes pendientes</h2>
            <Badge variant="warning">{pendientes.length}</Badge>
          </div>
          <p className="mt-1 font-body text-[12px] text-on-surface-variant">
            {rol === 'vendedor'
              ? 'Facturación completará los datos y validará el cliente'
              : 'Completá los datos fiscales y validá para habilitarlo en pedidos'}
          </p>
          <div className="mt-3 space-y-2">
            {pendientes.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-warning/20 bg-surface-container-high px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-on-surface">{c.nombre}</p>
                  <p className="truncate font-body text-[11px] text-on-surface-variant">
                    {c.contacto ?? c.referencia ?? 'Sin contacto ni referencia'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {estadoBadge(c.estado)}
                  {esFacturacion && (
                    <button
                      type="button"
                      onClick={() => abrirEdicion(c)}
                      className="rounded-full border border-primary px-3 py-1.5 font-body text-[11px] font-semibold text-primary transition hover:bg-primary/20"
                    >
                      Editar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {filtrados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center font-body text-[13px] text-on-surface-variant">
          {validados.length === 0 ? 'No hay clientes.' : 'No hay resultados.'}
        </p>
      ) : (
        <>
          <div className="space-y-3 md:hidden" data-testid="clientes-mobile">
            {filtrados.map((c) => (
              <ClienteCard key={c.id} cliente={c} puedeEditar={esFacturacion} onEditar={() => abrirEdicion(c)} />
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-xl bg-surface-container-high md:block" data-testid="clientes-table">
            <table className="w-full text-left font-body text-[12px]">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.8px] text-outline">
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-5 py-3 font-medium">Contacto</th>
                  <th className="px-5 py-3 font-medium">Dirección</th>
                  <th className="px-5 py-3 font-medium text-center">Estado</th>
                  <th className="px-5 py-3 font-medium text-center">Activo</th>
                  <th className="px-5 py-3 font-medium text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr key={c.id} className="border-b border-white/10 last:border-0">
                    <td className="px-5 py-4 font-semibold text-on-surface">{c.nombre}</td>
                    <td className="px-5 py-4 text-outline">{c.contacto ?? c.referencia ?? '—'}</td>
                    <td className="px-5 py-4 text-outline">{c.direccion ?? '—'}</td>
                    <td className="px-5 py-4 text-center">{estadoBadge(c.estado)}</td>
                    <td className="px-5 py-4 text-center">
                      <Badge variant={c.activo ? 'success' : 'default'}>{c.activo ? 'Activo' : 'Inactivo'}</Badge>
                    </td>
                    <td className="px-5 py-4 text-center">
                      {esFacturacion && (
                        <button
                          type="button"
                          onClick={() => abrirEdicion(c)}
                          className="rounded-full border border-primary px-4 py-2 font-body text-[11px] font-semibold text-primary transition hover:bg-primary/20"
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ClienteFormModal
        open={modal !== null}
        cliente={modal !== null && modal !== 'nuevo' ? modal.cliente : null}
        form={form}
        error={formError}
        guardando={guardando}
        esNuevo={modal === 'nuevo'}
        onChange={cambiarForm}
        onClose={cerrarModal}
        onGuardar={(validar) => void guardar(validar)}
        onToggleActivo={() => {
          if (modal !== null && modal !== 'nuevo') {
            setConfirmar(modal.cliente)
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
            aria-label="Cambiar estado del cliente"
            className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container-low p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[16px] font-bold text-on-surface">
              {confirmar.activo ? 'Desactivar cliente' : 'Activar cliente'}
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
