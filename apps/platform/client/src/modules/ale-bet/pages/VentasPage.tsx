import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, FileDown, FileSpreadsheet, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlassCard } from '@/components/ui/GlassCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/lib/toast'
import { aleBetApi, type Cliente, type ProductoAgregado, type ReporteVentas } from '../lib/api'
import { useClientes, useVentas } from '../queries'
import { generarExcelVentas } from '../lib/ventas-excel'

// Module-private Spanish month names: deterministic and testable (no Intl month formatting).
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// Year range mirrors the backend validation (2000-2100).
const AÑOS = Array.from({ length: 101 }, (_, i) => 2000 + i)

// Thousands separator ("1.426"). Safe under jsdom; never use timeStyle (crash precedent).
const fmtUnidades = new Intl.NumberFormat('es-AR')

/**
 * Mini slug for download filenames: strips diacritics, lowercases, collapses
 * non-alphanumeric runs to hyphens, and trims leading/trailing dashes.
 * Mirrors the server-side slugify (ALEBET-FACT-02 R5) without importing it.
 */
function miniSlugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function formatClienteChip(cliente: Cliente): string {
  return cliente.cuit ? `${cliente.nombre} / ${cliente.cuit}` : cliente.nombre
}

function isEmptyReport(reporte: ReporteVentas): boolean {
  if (reporte.modo === 'anual') return reporte.meses.length === 0
  return reporte.pedidosDespachados === 0 && reporte.productos.length === 0
}

