import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from '@/lib/toast'
import { descargarRemitoPdf } from '../queries/use-remitos'
import { useClientes } from '../queries/use-clientes'
import { useProductos } from '../queries/use-productos'
import { useTransportistas } from '../queries/use-transportistas'
import { useCrearRemitoManual, useRemitosManuales } from '../queries/use-pedidos'
import { useActualizarRemitoConfiguracion, useRemitoConfiguracion } from '../queries/use-remito-configuracion'
import type { CrearRemitoManualInput } from '../lib/api'

type ItemForm = { productoId: string; cantidad: number }
type ClienteNuevoForm = {
  nombre: string
  direccion: string
  localidad: string
  provincia: string
  cuit: string
  condicionIva: string
  condicionVenta: string
}

const EMPTY_CLIENTE: ClienteNuevoForm = {
  nombre: '', direccion: '', localidad: '', provincia: '', cuit: '', condicionIva: '', condicionVenta: '',
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo emitir el remito. Intentá nuevamente.'
}

export default function RemitosManualesPage() {
  const navigate = useNavigate()
  const { data: clientes = [] } = useClientes()
  const { data: productos = [] } = useProductos()
  const { data: transportistas = [] } = useTransportistas()
  const { data: remitos = [] } = useRemitosManuales()
  const { data: configuracion, isLoading: cargandoConfiguracion } = useRemitoConfiguracion()
  const actualizarConfiguracion = useActualizarRemitoConfiguracion()
  const create = useCrearRemitoManual()
  const [clienteId, setClienteId] = useState('')
  const [crearCliente, setCrearCliente] = useState(false)
  const [clienteNuevo, setClienteNuevo] = useState<ClienteNuevoForm>(EMPTY_CLIENTE)
  const [items, setItems] = useState<ItemForm[]>([])
  const [productoParaAgregar, setProductoParaAgregar] = useState('')
  const [transportistaId, setTransportistaId] = useState('')
  const [ocasional, setOcasional] = useState(false)
  const [transporteOcasional, setTransporteOcasional] = useState({ nombre: '', direccion: '' })
  const [correlativoInicial, setCorrelativoInicial] = useState('')

  const clienteSeleccionado = useMemo(() => clientes.find((cliente) => cliente.id === clienteId), [clientes, clienteId])
  const itemsConProducto = useMemo(() => items.map((item) => ({ ...item, producto: productos.find((producto) => producto.id === item.productoId) })).filter((item) => item.producto), [items, productos])

  function agregarProducto() {
    if (!productoParaAgregar) return
    setItems((current) => current.some((item) => item.productoId === productoParaAgregar)
      ? current
      : [...current, { productoId: productoParaAgregar, cantidad: 1 }])
    setProductoParaAgregar('')
  }

  function actualizarCantidad(productoId: string, value: string) {
    const cantidad = Math.max(1, Math.floor(Number(value) || 1))
    setItems((current) => current.map((item) => item.productoId === productoId ? { ...item, cantidad } : item))
  }

  async function guardarNumeracionInicial() {
    const value = Number(correlativoInicial)
    if (!Number.isInteger(value) || value < 1) {
      toast.error('Ingresá el próximo número de remito, sin el punto de venta.')
      return
    }
    try {
      await actualizarConfiguracion.mutateAsync({ proximoCorrelativo: value })
      toast.success(`Numeración configurada: ${configuracion?.puntoVenta ?? '00001'}-${String(value).padStart(8, '0')}`)
      setCorrelativoInicial('')
    } catch (error) {
      toast.error(readError(error))
    }
  }

  async function emitir() {
    if ((!crearCliente && !clienteId) || (crearCliente && !clienteNuevo.nombre.trim())) {
      toast.error('Seleccioná un cliente o cargá el nombre del nuevo cliente.')
      return
    }
    if (items.length === 0) {
      toast.error('Agregá al menos un producto.')
      return
    }
    if (configuracion?.proximoCorrelativo === null) {
      toast.error('Configurá primero el próximo número de remito.')
      return
    }
    if (ocasional && (!transporteOcasional.nombre.trim() || !transporteOcasional.direccion.trim())) {
      toast.error('Completá nombre y dirección del transporte ocasional.')
      return
    }
    const payload: CrearRemitoManualInput = {
      ...(crearCliente ? { clienteNuevo: {
        nombre: clienteNuevo.nombre.trim(),
        ...(clienteNuevo.direccion.trim() ? { direccion: clienteNuevo.direccion.trim() } : {}),
        ...(clienteNuevo.localidad.trim() ? { localidad: clienteNuevo.localidad.trim() } : {}),
        ...(clienteNuevo.provincia.trim() ? { provincia: clienteNuevo.provincia.trim() } : {}),
        ...(clienteNuevo.cuit.trim() ? { cuit: clienteNuevo.cuit.trim() } : {}),
        ...(clienteNuevo.condicionIva.trim() ? { condicionIva: clienteNuevo.condicionIva.trim() } : {}),
        ...(clienteNuevo.condicionVenta.trim() ? { condicionVenta: clienteNuevo.condicionVenta.trim() } : {}),
      }} : { clienteId }),
      items,
      ...(transportistaId ? { transportistaId } : {}),
      ...(ocasional ? { transporteOcasional } : {}),
    }
    try {
      const result = await create.mutateAsync({ ...payload, idempotencyKey: crypto.randomUUID() })
      toast.success(`Remito ${result.remito.numero} emitido. Quedó pendiente a descuento.`)
      await descargarRemitoPdf(result.pedido.id)
      navigate(`/ale-bet/pedidos/${result.pedido.id}`)
    } catch (error) {
      toast.error(readError(error))
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-outline-variant bg-surface-container p-6">
        <div>
          <p className="mb-1 font-body text-xs font-semibold uppercase tracking-[0.16em] text-primary">Facturación</p>
          <h1 className="font-display text-2xl font-semibold text-on-surface">Nuevo remito</h1>
          <p className="mt-1 font-body text-sm text-on-surface-variant">Se emite e imprime ahora; el stock se descontará cuando Encargado o Admin lo apruebe.</p>
        </div>
        <FileText className="text-primary" size={32} aria-hidden="true" />
      </header>

      {!cargandoConfiguracion && configuracion?.proximoCorrelativo === null && (
        <section aria-label="Numeración de remitos pendiente" className="rounded-xl border border-warning/40 bg-warning/10 p-5">
          <h2 className="font-display text-lg font-semibold text-on-surface">Antes de emitir el primer remito</h2>
          <p className="mt-1 font-body text-sm text-on-surface-variant">Indicá una única vez el próximo correlativo. El punto de venta es fijo: {configuracion.puntoVenta}. Desde ahí, la numeración continúa automáticamente.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block flex-1 font-body text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Próximo número
              <input aria-label="Próximo número de remito" value={correlativoInicial} inputMode="numeric" onChange={(event) => setCorrelativoInicial(event.target.value.replace(/\D/g, ''))} placeholder="Ej: 13216" className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 font-body text-sm text-on-surface" />
            </label>
            <Button loading={actualizarConfiguracion.isPending} onClick={() => void guardarNumeracionInicial()} className="sm:mb-0">Guardar numeración</Button>
          </div>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-xl border border-outline-variant bg-surface-container p-5">
            <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-display text-lg font-semibold">Cliente</h2><Button variant="outline" size="sm" onClick={() => { setCrearCliente((value) => !value); setClienteId('') }}>{crearCliente ? 'Usar existente' : 'Crear cliente'}</Button></div>
            {crearCliente ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Nombre / razón social *" value={clienteNuevo.nombre} onChange={(value) => setClienteNuevo((state) => ({ ...state, nombre: value }))} />
                <Input label="Domicilio" value={clienteNuevo.direccion} onChange={(value) => setClienteNuevo((state) => ({ ...state, direccion: value }))} />
                <Input label="Localidad" value={clienteNuevo.localidad} onChange={(value) => setClienteNuevo((state) => ({ ...state, localidad: value }))} />
                <Input label="Provincia" value={clienteNuevo.provincia} onChange={(value) => setClienteNuevo((state) => ({ ...state, provincia: value }))} />
                <Input label="CUIT" value={clienteNuevo.cuit} onChange={(value) => setClienteNuevo((state) => ({ ...state, cuit: value }))} />
                <Input label="IVA" value={clienteNuevo.condicionIva} onChange={(value) => setClienteNuevo((state) => ({ ...state, condicionIva: value }))} />
                <Input label="Condición de venta" value={clienteNuevo.condicionVenta} onChange={(value) => setClienteNuevo((state) => ({ ...state, condicionVenta: value }))} />
              </div>
            ) : (
              <label className="block font-body text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Cliente
                <select value={clienteId} onChange={(event) => { const nextClient = clientes.find((cliente) => cliente.id === event.target.value); setClienteId(event.target.value); setTransportistaId(nextClient?.transportistaPredeterminadoId ?? '') }} className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 font-body text-sm text-on-surface">
                  <option value="">Seleccioná un cliente</option>
                  {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>)}
                </select>
              </label>
            )}
          </div>

          <div className="rounded-xl border border-outline-variant bg-surface-container p-5">
            <h2 className="mb-4 font-display text-lg font-semibold">Productos</h2>
            <div className="flex gap-2"><select value={productoParaAgregar} onChange={(event) => setProductoParaAgregar(event.target.value)} className="h-11 min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface px-3 font-body text-sm text-on-surface"><option value="">Elegí un producto del catálogo</option>{productos.filter((producto) => producto.activo).map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre}</option>)}</select><Button onClick={agregarProducto} disabled={!productoParaAgregar}><Plus size={16} /> Agregar</Button></div>
            <div className="mt-4 divide-y divide-outline-variant/70 rounded-lg border border-outline-variant">
              {itemsConProducto.length === 0 ? <p className="p-4 font-body text-sm text-on-surface-variant">Todavía no agregaste productos.</p> : itemsConProducto.map(({ productoId, cantidad, producto }) => producto && <div key={productoId} className="flex items-center gap-3 p-3"><p className="min-w-0 flex-1 truncate font-body text-sm font-semibold">{producto.nombre}</p><label className="font-body text-xs text-on-surface-variant">Unidades<input aria-label={`Cantidad ${producto.nombre}`} type="number" min="1" step="1" value={cantidad} onChange={(event) => actualizarCantidad(productoId, event.target.value)} className="ml-2 h-9 w-20 rounded-md border border-outline-variant bg-surface px-2 text-right font-body text-sm text-on-surface" /></label><button type="button" aria-label={`Quitar ${producto.nombre}`} onClick={() => setItems((current) => current.filter((item) => item.productoId !== productoId))} className="rounded p-2 text-error hover:bg-error/10"><Trash2 size={16} /></button></div>)}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-xl border border-outline-variant bg-surface-container p-5">
            <h2 className="mb-2 font-display text-lg font-semibold">Entrega</h2>
            <p className="mb-4 font-body text-xs text-on-surface-variant">Sin transportista, se usa el domicilio del cliente como entrega directa.</p>
            <label className="block font-body text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Transportista
              <select value={transportistaId} disabled={ocasional} onChange={(event) => setTransportistaId(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 font-body text-sm text-on-surface disabled:opacity-50"><option value="">Entrega directa al cliente</option>{transportistas.map((transportista) => <option key={transportista.id} value={transportista.id}>{transportista.nombre}</option>)}</select>
            </label>
            <label className="mt-4 flex items-center gap-2 font-body text-sm text-on-surface"><input type="checkbox" checked={ocasional} onChange={(event) => { setOcasional(event.target.checked); setTransportistaId('') }} /> Transporte ocasional</label>
            {ocasional && <div className="mt-4 space-y-3"><Input label="Nombre / razón social *" value={transporteOcasional.nombre} onChange={(value) => setTransporteOcasional((state) => ({ ...state, nombre: value }))} /><Input label="Dirección / referencia *" value={transporteOcasional.direccion} onChange={(value) => setTransporteOcasional((state) => ({ ...state, direccion: value }))} /></div>}
            {!ocasional && !transportistaId && ((crearCliente ? clienteNuevo.direccion : clienteSeleccionado?.direccion) ? <p className="mt-3 rounded-md bg-primary/10 p-3 font-body text-xs text-on-surface">Entrega directa: {crearCliente ? clienteNuevo.direccion : clienteSeleccionado?.direccion}</p> : <p className="mt-3 rounded-md bg-error/10 p-3 font-body text-xs text-error">Para entrega directa, el cliente debe tener domicilio.</p>)}
          </div>
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-4"><p className="font-body text-sm font-semibold text-on-surface">Pendiente a descuento</p><p className="mt-1 font-body text-xs text-on-surface-variant">La emisión no valida ni descuenta stock. La aprobación posterior lo hará contra los lotes disponibles en ese momento.</p></div>
          <Button className="w-full" size="lg" loading={create.isPending} disabled={cargandoConfiguracion || configuracion?.proximoCorrelativo === null} onClick={() => void emitir()}>
            {configuracion?.proximoCorrelativo === null ? 'Configurá la numeración para emitir' : 'Emitir e imprimir remito'}
          </Button>
        </aside>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container p-5">
        <h2 className="font-display text-lg font-semibold">Remitos manuales recientes</h2>
        <div className="mt-4 divide-y divide-outline-variant/70">{remitos.slice(0, 8).map((pedido) => <button key={pedido.id} type="button" onClick={() => navigate(`/ale-bet/pedidos/${pedido.id}`)} className="flex w-full items-center justify-between gap-3 py-3 text-left"><span><span className="block font-body text-sm font-semibold">{pedido.cliente.nombre}</span><span className="font-body text-xs text-on-surface-variant">{pedido.remitos?.[0]?.numero ?? pedido.numero}</span></span><span className={`rounded-full px-3 py-1 font-body text-xs font-semibold ${pedido.estado === 'DESPACHADO' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>{pedido.estado === 'DESPACHADO' ? 'Stock descontado' : 'Pendiente a descuento'}</span></button>)}{remitos.length === 0 && <p className="py-4 font-body text-sm text-on-surface-variant">Aún no hay remitos manuales.</p>}</div>
      </section>
    </div>
  )
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block font-body text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 font-body text-sm text-on-surface" /></label>
}
