import { useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowDownLeft, ArrowUpRight, Download, History, Search, X } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { can } from '@/lib/permissions'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/Dialog'
import { api, ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { crearClaveOperacion, useCrearMovimientoZerox, useZeroxMovimientos, useZeroxSaldos, zeroxParams, type ZeroxCategoria, type ZeroxFiltros, type ZeroxSaldo, type ZeroxTipo } from '../queries/use-zerox'

function hoyLocal(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { timeZone: 'UTC' })
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR')
}

function MovimientoModal({ saldo, tipo, onClose }: { saldo: ZeroxSaldo; tipo: ZeroxTipo; onClose: () => void }) {
  const [cantidad, setCantidad] = useState('')
  const [fechaMovimiento, setFechaMovimiento] = useState(hoyLocal)
  const [observacion, setObservacion] = useState('')
  const [claveOperacion] = useState(crearClaveOperacion)
  const mutation = useCrearMovimientoZerox()
  const numero = Number(cantidad)
  const invalido = !Number.isSafeInteger(numero) || numero <= 0 || (tipo === 'salida' && numero > saldo.saldo)

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (invalido || !fechaMovimiento) return
    try {
      await mutation.mutateAsync({ claveOperacion, productoId: saldo.productoId, tipo, cantidad: numero, fechaMovimiento, observacion: observacion.trim() || undefined })
      toast.success(`${tipo === 'ingreso' ? 'Ingreso' : 'Salida'} registrado en ZEROX.`)
      onClose()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo registrar el movimiento.')
    }
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{tipo === 'ingreso' ? 'Ingreso a ZEROX' : 'Salida de ZEROX'}</DialogTitle>
        <DialogDescription>{saldo.nombre} · Saldo actual: {saldo.saldo.toLocaleString('es-AR')} unidades</DialogDescription>
      </DialogHeader>
      <form onSubmit={(event) => void guardar(event)} className="space-y-4">
        <label className="block space-y-1 text-sm text-on-surface-variant">
          <span>Cantidad (unidades)</span>
          <input aria-label="Cantidad (unidades)" autoFocus type="number" min="1" step="1" max={tipo === 'salida' ? saldo.saldo : undefined} value={cantidad} onChange={(event) => setCantidad(event.target.value)} className="input-field w-full" required />
        </label>
        {tipo === 'salida' && numero > saldo.saldo && <p className="text-sm text-error">La salida supera el saldo en ZEROX.</p>}
        <label className="block space-y-1 text-sm text-on-surface-variant">
          <span>Fecha del movimiento</span>
          <input aria-label="Fecha del movimiento" type="date" value={fechaMovimiento} onChange={(event) => setFechaMovimiento(event.target.value)} className="input-field w-full" required />
        </label>
        <p className="text-xs text-on-surface-variant">Podés usar una fecha anterior. La fecha y hora real de carga se guardan automáticamente.</p>
        <label className="block space-y-1 text-sm text-on-surface-variant">
          <span>Observación (opcional)</span>
          <textarea aria-label="Observación" value={observacion} maxLength={500} onChange={(event) => setObservacion(event.target.value)} className="input-field w-full resize-y" rows={2} placeholder="Remito, corrección u otro detalle" />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-outline-variant/40 px-4 py-2 text-sm text-on-surface">Cancelar</button>
          <button type="submit" disabled={invalido || !fechaMovimiento || mutation.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50">{mutation.isPending ? 'Guardando…' : 'Registrar movimiento'}</button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}

export default function ZeroxPage() {
  const user = useAuthStore((state) => state.user)
  const canManage = can(user, 'deposito', 'pendientes.manage')
  const [categoria, setCategoria] = useState<ZeroxCategoria>('frasco')
  const [buscarSaldo, setBuscarSaldo] = useState('')
  const [seleccion, setSeleccion] = useState<{ saldo: ZeroxSaldo; tipo: ZeroxTipo } | null>(null)
  const [productoId, setProductoId] = useState('')
  const [tipo, setTipo] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [cantidadMin, setCantidadMin] = useState('')
  const [cantidadMax, setCantidadMax] = useState('')
  const [pagina, setPagina] = useState(1)
  const [exportando, setExportando] = useState(false)
  const [historialAbierto, setHistorialAbierto] = useState(false)
  const historialButtonRef = useRef<HTMLButtonElement>(null)
  const saldosQuery = useZeroxSaldos(categoria)
  const filtros: ZeroxFiltros = {
    categoria, productoId: productoId || undefined, tipo: tipo === 'ingreso' || tipo === 'salida' ? tipo : undefined,
    desde: desde || undefined, hasta: hasta || undefined, cantidadMin: cantidadMin || undefined, cantidadMax: cantidadMax || undefined, pagina,
  }
  const movimientosQuery = useZeroxMovimientos(filtros, historialAbierto)
  const saldos = saldosQuery.data ?? []
  const saldosVisibles = useMemo(() => saldos.filter((saldo) => `${saldo.nombre} ${saldo.codigo ?? ''}`.toLocaleLowerCase().includes(buscarSaldo.trim().toLocaleLowerCase())), [saldos, buscarSaldo])

  function cambiarCategoria(next: ZeroxCategoria) {
    setCategoria(next)
    setBuscarSaldo('')
    setProductoId('')
    setPagina(1)
  }

  function cerrarHistorial() {
    setHistorialAbierto(false)
    requestAnimationFrame(() => historialButtonRef.current?.focus())
  }

  async function exportar(vista: 'movimientos' | 'saldos') {
    setExportando(true)
    try {
      const buscar = vista === 'saldos' && buscarSaldo.trim() ? `&buscar=${encodeURIComponent(buscarSaldo.trim())}` : ''
      const blob = await api.getBlob(`/zerox/exportar?${zeroxParams(filtros)}&vista=${vista}${buscar}`)
      const extension = blob.type.includes('text/csv') ? 'csv' : 'xlsx'
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = vista === 'saldos' ? `zerox-saldos-${categoria}.${extension}` : `zerox-historial-${categoria}.${extension}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo exportar el archivo.')
    } finally { setExportando(false) }
  }

  return <div className="space-y-5">
    <header>
      <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">ZEROX</h1>
      <p className="mt-1 text-sm text-on-surface-variant">Existencias externas de frascos y tapas.</p>
    </header>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de producto en ZEROX">
        {(['frasco', 'tapa'] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={categoria === item} onClick={() => cambiarCategoria(item)} className={`rounded-lg border px-5 py-2 text-sm font-semibold transition-colors ${categoria === item ? 'border-primary bg-primary/15 text-primary' : 'border-outline-variant/40 bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}`}>{item === 'frasco' ? 'Frascos' : 'Tapas'}</button>)}
      </div>
      <button ref={historialButtonRef} type="button" onClick={() => setHistorialAbierto(true)} className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/50 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-high"><History size={17} /> Historial</button>
    </div>

    <section className="space-y-3" aria-label={`Saldos de ${categoria === 'frasco' ? 'frascos' : 'tapas'} en ZEROX`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-on-surface">Existencias en ZEROX</h2>
        <button type="button" onClick={() => void exportar('saldos')} disabled={exportando} className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/40 px-3 py-2 text-sm text-on-surface hover:bg-surface-container-high disabled:opacity-50"><Download size={15} /> Descargar saldos</button>
      </div>
      <div className="relative max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" /><input aria-label="Buscar producto en saldos" value={buscarSaldo} onChange={(event) => setBuscarSaldo(event.target.value)} placeholder="Buscar producto o código" className="input-field w-full pl-9" /></div>
      {saldosQuery.isLoading ? <p className="py-8 text-sm text-on-surface-variant">Cargando saldos…</p> : saldosQuery.error ? <p className="py-8 text-sm text-error">No se pudieron cargar los saldos.</p> : <div className="overflow-x-auto rounded-xl border border-outline-variant/30 bg-surface-container-low">
        <table className="w-full min-w-[580px] text-left text-sm"><thead className="border-b border-outline-variant/30 text-xs uppercase tracking-wider text-on-surface-variant"><tr><th className="px-4 py-3">Producto</th><th className="px-4 py-3 text-right">En ZEROX</th><th className="px-4 py-3 text-right">Movimientos</th></tr></thead><tbody>
          {saldosVisibles.map((saldo) => <tr key={saldo.productoId} className="border-t border-outline-variant/20"><td className="px-4 py-3"><div className="font-semibold text-on-surface">{saldo.nombre}</div><div className="text-xs text-on-surface-variant">{saldo.codigo ?? 'Sin código'}{!saldo.activo ? ' · Inactivo' : !saldo.permiteIngreso ? ' · Fuera de lista actual' : ''}</div></td><td className="px-4 py-3 text-right font-semibold tabular-nums text-on-surface">{saldo.saldo.toLocaleString('es-AR')} <span className="font-normal text-on-surface-variant">uds</span></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" disabled={!canManage || !saldo.permiteIngreso} onClick={() => setSeleccion({ saldo, tipo: 'ingreso' })} className="rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-40">+ Ingreso</button><button type="button" disabled={!canManage || saldo.saldo === 0} onClick={() => setSeleccion({ saldo, tipo: 'salida' })} className="rounded-lg border border-outline-variant/50 px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-40">− Salida</button></div></td></tr>)}
          {saldosVisibles.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-on-surface-variant">No hay productos para esta búsqueda.</td></tr>}
        </tbody></table>
      </div>}
    </section>

    {historialAbierto && <Dialog open large ariaLabel="Historial auditable de ZEROX" onOpenChange={(open) => { if (!open) cerrarHistorial() }}>
      <DialogContent className="flex h-[92dvh] min-h-0 flex-col gap-4 overflow-y-auto md:h-full md:overflow-hidden">
      <section className="flex min-h-0 flex-1 flex-col gap-3" aria-label="Historial de ZEROX">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-on-surface">Historial auditable · {categoria === 'frasco' ? 'Frascos' : 'Tapas'}</h2><p className="text-xs text-on-surface-variant">Para corregir un error, registrá un movimiento opuesto y explicalo en la observación.</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => void exportar('movimientos')} disabled={exportando} className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/40 px-3 py-2 text-sm text-on-surface hover:bg-surface-container-high disabled:opacity-50"><Download size={15} /> Descargar historial</button><button type="button" autoFocus aria-label="Cerrar historial" onClick={cerrarHistorial} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"><X size={18} /></button></div></div>
      <div className="grid gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-on-surface-variant">Producto<select aria-label="Filtrar producto" value={productoId} onChange={(event) => { setProductoId(event.target.value); setPagina(1) }} className="input-field mt-1 w-full"><option value="">Todos</option>{saldos.map((saldo) => <option key={saldo.productoId} value={saldo.productoId}>{saldo.nombre}</option>)}</select></label>
        <label className="text-xs text-on-surface-variant">Movimiento<select aria-label="Filtrar tipo" value={tipo} onChange={(event) => { setTipo(event.target.value); setPagina(1) }} className="input-field mt-1 w-full"><option value="">Todos</option><option value="ingreso">Ingreso</option><option value="salida">Salida</option></select></label>
        <label className="text-xs text-on-surface-variant">Desde<input aria-label="Desde" type="date" value={desde} onChange={(event) => { setDesde(event.target.value); setPagina(1) }} className="input-field mt-1 w-full" /></label>
        <label className="text-xs text-on-surface-variant">Hasta<input aria-label="Hasta" type="date" value={hasta} onChange={(event) => { setHasta(event.target.value); setPagina(1) }} className="input-field mt-1 w-full" /></label>
        <label className="text-xs text-on-surface-variant">Cantidad mínima<input aria-label="Cantidad mínima" type="number" min="1" value={cantidadMin} onChange={(event) => { setCantidadMin(event.target.value); setPagina(1) }} className="input-field mt-1 w-full" /></label>
        <label className="text-xs text-on-surface-variant">Cantidad máxima<input aria-label="Cantidad máxima" type="number" min="1" value={cantidadMax} onChange={(event) => { setCantidadMax(event.target.value); setPagina(1) }} className="input-field mt-1 w-full" /></label>
        <button type="button" onClick={() => { setProductoId(''); setTipo(''); setDesde(''); setHasta(''); setCantidadMin(''); setCantidadMax(''); setPagina(1) }} className="mt-auto inline-flex items-center justify-center gap-1 rounded-lg border border-outline-variant/40 px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container-high"><X size={14} /> Limpiar filtros</button>
      </div>
      {movimientosQuery.isLoading ? <p className="py-8 text-sm text-on-surface-variant">Cargando historial…</p> : movimientosQuery.error ? <p className="py-8 text-sm text-error">No se pudo cargar el historial. Revisá los filtros.</p> : <div className="min-h-40 flex-1 overflow-auto rounded-xl border border-outline-variant/30 bg-surface-container-low"><table className="w-full min-w-[900px] text-left text-sm"><thead className="sticky top-0 border-b border-outline-variant/30 bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3 text-right">Cantidad</th><th className="px-4 py-3 text-right">Saldo tras carga</th><th className="px-4 py-3">Cargado por</th><th className="px-4 py-3">Observación</th></tr></thead><tbody>
        {(movimientosQuery.data?.items ?? []).map((item) => <tr key={item.id} className="border-t border-outline-variant/20"><td className="whitespace-nowrap px-4 py-3 tabular-nums text-on-surface">{fecha(item.fechaMovimiento)}<div className="text-xs text-on-surface-variant" title="Fecha real de carga">Cargado: {fechaHora(item.registradoAt)}</div></td><td className="px-4 py-3 font-medium text-on-surface">{item.nombreProducto}</td><td className={`px-4 py-3 ${item.tipo === 'ingreso' ? 'text-primary' : 'text-warning'}`}>{item.tipo === 'ingreso' ? <span className="inline-flex items-center gap-1"><ArrowDownLeft size={15} /> Ingreso</span> : <span className="inline-flex items-center gap-1"><ArrowUpRight size={15} /> Salida</span>}</td><td className="px-4 py-3 text-right tabular-nums text-on-surface">{item.tipo === 'ingreso' ? '+' : '−'}{item.cantidad.toLocaleString('es-AR')}</td><td className="px-4 py-3 text-right tabular-nums text-on-surface">{item.saldoResultante.toLocaleString('es-AR')}</td><td className="px-4 py-3 text-on-surface-variant">{item.usuario.name}</td><td className="max-w-56 px-4 py-3 text-on-surface-variant">{item.observacion || '—'}</td></tr>)}
        {(movimientosQuery.data?.items.length ?? 0) === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">Sin movimientos para los filtros elegidos.</td></tr>}
      </tbody></table></div>}
      {(movimientosQuery.data?.paginas ?? 0) > 1 && <div className="flex items-center justify-end gap-3 text-sm text-on-surface-variant"><button type="button" disabled={pagina <= 1} onClick={() => setPagina((current) => current - 1)} className="rounded-lg border border-outline-variant/40 px-3 py-1.5 disabled:opacity-40">Anterior</button><span>Página {pagina} de {movimientosQuery.data?.paginas}</span><button type="button" disabled={pagina >= (movimientosQuery.data?.paginas ?? 0)} onClick={() => setPagina((current) => current + 1)} className="rounded-lg border border-outline-variant/40 px-3 py-1.5 disabled:opacity-40">Siguiente</button></div>}
      </section>
      </DialogContent>
    </Dialog>}
    {seleccion && <MovimientoModal saldo={seleccion.saldo} tipo={seleccion.tipo} onClose={() => setSeleccion(null)} />}
  </div>
}
