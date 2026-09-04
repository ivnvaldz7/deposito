import { type FormEvent, useState } from 'react'
import { toast } from '@/lib/toast'
import { useAperturaAdminStock, useCreateAdminLote, useProductoAdminStock, useProductos } from '../queries'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function SaldoAperturaStockModal({ onClose }: { onClose: () => void }) {
  const { data: catalogo = [], isLoading: catalogoLoading } = useProductos()
  const [productoId, setProductoId] = useState('')
  const [loteId, setLoteId] = useState('')
  const [ubicacionId, setUbicacionId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [fechaEfectiva, setFechaEfectiva] = useState(today)
  const [mostrarLoteNuevo, setMostrarLoteNuevo] = useState(false)
  const [numeroLoteNuevo, setNumeroLoteNuevo] = useState('')
  const [fechaProduccion, setFechaProduccion] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const producto = catalogo.find((item) => item.id === productoId && item.activo)
  const { data: stockProducto, isLoading: lotesLoading } = useProductoAdminStock(productoId)
  const crearLote = useCreateAdminLote()
  const apertura = useAperturaAdminStock()
  const ubicaciones = (stockProducto?.ubicaciones ?? []).filter((ubicacion) => ubicacion.codigo === 'DEPOSITO' || ubicacion.codigo === 'ACONDICIONADO')
  const lote = stockProducto?.lotes.find((item) => item.id === loteId)
  const ubicacion = ubicaciones.find((item) => item.id === ubicacionId)
  const cantidadNumerica = Number(cantidad)

  function seleccionarProducto(id: string) {
    setProductoId(id)
    setLoteId('')
    setUbicacionId('')
    setMostrarLoteNuevo(false)
    setConfirming(false)
    setError(null)
  }

  async function registrarLoteReal() {
    if (!producto || !numeroLoteNuevo.trim()) {
      setError('Ingresá el número de lote físico para registrarlo.')
      return
    }
    setError(null)
    try {
      const creado = await crearLote.mutateAsync({
        productoId: producto.id,
        numero: numeroLoteNuevo.trim(),
        fechaProduccion: fechaProduccion ? new Date(`${fechaProduccion}T00:00:00.000Z`).toISOString() : null,
        fechaVencimiento: fechaVencimiento ? new Date(`${fechaVencimiento}T00:00:00.000Z`).toISOString() : null,
      })
      setLoteId(creado.id)
      setMostrarLoteNuevo(false)
      setNumeroLoteNuevo('')
      setFechaProduccion('')
      setFechaVencimiento('')
      toast.success('Lote real registrado. Ahora podés completar el saldo de apertura.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar el lote.')
    }
  }

  function revisarApertura(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!producto || !lote || !ubicacion || !Number.isInteger(cantidadNumerica) || cantidadNumerica <= 0) {
      setError('Seleccioná producto, lote, ubicación e ingresá una cantidad entera mayor a cero.')
      return
    }
    setError(null)
    setConfirming(true)
  }

  async function confirmarApertura() {
    if (!producto || !lote || !ubicacion) return
    try {
      await apertura.mutateAsync({
        productoId: producto.id,
        loteId: lote.id,
        ubicacionId: ubicacion.id,
        cantidadFinal: cantidadNumerica,
        fechaEfectiva,
        idempotencyKey: crypto.randomUUID(),
      })
      toast.success('Saldo de apertura registrado.')
      onClose()
    } catch (cause) {
      setConfirming(false)
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar el saldo de apertura.')
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/10 bg-surface-container p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-[20px] font-semibold text-on-surface">Saldo de apertura</h2>
        <p className="mt-1 font-body text-[13px] text-on-surface-variant">Registrá el stock físico inicial por producto, lote y ubicación.</p>

        {confirming ? (
          <div className="mt-6 space-y-4">
            <p className="font-body text-[13px] text-on-surface-variant">Confirmá los datos antes de registrar. Esta operación no es un ajuste ni una transferencia.</p>
            <dl className="space-y-2 rounded-lg bg-surface-container-high p-4 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">Producto</dt><dd className="text-right font-semibold text-on-surface">{producto?.nombre}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">Lote</dt><dd className="text-right font-semibold text-on-surface">{lote?.numero}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">Ubicación</dt><dd className="text-right font-semibold text-on-surface">{ubicacion?.nombre}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">Cantidad</dt><dd className="text-right font-semibold text-on-surface">{cantidadNumerica} unidades</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">Fecha efectiva</dt><dd className="text-right font-semibold text-on-surface">{fechaEfectiva}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">Motivo</dt><dd className="text-right font-semibold text-on-surface">Saldo de apertura</dd></div>
            </dl>
            {error && <p className="text-sm text-error">{error}</p>}
            <div className="flex gap-3">
              <button type="button" className="btn-secondary flex-1" disabled={apertura.isPending} onClick={() => setConfirming(false)}>Volver</button>
              <button type="button" className="btn-primary flex-1" disabled={apertura.isPending} onClick={confirmarApertura}>{apertura.isPending ? 'Registrando…' : 'Registrar saldo de apertura'}</button>
            </div>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={revisarApertura}>
            <label className="block font-body text-[12px] text-outline">Producto
              <select aria-label="Producto" className="input-field mt-1 w-full" value={productoId} disabled={catalogoLoading} onChange={(event) => seleccionarProducto(event.target.value)}>
                <option value="">Seleccionar producto terminado</option>
                {catalogo.filter((item) => item.activo).map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
              </select>
            </label>
            {producto && <p className="text-sm text-on-surface-variant">Unidad de stock: unidades{producto.unidadesPorCaja > 1 ? ` (presentación: ${producto.unidadesPorCaja} unidades por caja)` : ''}</p>}
            {producto && <>
              <label className="block font-body text-[12px] text-outline">Lote
                <select aria-label="Lote" className="input-field mt-1 w-full" value={loteId} disabled={lotesLoading} onChange={(event) => setLoteId(event.target.value)}>
                  <option value="">Seleccionar lote real</option>
                  {(stockProducto?.lotes ?? []).map((item) => <option key={item.id} value={item.id}>{item.numero}</option>)}
                </select>
              </label>
              <button type="button" className="text-sm text-primary underline" onClick={() => setMostrarLoteNuevo((value) => !value)}>{mostrarLoteNuevo ? 'Usar un lote existente' : 'Registrar lote real nuevo'}</button>
              {mostrarLoteNuevo && <div className="space-y-3 rounded-lg border border-white/10 p-4">
                <label className="block font-body text-[12px] text-outline">Número de lote físico<input aria-label="Número de lote físico" className="input-field mt-1 w-full" value={numeroLoteNuevo} onChange={(event) => setNumeroLoteNuevo(event.target.value)} /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block font-body text-[12px] text-outline">Producción<input aria-label="Fecha de producción" type="date" className="input-field mt-1 w-full" value={fechaProduccion} onChange={(event) => setFechaProduccion(event.target.value)} /></label>
                  <label className="block font-body text-[12px] text-outline">Vencimiento<input aria-label="Fecha de vencimiento" type="date" className="input-field mt-1 w-full" value={fechaVencimiento} onChange={(event) => setFechaVencimiento(event.target.value)} /></label>
                </div>
                <button type="button" className="btn-secondary w-full" disabled={crearLote.isPending} onClick={registrarLoteReal}>{crearLote.isPending ? 'Registrando lote…' : 'Registrar lote real'}</button>
              </div>}
              <label className="block font-body text-[12px] text-outline">Ubicación
                <select aria-label="Ubicación" className="input-field mt-1 w-full" value={ubicacionId} onChange={(event) => setUbicacionId(event.target.value)}>
                  <option value="">Seleccionar ubicación</option>
                  {ubicaciones.map((item) => <option key={item.id} value={item.id}>{item.codigo === 'DEPOSITO' ? 'DEPÓSITO' : 'ACONDICIONADO'} — {item.nombre}</option>)}
                </select>
              </label>
              <label className="block font-body text-[12px] text-outline">Cantidad (unidades)<input aria-label="Cantidad" type="number" min="1" step="1" className="input-field mt-1 w-full" value={cantidad} onChange={(event) => setCantidad(event.target.value)} /></label>
              <label className="block font-body text-[12px] text-outline">Fecha efectiva<input aria-label="Fecha efectiva" type="date" className="input-field mt-1 w-full" value={fechaEfectiva} onChange={(event) => setFechaEfectiva(event.target.value)} /></label>
              <div className="rounded-lg bg-surface-container-high p-3 text-sm text-on-surface-variant">Motivo: <span className="font-semibold text-on-surface">Saldo de apertura</span></div>
            </>}
            {error && <p className="text-sm text-error">{error}</p>}
            <div className="flex gap-3"><button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button><button type="submit" className="btn-primary flex-1">Revisar apertura</button></div>
          </form>
        )}
      </div>
    </div>
  )
}
