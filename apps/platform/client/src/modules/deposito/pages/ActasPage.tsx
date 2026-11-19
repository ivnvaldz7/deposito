import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Calendar, ChevronLeft, ChevronRight, Download, Printer, X } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { can } from '@/lib/permissions'
import { matchesApproximateSearch } from '@/lib/approximate-search'
import { useActa, useActas } from '../queries/use-actas'
import { api, ApiError } from '../lib/api'
import { formatCantidad } from '../lib/format-units'
import { toast } from '../lib/toast'
import { LoadingState } from '../components/inventory-shared/inventory-states'
import { MercadoFlag } from '../components/inventory-shared/mercado-chip'
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

const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  completada: 'Completada',
} as const


const ACTAS_PRINT_ROWS_PER_SHEET = 20

export type ActaRow = { id: string; actaId: string; fecha: string; userName: string; item: ActaItemSummary }

function formatProductName(item: ActaItemSummary): string {
  return item.categoria === 'droga' || item.categoria === 'material_empaque'
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

function getMonthKey(fecha: string): string {
  return fecha.slice(0, 7)
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function chunkRows(rows: ActaRow[], chunkSize: number): ActaRow[][] {
  return Array.from({ length: Math.ceil(rows.length / chunkSize) }, (_, index) => rows.slice(index * chunkSize, (index + 1) * chunkSize))
}

export function buildActasPrintHtml(rows: ActaRow[], detail: string): string {
  const pages = chunkRows(rows, ACTAS_PRINT_ROWS_PER_SHEET).map((pageRows, pageIndex) => {
    const body = pageRows.map(({ fecha, userName, item }) => `<tr>
      <td>${escapeHtml(formatFecha(fecha))}</td>
      <td class="product">${escapeHtml(formatProductName(item))}</td>
      <td>${escapeHtml(CATEGORIA_LABEL[item.categoria])}</td>
      <td>${escapeHtml(item.mercado ? MERCADO_LABEL[item.mercado] : '—')}</td>
      <td>${escapeHtml(item.lote || '—')}</td>
      <td class="quantity">${escapeHtml(formatCantidad(item.cantidadIngresada, item.categoria))}</td>
      <td>${escapeHtml(userName)}</td>
    </tr>`).join('')
    return `<section class="sheet">
      <header><div><h1>ACTAS DE INGRESO</h1><p>Registro de movimientos de insumos</p></div><div class="meta">${escapeHtml(detail)}<br>${rows.length} registros</div></header>
      <table><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo de insumo</th><th>País / mercado</th><th>Lote</th><th class="quantity">Cantidad</th><th>Usuario</th></tr></thead><tbody>${body}</tbody></table>
      <footer><span>Plataforma · Depósito</span><span>Hoja ${pageIndex + 1} de ${Math.ceil(rows.length / ACTAS_PRINT_ROWS_PER_SHEET)}</span></footer>
    </section>`
  }).join('')

  return `<!doctype html><html lang="es"><head><meta charset="utf-8" /><title>Actas de ingreso</title><style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { color: #18241c; font-family: Aptos, Calibri, Arial, sans-serif; margin: 0; }
    .sheet { break-after: page; min-height: 190mm; page-break-after: always; }
    .sheet:last-child { break-after: auto; page-break-after: auto; }
    header { align-items: end; border-bottom: 2px solid #1c2b21; display: flex; justify-content: space-between; margin-bottom: 6mm; padding-bottom: 4mm; }
    h1 { font-size: 16pt; letter-spacing: .3pt; margin: 0; }
    header p, .meta { color: #355340; font-size: 9pt; font-weight: 600; margin: 1.5mm 0 0; }
    .meta { color: #506258; font-weight: 400; line-height: 1.4; margin: 0; text-align: right; }
    table { border-collapse: collapse; table-layout: fixed; width: 100%; }
    th { border-bottom: 2px solid #1c2b21; color: #314337; font-size: 8pt; letter-spacing: .4pt; padding: 3mm 2mm; text-align: left; text-transform: uppercase; }
    td { border-bottom: 1px solid #dde4de; font-size: 9pt; padding: 3mm 2mm; vertical-align: middle; }
    th:nth-child(1) { width: 10%; } th:nth-child(2) { width: 25%; } th:nth-child(3) { width: 15%; } th:nth-child(4) { width: 14%; } th:nth-child(5) { width: 12%; } th:nth-child(6) { width: 12%; } th:nth-child(7) { width: 12%; }
    .product { color: #132119; font-weight: 700; } .quantity { font-variant-numeric: tabular-nums; font-weight: 700; text-align: right; white-space: nowrap; }
    footer { border-top: 2px solid #1c2b21; color: #64736a; display: flex; font-size: 8pt; justify-content: space-between; margin-top: 5mm; padding-top: 3mm; }
  </style></head><body>${pages}</body></html>`
}

export function openActasPrintWindow(rows: ActaRow[], detail: string): boolean {
  const printWindow = window.open('', '_blank', 'width=1100,height=800')
  if (!printWindow) return false

  let printStarted = false
  const startPrint = () => {
    if (printStarted || printWindow.closed) return
    printStarted = true
    printWindow.focus()
    printWindow.print()
  }

  printWindow.onload = startPrint
  printWindow.document.open()
  printWindow.document.write(buildActasPrintHtml(rows, detail))
  printWindow.document.close()
  window.setTimeout(startPrint, 250)
  return true
}

async function exportActasExcel(rows: ActaRow[]): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Plataforma'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Actas', { properties: { tabColor: { argb: 'FF214F36' } } })
  sheet.pageSetup.paperSize = 9
  sheet.pageSetup.orientation = 'landscape'
  sheet.pageSetup.fitToPage = true
  sheet.pageSetup.fitToWidth = 1
  sheet.pageSetup.fitToHeight = 0
  sheet.pageSetup.margins = { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.25 }
  sheet.headerFooter.oddFooter = '&LPlataforma · Depósito&RHoja &P de &N'
  sheet.columns = [{ width: 13 }, { width: 34 }, { width: 19 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 18 }]
  sheet.mergeCells('A1:G1')
  sheet.getCell('A1').value = 'ACTAS DE INGRESO'
  sheet.getCell('A1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: 'FF18241C' } }
  sheet.getCell('A1').alignment = { vertical: 'middle' }
  sheet.getRow(1).height = 28
  sheet.mergeCells('A2:G2')
  sheet.getCell('A2').value = 'Registro de movimientos de insumos'
  sheet.getCell('A2').font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FF355340' } }
  sheet.getCell('A2').alignment = { vertical: 'middle' }
  sheet.getRow(2).height = 20
  sheet.mergeCells('A3:G3')
  sheet.getCell('A3').value = `Generado el ${new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' }).format(new Date())} · ${rows.length} registros`
  sheet.getCell('A3').font = { name: 'Aptos', size: 9, color: { argb: 'FF506258' } }
  sheet.getRow(3).height = 18

  const headerRow = sheet.getRow(5)
  const headers = ['FECHA', 'PRODUCTO', 'TIPO DE INSUMO', 'PAÍS / MERCADO', 'LOTE', 'CANTIDAD', 'USUARIO']
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = header
    cell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: 'FF314337' } }
    cell.alignment = { vertical: 'middle', horizontal: index === 5 ? 'right' : 'left' }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF1C2B21' } } }
  })
  headerRow.height = 22

  rows.forEach((row, index) => {
    const excelRow = sheet.getRow(index + 6)
    excelRow.values = [
      formatFecha(row.fecha),
      formatProductName(row.item),
      CATEGORIA_LABEL[row.item.categoria],
      row.item.mercado ? MERCADO_LABEL[row.item.mercado] : '—',
      row.item.lote || '—',
      formatCantidad(row.item.cantidadIngresada, row.item.categoria),
      row.userName,
    ]
    excelRow.height = 21
    excelRow.eachCell((cell, column) => {
      cell.font = { name: 'Aptos', size: 10, color: { argb: column === 2 ? 'FF132119' : 'FF425249' }, bold: column === 2 || column === 6 }
      cell.alignment = { vertical: 'middle', horizontal: column === 6 ? 'right' : 'left' }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFDDE4DE' } } }
    })
  })

  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: 7 } }
  sheet.views = [{ state: 'frozen', ySplit: 5 }]
  sheet.pageSetup.printTitlesRow = '1:5'

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `actas-${new Date().toISOString().slice(0, 10)}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
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
  return <MercadoFlag mercado={mercado} className="ml-2 inline-flex h-3.5 w-5 align-middle" />
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
  const [isMobile, setIsMobile] = useState(false)
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false)
  const [printScope, setPrintScope] = useState<'all' | 'month' | 'sheet'>('all')
  const [printMonth, setPrintMonth] = useState('')
  const [printSheet, setPrintSheet] = useState(1)
  const [selectedRow, setSelectedRow] = useState<ActaRow | null>(null)
  const [cuarentenaCopies, setCuarentenaCopies] = useState(1)
  const [isPrintingCuarentena, setIsPrintingCuarentena] = useState(false)
  const [cuarentenaError, setCuarentenaError] = useState<string | null>(null)
  const perPage = 20
  const selectedActaQuery = useActa(selectedRow?.actaId ?? '')
  const selectedItem = selectedActaQuery.data?.items?.find((item) => item.id === selectedRow?.item.id)
  const selectedCantidadIngresada = selectedItem?.cantidadIngresada ?? selectedRow?.item.cantidadIngresada ?? 0

  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 767px)')
    if (!query) return
    const update = () => setIsMobile(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!selectedRow) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedRow(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedRow])

  const rows = useMemo<ActaRow[]>(() => actas.flatMap((acta) => (acta.items ?? []).map((item, index) => ({
    id: `${acta.id}-${item.id || index}`, actaId: acta.id, fecha: acta.fecha, userName: acta.user.name, item,
  }))), [actas])
  const mercadosDisponibles = useMemo(() => Array.from(new Set(rows.flatMap((row) => row.item.mercado ? [row.item.mercado] : [])))
    .sort((left, right) => MERCADO_ORDER.indexOf(left) - MERCADO_ORDER.indexOf(right)), [rows])
  const filtered = useMemo(() => rows.filter((row) => {
    const { item } = row
    return (!searchQuery.trim() || matchesApproximateSearch(`${item.productoNombre} ${item.lote ?? ''}`, searchQuery))
      && (!categoria || item.categoria === categoria)
      && (!mercado || item.mercado === mercado)
      && (!fechaDesde || row.fecha.split('T')[0] >= fechaDesde)
      && (!fechaHasta || row.fecha.split('T')[0] <= fechaHasta)
  }), [rows, searchQuery, categoria, mercado, fechaDesde, fechaHasta])
  const totalPages = Math.ceil(filtered.length / perPage)
  const paginatedRows = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)
  const hasFilters = Boolean(searchQuery || categoria || mercado || fechaDesde || fechaHasta)
  const printableMonths = useMemo(() => Array.from(new Set(filtered.map((row) => getMonthKey(row.fecha)))).sort().reverse(), [filtered])
  const printableSheets = Math.max(1, Math.ceil(filtered.length / ACTAS_PRINT_ROWS_PER_SHEET))

  function clearFilters() { setSearchQuery(''); setCategoria(''); setMercado(''); setFechaDesde(''); setFechaHasta(''); setCurrentPage(1) }
  async function exportFilteredRows() {
    await exportActasExcel(filtered)
  }

  function openPrintDialog() {
    setPrintMonth((current) => current || printableMonths[0] || '')
    setPrintSheet(Math.min(currentPage, printableSheets))
    setIsPrintDialogOpen(true)
  }

  function printActas() {
    const rowsToPrint = printScope === 'month'
      ? filtered.filter((row) => getMonthKey(row.fecha) === printMonth)
      : printScope === 'sheet'
        ? filtered.slice((printSheet - 1) * ACTAS_PRINT_ROWS_PER_SHEET, printSheet * ACTAS_PRINT_ROWS_PER_SHEET)
        : filtered
    if (rowsToPrint.length === 0) return

    const detail = printScope === 'month'
      ? formatMonthLabel(printMonth)
      : printScope === 'sheet'
        ? `Hoja ${printSheet}`
        : 'Documento completo'
    if (openActasPrintWindow(rowsToPrint, detail)) setIsPrintDialogOpen(false)
  }

  function openActionPanel(row: ActaRow) {
    setSelectedRow(row)
    setCuarentenaCopies(1)
    setCuarentenaError(null)
  }

  async function printCuarentenaLabels() {
    if (!selectedRow || isPrintingCuarentena || !Number.isInteger(cuarentenaCopies) || cuarentenaCopies < 1 || cuarentenaCopies > 100) return

    const itemId = selectedRow.item.id
    setIsPrintingCuarentena(true)
    setCuarentenaError(null)
    setSelectedRow(null)
    try {
      const result = await api.post<{ message: string }>('/labels/cuarentena', { itemId, copias: cuarentenaCopies })
      toast.success(result.message)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'No se pudo comunicar con la impresora.'
      setCuarentenaError(message)
      toast.error(message)
    } finally {
      setIsPrintingCuarentena(false)
    }
  }

  return <div className="flex flex-col h-full space-y-5 md:space-y-lg">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-2xl font-semibold text-on-surface tracking-tight md:text-3xl">Actas</h1><p className="font-body text-sm text-on-surface-variant mt-1">Comprobantes de ingresos al depósito{!isLoading && !error && <span className="ml-1">· {rows.length} ingresos</span>}</p></div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <button type="button" onClick={() => { void exportFilteredRows() }} disabled={filtered.length === 0} className="flex min-h-11 items-center justify-center gap-2 border border-primary/50 text-primary font-body text-sm font-semibold px-3 py-sm rounded-lg transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"><Download size={16} strokeWidth={2} />Exportar Excel</button>
        <button type="button" onClick={openPrintDialog} disabled={filtered.length === 0} className="flex min-h-11 items-center justify-center gap-2 border border-white/15 text-on-surface font-body text-sm font-semibold px-3 py-sm rounded-lg transition-colors hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-50"><Printer size={16} strokeWidth={2} />Imprimir</button>
        {canCreate && <button onClick={() => navigate('/deposito/ingresos')} className="flex min-h-11 items-center justify-center gap-2 bg-primary text-on-primary font-body text-sm font-semibold px-3 py-sm rounded-lg scale-hover transition-transform duration-200 hover:brightness-110 shadow-float"><Plus size={16} strokeWidth={2} />Nuevo ingreso</button>}
      </div>
    </div>

    <div className="bg-surface-container-high rounded-lg p-md border border-white/10 grid grid-cols-2 gap-x-3 gap-y-sm items-end sm:flex sm:flex-wrap sm:gap-x-md">
      <div className="col-span-2 flex-1 min-w-0 sm:min-w-[200px] relative"><label className="block font-body text-[11px] text-on-surface-variant mb-xs font-medium tracking-wider uppercase">Buscar</label><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" /><input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }} placeholder="Buscar producto..." className="w-full bg-surface-container border border-outline-variant rounded-lg pl-[36px] pr-3 h-11 sm:h-[38px] text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-all text-xs outline-none" /></div></div>
      <div className="min-w-0 sm:min-w-[154px]"><label htmlFor="actas-categoria" className="block font-body text-[11px] text-on-surface-variant mb-xs font-medium tracking-wider uppercase">Insumo</label><select id="actas-categoria" value={categoria} onChange={(e) => { setCategoria(e.target.value as Categoria | ''); setCurrentPage(1) }} className="w-full h-11 sm:h-[38px] bg-surface-container border border-outline-variant rounded-lg px-3 text-xs text-on-surface outline-none focus:border-primary"><option value="">Todos los insumos</option>{(Object.keys(CATEGORIA_LABEL) as Categoria[]).map((value) => <option key={value} value={value}>{CATEGORIA_LABEL[value]}</option>)}</select></div>
      <div className="min-w-0 sm:min-w-[144px]"><label htmlFor="actas-mercado" className="block font-body text-[11px] text-on-surface-variant mb-xs font-medium tracking-wider uppercase">País</label><select id="actas-mercado" value={mercado} onChange={(e) => { setMercado(e.target.value as Mercado | ''); setCurrentPage(1) }} className="w-full h-11 sm:h-[38px] bg-surface-container border border-outline-variant rounded-lg px-3 text-xs text-on-surface outline-none focus:border-primary"><option value="">Todos los países</option>{mercadosDisponibles.map((value) => <option key={value} value={value}>{MERCADO_LABEL[value]}</option>)}</select></div>
      <DateIconButton label="Desde" value={fechaDesde} onChange={(v) => { setFechaDesde(v); setCurrentPage(1) }} /><DateIconButton label="Hasta" value={fechaHasta} onChange={(v) => { setFechaHasta(v); setCurrentPage(1) }} />
      {hasFilters && <button onClick={clearFilters} className="h-[38px] font-body text-xs text-on-surface-variant hover:text-on-surface transition-colors px-2">Limpiar filtros</button>}
    </div>

    {isLoading ? <LoadingState />
      : error ? <div className="flex items-center justify-center h-48"><p className="font-body text-error text-sm">{error instanceof ApiError ? error.message : 'No se pudieron cargar las actas'}</p></div>
      : filtered.length === 0 ? <div className="flex flex-col items-center justify-center h-48 rounded-lg bg-surface-container-high border border-white/10 gap-3"><p className="font-body text-on-surface-variant text-sm">{hasFilters ? 'No se encontraron ingresos con esos filtros.' : 'No hay actas registradas todavía.'}</p>{canCreate && !hasFilters && <p className="font-body text-on-surface-variant/60 text-xs">Usá "Nuevo Ingreso" para empezar.</p>}</div>
      : <div className="bg-surface-container border border-white/10 rounded-xl overflow-hidden flex-1 shadow-float flex flex-col">{isMobile ? <div className="divide-y divide-white/10">{paginatedRows.map((row) => <article key={row.id} role="button" tabIndex={0} aria-label={`Ver acciones de ${formatProductName(row.item)}`} onClick={() => openActionPanel(row)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openActionPanel(row) } }} className="cursor-pointer p-4 transition-colors hover:bg-surface-variant/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium text-on-surface break-words">{formatProductName(row.item)} <MarketBadge mercado={row.item.mercado} /></p><p className="mt-1 text-xs text-on-surface-variant">Lote {row.item.lote || '—'} · {formatFecha(row.fecha)}</p></div><p className="shrink-0 font-semibold tabular-nums text-primary">{formatCantidad(row.item.cantidadIngresada, row.item.categoria)}</p></div><p className="mt-2 text-xs text-outline">Registró: {row.userName}</p></article>)}</div> : <div className="overflow-x-auto flex-1"><table className="w-full text-left border-collapse text-xs"><thead className="bg-surface-container-highest border-b border-white/10"><tr><th className="p-3 font-body text-[11px] font-medium text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Fecha</th><th className="p-3 font-body text-[11px] font-medium text-on-surface-variant uppercase tracking-wider w-1/3">Producto</th><th className="p-3 font-body text-[11px] font-medium text-on-surface-variant uppercase tracking-wider">Lote</th><th className="p-3 font-body text-[11px] font-medium text-on-surface-variant uppercase tracking-wider text-right">Cantidad</th><th className="p-3 font-body text-[11px] font-medium text-on-surface-variant uppercase tracking-wider text-center">Usuario</th></tr></thead><tbody className="divide-y divide-white/5">
        {paginatedRows.map((row) => <tr key={row.id} role="button" tabIndex={0} aria-label={`Ver acciones de ${formatProductName(row.item)}`} onClick={() => openActionPanel(row)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openActionPanel(row) } }} className="cursor-pointer transition-colors hover:bg-surface-variant/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"><td className="p-3 font-body text-on-surface tabular-nums whitespace-nowrap">{formatFecha(row.fecha)}</td><td className="p-3 font-body text-sm font-medium text-on-surface max-w-[360px]" title={formatProductName(row.item)}><span className="break-words">{formatProductName(row.item)}</span><MarketBadge mercado={row.item.mercado} /></td><td className="p-3 font-body text-on-surface-variant">{row.item.lote || '—'}</td><td className="p-3 font-body text-on-surface tabular-nums text-right font-medium">{formatCantidad(row.item.cantidadIngresada, row.item.categoria)}</td><td className="p-3 font-body text-outline text-center truncate max-w-[100px]" title={row.userName}>{row.userName}</td></tr>)}
      </tbody></table></div>}
      {totalPages > 1 && <div className="border-t border-white/10 p-3 flex items-center justify-end bg-surface-container-low mt-auto"><div className="flex gap-2"><button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} aria-label="Página anterior" className="w-8 h-8 rounded-lg border border-outline-variant flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-variant disabled:opacity-50 transition-colors"><ChevronLeft size={16} /></button><button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} aria-label="Página siguiente" className="w-8 h-8 rounded-lg border border-outline-variant flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-variant disabled:opacity-50 transition-colors"><ChevronRight size={16} /></button></div></div>}
    </div>}
    {selectedRow && <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-hidden bg-surface/30 p-3 backdrop-blur-[1px] sm:p-5" onClick={() => setSelectedRow(null)}>
      <section role="dialog" aria-modal="true" aria-labelledby="actas-action-panel-title" className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-container-high shadow-2xl sm:max-h-[calc(100vh-2.5rem)]" onClick={(event) => event.stopPropagation()}>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div><p className="font-body text-[11px] font-semibold uppercase tracking-wider text-primary">Ingreso · {formatFecha(selectedRow.fecha)}</p><h2 id="actas-action-panel-title" className="mt-1 text-lg font-bold text-on-surface">Panel de acciones del ingreso</h2><p className="mt-1 font-body text-sm text-on-surface-variant">{formatProductName(selectedRow.item)}</p></div>
          <button type="button" aria-label="Cerrar panel de acciones" onClick={() => setSelectedRow(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface"><X size={18} /></button>
        </header>

        {selectedActaQuery.isLoading ? <p className="py-8 text-center font-body text-sm text-on-surface-variant">Cargando el detalle del ingreso…</p> : <>
          {selectedActaQuery.error && <p role="alert" className="mt-4 rounded-lg border border-error/30 bg-error/10 p-3 font-body text-sm text-error">No se pudo cargar todo el detalle. Podés usar las acciones disponibles para este ingreso.</p>}
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 break-words sm:grid-cols-3">
            <div><dt className="font-body text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Producto</dt><dd className="mt-1 font-body text-sm font-semibold text-on-surface">{formatProductName(selectedRow.item)}</dd></div>
            <div><dt className="font-body text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Tipo de insumo</dt><dd className="mt-1 font-body text-sm text-on-surface">{CATEGORIA_LABEL[selectedRow.item.categoria]}</dd></div>
            <div><dt className="font-body text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Lote</dt><dd className="mt-1 font-body text-sm text-on-surface">{selectedRow.item.lote || '—'}</dd></div>
            <div><dt className="font-body text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Vencimiento</dt><dd className="mt-1 font-body text-sm text-on-surface">{selectedItem?.vencimiento ? formatFecha(selectedItem.vencimiento) : '—'}</dd></div>
            <div><dt className="font-body text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Cantidad ingresada</dt><dd className="mt-1 font-body text-sm font-semibold text-on-surface">{formatCantidad(selectedCantidadIngresada, selectedRow.item.categoria)}</dd></div>
            <div><dt className="font-body text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Mercado</dt><dd className="mt-1 font-body text-sm text-on-surface">{selectedRow.item.mercado ? MERCADO_LABEL[selectedRow.item.mercado] : 'No aplica'}</dd></div>
            <div><dt className="font-body text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Estado del acta</dt><dd className="mt-1 font-body text-sm text-on-surface">{selectedActaQuery.data ? ESTADO_LABEL[selectedActaQuery.data.estado] : '—'}</dd></div>
            <div><dt className="font-body text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Registró</dt><dd className="mt-1 font-body text-sm text-on-surface">{selectedRow.userName}</dd></div>
          </dl>
          {(selectedActaQuery.data?.notas?.trim()) && <div className="mt-5 rounded-xl border border-white/10 bg-surface-container p-4"><p className="font-body text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Notas</p><p className="mt-1 whitespace-pre-wrap break-words font-body text-sm text-on-surface">{selectedActaQuery.data?.notas?.trim()}</p></div>}
        </>}

        <section aria-labelledby="actas-action-panel-actions" className="mt-6 border-t border-white/10 pt-5">
          <h3 id="actas-action-panel-actions" className="font-body text-base font-bold text-on-surface">Acciones</h3>
          {canCreate ? <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4"><div className="flex items-start gap-3"><Printer size={18} className="mt-0.5 shrink-0 text-primary" /><div><h4 className="font-body text-sm font-semibold text-on-surface">Etiquetas de cuarentena</h4><p className="mt-1 font-body text-[13px] text-on-surface-variant">Generá e imprimí etiquetas para identificar este ingreso en cuarentena.</p></div></div><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><label className="block font-body text-[13px] text-on-surface" htmlFor="cuarentena-copies">Copias<input id="cuarentena-copies" aria-label="Copias de etiquetas de cuarentena" type="number" min="1" max="100" value={cuarentenaCopies} onChange={(event) => setCuarentenaCopies(Number(event.target.value))} className="mt-1 block h-10 w-28 rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface outline-none focus:border-primary" /></label><button type="button" onClick={() => { void printCuarentenaLabels() }} disabled={isPrintingCuarentena || cuarentenaCopies < 1 || cuarentenaCopies > 100 || !Number.isInteger(cuarentenaCopies)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-body text-[13px] font-semibold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"><Printer size={16} />{isPrintingCuarentena ? 'Generando…' : 'Generar etiquetas'}</button></div>{cuarentenaError && <p role="alert" className="mt-3 font-body text-sm text-error">{cuarentenaError}</p>}</div> : <p className="mt-4 rounded-xl border border-white/10 bg-surface-container p-4 font-body text-sm text-on-surface-variant">Tu perfil puede consultar el ingreso, pero no tiene permisos para generar etiquetas.</p>}
        </section>
        </div>
      </section>
    </div>}
    {isPrintDialogOpen && <div className="fixed inset-0 z-[60] flex items-end justify-center bg-surface/30 p-0 backdrop-blur-[1px] sm:items-center sm:p-5" onClick={() => setIsPrintDialogOpen(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="actas-print-title" className="w-full max-w-md rounded-t-2xl border border-white/10 bg-surface-container-high p-5 shadow-2xl sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <h2 id="actas-print-title" className="text-lg font-bold text-on-surface">Imprimir actas</h2>
        <p className="mt-1 font-body text-[13px] text-on-surface-variant">Elegí el alcance del documento. Se imprimirán los registros que coincidan con los filtros actuales.</p>
        <fieldset className="mt-5 space-y-2">
          <legend className="font-body text-[13px] font-semibold text-on-surface">Alcance de impresión</legend>
          <label htmlFor="actas-print-all" className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 px-3 font-body text-sm text-on-surface"><input id="actas-print-all" type="radio" name="actas-print-scope" checked={printScope === 'all'} onChange={() => setPrintScope('all')} />Documento completo <span className="ml-auto text-xs text-on-surface-variant">{filtered.length} registros</span></label>
          <label htmlFor="actas-print-month-scope" className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 px-3 font-body text-sm text-on-surface"><input id="actas-print-month-scope" type="radio" name="actas-print-scope" checked={printScope === 'month'} onChange={() => setPrintScope('month')} />Por mes</label>
          {printScope === 'month' && <label className="block pl-8 font-body text-[12px] text-on-surface-variant" htmlFor="actas-print-month">Mes<select id="actas-print-month" value={printMonth} onChange={(event) => setPrintMonth(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface outline-none focus:border-primary">{printableMonths.map((month) => <option key={month} value={month}>{formatMonthLabel(month)}</option>)}</select></label>}
          <label htmlFor="actas-print-sheet-scope" className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 px-3 font-body text-sm text-on-surface"><input id="actas-print-sheet-scope" type="radio" name="actas-print-scope" checked={printScope === 'sheet'} onChange={() => setPrintScope('sheet')} />Por hoja</label>
          {printScope === 'sheet' && <label className="block pl-8 font-body text-[12px] text-on-surface-variant" htmlFor="actas-print-sheet">Hoja<select id="actas-print-sheet" value={printSheet} onChange={(event) => setPrintSheet(Number(event.target.value))} className="mt-1 block h-10 w-full rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface outline-none focus:border-primary">{Array.from({ length: printableSheets }, (_, index) => index + 1).map((sheetNumber) => <option key={sheetNumber} value={sheetNumber}>Hoja {sheetNumber} · registros {(sheetNumber - 1) * ACTAS_PRINT_ROWS_PER_SHEET + 1}–{Math.min(sheetNumber * ACTAS_PRINT_ROWS_PER_SHEET, filtered.length)}</option>)}</select></label>}
        </fieldset>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setIsPrintDialogOpen(false)} className="min-h-11 rounded-xl border border-white/15 px-4 font-body text-[13px] font-semibold text-on-surface">Cancelar</button><button type="button" onClick={printActas} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-body text-[13px] font-semibold text-on-primary"><Printer size={16} />Imprimir</button></div>
      </section>
    </div>}
  </div>
}
