import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/lib/api-client'
import { toast } from '@/lib/toast'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { calcularUnidades } from '../lib/constants'
import {
  useClientes,
  useCreateCliente,
  usePedidos,
  useProductos,
  useProductosSearch,
  useCreatePedido,
  useAprobarPedido,
} from '../queries'
import type { Cliente, PedidoItemInput } from '../lib/api'
import { BottomSheet } from '../components/BottomSheet'
import { CartBottomBar } from '../components/CartBottomBar'
import { ProductCard, type ProductoCardDatos } from '../components/ProductCard'
import { QuantityStepper } from '../components/QuantityStepper'
import { StockIndicator, nivelStock } from '../components/StockIndicator'

interface CartLine {
  cajas: number
  sueltos: number
}

type Carrito = Record<string, CartLine>

interface LineaCarritoDatos {
  productoId: string
  producto?: ProductoCardDatos
  cajas: number
  sueltos: number
  unidades: number
}

function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function extractProductoIds(message: string): string[] {
  const ids = Array.from(message.matchAll(/producto ([A-Za-z0-9_-]+)/gi), (m) => m[1])
  return [...new Set(ids)]
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

const porActualizadoDesc = (a: { updatedAt: string }, b: { updatedAt: string }) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()

function ClienteCard({ cliente, onSelect }: { cliente: Cliente; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-surface-container-high p-4 text-left transition enabled:active:scale-[0.99]"
    >
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-on-surface">{cliente.nombre}</p>
        <p className="mt-0.5 truncate font-body text-[11px] text-outline">
          {cliente.contacto ?? cliente.referencia ?? '—'}
        </p>
      </div>
      {cliente.estado === 'PENDIENTE_CLIENTE' && <Badge variant="warning">Pendiente de validación</Badge>}
    </button>
  )
}

function LineaCarrito({
  linea,
  conflicto,
  onChange,
  onEliminar,
}: {
  linea: LineaCarritoDatos
  conflicto: boolean
  onChange: (cajas: number, sueltos: number) => void
  onEliminar: () => void
}) {
  const nombre = linea.producto?.nombre ?? 'Producto'
  const ceroUnidades = linea.unidades === 0

  return (
    <div
      data-testid={`linea-${linea.productoId}`}
      className={cn('space-y-2 rounded-xl border bg-surface-container p-3', conflicto ? 'border-error/60' : 'border-white/10')}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-semibold text-on-surface">{nombre}</p>
        <button
          type="button"
          onClick={onEliminar}
          aria-label={ceroUnidades ? 'Eliminar del pedido' : `Eliminar ${nombre}`}
          className={cn(
            'shrink-0 rounded-full px-3 py-1.5 font-body text-[11px] font-semibold transition',
            ceroUnidades
              ? 'border border-error/60 text-error hover:bg-error/10'
              : 'text-outline hover:text-error',
          )}
        >
          {ceroUnidades ? 'Eliminar del pedido' : 'Eliminar'}
        </button>
      </div>
      {linea.producto && <QuantityStepper cajas={linea.cajas} sueltos={linea.sueltos} unidadesPorCaja={linea.producto.unidadesPorCaja} onChange={onChange} />}
      {linea.producto && (
        <StockIndicator
          disponible={linea.producto.disponible}
          reservado={linea.producto.reservado}
          cantidadPedida={linea.unidades}
        />
      )}
      {conflicto && (
        <p className="font-body text-[11px] font-semibold text-error">Stock insuficiente según el servidor</p>
      )}
      {ceroUnidades && (
        <p className="font-body text-[11px] font-medium text-warning">
          0 unidades — la línea se excluye del pedido al guardar
        </p>
      )}
    </div>
  )
}

function NuevoClienteSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (cliente: Cliente) => void
}) {
  const [nombre, setNombre] = useState('')
  const [contacto, setContacto] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const createCliente = useCreateCliente()

  function reset() {
    setNombre('')
    setContacto('')
    setError(null)
  }

  async function handleSubmit() {
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
      onCreated(creado)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el cliente')
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="NUEVO CLIENTE" desktop="modal">
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
            onClick={onClose}
            disabled={createCliente.isPending}
            className="flex-1 rounded-full border border-white/10 px-4 py-3 font-body text-[14px] font-medium text-outline transition hover:bg-surface-variant hover:text-on-surface disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={createCliente.isPending}
            className="flex-[2] rounded-full bg-primary px-4 py-3 font-body text-[14px] font-bold text-on-primary transition hover:bg-primary/90 disabled:opacity-50"
          >
            {createCliente.isPending ? 'Creando...' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

export default function NuevoPedidoPage() {
  const navigate = useNavigate()

  const { data: clientes = [] } = useClientes()
  const { data: pedidos = [] } = usePedidos()
  const { data: productos = [], refetch: refetchProductos } = useProductos()

  const isExecutingRef = useRef(false)

  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const qProductoDebounced = useDebouncedValue(busquedaProducto.trim(), 250)
  const { data: resultadosBusqueda = [] } = useProductosSearch(qProductoDebounced)

  const [carrito, setCarrito] = useState<Carrito>({})
  const [sheetOpen, setSheetOpen] = useState(false)
  const [showNuevoCliente, setShowNuevoCliente] = useState(false)
  const [stockError, setStockError] = useState<{ ids: string[]; message: string } | null>(null)
  const [conflictIds, setConflictIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const createPedido = useCreatePedido()
  const aprobarPedido = useAprobarPedido()

  const pedidosActivos = useMemo(
    () => pedidos.filter((p) => p.estado !== 'CANCELADO').sort(porActualizadoDesc),
    [pedidos],
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
    if (!clienteSeleccionado) return []
    const counts = new Map<string, number>()
    for (const p of pedidosActivos) {
      if (p.clienteId !== clienteSeleccionado.id) continue
      for (const item of p.items) counts.set(item.productoId, (counts.get(item.productoId) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id)
  }, [pedidosActivos, clienteSeleccionado])

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

  const productoPorId = useMemo(() => {
    const map = new Map<string, ProductoCardDatos>()
    for (const p of productos) map.set(p.id, p)
    for (const r of resultadosBusqueda) if (!map.has(r.id)) map.set(r.id, r)
    return map
  }, [productos, resultadosBusqueda])

  const frecuentes = useMemo(
    () => frecuentesIds.map((id) => productoPorId.get(id)).filter((p): p is ProductoCardDatos => Boolean(p)),
    [frecuentesIds, productoPorId],
  )

  const recientes = useMemo(
    () => recientesIds.map((id) => productoPorId.get(id)).filter((p): p is ProductoCardDatos => Boolean(p)),
    [recientesIds, productoPorId],
  )

  const clientesFiltrados = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter((c) =>
      `${c.nombre} ${c.contacto ?? ''} ${c.referencia ?? ''}`.toLowerCase().includes(q),
    )
  }, [clientes, busquedaCliente])

  const clientesLista = useMemo(() => {
    if (busquedaCliente.trim() !== '') return clientesFiltrados
    const recientesIdsSet = new Set(clientesRecientes.map((c) => c.id))
    return clientesFiltrados.filter((c) => !recientesIdsSet.has(c.id))
  }, [busquedaCliente, clientesFiltrados, clientesRecientes])

  const lineasCarrito = useMemo(
    () =>
      Object.entries(carrito).map(([productoId, line]) => {
        const producto = productoPorId.get(productoId)
        return {
          productoId,
          producto,
          cajas: line.cajas,
          sueltos: line.sueltos,
          unidades: producto ? calcularUnidades(line.cajas, line.sueltos, producto.unidadesPorCaja) : 0,
        }
      }),
    [carrito, productoPorId],
  )

  const totalProductos = lineasCarrito.filter((l) => l.unidades > 0).length
  const totalUnidades = lineasCarrito.reduce((acc, l) => acc + l.unidades, 0)

  const lineasEnRojo = lineasCarrito.filter(
    (l) => l.unidades > 0 && l.producto && nivelStock(l.producto.disponible, l.unidades) === 'rojo',
  )
  const canAprobar = totalProductos > 0 && lineasEnRojo.length === 0

  function seleccionarCliente(cliente: Cliente) {
    setClienteSeleccionado(cliente)
    setBusquedaCliente('')
  }

  function cambiarCliente() {
    setClienteSeleccionado(null)
    setSheetOpen(false)
  }

  function agregarAlCarrito(producto: ProductoCardDatos) {
    setCarrito((prev) => {
      const actual = prev[producto.id]
      return { ...prev, [producto.id]: { cajas: (actual?.cajas ?? 0) + 1, sueltos: actual?.sueltos ?? 0 } }
    })
  }

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

  function buildItems(): PedidoItemInput[] {
    return lineasCarrito.filter((l) => l.unidades > 0).map((l) => ({ productoId: l.productoId, cantidad: l.unidades }))
  }

  async function handleGuardar() {
    if (!clienteSeleccionado || isExecutingRef.current) return
    const items = buildItems()
    if (items.length === 0) {
      toast.warning('Agregá al menos un producto al pedido')
      return
    }
    isExecutingRef.current = true
    setIsSubmitting(true)
    try {
      const creado = await createPedido.mutateAsync({
        clienteId: clienteSeleccionado.id,
        items,
        idempotencyKey: newIdempotencyKey(),
      })
      toast.success(`Borrador ${creado.numero} guardado`)
      navigate(`/ale-bet/pedidos/${creado.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar el borrador')
    } finally {
      isExecutingRef.current = false
      setIsSubmitting(false)
    }
  }

  async function handleAprobar() {
    if (!clienteSeleccionado || isExecutingRef.current) return
    const items = buildItems()
    if (items.length === 0) return
    isExecutingRef.current = true
    setIsSubmitting(true)
    try {
      const creado = await createPedido.mutateAsync({
        clienteId: clienteSeleccionado.id,
        items,
        idempotencyKey: newIdempotencyKey(),
      })
      try {
        const aprobado = await aprobarPedido.mutateAsync({
          id: creado.id,
          expectedVersion: creado.version,
          idempotencyKey: newIdempotencyKey(),
        })
        toast.success(`Pedido ${aprobado.numero} aprobado`)
        navigate(`/ale-bet/pedidos/${aprobado.id}`)
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          if (e.message.includes('PENDIENTE_CLIENTE')) {
            toast.error('El cliente debe ser validado por Facturación antes de aprobar. El pedido quedó guardado como borrador.')
            navigate(`/ale-bet/pedidos/${creado.id}`)
          } else if (e.message.includes('Stock insuficiente')) {
            const ids = extractProductoIds(e.message)
            setConflictIds(ids)
            setStockError({ ids, message: e.message })
            void refetchProductos()
            toast.error('Stock insuficiente: revisá las líneas en rojo del resumen')
          } else {
            toast.error(e.message)
          }
        } else {
          toast.error(e instanceof Error ? e.message : 'Error al aprobar el pedido')
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear el pedido')
    } finally {
      isExecutingRef.current = false
      setIsSubmitting(false)
    }
  }

  function cerrarErrorStock() {
    setStockError(null)
    setConflictIds([])
  }

  const resumenFooter = (
    <div className="space-y-3">
      <p className="font-body text-[12px] text-on-surface-variant">
        {totalProductos} productos · {totalUnidades} unidades
      </p>
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          onClick={handleGuardar}
          disabled={totalProductos === 0}
          loading={isSubmitting}
          className="min-h-11 w-full"
        >
          Guardar borrador
        </Button>
        <Button onClick={handleAprobar} disabled={!canAprobar} loading={isSubmitting} className="min-h-11 w-full">
          Aprobar y enviar
        </Button>
        {totalProductos > 0 && !canAprobar && (
          <p className="text-center font-body text-[11px] font-medium text-error">
            Hay líneas con stock insuficiente: ajustá las cantidades antes de aprobar.
          </p>
        )}
      </div>
    </div>
  )

  const resumenContenido = (
    <div className="space-y-3">
      <p className="font-body text-[12px] text-on-surface-variant">
        Cliente: <span className="font-semibold text-on-surface">{clienteSeleccionado?.nombre}</span>
      </p>
      {lineasCarrito.length === 0 ? (
        <p className="py-6 text-center font-body text-[13px] text-on-surface-variant">
          El pedido está vacío. Tocá un producto para agregarlo.
        </p>
      ) : (
        lineasCarrito.map((linea) => (
          <LineaCarrito
            key={linea.productoId}
            linea={linea}
            conflicto={conflictIds.includes(linea.productoId)}
            onChange={(cajas, sueltos) => cambiarCantidad(linea.productoId, cajas, sueltos)}
            onEliminar={() => eliminarLinea(linea.productoId)}
          />
        ))
      )}
    </div>
  )

  if (clienteSeleccionado === null) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-5 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <header className="space-y-1">
          <h1 className="text-[28px] font-bold tracking-tight text-on-surface">Nuevo pedido</h1>
          <p className="font-body text-[13px] text-on-surface-variant">¿Para quién es el pedido?</p>
        </header>

        <input
          autoFocus
          type="search"
          value={busquedaCliente}
          onChange={(e) => setBusquedaCliente(e.target.value)}
          aria-label="Buscar cliente"
          placeholder="Buscar por nombre, contacto o referencia"
          className="input-field text-base"
        />

        {busquedaCliente.trim() === '' && clientesRecientes.length > 0 && (
          <section aria-label="Clientes recientes" className="space-y-2">
            <h2 className="font-body text-[12px] font-medium uppercase tracking-wide text-outline">Recientes</h2>
            {clientesRecientes.map((c) => (
              <ClienteCard key={c.id} cliente={c} onSelect={() => seleccionarCliente(c)} />
            ))}
          </section>
        )}

        <section aria-label="Lista de clientes" className="space-y-2">
          <h2 className="font-body text-[12px] font-medium uppercase tracking-wide text-outline">
            {busquedaCliente.trim() === '' ? 'Todos los clientes' : 'Resultados'}
          </h2>
          {clientesLista.length === 0 ? (
            <p className="py-8 text-center font-body text-[13px] text-on-surface-variant">
              Sin resultados para “{busquedaCliente}”
            </p>
          ) : (
            clientesLista.map((c) => (
              <ClienteCard key={c.id} cliente={c} onSelect={() => seleccionarCliente(c)} />
            ))
          )}
        </section>

        <button
          type="button"
          onClick={() => setShowNuevoCliente(true)}
          className="w-full rounded-xl border border-dashed border-primary/50 p-4 font-body text-[13px] font-semibold text-primary transition hover:bg-primary/10"
        >
          + Cliente nuevo
        </button>

        <NuevoClienteSheet
          open={showNuevoCliente}
          onClose={() => setShowNuevoCliente(false)}
          onCreated={(cliente) => {
            seleccionarCliente(cliente)
            setShowNuevoCliente(false)
            toast.success('Cliente creado. Facturación debe validarlo.')
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-[calc(env(safe-area-inset-bottom)+8rem)] lg:pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-on-surface">Nuevo pedido</h1>
          <p className="font-body text-[13px] text-on-surface-variant">Agregá productos al pedido</p>
        </div>
        <div
          data-testid="cliente-chip"
          className="flex min-w-0 flex-wrap items-center gap-2 rounded-full border border-white/10 bg-surface-container-high py-1.5 pl-4 pr-1.5"
        >
          <span className="min-w-0 font-body text-[12px] font-semibold text-on-surface">
            <span className="text-outline">Cliente: </span>
            <span className="truncate">{clienteSeleccionado.nombre}</span>
          </span>
          {clienteSeleccionado.estado === 'PENDIENTE_CLIENTE' && (
            <Badge variant="warning">Pendiente de validación por Facturación</Badge>
          )}
          <button
            type="button"
            onClick={cambiarCliente}
            className="min-h-11 rounded-full px-3 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/10"
          >
            Cambiar
          </button>
        </div>
      </header>

      {stockError && (
        <div
          role="alert"
          data-testid="stock-error-banner"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error/40 bg-error/10 p-4"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-error">Stock insuficiente</p>
            <p className="mt-0.5 font-body text-[12px] text-on-surface-variant">
              {stockError.message}
              {stockError.ids.length > 0 && (
                <span>
                  {' '}
                  Revisá: {stockError.ids.map((id) => productoPorId.get(id)?.nombre ?? id).join(', ')}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={cerrarErrorStock}
            className="rounded-full border border-error/50 px-4 py-2 font-body text-[12px] font-semibold text-error transition hover:bg-error/10"
          >
            Entendido
          </button>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-5">
          <input
            type="search"
            value={busquedaProducto}
            onChange={(e) => setBusquedaProducto(e.target.value)}
            aria-label="Buscar producto"
            placeholder="Buscar producto por nombre o SKU"
            className="input-field text-base"
          />

          {busquedaProducto.trim() !== '' ? (
            <section aria-label="Resultados de búsqueda" className="space-y-2">
              <h2 className="font-body text-[12px] font-medium uppercase tracking-wide text-outline">
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
                  <h2 className="font-body text-[12px] font-medium uppercase tracking-wide text-outline">
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
                  <h2 className="font-body text-[12px] font-medium uppercase tracking-wide text-outline">
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
                  Sin pedidos previos: buscá un producto para comenzar.
                </p>
              )}
            </>
          )}
        </div>

        <BottomSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          desktop="panel"
          title="Resumen del pedido"
          footer={resumenFooter}
        >
          {resumenContenido}
        </BottomSheet>
      </div>

      <CartBottomBar
        productos={totalProductos}
        unidades={totalUnidades}
        onOpen={() => setSheetOpen(true)}
        className="bottom-[calc(env(safe-area-inset-bottom)+52px)]"
      />

      <NuevoClienteSheet
        open={showNuevoCliente}
        onClose={() => setShowNuevoCliente(false)}
        onCreated={(cliente) => {
          seleccionarCliente(cliente)
          setShowNuevoCliente(false)
          toast.success('Cliente creado. Facturación debe validarlo.')
        }}
      />
    </div>
  )
}
