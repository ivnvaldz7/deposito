import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Calendar, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { can } from '@/lib/permissions'
import { useActas } from '../queries/use-actas'
import { ApiError } from '../lib/api'
import { formatCantidad } from '../lib/format-units'
import type { ActaItemSummary, Categoria, Mercado } from '../lib/actas-types'

const CATEGORIA_LABEL: Record<Categoria, string> = {
  droga: 'Droga',
  estuche: 'Estuche',
  etiqueta: 'Etiqueta',
  frasco: 'Frasco',
  material_empaque: 'Material auxiliar',
}

const MERCADO_LABEL: Record<Mercado, string> = {
  argentina: 'Argentina', colombia: 'Colombia', mexico: 'México', ecuador: 'Ecuador',
  bolivia: 'Bolivia', paraguay: 'Paraguay', VENEZUELA: 'Venezuela', no_exportable: 'No exportable',
}

const MERCADO_BADGE: Record<Mercado, string> = {
  argentina: 'AR',
  colombia: 'COL',
  mexico: 'MEX',
  ecuador: 'EC',
  bolivia: 'BOL',
  paraguay: 'PY',
  VENEZUELA: 'VEN',
  no_exportable: 'N/E',
}

const MERCADO_ORDER: Mercado[] = [
  'argentina',
  'colombia',
  'mexico',
  'ecuador',
  'bolivia',
  'paraguay',
  'VENEZUELA',
  'no_exportable',
]

const MERCADO_COLOR: Record<Mercado, string> = {
  argentina: 'bg-sky-500/15 text-sky-200 border-sky-400/30', colombia: 'bg-yellow-500/15 text-yellow-200 border-yellow-400/30',
  mexico: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30', ecuador: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
  bolivia: 'bg-red-500/15 text-red-200 border-red-400/30', paraguay: 'bg-indigo-500/15 text-indigo-200 border-indigo-400/30',
  VENEZUELA: 'bg-orange-500/15 text-orange-200 border-orange-400/30', no_exportable: 'bg-surface-variant text-on-surface-variant border-outline-variant',
}

export type ActaRow = { id: string; fecha: string; userName: string; item: ActaItemSummary }