function ClienteCombobox({
  clientes,
  cliente,
  onSelect,
}: {
  clientes: Cliente[]
  cliente: Cliente | null
  onSelect: (cliente: Cliente | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter(
      (c) => c.nombre.toLowerCase().includes(q) || (c.cuit ?? '').toLowerCase().includes(q),
    )
  }, [clientes, query])

  return (
    <div className="relative w-full md:w-[400px]" ref={ref}>
      <div className="relative">
        <input
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls="ventas-cliente-listbox"
          type="text"
          className="input-field w-full h-11 pr-10"
          placeholder="Buscar cliente..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            // Typing after a selection clears it.
            if (cliente) onSelect(null)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
        />
        {cliente || query ? (
          <button
            type="button"
            aria-label="Quitar cliente"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
            onClick={() => {
              onSelect(null)
              setQuery('')
              setOpen(true)
            }}
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
        )}
      </div>

      {open && (
        <div
          id="ventas-cliente-listbox"
          role="listbox"
          className="absolute top-full left-0 right-0 z-50 mt-2 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-surface-container-high shadow-float p-1"
        >
          {filtered.length > 0 ? (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={cliente?.id === c.id}
                onClick={() => {
                  onSelect(c)
                  setQuery('')
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left rounded-lg transition-colors hover:bg-surface-high focus:bg-surface-high focus:outline-none',
                  cliente?.id === c.id ? 'bg-primary/10' : '',
                )}
              >
                <span className={cn('text-[14px] font-body truncate', cliente?.id === c.id ? 'text-primary font-semibold' : 'text-on-surface')}>
                  {c.nombre}
                </span>
                {c.cuit && <span className="text-[11px] font-body text-on-surface-variant truncate">{c.cuit}</span>}
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-[12px] font-body text-on-surface-variant">No se encontraron resultados</div>
          )}
        </div>
      )}

      {cliente && (
        <div data-testid="cliente-chip" className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-surface-container-high px-3 py-2">
          <span className="text-[13px] font-body text-on-surface truncate">{formatClienteChip(cliente)}</span>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <GlassCard>
      <p className="font-body text-[10px] uppercase tracking-[0.8px] text-outline">{label}</p>
      <p className="mt-4 text-[28px] font-bold leading-none text-on-surface">{value}</p>
    </GlassCard>
  )
}

function ProductosMobileCards({ productos }: { productos: ProductoAgregado[] }) {
  return (
    <div className="space-y-3 md:hidden" data-testid="ventas-mobile">
      {productos.map((p) => (
        <div key={p.productoId} className="rounded-xl border border-white/10 bg-surface-container-high p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-body text-[13px] font-semibold text-on-surface">{p.nombre}</p>
            <p className="font-body text-[11px] text-on-surface-variant">{p.sku}</p>
          </div>
          <p className="mt-2 font-body text-[12px] text-on-surface-variant">
            {p.cajas} cajas · {p.sueltos} sueltos / {p.unidades} unidades
          </p>
        </div>
      ))}
    </div>
  )
}

function ProductosTable({ productos }: { productos: ProductoAgregado[] }) {
  return (
    <div className="hidden md:block bg-surface-container-high rounded-xl overflow-hidden">
      <table className="w-full text-left font-body text-[12px]" data-testid="ventas-table">
        <thead className="text-[10px] uppercase tracking-[0.8px] text-outline">
          <tr>
            <th scope="col" className="px-5 py-4 font-medium">PRODUCTO</th>
            <th scope="col" className="px-5 py-4 font-medium">SKU</th>
            <th scope="col" className="px-5 py-4 font-medium text-right">CAJAS</th>
            <th scope="col" className="px-5 py-4 font-medium text-right">SUELTOS</th>
            <th scope="col" className="px-5 py-4 font-medium text-right">UNIDADES</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            // Backend values rendered verbatim — never recompute cajas/sueltos client-side.
            <tr key={p.productoId} className="border-b border-white/10 last:border-0">
              <td className="px-5 py-4 text-on-surface">{p.nombre}</td>
              <td className="px-5 py-4 text-on-surface-variant">{p.sku}</td>
              <td className="px-5 py-4 text-right text-on-surface">{p.cajas}</td>
              <td className="px-5 py-4 text-right text-on-surface">{p.sueltos}</td>
              <td className="px-5 py-4 text-right text-on-surface font-semibold">{p.unidades}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function VentasPage() {
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [modo, setModo] = useState<'mensual' | 'anual'>('mensual')
  const [mes, setMes] = useState(() => new Date().getMonth() + 1)
  const [año, setAño] = useState(() => new Date().getFullYear())
  const [generating, setGenerating] = useState(false)

  const { data: clientes = [] } = useClientes()
  const { data: reporte, isLoading, isError } = useVentas({
    clienteId: cliente?.id ?? '',
    year: año,
    month: modo === 'mensual' ? mes : undefined,
  })

  const pdfEnabled = !generating && !!cliente && !isLoading && !isError && !!reporte

  async function handleExportPdf() {
    if (!pdfEnabled || !cliente) return
    setGenerating(true)
    try {
      const blob = await aleBetApi.facturacion.ventasPdf({
        clienteId: cliente.id,
        year: año,
        month: modo === 'mensual' ? mes : undefined,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // Fallback filename; the Content-Disposition header is consumed by the
      // browser automatically when the blob is streamed directly — here we only
      // construct a human-readable name for the hidden anchor download.
      const suffix = modo === 'mensual' ? `-${String(mes).padStart(2, '0')}` : ''
      a.download = `ventas-${miniSlugify(cliente.nombre)}-${año}${suffix}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF generado correctamente.')
    } catch {
      toast.error('No pudimos generar el PDF.')
    } finally {
      setGenerating(false)
    }
  }

  const [generatingExcel, setGeneratingExcel] = useState(false)
  const excelEnabled = !generatingExcel && !!cliente && !isLoading && !isError && !!reporte && !isEmptyReport(reporte)

  async function handleExportExcel() {
    if (!excelEnabled || !cliente || !reporte) return
    setGeneratingExcel(true)
    try {
      // Allow a small tick for the UI to update the button text
      await new Promise(resolve => setTimeout(resolve, 50))
      await generarExcelVentas(cliente, reporte)
      toast.success('Excel generado correctamente.')
    } catch (err) {
      console.error(err)
      toast.error('No pudimos generar el Excel.')
    } finally {
      setGeneratingExcel(false)
    }
  }

  return (
    <div className="space-y-8 mx-auto w-full max-w-[1000px]">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight text-on-surface leading-tight">Ventas por cliente</h1>
            <p className="font-body text-[13px] text-on-surface-variant mt-1">Consultá los productos despachados por cliente y período.</p>
          </div>
          <ClienteCombobox clientes={clientes} cliente={cliente} onSelect={setCliente} />
        </div>

        <div className="flex flex-col md:items-end space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full border border-white/10 bg-surface-container-high p-0.5">
              <button
                type="button"
                onClick={() => setModo('mensual')}
                className={cn(
                  'rounded-lg px-4 py-1.5 font-body text-[12px] transition-colors',
                  modo === 'mensual' ? 'bg-primary/10 text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                MES
              </button>
              <button
                type="button"
                onClick={() => setModo('anual')}
                className={cn(
                  'rounded-lg px-4 py-1.5 font-body text-[12px] transition-colors',
                  modo === 'anual' ? 'bg-primary/10 text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                AÑO
              </button>
            </div>
            {modo === 'mensual' && (
              <select
                aria-label="Mes"
                className="input-field"
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
              >
                {MESES.map((nombre, i) => (
                  <option key={i + 1} value={i + 1}>{nombre}</option>
                ))}
              </select>
            )}
            <select
              aria-label="Año"
              className="input-field"
              value={año}
              onChange={(e) => setAño(Number(e.target.value))}
            >
              {AÑOS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

        {!cliente ? (
          <div className="py-16 flex justify-center">
            <div className="rounded-2xl border border-white/10 bg-surface-container-high px-8 py-10 text-center max-w-sm w-full shadow-sm">
              <p className="font-body text-[14px] text-on-surface-variant">Seleccioná un cliente para consultar sus ventas.</p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="space-y-6" data-testid="ventas-loading">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
              <Skeleton variant="card" className="h-28" />
              <Skeleton variant="card" className="h-28" />
              <Skeleton variant="card" className="h-28" />
            </div>
            <Skeleton variant="card" className="h-64" />
          </div>
        ) : isError ? (
          <p className="font-body text-sm text-error">No pudimos cargar el reporte. Intentá nuevamente.</p>
        ) : !reporte ? null : isEmptyReport(reporte) ? (
          <div className="rounded-xl bg-surface-container-high px-5 py-8 text-center">
            <p className="font-body text-[13px] text-on-surface-variant">No hay pedidos despachados para este período.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3" data-testid="ventas-acciones">
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={!pdfEnabled}
                className="flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-full border border-primary px-5 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileDown className="w-4 h-4" />
                {generating ? 'Generando PDF…' : 'Exportar PDF'}
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={!excelEnabled}
                className="flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-full border border-primary px-5 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {generatingExcel ? 'Generando Excel…' : 'Exportar Excel'}
              </button>
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3" data-testid="ventas-metrics">
              <MetricCard label="PEDIDOS DESPACHADOS" value={fmtUnidades.format(reporte.pedidosDespachados)} />
              <MetricCard label="PRODUCTOS" value={fmtUnidades.format(reporte.productosDistintos)} />
              <MetricCard label="UNIDADES" value={fmtUnidades.format(reporte.unidadesTotales)} />
            </div>

            {reporte.modo === 'mensual' ? (
              <section className="space-y-4" data-testid="ventas-mensual">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="font-body text-[10px] uppercase tracking-[0.8px] text-outline">Cliente</p>
                    <p className="mt-1 font-body text-[14px] font-semibold text-on-surface">{cliente.nombre}</p>
                  </div>
                  <div>
                    <p className="font-body text-[10px] uppercase tracking-[0.8px] text-outline">Período</p>
                    <p className="mt-1 font-body text-[14px] font-semibold text-on-surface">{MESES[mes - 1]} {año}</p>
                  </div>
                </div>
                <ProductosMobileCards productos={reporte.productos} />
                <ProductosTable productos={reporte.productos} />
              </section>
            ) : (
              <section className="space-y-6" data-testid="ventas-anual">
                {reporte.meses.length > 0 && (
                  <div className="space-y-2 rounded-xl bg-surface-container-high p-4">
                    <h2 className="font-body text-[10px] uppercase tracking-[0.8px] text-outline">RESUMEN POR MES</h2>
                    {reporte.meses.map((m) => (
                      // Server order (ascending); render verbatim, never re-sort.
                      <p key={m.month} className="font-body text-[13px] text-on-surface">
                        {MESES[m.month - 1].toUpperCase()} — {m.pedidosDespachados} pedidos · {fmtUnidades.format(m.unidadesTotales)} unidades
                      </p>
                    ))}
                  </div>
                )}
                <div className="space-y-4">
                  <h2 className="font-body text-[10px] uppercase tracking-[0.8px] text-outline">TOTAL ANUAL POR PRODUCTO</h2>
                  <ProductosMobileCards productos={reporte.productos} />
                  <ProductosTable productos={reporte.productos} />
                </div>
              </section>
            )}
          </div>
        )}
    </div>
  )
}
