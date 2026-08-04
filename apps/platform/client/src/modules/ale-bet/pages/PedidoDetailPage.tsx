import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ChevronDown, Check, X, FileText, FlaskConical, TriangleAlert, Package, Printer, LogOut, ArrowLeft } from 'lucide-react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api-client'
import { toast } from '@/lib/toast'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import {
  ESTADO_META,
  canAccionesBarraArmador,
  canAprobar,
  canCancelarDirecto,
  canConfirmarCancelacion,
  canDespachar,
  canEditarPedido,
  canEmitirRemito,
  canPreparar,
  canSolicitarCancelacion,
  canTomar,
  cantidadLinea,
  calcularCajasSueltos,
  esArmadorAsignado,
  pedidoClientePendiente,
} from '../lib/estados'
import type { Cliente, PedidoItemInput } from '../lib/api'
import {
  descargarRemitoPdf,
  pedidosKeys,
  useAnularRemito,
  useAprobarPedido,
  useCancelarPedido,
  useClientes,
  useCompletarItemPedido,
  useConfirmarCancelacionPedido,
  useCreateCliente,
  useDespacharPedido,
  useEmitirRemito,
  usePedidoDetalle,
  usePedidos,
  usePrepararPedido,
  useProductos,
  useProductosSearch,
  useTomarPedido,
  useTransportistas,
  useUpdatePedido,
} from '../queries'
import { BottomSheet } from '../components/BottomSheet'
import { ArmadorActionBar } from '../components/ArmadorActionBar'
import { ProductCard, type ProductoCardDatos } from '../components/ProductCard'
import { QuantityStepper } from '../components/QuantityStepper'
import { StockIndicator } from '../components/StockIndicator'

interface CartLine {
  cajas: number
  sueltos: number
}

type Carrito = Record<string, CartLine>

type ConfirmAccion = 'aprobar' | 'tomar' | 'cancelar' | 'guardar-aprobado' | 'preparar' | 'despachar'

const ESTADOS_CON_REMITO = ['APROBADO', 'EN_ARMADO', 'PREPARADO']