function formatProductName(item: ActaItemSummary): string {
  return item.categoria === 'droga'
    ? item.productoNombre
    : `${CATEGORIA_LABEL[item.categoria].toUpperCase()} ${item.productoNombre}`
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function escapeCsv(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`
}

export function buildActasCsv(rows: ActaRow[]): string {
  const header = ['Fecha', 'Producto', 'Tipo de insumo', 'País / mercado', 'Lote', 'Cantidad', 'Usuario']
  const data = rows.map(({ fecha, userName, item }) => [
    formatFecha(fecha), formatProductName(item), CATEGORIA_LABEL[item.categoria],
    item.mercado ? MERCADO_LABEL[item.mercado] : '', item.lote || '',
    formatCantidad(item.cantidadIngresada, item.categoria), userName,
  ].map(escapeCsv).join(';'))
  return `\uFEFF${[header.map(escapeCsv).join(';'), ...data].join('\n')}\n`
}

function DateIconButton({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const hasValue = !!value
  return <div className="w-[48px]">
    <label className="block font-body text-[11px] text-on-surface-variant mb-xs font-medium tracking-wider uppercase">{label}</label>
    <div className="relative"><div className={`w-full h-[38px] border rounded-lg flex items-center justify-center transition-all pointer-events-none ${hasValue ? 'border-primary text-primary bg-primary/5' : 'border-outline-variant text-on-surface-variant'}`}><Calendar size={18} /></div>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer [color-scheme:dark]" aria-label={label} />
    </div>
  </div>
}

function MarketBadge({ mercado }: { mercado: Mercado | null }) {
  if (!mercado) return null
  return <span aria-label={MERCADO_LABEL[mercado]} title={MERCADO_LABEL[mercado]} className={`ml-2 inline-flex rounded border px-1.5 py-0.5 align-middle font-body text-[10px] font-semibold uppercase tracking-wide ${MERCADO_COLOR[mercado]}`}>{MERCADO_BADGE[mercado]}</span>
}

export default function ActasPage() {
  const user = useAuthStore((s) => s.user)
  const canCreate = can(user, 'deposito', 'ingresos.create')
  const navigate = useNavigate()
  const { data: actas = [], isLoading, error } = useActas()
  const [searchQuery, setSearchQuery] = useState('')
  const [categoria, setCategoria] = useState<Categoria | ''>('')
  const [mercado, setMercado] = useState<Mercado | ''>('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const perPage = 20

  const rows = useMemo<ActaRow[]>(() => actas.flatMap((acta) => (acta.items ?? []).map((item, index) => ({
    id: item.id || `${acta.id}-${index}`, fecha: acta.fecha, userName: acta.user.name, item,
  }))), [actas])
  const mercadosDisponibles = useMemo(() => Array.from(new Set(rows.flatMap((row) => row.item.mercado ? [row.item.mercado] : [])))
    .sort((left, right) => MERCADO_ORDER.indexOf(left) - MERCADO_ORDER.indexOf(right)), [rows])
  const filtered = useMemo(() => rows.filter((row) => {
    const { item } = row
    return (!searchQuery.trim() || item.productoNombre.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      && (!categoria || item.categoria === categoria)
      && (!mercado || item.mercado === mercado)
      && (!fechaDesde || row.fecha.split('T')[0] >= fechaDesde)
      && (!fechaHasta || row.fecha.split('T')[0] <= fechaHasta)
  }), [rows, searchQuery, categoria, mercado, fechaDesde, fechaHasta])
  const totalPages = Math.ceil(filtered.length / perPage)
  const paginatedRows = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)
  const hasFilters = Boolean(searchQuery || categoria || mercado || fechaDesde || fechaHasta)

  function clearFilters() { setSearchQuery(''); setCategoria(''); setMercado(''); setFechaDesde(''); setFechaHasta(''); setCurrentPage(1) }
  function exportFilteredRows() {
    const blob = new Blob([buildActasCsv(filtered)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `actas-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return <div className="flex flex-col h-full space-y-lg">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-2xl font-semibold text-on-surface tracking-tight">Actas</h1><p className="font-body text-sm text-on-surface-variant mt-1">Comprobantes de ingresos al depósito{!isLoading && !error && <span className="ml-1">· {rows.length} ingresos</span>}</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={exportFilteredRows} disabled={filtered.length === 0} className="flex items-center gap-2 border border-primary/50 text-primary font-body text-sm font-semibold px-lg py-sm rounded-lg transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"><Download size={16} strokeWidth={2} />Exportar cantidades</button>
        {canCreate && <button onClick={() => navigate('/deposito/ingresos')} className="flex items-center gap-2 bg-primary text-on-primary font-body text-sm font-semibold px-lg py-sm rounded-lg scale-hover transition-transform duration-200 hover:brightness-110 shadow-float"><Plus size={16} strokeWidth={2} />Nuevo ingreso</button>}
      </div>
    </div>

    <div className="bg-surface-container-high rounded-lg p-md border border-white/10 flex flex-wrap gap-x-md gap-y-sm items-end">
      <div className="flex-1 min-w-[200px] relative"><label className="block font-body text-[11px] text-on-surface-variant mb-xs font-medium tracking-wider uppercase">Buscar</label><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" /><input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }} placeholder="Buscar producto..." className="w-full bg-surface-container border border-outline-variant rounded-lg pl-[36px] pr-3 h-[38px] text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-all text-xs outline-none" /></div></div>
      <div className="min-w-[154px]"><label htmlFor="actas-categoria" className="block font-body text-[11px] text-on-surface-variant mb-xs font-medium tracking-wider uppercase">Insumo</label><select id="actas-categoria" value={categoria} onChange={(e) => { setCategoria(e.target.value as Categoria | ''); setCurrentPage(1) }} className="w-full h-[38px] bg-surface-container border border-outline-variant rounded-lg px-3 text-xs text-on-surface outline-none focus:border-primary"><option value="">Todos los insumos</option>{(Object.keys(CATEGORIA_LABEL) as Categoria[]).map((value) => <option key={value} value={value}>{CATEGORIA_LABEL[value]}</option>)}</select></div>
      <div className="min-w-[144px]"><label htmlFor="actas-mercado" className="block font-body text-[11px] text-on-surface-variant mb-xs font-medium tracking-wider uppercase">País</label><select id="actas-mercado" value={mercado} onChange={(e) => { setMercado(e.target.value as Mercado | ''); setCurrentPage(1) }} className="w-full h-[38px] bg-surface-container border border-outline-variant rounded-lg px-3 text-xs text-on-surface outline-none focus:border-primary"><option value="">Todos los países</option>{mercadosDisponibles.map((value) => <option key={value} value={value}>{MERCADO_LABEL[value]}</option>)}</select></div>
      <DateIconButton label="Desde" value={fechaDesde} onChange={(v) => { setFechaDesde(v); setCurrentPage(1) }} /><DateIconButton label="Hasta" value={fechaHasta} onChange={(v) => { setFechaHasta(v); setCurrentPage(1) }} />
      {hasFilters && <button onClick={clearFilters} className="h-[38px] font-body text-xs text-on-surface-variant hover:text-on-surface transition-colors px-2">Limpiar filtros</button>}
    </div>

    {isLoading ? <div className="flex items-center justify-center h-48"><p className="font-body text-on-surface-variant text-sm">Cargando...</p></div>
      : error ? <div className="flex items-center justify-center h-48"><p className="font-body text-error text-sm">{error instanceof ApiError ? error.message : 'No se pudieron cargar las actas'}</p></div>
      : filtered.length === 0 ? <div className="flex flex-col items-center justify-center h-48 rounded-lg bg-surface-container-high border border-white/10 gap-3"><p className="font-body text-on-surface-variant text-sm">{hasFilters ? 'No se encontraron ingresos con esos filtros.' : 'No hay actas registradas todavía.'}</p>{canCreate && !hasFilters && <p className="font-body text-on-surface-variant/60 text-xs">Usá "Nuevo Ingreso" para empezar.</p>}</div>
      : <div className="bg-surface-container border border-white/10 rounded-xl overflow-hidden flex-1 shadow-float flex flex-col"><div className="overflow-x-auto flex-1"><table className="w-full text-left border-collapse text-xs"><thead className="bg-surface-container-highest border-b border-white/10"><tr><th className="p-3 font-body text-[11px] font-medium text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Fecha</th><th className="p-3 font-body text-[11px] font-medium text-on-surface-variant uppercase tracking-wider w-1/3">Producto</th><th className="p-3 font-body text-[11px] font-medium text-on-surface-variant uppercase tracking-wider">Lote</th><th className="p-3 font-body text-[11px] font-medium text-on-surface-variant uppercase tracking-wider text-right">Cantidad</th><th className="p-3 font-body text-[11px] font-medium text-on-surface-variant uppercase tracking-wider text-center">Usuario</th></tr></thead><tbody className="divide-y divide-white/5">
        {paginatedRows.map(({ id, fecha, userName, item }) => <tr key={id} className="hover:bg-surface-variant/30 transition-colors"><td className="p-3 font-body text-on-surface tabular-nums whitespace-nowrap">{formatFecha(fecha)}</td><td className="p-3 font-body text-sm font-medium text-on-surface max-w-[360px]" title={formatProductName(item)}><span className="break-words">{formatProductName(item)}</span><MarketBadge mercado={item.mercado} /></td><td className="p-3 font-body text-on-surface-variant">{item.lote || '—'}</td><td className="p-3 font-body text-on-surface tabular-nums text-right font-medium">{formatCantidad(item.cantidadIngresada, item.categoria)}</td><td className="p-3 font-body text-outline text-center truncate max-w-[100px]" title={userName}>{userName}</td></tr>)}
      </tbody></table></div>
      {totalPages > 1 && <div className="border-t border-white/10 p-3 flex items-center justify-end bg-surface-container-low mt-auto"><div className="flex gap-2"><button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} aria-label="Página anterior" className="w-8 h-8 rounded-lg border border-outline-variant flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-variant disabled:opacity-50 transition-colors"><ChevronLeft size={16} /></button><button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} aria-label="Página siguiente" className="w-8 h-8 rounded-lg border border-outline-variant flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-variant disabled:opacity-50 transition-colors"><ChevronRight size={16} /></button></div></div>}
    </div>}
  </div>
}
