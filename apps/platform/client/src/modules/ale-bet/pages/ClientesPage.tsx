import { useState } from 'react'
import { type Cliente, type Transportista } from '../lib/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/auth-store'
import { useActualizarRemitoConfiguracion, useClientes, useCreateCliente, useRemitoConfiguracion, useTransportistas, useUpdateCliente } from '../queries'
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
  transportistaPredeterminadoId: string
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
  transportistaPredeterminadoId: '',
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
  puedeEditar: boolean
  transportistas: Transportista[]
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
  puedeEditar,
  transportistas,
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
          {!esNuevo && puedeEditar && (
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
          {pendiente && puedeEditar && (
            <Button onClick={() => onGuardar(true)} loading={guardando}>
              VALIDAR CLIENTE
            </Button>
          )}
          <Button variant={pendiente && puedeEditar ? "outline" : "primary"} onClick={() => onGuardar(false)} loading={guardando}>
            {esNuevo ? 'Crear cliente' : 'Guardar'}
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
        <div className="space-y-3">
          <h4 className="font-body text-[12px] font-semibold text-primary uppercase tracking-wider">Datos Generales</h4>
          <Campo label="Nombre" value={form.nombre} maxLength={120} onChange={(v) => onChange('nombre', v)} />
          <Campo label="Contacto" value={form.contacto} maxLength={120} onChange={(v) => onChange('contacto', v)} />
          <Campo label="Referencia" value={form.referencia} maxLength={120} onChange={(v) => onChange('referencia', v)} />
        </div>

        <div className="space-y-3 mt-5">
          <h4 className="font-body text-[12px] font-semibold text-primary uppercase tracking-wider">Domicilio</h4>
          <Campo label="Dirección" value={form.direccion} maxLength={200} onChange={(v) => onChange('direccion', v)} />
          {(puedeEditar || !esNuevo) && (
            <>
              <Campo label="Localidad" value={form.localidad} maxLength={120} onChange={(v) => onChange('localidad', v)} />
              <Campo label="Provincia" value={form.provincia} maxLength={120} onChange={(v) => onChange('provincia', v)} />
            </>
          )}
        </div>

        {(puedeEditar || !esNuevo) && (
          <div className="space-y-3 mt-5">
            <h4 className="font-body text-[12px] font-semibold text-primary uppercase tracking-wider">Datos Fiscales</h4>
            <Campo label="CUIT" value={form.cuit} maxLength={11} tipo="tel" onChange={(v) => onChange('cuit', v)} />
            <Campo label="Condición IVA" value={form.condicionIva} maxLength={80} onChange={(v) => onChange('condicionIva', v)} />
            <Campo label="Condición de venta" value={form.condicionVenta} maxLength={80} onChange={(v) => onChange('condicionVenta', v)} />
          </div>
        )}
        {puedeEditar && (
          <div className="space-y-2 mt-5">
            <h4 className="font-body text-[12px] font-semibold text-primary uppercase tracking-wider">Logística</h4>
            <label htmlFor="Transportista predeterminado" className="font-body text-[11px] text-outline">Transportista predeterminado</label>
            <select id="Transportista predeterminado" value={form.transportistaPredeterminadoId} onChange={(event) => onChange('transportistaPredeterminadoId', event.target.value)} className="input-field mt-1">
              <option value="">Sin transportista predeterminado</option>
              {transportistas.filter((transportista) => transportista.activo).map((transportista) => (
                <option key={transportista.id} value={transportista.id}>{transportista.nombre}</option>
              ))}
            </select>
            <p className="font-body text-[11px] text-on-surface-variant">Se propone automáticamente al emitir un remito; se puede cambiar para cada entrega.</p>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

function RemitoConfigurationCard({ enabled }: { enabled: boolean }) {
  const { data: configuration, isLoading } = useRemitoConfiguracion(enabled)
  const update = useActualizarRemitoConfiguracion()
  const [correlativo, setCorrelativo] = useState('')
  const [cai, setCai] = useState('')
  const [vencimiento, setVencimiento] = useState('')

  if (!enabled || isLoading || !configuration) return null
  const next = configuration.proximoCorrelativo === null ? null : `${configuration.puntoVenta}-${String(configuration.proximoCorrelativo).padStart(8, '0')}`
  const saveCorrelative = async () => {
    const value = Number(correlativo)
    if (!Number.isInteger(value) || value < 1) { toast.error('Ingresá un correlativo válido'); return }
    try { await update.mutateAsync({ proximoCorrelativo: value }); toast.success('Correlativo inicial configurado') } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo guardar el correlativo') }
  }
  const renewCai = async () => {
    if (!/^\d{14}$/.test(cai) || !vencimiento) { toast.error('Ingresá el CAI de 14 dígitos y su vencimiento'); return }
    try { await update.mutateAsync({ cai, caiVencimiento: new Date(`${vencimiento}T00:00:00.000Z`).toISOString() }); toast.success('CAI renovado') } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo renovar el CAI') }
  }
  return (
    <section className="rounded-2xl border border-white/10 bg-surface-container-high p-5" aria-label="Configuración de remitos">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-[16px] font-bold text-on-surface">Configuración de remitos</h2><p className="mt-1 font-body text-[12px] text-on-surface-variant">Punto de venta fijo: {configuration.puntoVenta}. Cada emisión reserva su número de forma segura.</p></div>
        <Badge variant={configuration.caiVencido ? 'warning' : 'success'}>{configuration.caiVencido ? 'CAI vencido' : 'CAI vigente'}</Badge>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 p-3">
          <p className="font-body text-[11px] uppercase tracking-wider text-outline">Numeración</p>
          {next ? <p className="mt-1 text-[14px] font-semibold text-on-surface">Próximo remito: {next}</p> : <><p className="mt-1 font-body text-[12px] text-on-surface-variant">Indicá una sola vez el próximo número a emitir.</p><div className="mt-3 flex gap-2"><input value={correlativo} inputMode="numeric" onChange={(event) => setCorrelativo(event.target.value.replace(/\D/g, ''))} placeholder="Ej: 13216" className="input-field" /><Button onClick={() => void saveCorrelative()} loading={update.isPending}>Guardar</Button></div></>}
        </div>
        <div className="rounded-xl border border-white/10 p-3">
          <p className="font-body text-[11px] uppercase tracking-wider text-outline">C.A.I.</p>
          <p className="mt-1 text-[14px] font-semibold text-on-surface">N° {configuration.cai} · Vto. {new Date(configuration.caiVencimiento).toLocaleDateString('es-AR', { timeZone: 'UTC' })}</p>
          {configuration.caiVencido && <><p className="mt-2 font-body text-[12px] text-warning">El CAI venció. Los remitos pueden seguir emitiéndose, pero renovalo para los próximos documentos.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={cai} inputMode="numeric" onChange={(event) => setCai(event.target.value.replace(/\D/g, ''))} placeholder="Nuevo CAI (14 dígitos)" className="input-field" /><input type="date" value={vencimiento} onChange={(event) => setVencimiento(event.target.value)} className="input-field" /></div><Button className="mt-2" onClick={() => void renewCai()} loading={update.isPending}>Renovar CAI</Button></>}
        </div>
      </div>
    </section>
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

import { can } from '@/lib/permissions'

export default function ClientesPage() {
  const user = useAuthStore((state) => state.user)
  const rol = user?.apps?.['ale-bet']?.rol ?? ''
  const esVendedor = rol === 'vendedor'
  const puedeCrear = can(user, 'ale-bet', 'clientes.create')
  const puedeEditar = can(user, 'ale-bet', 'clientes.update')
  const puedeConfigurarRemitos = can(user, 'ale-bet', 'remitos.create')

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
  const { data: transportistas = [] } = useTransportistas({ enabled: puedeEditar && modal !== null })

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
      transportistaPredeterminadoId: c.transportistaPredeterminadoId ?? '',
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
          ...(!esVendedor ? {
            ...(form.localidad.trim() ? { localidad: form.localidad.trim() } : {}),
            ...(form.provincia.trim() ? { provincia: form.provincia.trim() } : {}),
            ...(form.cuit.trim() ? { cuit: form.cuit.trim() } : {}),
            ...(form.condicionIva.trim() ? { condicionIva: form.condicionIva.trim() } : {}),
            ...(form.condicionVenta.trim() ? { condicionVenta: form.condicionVenta.trim() } : {}),
            ...(form.transportistaPredeterminadoId ? { transportistaPredeterminadoId: form.transportistaPredeterminadoId } : {}),
          } : {})
        })
        toast.success(esVendedor ? 'Cliente creado · quedará pendiente de validación' : 'Cliente creado')
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
          transportistaPredeterminadoId: form.transportistaPredeterminadoId || null,
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

      <RemitoConfigurationCard enabled={puedeConfigurarRemitos} />

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
            {esVendedor
              ? 'Facturación completará los datos y validará el cliente'
              : puedeEditar
                ? 'Completá los datos fiscales y validá para habilitarlo en pedidos'
                : 'Requiere validación antes de habilitarlo en pedidos'}
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
                  {puedeEditar && (
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
              <ClienteCard key={c.id} cliente={c} puedeEditar={puedeEditar} onEditar={() => abrirEdicion(c)} />
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
                      {puedeEditar && (
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
        puedeEditar={puedeEditar}
        transportistas={transportistas}
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