function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function formatFecha(dateString: string): string {
  return new Date(dateString).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatFechaHora(dateString: string): string {
  return new Date(dateString).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const porActualizadoDesc = (a: { updatedAt: string }, b: { updatedAt: string }) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()

interface ConfirmDialogProps {
  open: boolean
  titulo: string
  mensaje: string
  accion: string
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}

function ConfirmDialog({ open, titulo, mensaje, accion, loading, onCancel, onConfirm }: ConfirmDialogProps) {
  if (!open) return null
  return (
    <div
      data-testid="confirm-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container-low p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading text-[16px] font-bold text-on-surface">{titulo}</h2>
        <p className="mt-2 font-body text-[13px] leading-relaxed text-on-surface-variant">{mensaje}</p>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Volver
          </Button>
          <Button onClick={onConfirm} loading={loading}>
            {accion}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ClienteOption({ cliente, onSelect }: { cliente: Cliente; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-surface-container-high p-4 text-left transition enabled:active:scale-[0.99]"
    >
      <div className="min-w-0">
        <p className="truncate font-heading text-[14px] font-semibold text-on-surface">{cliente.nombre}</p>
        <p className="mt-0.5 truncate font-body text-[11px] text-outline">
          {cliente.contacto ?? cliente.referencia ?? '—'}
        </p>
      </div>
      {cliente.estado === 'PENDIENTE_CLIENTE' && <Badge variant="warning">Pendiente de validación</Badge>}
    </button>
  )
}

interface CambiarClienteSheetProps {
  open: boolean
  onClose: () => void
  clientes: Cliente[]
  recientes: Cliente[]
  onSelect: (cliente: Cliente) => void
}

function CambiarClienteSheet({ open, onClose, clientes, recientes, onSelect }: CambiarClienteSheetProps) {
  const [busqueda, setBusqueda] = useState('')
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [nombre, setNombre] = useState('')
  const [contacto, setContacto] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const createCliente = useCreateCliente()

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter((c) => `${c.nombre} ${c.contacto ?? ''} ${c.referencia ?? ''}`.toLowerCase().includes(q))
  }, [clientes, busqueda])

  const lista = useMemo(() => {
    if (busqueda.trim() !== '') return filtrados
    const recientesIds = new Set(recientes.map((c) => c.id))
    return filtrados.filter((c) => !recientesIds.has(c.id))
  }, [busqueda, filtrados, recientes])

  function reset() {
    setBusqueda('')
    setMostrarNuevo(false)
    setNombre('')
    setContacto('')
    setError(null)
  }

  async function crearCliente() {
    const name = nombre.trim()
    if (!name) {
      setError('El nombre es obligatorio')
      inputRef.current?.focus()
      return
    }
    const cont = contacto.trim()
    if (!cont) {
      setError('Debe informar un contacto o referencia')
      return
    }
    setError(null)
    try {
      const creado = await createCliente.mutateAsync({
        nombre: name,
        contacto: cont,
      })
      reset()
      onSelect(creado)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el cliente')
    }
  }

  return (
    <BottomSheet open={open} onClose={() => { reset(); onClose() }} title={mostrarNuevo ? "NUEVO CLIENTE" : "Cambiar cliente"} desktop="modal">
      {mostrarNuevo ? (
        <div className="space-y-5">
          <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 font-body text-[12px] leading-relaxed text-primary">
            Cargá lo mínimo. Facturación completará los datos fiscales.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="nuevo-cliente-nombre" className="font-body text-[12px] font-semibold text-on-surface">
              Nombre del cliente *
            </label>
            <input
              id="nuevo-cliente-nombre"
              ref={inputRef}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Veterinaria Central"
              className="w-full rounded-xl border border-white/10 bg-surface-container-high px-4 py-3 font-body text-[16px] text-on-surface focus:border-primary focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="nuevo-cliente-contacto" className="font-body text-[12px] font-semibold text-on-surface">
              Contacto o referencia *
            </label>
            <input
              id="nuevo-cliente-contacto"
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              placeholder="Teléfono, mail o detalle…"
              className="w-full rounded-xl border border-white/10 bg-surface-container-high px-4 py-3 font-body text-[16px] text-on-surface focus:border-primary focus:outline-none"
            />
          </div>
          {error && (
            <p role="alert" className="font-body text-[13px] font-medium text-error">
              {error}
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setMostrarNuevo(false)}
              disabled={createCliente.isPending}
              className="flex-1 rounded-full border border-white/10 px-4 py-3 font-body text-[14px] font-medium text-outline transition hover:bg-surface-variant hover:text-on-surface disabled:opacity-50"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={() => void crearCliente()}
              disabled={createCliente.isPending}
              className="flex-[2] rounded-full bg-primary px-4 py-3 font-body text-[14px] font-bold text-on-primary transition hover:bg-primary/90 disabled:opacity-50"
            >
              {createCliente.isPending ? 'Creando...' : 'Crear cliente'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <input
            autoFocus
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar cliente"
            placeholder="Buscar por nombre, contacto o referencia"
            className="input-field text-base"
          />
          {busqueda.trim() === '' && recientes.length > 0 && (
            <section aria-label="Clientes recientes" className="space-y-2">
              <h2 className="font-heading text-[12px] font-bold uppercase tracking-[0.8px] text-outline">Recientes</h2>
              {recientes.map((c) => (
                <ClienteOption key={c.id} cliente={c} onSelect={() => onSelect(c)} />
              ))}
            </section>
          )}
          <section aria-label="Lista de clientes" className="space-y-2">
            <h2 className="font-heading text-[12px] font-bold uppercase tracking-[0.8px] text-outline">
              {busqueda.trim() === '' ? 'Todos los clientes' : 'Resultados'}
            </h2>
            {lista.length === 0 ? (
              <p className="py-6 text-center font-body text-[13px] text-on-surface-variant">
                Sin resultados para “{busqueda}”
              </p>
            ) : (
              lista.map((c) => <ClienteOption key={c.id} cliente={c} onSelect={() => onSelect(c)} />)
            )}
          </section>
          <button
            type="button"
            onClick={() => setMostrarNuevo(true)}
            className="w-full rounded-xl border border-dashed border-primary/50 p-4 font-body text-[13px] font-semibold text-primary transition hover:bg-primary/10"
          >
            + Cliente nuevo
          </button>
        </div>
      )}
    </BottomSheet>
  )
}

interface LineaDetalleProps {
  productoId: string
  nombre: string
  sku: string
  cajas: number
  sueltos: number
  unidades: number
  unidadesPorCaja: number
  disponible?: number
  reservado?: number
  completado: boolean
  editable: boolean
  completable: boolean
  onChange?: (cajas: number, sueltos: number) => void
  onEliminar?: () => void
  onToggleCompletar?: () => void
}

function LineaDetalle({
  productoId,
  nombre,
  sku,
  cajas,
  sueltos,
  unidades,
  unidadesPorCaja,
  disponible,
  reservado,
  completado,
  editable,
  completable,
  onChange,
  onEliminar,
  onToggleCompletar,
}: LineaDetalleProps) {
  const ceroUnidades = unidades === 0

  return (
    <div
      data-testid={`linea-${productoId}`}
      className={cn(
        'space-y-2 rounded-xl border bg-surface-container p-3',
        ceroUnidades ? 'border-warning/50' : 'border-white/10',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-heading text-[13px] font-semibold text-on-surface">{nombre}</p>
          <p className="mt-0.5 font-body text-[11px] text-outline">{sku}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {completado && <Badge variant="success">Listo</Badge>}
          {editable && onEliminar && (
            <button
              type="button"
              onClick={onEliminar}
              aria-label={`Eliminar ${nombre}`}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-[14px] text-outline transition hover:border-error/50 hover:text-error"
            >
              ✕
            </button>
          )}
          {completable && onToggleCompletar && (
            <button
              type="button"
              onClick={onToggleCompletar}
              className={cn(
                'rounded-full border px-3 py-1.5 font-body text-[11px] font-semibold transition',
                completado
                  ? 'border-white/10 text-on-surface-variant hover:text-on-surface'
                  : 'border-primary/40 text-primary hover:bg-primary/20',
              )}
            >
              {completado ? 'Desmarcar' : 'Marcar preparado'}
            </button>
          )}
        </div>
      </div>
      <p className="font-body text-[12px] text-on-surface-variant">
        {cajas} caja{cajas === 1 ? '' : 's'} · {sueltos} suelto{sueltos === 1 ? '' : 's'} · {unidades} unidades
      </p>
      {disponible !== undefined && reservado !== undefined && (
        <StockIndicator disponible={disponible} reservado={reservado} cantidadPedida={unidades} />
      )}
      {editable && onChange && <QuantityStepper cajas={cajas} sueltos={sueltos} unidadesPorCaja={unidadesPorCaja} onChange={onChange} />}
      {ceroUnidades && (
        <p className="font-body text-[11px] font-medium text-warning">0 unidades — se eliminará al guardar</p>
      )}
    </div>
  )
}

export default function PedidoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const rol = user?.apps?.['ale-bet']?.rol ?? ''
  const userId = user?.sub ?? ''
  const esRemitos = rol === 'admin' || rol === 'facturacion'

  const { data: pedido, isLoading, error, refetch: refetchPedido } = usePedidoDetalle(id)
  const { data: productos = [], refetch: refetchProductos } = useProductos()
  const { data: clientes = [] } = useClientes()
  const { data: transportistas = [] } = useTransportistas({ enabled: esRemitos })
  const { data: pedidosList = [] } = usePedidos()

  const [carrito, setCarrito] = useState<Carrito>({})
  const [clienteIdLocal, setClienteIdLocal] = useState<string | null>(null)

  const [sheetProductos, setSheetProductos] = useState(false)
  const [sheetCliente, setSheetCliente] = useState(false)
  const [solicitarOpen, setSolicitarOpen] = useState(false)
  const [confirmarOpen, setConfirmarOpen] = useState(false)
  const [anularOpen, setAnularOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmAccion | null>(null)
  const [guardando, setGuardando] = useState(false)

  const isExecutingRef = useRef(false)

  const [motivoSolicitud, setMotivoSolicitud] = useState('')
  const [motivoSolicitudError, setMotivoSolicitudError] = useState<string | null>(null)
  const [motivoConfirmar, setMotivoConfirmar] = useState('')
  const [motivoConfirmarError, setMotivoConfirmarError] = useState<string | null>(null)
  const [motivoAnular, setMotivoAnular] = useState('')
  const [motivoAnularError, setMotivoAnularError] = useState<string | null>(null)

  const [transporteId, setTransporteId] = useState('')
  const [usarOcasional, setUsarOcasional] = useState(false)
  const [ocasionalNombre, setOcasionalNombre] = useState('')
  const [ocasionalDireccion, setOcasionalDireccion] = useState('')
  const [remitoError, setRemitoError] = useState<string | null>(null)
  const ocasionalNombreRef = useRef<HTMLInputElement>(null)
  const ocasionalDireccionRef = useRef<HTMLInputElement>(null)

  const [busquedaProducto, setBusquedaProducto] = useState('')
  const qProductoDebounced = useDebouncedValue(busquedaProducto.trim(), 250)
  const { data: resultadosBusqueda = [] } = useProductosSearch(qProductoDebounced)

  const updatePedido = useUpdatePedido()
  const aprobarMutation = useAprobarPedido()
  const tomarMutation = useTomarPedido()
  const completarMutation = useCompletarItemPedido()
  const prepararMutation = usePrepararPedido()
  const cancelarMutation = useCancelarPedido()
  const confirmarCancelacionMutation = useConfirmarCancelacionPedido()
  const despacharMutation = useDespacharPedido()
  const emitirRemitoMutation = useEmitirRemito()
  const anularRemitoMutation = useAnularRemito()

  useEffect(() => {
    if (!pedido) return
    const next: Carrito = {}
    for (const item of pedido.items) {
      const { cajas, sueltos } = calcularCajasSueltos(item.cantidad, item.producto.unidadesPorCaja)
      next[item.productoId] = { cajas, sueltos }
    }
    setCarrito(next)
    setClienteIdLocal(pedido.clienteId)
  }, [pedido])

  const productoPorId = useMemo(() => {
    const map = new Map<string, ProductoCardDatos>()
    for (const p of productos) map.set(p.id, p)
    for (const r of resultadosBusqueda) if (!map.has(r.id)) map.set(r.id, r)
    return map
  }, [productos, resultadosBusqueda])

  const lineas = useMemo(() => {
    if (!pedido) return []
    return pedido.items.map((item) => {
      const linea = carrito[item.productoId]
      const base = calcularCajasSueltos(item.cantidad, item.producto.unidadesPorCaja)
      const cajas = linea?.cajas ?? base.cajas
      const sueltos = linea?.sueltos ?? base.sueltos
      return {
        item,
        cajas,
        sueltos,
        unidades: cantidadLinea(cajas, sueltos, item.producto.unidadesPorCaja),
        producto: productoPorId.get(item.productoId),
      }
    })
  }, [pedido, carrito, productoPorId])

  const carritoIgual = useMemo(() => {
    if (!pedido) return true
    const actual = new Map(pedido.items.map((i) => [i.productoId, i.cantidad]))
    const aEditar = Object.entries(carrito).filter(([, l]) => l.cajas > 0 || l.sueltos > 0)
    if (aEditar.length !== actual.size) return false
    for (const [productoId, l] of aEditar) {
      const ubc = productoPorId.get(productoId)?.unidadesPorCaja ?? 1
      if (actual.get(productoId) !== cantidadLinea(l.cajas, l.sueltos, ubc)) return false
    }
    return true
  }, [pedido, carrito, productoPorId])

  const canEditar = pedido ? canEditarPedido(pedido, rol, userId) : false
  const clientePendiente = pedido ? pedidoClientePendiente(pedido) : false
  const remitoVigente = pedido?.remitos?.find((r) => r.estado === 'VIGENTE') ?? null
  const remitosInvalidados = pedido?.remitos?.filter((r) => r.estado === 'INVALIDADO') ?? []

  const clienteCambio = Boolean(pedido) && clienteIdLocal !== pedido?.clienteId
  const hayCambios = Boolean(pedido) && (clienteCambio || !carritoIgual)
  const clienteActual = clientes.find((c) => c.id === clienteIdLocal) ?? pedido?.cliente ?? null

  const pedidosActivos = useMemo(
    () => pedidosList.filter((p) => p.estado !== 'CANCELADO').sort(porActualizadoDesc),
    [pedidosList],
  )

  const clientesRecientes = useMemo(() => {
    const vistos = new Set<string>()
    const out: Cliente[] = []
    for (const p of pedidosActivos) {
      if (vistos.has(p.clienteId)) continue
      vistos.add(p.clienteId)
      out.push(p.cliente)
      if (out.length >= 5) break
    }
    return out
  }, [pedidosActivos])

  const frecuentesIds = useMemo(() => {
    if (!clienteIdLocal) return []
    const counts = new Map<string, number>()
    for (const p of pedidosActivos) {
      if (p.clienteId !== clienteIdLocal) continue
      for (const item of p.items) counts.set(item.productoId, (counts.get(item.productoId) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([entryId]) => entryId)
  }, [pedidosActivos, clienteIdLocal])

  const recientesIds = useMemo(() => {
    const vistos = new Set(frecuentesIds)
    const out: string[] = []
    for (const p of pedidosActivos) {
      for (const item of p.items) {
        if (!vistos.has(item.productoId)) {
          vistos.add(item.productoId)
          out.push(item.productoId)
          if (out.length >= 5) return out
        }
      }
    }
    return out
  }, [pedidosActivos, frecuentesIds])

  const frecuentes = useMemo(
    () => frecuentesIds.map((productoId) => productoPorId.get(productoId)).filter((p): p is ProductoCardDatos => Boolean(p)),
    [frecuentesIds, productoPorId],
  )

  const recientes = useMemo(
    () => recientesIds.map((productoId) => productoPorId.get(productoId)).filter((p): p is ProductoCardDatos => Boolean(p)),
    [recientesIds, productoPorId],
  )

  const puedeProgreso = pedido
    ? pedido.estado === 'EN_ARMADO' && (rol === 'admin' || (rol === 'armador' && esArmadorAsignado(pedido, userId)))
    : false
  const prepararListo = pedido ? canPreparar(pedido, rol, userId) : false
  const itemsCompletados = pedido?.items.filter((i) => i.completado).length ?? 0
  const itemsPendientes = pedido ? pedido.items.length - itemsCompletados : 0

  function cambiarCantidad(productoId: string, cajas: number, sueltos: number) {
    setCarrito((prev) => ({ ...prev, [productoId]: { cajas, sueltos } }))
  }

  function eliminarLinea(productoId: string) {
    setCarrito((prev) => {
      const next = { ...prev }
      delete next[productoId]
      return next
    })
  }

  function agregarAlCarrito(producto: ProductoCardDatos) {
    setCarrito((prev) => {
      const actual = prev[producto.id]
      return { ...prev, [producto.id]: { cajas: (actual?.cajas ?? 0) + 1, sueltos: actual?.sueltos ?? 0 } }
    })
  }

  function buildItems(): PedidoItemInput[] {
    return Object.entries(carrito)
      .filter(([, l]) => l.cajas > 0 || l.sueltos > 0)
      .map(([productoId, l]) => {
        const ubc = productoPorId.get(productoId)?.unidadesPorCaja ?? 1
        return { productoId, cantidad: cantidadLinea(l.cajas, l.sueltos, ubc) }
      })
  }

  function invalidarTodo() {
    void qc.invalidateQueries({ queryKey: pedidosKeys.all })
    void refetchProductos()
  }

  async function ejecutarGuardar() {
    if (!pedido || !clienteIdLocal) return
    const items = buildItems()
    if (items.length === 0) {
      toast.warning('Agregá al menos un producto al pedido')
      return
    }
    setGuardando(true)
    try {
      const actualizado = await updatePedido.mutateAsync({
        id: pedido.id,
        clienteId: clienteIdLocal,
        items,
        expectedVersion: pedido.version,
      })
      toast.success(`Pedido ${actualizado.numero} actualizado`)
      invalidarTodo()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.message.includes('versión')) {
        toast.error('La versión del pedido cambió; se recargó. Reintentá.')
        void refetchPedido()
      } else if (e instanceof ApiError && e.status === 409) {
        toast.error(e.message)
        void refetchProductos()
      } else {
        toast.error(e instanceof Error ? e.message : 'Error al guardar los cambios')
      }
    } finally {
      setGuardando(false)
    }
  }

  function handleGuardar() {
    if (pedido?.estado === 'APROBADO') {
      setConfirm('guardar-aprobado')
      return
    }
    void ejecutarGuardar()
  }

  async function ejecutarConfirm() {
    if (!pedido || !confirm || isExecutingRef.current) return
    isExecutingRef.current = true
    try {
      if (confirm === 'aprobar') {
        const aprobado = await aprobarMutation.mutateAsync({
          id: pedido.id,
          expectedVersion: pedido.version,
          idempotencyKey: newIdempotencyKey(),
        })
        toast.success(`Pedido ${aprobado.numero} aprobado`)
        invalidarTodo()
      } else if (confirm === 'tomar') {
        await tomarMutation.mutateAsync({
          id: pedido.id,
          expectedVersion: pedido.version,
          idempotencyKey: newIdempotencyKey(),
        })
        toast.success(`Pedido ${pedido.numero} tomado`)
        invalidarTodo()
      } else if (confirm === 'cancelar') {
        const res = await cancelarMutation.mutateAsync({
          id: pedido.id,
          expectedVersion: pedido.version,
          idempotencyKey: newIdempotencyKey(),
        })
        if (res.requested) {
          toast.success('Solicitud enviada')
        } else {
          toast.success(pedido.estado === 'APROBADO' ? 'Pedido cancelado y reserva liberada' : 'Pedido cancelado')
        }
        invalidarTodo()
      } else if (confirm === 'preparar') {
        await prepararMutation.mutateAsync({
          id: pedido.id,
          expectedVersion: pedido.version,
          idempotencyKey: newIdempotencyKey(),
        })
        toast.success('Pedido preparado')
        invalidarTodo()
      } else if (confirm === 'despachar') {
        await despacharMutation.mutateAsync({
          id: pedido.id,
          expectedVersion: pedido.version,
          idempotencyKey: newIdempotencyKey(),
        })
        toast.success('Pedido despachado')
        invalidarTodo()
      } else if (confirm === 'guardar-aprobado') {
        await ejecutarGuardar()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al ejecutar la acción')
    } finally {
      isExecutingRef.current = false
      setConfirm(null)
    }
  }

  async function toggleCompletar(itemId: string) {
    if (!pedido) return
    try {
      await completarMutation.mutateAsync({
        pedidoId: pedido.id,
        itemId,
        expectedVersion: pedido.version,
        idempotencyKey: newIdempotencyKey(),
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar el item')
    }
  }

  function abrirSolicitarCancelacion() {
    setMotivoSolicitud('')
    setMotivoSolicitudError(null)
    setSolicitarOpen(true)
  }

  async function enviarSolicitud() {
    const motivo = motivoSolicitud.trim()
    if (motivo.length < 3) {
      setMotivoSolicitudError(motivo.length === 0 ? 'El motivo es obligatorio' : 'El motivo debe tener al menos 3 caracteres')
      return
    }
    setMotivoSolicitudError(null)
    if (!pedido) return
    try {
      const res = await cancelarMutation.mutateAsync({
        id: pedido.id,
        expectedVersion: pedido.version,
        motivo,
        idempotencyKey: newIdempotencyKey(),
      })
      toast.success(res.requested ? 'Solicitud enviada' : 'Pedido cancelado')
      setSolicitarOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al solicitar la cancelación')
    }
  }

  function abrirConfirmarCancelacion() {
    setMotivoConfirmar(pedido?.motivoCancelacion ?? '')
    setMotivoConfirmarError(null)
    setConfirmarOpen(true)
  }

  async function confirmarCancelacion() {
    const motivo = motivoConfirmar.trim()
    if (!motivo) {
      setMotivoConfirmarError('El motivo es obligatorio')
      return
    }
    setMotivoConfirmarError(null)
    if (!pedido) return
    try {
      await confirmarCancelacionMutation.mutateAsync({
        id: pedido.id,
        expectedVersion: pedido.version,
        motivo,
        idempotencyKey: newIdempotencyKey(),
      })
      toast.success('Pedido cancelado')
      setConfirmarOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al confirmar la cancelación')
    }
  }

  function abrirAnular() {
    setMotivoAnular('')
    setMotivoAnularError(null)
    setAnularOpen(true)
  }

  async function anularRemito() {
    const motivo = motivoAnular.trim()
    if (motivo.length < 3) {
      setMotivoAnularError(motivo.length === 0 ? 'El motivo es obligatorio' : 'El motivo debe tener al menos 3 caracteres')
      return
    }
    setMotivoAnularError(null)
    if (!pedido || !remitoVigente) return
    try {
      await anularRemitoMutation.mutateAsync({
        pedidoId: pedido.id,
        remitoId: remitoVigente.id,
        motivo,
        idempotencyKey: newIdempotencyKey(),
      })
      toast.success('Remito anulado')
      setAnularOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al anular el remito')
    }
  }

  async function emitirRemito() {
    if (usarOcasional) {
      const nombreValido = ocasionalNombre.trim().length >= 2
      const direccionValida = ocasionalDireccion.trim().length >= 2
      if (!nombreValido || !direccionValida) {
        setRemitoError('El transporte ocasional requiere nombre y dirección de al menos 2 caracteres')
        toast.error('Completá nombre y dirección del transporte ocasional')
        if (!nombreValido) {
          ocasionalNombreRef.current?.focus()
          ocasionalNombreRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
        } else {
          ocasionalDireccionRef.current?.focus()
          ocasionalDireccionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
        }
        return
      }
    } else if (!transporteId) {
      setRemitoError('Seleccioná un transporte habitual o indicá un transporte ocasional')
      return
    }
    setRemitoError(null)
    if (!pedido) return
    try {
      await emitirRemitoMutation.mutateAsync({
        pedidoId: pedido.id,
        expectedVersion: pedido.version,
        ...(usarOcasional
          ? { transporteOcasional: { nombre: ocasionalNombre.trim(), direccion: ocasionalDireccion.trim() } }
          : { transportistaId: transporteId }),
        idempotencyKey: newIdempotencyKey(),
      })
      toast.success('Remito emitido')
      setTransporteId('')
      setUsarOcasional(false)
      setOcasionalNombre('')
      setOcasionalDireccion('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al emitir el remito')
    }
  }

  async function descargarRemito() {
    if (!pedido) return
    try {
      await descargarRemitoPdf(pedido.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al descargar el remito')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton variant="card" className="h-28" />
        <div className="lg:grid lg:grid-cols-2 lg:gap-6">
          <div className="space-y-5">
            <Skeleton variant="card" className="h-40" />
            <Skeleton variant="card" className="h-56" />
          </div>
          <div className="mt-5 space-y-5 lg:mt-0">
            <Skeleton variant="card" className="h-40" />
            <Skeleton variant="card" className="h-40" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !pedido) {
    return (
      <div className="space-y-4">
        <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-on-surface">Detalle de pedido</h1>
        <p className="font-body text-[13px] text-error">{error instanceof Error ? error.message : 'Pedido no encontrado'}</p>
      </div>
    )
  }

  const meta = ESTADO_META[pedido.estado]
  const puedeVerPanelRemito = esRemitos && ESTADOS_CON_REMITO.includes(pedido.estado)
  const clienteActualNombre = clienteActual?.nombre ?? pedido.cliente.nombre
  const barraArmadorVisible = canAccionesBarraArmador(pedido, rol, userId)

  return (
    <div className={cn('space-y-5', barraArmadorVisible && 'pb-[calc(env(safe-area-inset-bottom)+7rem)] lg:pb-0')}>
      <div className="-mb-2">
        <button
          type="button"
          onClick={() => {
            if (location.key !== 'default') navigate(-1)
            else navigate('/ale-bet/pedidos')
          }}
          className="inline-flex items-center gap-1.5 font-body text-[13px] font-medium text-outline transition hover:text-on-surface focus:outline-none focus:text-on-surface"
        >
          <ArrowLeft size={16} strokeWidth={2} />
          Pedidos
        </button>
      </div>
      <section className="rounded-xl border border-white/10 bg-surface-container-high overflow-hidden">
        {/* Header y Acciones */}
        <div className="p-4 lg:p-6 border-b border-white/10">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <h1 data-testid="pedido-numero" className="font-heading text-[22px] font-bold tracking-[-0.02em] text-on-surface">
                Pedido {pedido.numero}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge variant={meta.variant} className="justify-center">
                  {meta.label}
                </Badge>
                {clientePendiente && <Badge variant="warning">Cliente pendiente de validación</Badge>}
              </div>
              <p className="mt-2 font-body text-[12px] text-on-surface-variant">Creado el {formatFechaHora(pedido.createdAt)}</p>
              <div className="mt-0.5 font-body text-[11px] text-outline">
                {pedido.vendedorNombre && <p>Vendedor: {pedido.vendedorNombre}</p>}
                {pedido.armadorNombre && <p>Armador: {pedido.armadorNombre}</p>}
              </div>
              {clientePendiente && (
                <p className="mt-1 font-body text-[11px] font-medium text-warning">Facturación debe completar los datos</p>
              )}

              <div className="mt-6">
                <div className="flex items-center gap-3">
                  <h2 className="font-heading text-[12px] font-bold uppercase tracking-[0.8px] text-outline">Cliente</h2>
                  {canEditar && (
                    <button
                      type="button"
                      onClick={() => setSheetCliente(true)}
                      className="font-body text-[12px] font-semibold text-primary transition hover:underline"
                    >
                      Cambiar cliente
                    </button>
                  )}
                </div>
                <p className="mt-1 font-heading text-[15px] font-semibold text-on-surface">{clienteActualNombre}</p>
                {clienteCambio && (
                  <p className="mt-1 font-body text-[11px] font-medium text-warning">Cambio de cliente sin guardar</p>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-body text-[12px]">
                  {clienteActual?.contacto && <div className="flex gap-1.5"><dt className="text-outline">Contacto:</dt><dd className="text-on-surface-variant">{clienteActual.contacto}</dd></div>}
                  {clienteActual?.cuit && <div className="flex gap-1.5"><dt className="text-outline">CUIT:</dt><dd className="text-on-surface-variant">{clienteActual.cuit}</dd></div>}
                  {clienteActual?.direccion && (
                    <div className="flex gap-1.5">
                      <dt className="text-outline">Dirección:</dt>
                      <dd className="text-on-surface-variant">{clienteActual.direccion}{clienteActual?.localidad ? `, ${clienteActual.localidad}` : ''}</dd>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0 lg:w-48">
              {canAprobar(pedido, rol, userId) && (
                <>
                  <Button onClick={() => setConfirm('aprobar')} disabled={clientePendiente} className="min-h-10 w-full">Aprobar</Button>
                  {clientePendiente && <p className="font-body text-[11px] font-medium text-warning text-center">El cliente debe ser validado por Facturación antes de aprobar</p>}
                </>
              )}
              {canTomar(pedido, rol, userId) && (
                <div data-testid="accion-tomar-desktop" className="hidden lg:block">
                  <Button variant="outline" onClick={() => setConfirm('tomar')} className="min-h-10 w-full">Tomar</Button>
                </div>
              )}
              {canCancelarDirecto(pedido, rol, userId) && (
                <Button variant="outline" onClick={() => setConfirm('cancelar')} className="min-h-10 w-full">Cancelar</Button>
              )}
              {canSolicitarCancelacion(pedido, rol, userId) && (
                <Button variant="outline" onClick={abrirSolicitarCancelacion} className="min-h-10 w-full">Solicitar cancelación</Button>
              )}
              {pedido.estado === 'PREPARADO' && !remitoVigente && (
                <p className="rounded-lg border border-primary-container/30 bg-primary-container/10 p-2 font-body text-[11px] font-medium text-primary-container text-center">
                  Esperando remito — Facturación debe emitirlo
                </p>
              )}
              {canDespachar(pedido, rol, userId) && (
                <div data-testid="accion-despachar-desktop" className="hidden lg:block">
                  <button type="button" onClick={() => setConfirm('despachar')} disabled={despacharMutation.isPending} className="min-h-10 w-full rounded-full border border-error/40 font-body text-[13px] font-semibold text-error transition hover:bg-error/10 disabled:opacity-50">Confirmar despacho</button>
                </div>
              )}
              {pedido.estado === 'DESPACHADO' && (
                <div className="text-center lg:text-right">
                  <p className="font-heading text-[13px] font-bold text-success">Pedido despachado</p>
                  {pedido.despachadoAt && <p className="mt-0.5 font-body text-[11px] text-on-surface-variant">El {formatFechaHora(pedido.despachadoAt)}</p>}
                </div>
              )}
              {pedido.estado === 'CANCELADO' && (
                <div className="text-center lg:text-right">
                  <p className="font-heading text-[13px] font-bold text-error">Pedido cancelado</p>
                  {pedido.motivoCancelacion && <p className="mt-0.5 font-body text-[11px] text-on-surface-variant">Motivo: {pedido.motivoCancelacion}</p>}
                </div>
              )}
            </div>
          </div>
        </div>

        {pedido.cancelacionSolicitadaAt && pedido.estado === 'EN_ARMADO' && (
          <div role="status" data-testid="banner-cancelacion" className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/40 bg-warning/10 p-4 lg:px-6">
            <div className="min-w-0">
              <p className="font-heading text-[13px] font-bold text-warning">Cancelación solicitada</p>
              {pedido.motivoCancelacion && <p className="mt-0.5 font-body text-[12px] text-on-surface-variant">Motivo: {pedido.motivoCancelacion}</p>}
            </div>
            {canConfirmarCancelacion(pedido, rol, userId) ? (
              <div className="hidden lg:block" data-testid="accion-cancelacion-desktop">
                <button type="button" onClick={abrirConfirmarCancelacion} className="rounded-full border border-warning/50 px-4 py-2 font-body text-[12px] font-semibold text-warning transition hover:bg-warning/20">Confirmar cancelación</button>
              </div>
            ) : (
              <p className="font-body text-[11px] text-on-surface-variant">Esperando confirmación del armador</p>
            )}
          </div>
        )}

        <div className="p-4 lg:p-6 space-y-6">
          {puedeProgreso && (
            <section aria-label="Progreso de armado" className="hidden lg:block rounded-xl border border-white/10 bg-surface-container p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <h2 className="font-heading text-[12px] font-bold uppercase tracking-[0.8px] text-outline">Armado</h2>
                  <p className="mt-1 font-body text-[12px] font-semibold text-on-surface">{itemsCompletados} de {pedido.items.length} items preparados</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-highest">
                    <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pedido.items.length === 0 ? 0 : (itemsCompletados / pedido.items.length) * 100}%` }} />
                  </div>
                </div>
                <div className="shrink-0 w-48 text-center">
                  <Button onClick={() => setConfirm('preparar')} disabled={!prepararListo} loading={prepararMutation.isPending} className="min-h-10 w-full">Preparar</Button>
                  {itemsPendientes > 0 && <p className="mt-2 text-center font-body text-[11px] font-medium text-warning">Faltan {itemsPendientes} items para poder preparar</p>}
                </div>
              </div>
            </section>
          )}

          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-[12px] font-bold uppercase tracking-[0.8px] text-outline">Productos</h2>
              {canEditar && (
                <button type="button" onClick={() => setSheetProductos(true)} className="rounded-full border border-primary/40 px-3.5 py-1.5 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/10">+ Agregar producto</button>
              )}
            </div>
            {pedido.estado === 'APROBADO' && canEditar && (
              <p className="mt-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5 font-body text-[11px] font-medium text-warning">
                Editar puede cambiar la disponibilidad y liberar la reserva actual
              </p>
            )}
            <div className="mt-3 space-y-3">
              {lineas.map(({ item, cajas, sueltos, unidades, producto }) => (
                <LineaDetalle
                  key={item.productoId}
                  productoId={item.productoId}
                  nombre={item.producto.nombre}
                  sku={item.producto.sku}
                  cajas={cajas}
                  sueltos={sueltos}
                  unidades={unidades}
                  unidadesPorCaja={item.producto.unidadesPorCaja}
                  disponible={producto?.disponible}
                  reservado={producto?.reservado}
                  completado={item.completado}
                  editable={canEditar}
                  completable={puedeProgreso}
                  onChange={(nCajas, nSueltos) => cambiarCantidad(item.productoId, nCajas, nSueltos)}
                  onEliminar={canEditar ? () => eliminarLinea(item.productoId) : undefined}
                  onToggleCompletar={puedeProgreso ? () => void toggleCompletar(item.id) : undefined}
                />
              ))}
            </div>
            {canEditar && (
              <div className="mt-5 flex flex-col lg:flex-row lg:items-center lg:justify-end gap-3 border-t border-white/10 pt-5">
                {pedido.estado === 'APROBADO' && (
                  <p className="text-center lg:text-right font-body text-[11px] text-on-surface-variant flex-1">
                    Al guardar se liberará la reserva actual y se volverá a reservar según la disponibilidad
                  </p>
                )}
                <Button onClick={handleGuardar} loading={guardando} disabled={!hayCambios} className="min-h-11 lg:min-h-10 w-full lg:w-auto px-6">Guardar cambios</Button>
              </div>
            )}
          </div>
        </div>

        {puedeVerPanelRemito && (
          <div className="border-t border-white/10 bg-surface-container/50 p-4 lg:p-6">
            {remitoVigente ? (
              <div className="lg:flex lg:items-center lg:justify-between lg:gap-6">
                <div className="flex-1">
                  <h2 className="font-heading text-[12px] font-bold uppercase tracking-[0.8px] text-outline">Remito Vigente</h2>
                  <div className="mt-2 rounded-xl border border-success/30 bg-success/10 p-3">
                    <p className="font-heading text-[14px] font-semibold text-on-surface">Remito {remitoVigente.numero}</p>
                    <p className="mt-0.5 font-body text-[12px] text-on-surface-variant">Fecha: {formatFecha(remitoVigente.fecha)}</p>
                    <p className="font-body text-[12px] text-on-surface-variant">Transporte: {remitoVigente.transporteNombre}{remitoVigente.transporteDireccion ? ` · ${remitoVigente.transporteDireccion}` : ''}</p>
                  </div>
                </div>
                <div className="mt-3 lg:mt-0 shrink-0 flex flex-col gap-2 lg:w-48">
                  <Button variant="outline" onClick={() => void descargarRemito()} className="min-h-10 w-full">Descargar PDF</Button>
                  <Button variant="outline" onClick={abrirAnular} className="min-h-10 w-full">Anular</Button>
                </div>
              </div>
            ) : canEmitirRemito(pedido, rol) ? (
              <div>
                <h2 className="font-heading text-[12px] font-bold uppercase tracking-[0.8px] text-outline">Emitir remito</h2>
                <div className="mt-3 flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 space-y-2.5">
                    <select
                      aria-label="Seleccionar transporte"
                      value={usarOcasional ? '__ocasional__' : transporteId}
                      onChange={(e) => {
                        const value = e.target.value
                        if (value === '__ocasional__') { setUsarOcasional(true); setTransporteId('') }
                        else { setUsarOcasional(false); setTransporteId(value) }
                      }}
                      className="input-field text-base"
                    >
                      <option value="">Seleccionar transporte</option>
                      {transportistas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                      <option value="__ocasional__">OTRO / TRANSPORTE OCASIONAL</option>
                    </select>
                    {usarOcasional && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                        <input ref={ocasionalNombreRef} value={ocasionalNombre} onChange={(e) => setOcasionalNombre(e.target.value)} aria-label="Nombre del transporte ocasional" placeholder="Nombre del transporte" className="input-field text-base" />
                        <input ref={ocasionalDireccionRef} value={ocasionalDireccion} onChange={(e) => setOcasionalDireccion(e.target.value)} aria-label="Dirección del transporte ocasional" placeholder="Dirección" className="input-field text-base" />
                      </div>
                    )}
                    {remitoError && <p role="alert" className="font-body text-[12px] font-medium text-error">{remitoError}</p>}
                  </div>
                  <div className="shrink-0 lg:w-48 lg:pt-0">
                    <Button onClick={() => void emitirRemito()} loading={emitirRemitoMutation.isPending} className="min-h-11 lg:min-h-10 w-full">Emitir remito</Button>
                  </div>
                </div>
              </div>
            ) : null}
            {remitosInvalidados.length > 0 && (
              <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
                <h3 className="font-heading text-[11px] font-bold uppercase tracking-[0.8px] text-outline">Remitos anteriores</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {remitosInvalidados.map((r) => (
                    <div key={r.id} className="rounded-lg border border-white/10 bg-surface-container p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-body text-[12px] font-semibold text-on-surface">Remito {r.numero}</p>
                        <Badge variant="error">Anulado</Badge>
                      </div>
                      <p className="mt-0.5 font-body text-[11px] text-outline">{formatFecha(r.fecha)}</p>
                      {r.motivoInvalidacion && <p className="mt-0.5 font-body text-[11px] text-on-surface-variant">Motivo: {r.motivoInvalidacion}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <CambiarClienteSheet
        open={sheetCliente}
        onClose={() => setSheetCliente(false)}
        clientes={clientes}
        recientes={clientesRecientes}
        onSelect={(cliente) => {
          setClienteIdLocal(cliente.id)
          setSheetCliente(false)
        }}
      />

      <BottomSheet open={sheetProductos} onClose={() => setSheetProductos(false)} title="Agregar producto" desktop="sheet">
        <div className="space-y-4">
          <input
            autoFocus
            type="search"
            value={busquedaProducto}
            onChange={(e) => setBusquedaProducto(e.target.value)}
            aria-label="Buscar producto"
            placeholder="Buscar producto por nombre o SKU"
            className="input-field text-base"
          />
          {busquedaProducto.trim() !== '' ? (
            <section aria-label="Resultados de búsqueda" className="space-y-2">
              <h2 className="font-heading text-[12px] font-bold uppercase tracking-[0.8px] text-outline">
                Resultados para “{busquedaProducto.trim()}”
              </h2>
              {resultadosBusqueda.length === 0 ? (
                <p className="py-6 text-center font-body text-[13px] text-on-surface-variant">
                  Sin resultados para “{busquedaProducto.trim()}”
                </p>
              ) : (
                resultadosBusqueda.map((r) => (
                  <ProductCard
                    key={r.id}
                    producto={r}
                    agregadoCajas={carrito[r.id]?.cajas}
                    agregadoSueltos={carrito[r.id]?.sueltos}
                    onChangeSueltos={(sueltos) => cambiarCantidad(r.id, carrito[r.id]?.cajas ?? 0, sueltos)}
                    onTap={() => agregarAlCarrito(r)}
                  />
                ))
              )}
            </section>
          ) : (
            <>
              {frecuentes.length > 0 && (
                <section aria-label="Frecuentes" className="space-y-2">
                  <h2 className="font-heading text-[12px] font-bold uppercase tracking-[0.8px] text-outline">
                    Frecuentes del cliente
                  </h2>
                  {frecuentes.map((p) => (
                    <ProductCard
                      key={p.id}
                      producto={p}
                      agregadoCajas={carrito[p.id]?.cajas}
                      agregadoSueltos={carrito[p.id]?.sueltos}
                      onChangeSueltos={(sueltos) => cambiarCantidad(p.id, carrito[p.id]?.cajas ?? 0, sueltos)}
                      onTap={() => agregarAlCarrito(p)}
                    />
                  ))}
                </section>
              )}
              {recientes.length > 0 && (
                <section aria-label="Recientes" className="space-y-2">
                  <h2 className="font-heading text-[12px] font-bold uppercase tracking-[0.8px] text-outline">
                    Recientes
                  </h2>
                  {recientes.map((p) => (
                    <ProductCard
                      key={p.id}
                      producto={p}
                      agregadoCajas={carrito[p.id]?.cajas}
                      agregadoSueltos={carrito[p.id]?.sueltos}
                      onChangeSueltos={(sueltos) => cambiarCantidad(p.id, carrito[p.id]?.cajas ?? 0, sueltos)}
                      onTap={() => agregarAlCarrito(p)}
                    />
                  ))}
                </section>
              )}
              {frecuentes.length === 0 && recientes.length === 0 && (
                <p className="py-6 text-center font-body text-[13px] text-on-surface-variant">
                  Sin pedidos previos: buscá un producto para agregar
                </p>
              )}
            </>
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={solicitarOpen} onClose={() => setSolicitarOpen(false)} title="Solicitar cancelación" desktop="sheet">
        <div className="space-y-4">
          <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 font-body text-[12px] leading-relaxed text-primary">
            El armador deberá confirmar. La reserva no se libera hasta entonces.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="motivo-solicitud" className="font-body text-[11px] text-outline">
              Motivo *
            </label>
            <textarea
              id="motivo-solicitud"
              value={motivoSolicitud}
              onChange={(e) => setMotivoSolicitud(e.target.value)}
              rows={3}
              placeholder="¿Por qué querés cancelar el pedido?"
              className="input-field text-base"
            />
          </div>
          {motivoSolicitudError && (
            <p role="alert" className="font-body text-[12px] font-medium text-error">
              {motivoSolicitudError}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setSolicitarOpen(false)} disabled={cancelarMutation.isPending} className="min-h-11 flex-1">
              Volver
            </Button>
            <Button onClick={() => void enviarSolicitud()} loading={cancelarMutation.isPending} className="min-h-11 flex-1">
              Enviar solicitud
            </Button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={confirmarOpen} onClose={() => setConfirmarOpen(false)} title="Confirmar cancelación" desktop="sheet">
        <div className="space-y-4">
          <p className="font-body text-[12px] leading-relaxed text-on-surface-variant">
            Confirmá la cancelación solicitada. Se liberará la reserva de stock.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="motivo-confirmar" className="font-body text-[11px] text-outline">
              Motivo
            </label>
            <textarea
              id="motivo-confirmar"
              value={motivoConfirmar}
              onChange={(e) => setMotivoConfirmar(e.target.value)}
              rows={3}
              className="input-field text-base"
            />
          </div>
          {motivoConfirmarError && (
            <p role="alert" className="font-body text-[12px] font-medium text-error">
              {motivoConfirmarError}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setConfirmarOpen(false)} disabled={confirmarCancelacionMutation.isPending} className="min-h-11 flex-1">
              Volver
            </Button>
            <Button
              onClick={() => void confirmarCancelacion()}
              loading={confirmarCancelacionMutation.isPending}
              className="min-h-11 flex-1"
            >
              Confirmar cancelación
            </Button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={anularOpen} onClose={() => setAnularOpen(false)} title="Anular remito" desktop="sheet">
        <div className="space-y-4">
          <p className="font-body text-[12px] leading-relaxed text-on-surface-variant">
            El remito dejará de estar vigente y podrá emitirse uno nuevo.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="motivo-anular" className="font-body text-[11px] text-outline">
              Motivo *
            </label>
            <textarea
              id="motivo-anular"
              value={motivoAnular}
              onChange={(e) => setMotivoAnular(e.target.value)}
              rows={3}
              placeholder="¿Por qué se anula el remito?"
              className="input-field text-base"
            />
          </div>
          {motivoAnularError && (
            <p role="alert" className="font-body text-[12px] font-medium text-error">
              {motivoAnularError}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setAnularOpen(false)} disabled={anularRemitoMutation.isPending} className="min-h-11 flex-1">
              Volver
            </Button>
            <Button onClick={() => void anularRemito()} loading={anularRemitoMutation.isPending} className="min-h-11 flex-1">
              Anular remito
            </Button>
          </div>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirm === 'aprobar'}
        titulo="Aprobar pedido"
        mensaje={`¿Aprobar ${pedido.numero}? Se reservará el stock.`}
        accion="Aprobar"
        loading={aprobarMutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void ejecutarConfirm()}
      />
      <ConfirmDialog
        open={confirm === 'tomar'}
        titulo="Tomar pedido"
        mensaje={`¿Tomar ${pedido.numero}? Quedará asignado a vos para el armado.`}
        accion="Tomar"
        loading={tomarMutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void ejecutarConfirm()}
      />
      <ConfirmDialog
        open={confirm === 'cancelar'}
        titulo="Cancelar pedido"
        mensaje={pedido.estado === 'APROBADO' ? 'Se liberará la reserva de stock' : 'Se descartará el pedido'}
        accion="Cancelar"
        loading={cancelarMutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void ejecutarConfirm()}
      />
      <ConfirmDialog
        open={confirm === 'guardar-aprobado'}
        titulo="Guardar cambios"
        mensaje="Esto puede cambiar la disponibilidad y liberará la reserva actual. ¿Continuar?"
        accion="Continuar"
        loading={guardando}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void ejecutarConfirm()}
      />
      <ConfirmDialog
        open={confirm === 'preparar'}
        titulo="Marcar preparado"
        mensaje={`¿Marcar ${pedido.numero} como preparado?`}
        accion="Preparar"
        loading={prepararMutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void ejecutarConfirm()}
      />
      <ConfirmDialog
        open={confirm === 'despachar'}
        titulo="Confirmar despacho"
        mensaje="Esta acción descontará definitivamente el stock."
        accion="Despachar"
        loading={despacharMutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void ejecutarConfirm()}
      />

      <ArmadorActionBar
        pedido={pedido}
        rol={rol}
        userId={userId}
        despachando={despacharMutation.isPending}
        onTomar={() => setConfirm('tomar')}
        onPreparar={() => setConfirm('preparar')}
        onDespachar={() => setConfirm('despachar')}
        onConfirmarCancelacion={abrirConfirmarCancelacion}
      />
    </div>
  )
}
