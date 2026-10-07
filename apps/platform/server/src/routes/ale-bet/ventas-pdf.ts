/**
 * Pure PDF renderer for the "Ventas por cliente" report (ALEBET-FACT-02).
 *
 * No pdfkit import: draws against the structural `VentasPdfDocument`
 * interface so tests can drive it with a RecordingDocument (remito-pdf.ts
 * precedent). The route owns the real PDFDocument and the HTTP stream.
 *
 * Hard contract (spec R2-R6): text-only header, A4 portrait, 50pt margins,
 * single-line rows that never split, repeated header on continuation pages,
 * footer "Ale-Bet · Logística" + "Página X de Y" on every page. The report
 * carries NO fiscal or commercial data (no precio, subtotal, IVA, bultos,
 * peso, rankings, proyecciones, porcentajes) — only contract quantities.
 */

export type VentasPdfTextOptions = {
  width?: number
  align?: 'left' | 'center' | 'right'
  ellipsis?: boolean
  characterSpacing?: number
}

export interface VentasPdfDocument {
  fontSize(size: number): this
  font(name: string): this
  fillColor(color: string): this
  lineWidth(width: number): this
  text(value: string, x?: number, y?: number, options?: VentasPdfTextOptions): this
  rect(x: number, y: number, width: number, height: number): this
  fill(color?: string): this // soft backgrounds (resumen strip, table header)
  moveTo(x: number, y: number): this
  lineTo(x: number, y: number): this
  stroke(): this
  addPage(): this
  bufferedPageRange(): { start: number; count: number }
  switchToPage(index: number): this
}

export type VentasPdfInput = {
  modo: 'mensual' | 'anual'
  year: number
  month: number | null
  clienteNombre: string
  cuit?: string
  generado: string // pre-formatted es-AR label (route-side Intl)
  resumen: { pedidosDespachados: number; productosDistintos: number; unidadesTotales: number }
  productos: Array<{
    nombre: string
    sku: string
    unidadesPorCaja: number
    cajas: number
    sueltos: number
    unidades: number
  }>
  meses?: Array<{ month: number; pedidosDespachados: number; productosDistintos: number; unidadesTotales: number }>
}

// ─── Layout constants (A4 portrait, 50pt ≈ 17.6mm margins) ──────────────────

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 50
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN
const ROW_HEIGHT = 20
const TABLE_HEADER_HEIGHT = 22
// Rows and section breaks may not enter the footer band: content ends here.
const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN - 6
// Title rule / chrome: fixed positions for page 1 and continuation pages.
const TITLE_Y = MARGIN + 30
const TITLE_RULE_Y = MARGIN + 62
const CHROME_BOTTOM = MARGIN + 68
const FOOTER_RULE_Y = PAGE_HEIGHT - MARGIN + 8
// Minimum vertical room a new section needs: title gap + header + 2 rows.
const SECTION_MIN_HEIGHT = 16 + TABLE_HEADER_HEIGHT + 2 * ROW_HEIGHT

// ─── Palette (AD-6: accent green #3D6852 only; soft tints grey #F3F4F6) ─────

const TEXT_COLOR = '#1A1A1A'
const LABEL_COLOR = '#6B7280'
const RULE_COLOR = '#9CA3AF'
const ACCENT = '#3D6852'
const SOFT_TINT = '#F3F4F6'

// ─── Formatting ──────────────────────────────────────────────────────────────

// Spanish thousands separator ("1.426"); Node ships full ICU.
const fmt = new Intl.NumberFormat('es-AR')

// Single source of truth for month labels (PERÍODO + EVOLUCIÓN MENSUAL rows).
const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
]

// ─── Columns ─────────────────────────────────────────────────────────────────

type Column = { label: string; x: number; width: number; align: 'left' | 'right' }

const PRODUCT_COLUMNS: Column[] = [
  { label: 'PRODUCTO', x: MARGIN + 10, width: 190, align: 'left' },
  { label: 'SKU', x: MARGIN + 200, width: 90, align: 'left' },
  { label: 'U/CAJA', x: MARGIN + 290, width: 44, align: 'right' },
  { label: 'CAJAS', x: MARGIN + 334, width: 44, align: 'right' },
  { label: 'SUELTOS', x: MARGIN + 378, width: 48, align: 'right' },
  { label: 'UNIDADES', x: MARGIN + 426, width: 59, align: 'right' },
]

const MES_COLUMNS: Column[] = [
  { label: 'MES', x: MARGIN + 10, width: 180, align: 'left' },
  { label: 'PEDIDOS', x: MARGIN + 190, width: 90, align: 'right' },
  { label: 'PRODUCTOS', x: MARGIN + 280, width: 90, align: 'right' },
  { label: 'UNIDADES', x: MARGIN + 370, width: 115, align: 'right' },
]

// ─── Draw helpers ────────────────────────────────────────────────────────────

function periodoLabel(input: VentasPdfInput): string {
  if (input.modo === 'anual') return `AÑO ${input.year}`
  const month = input.month ?? 1
  return `${MESES[month - 1]} ${input.year}`
}

/** Brand + GENERADO/PERÍODO metadata + title + green rule (every page). */
function drawChrome(document: VentasPdfDocument, input: VentasPdfInput): void {
  document.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_COLOR).text('ALE-BET', MARGIN, MARGIN)
  document.font('Helvetica').fontSize(7.5).fillColor(LABEL_COLOR).text('LOGÍSTICA', MARGIN, MARGIN + 13)

  document.font('Helvetica').fontSize(7).fillColor(LABEL_COLOR)
    .text('PERÍODO', CONTENT_RIGHT - 350, MARGIN, { width: 175, align: 'right' })
  document.font('Helvetica-Bold').fontSize(8.5).fillColor(TEXT_COLOR)
    .text(periodoLabel(input), CONTENT_RIGHT - 350, MARGIN + 12, { width: 175, align: 'right' })

  document.font('Helvetica').fontSize(7).fillColor(LABEL_COLOR)
    .text('GENERADO', CONTENT_RIGHT - 175, MARGIN, { width: 175, align: 'right' })
  document.font('Helvetica-Bold').fontSize(8.5).fillColor(TEXT_COLOR)
    .text(input.generado, CONTENT_RIGHT - 175, MARGIN + 12, { width: 175, align: 'right' })

  document.font('Helvetica-Bold').fontSize(22).fillColor(TEXT_COLOR)
    .text('REPORTE DE VENTAS POR CLIENTE', MARGIN, TITLE_Y, { width: CONTENT_WIDTH, align: 'center' })

  // Thin green rule. Drawn as a filled rect because the structural interface
  // has no strokeColor; honors the AD-6 accent palette.
  document.rect(MARGIN, TITLE_RULE_Y, CONTENT_WIDTH, 1.2).fill(ACCENT)
}

/** Uppercase green section subtitle (10pt Bold, tracked). Returns next y. */
function drawSectionTitle(document: VentasPdfDocument, title: string, y: number): number {
  document.font('Helvetica-Bold').fontSize(10).fillColor(ACCENT)
    .text(title, MARGIN, y, { characterSpacing: 1 })
  return y + 16
}

/** Grey tinted table header. Returns the first row y. */
function drawTableHeader(document: VentasPdfDocument, columns: Column[], y: number): number {
  document.rect(MARGIN, y, CONTENT_WIDTH, TABLE_HEADER_HEIGHT).fill(SOFT_TINT)
  document.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_COLOR)
  for (const column of columns) {
    document.text(column.label, column.x, y + 7, { width: column.width, align: column.align })
  }
  return y + TABLE_HEADER_HEIGHT
}

/** Single-line row; never splits. Ellipsis on the first (name) cell. */
function drawRow(document: VentasPdfDocument, columns: Column[], cells: string[], y: number): void {
  document.font('Helvetica').fontSize(8.5).fillColor(TEXT_COLOR)
  for (let i = 0; i < columns.length; i++) {
    const column = columns[i]
    const options: VentasPdfTextOptions = { width: column.width, align: column.align }
    if (i === 0) options.ellipsis = true
    document.text(cells[i], column.x, y + 6, options)
  }
}

/**
 * Row loop with the row-split guard: before drawing, if the row would cross
 * CONTENT_BOTTOM, start a new page and repeat chrome + section title + table
 * header. Returns the next free y.
 */
function drawRows(
  document: VentasPdfDocument,
  input: VentasPdfInput,
  columns: Column[],
  rows: string[][],
  sectionTitle: string,
  startY: number,
): number {
  let y = startY
  for (const cells of rows) {
    if (y + ROW_HEIGHT > CONTENT_BOTTOM) {
      document.addPage()
      drawChrome(document, input)
      y = drawSectionTitle(document, sectionTitle, CHROME_BOTTOM)
      y = drawTableHeader(document, columns, y)
    }
    drawRow(document, columns, cells, y)
    y += ROW_HEIGHT
  }
  return y
}

/** RESUMEN strip: grey tinted rect, 3 centered label/value columns. */
function drawResumen(document: VentasPdfDocument, input: VentasPdfInput, y: number): number {
  document.rect(MARGIN, y, CONTENT_WIDTH, 64).fill(SOFT_TINT)

  const colWidth = CONTENT_WIDTH / 3
  const labels = ['PEDIDOS DESPACHADOS', 'PRODUCTOS', 'UNIDADES']
  const values = [
    fmt.format(input.resumen.pedidosDespachados),
    fmt.format(input.resumen.productosDistintos),
    fmt.format(input.resumen.unidadesTotales),
  ]

  for (let i = 0; i < 3; i++) {
    const x = MARGIN + colWidth * i
    document.font('Helvetica').fontSize(7).fillColor(LABEL_COLOR)
      .text(labels[i], x, y + 12, { width: colWidth, align: 'center' })
    document.font('Helvetica-Bold').fontSize(18).fillColor(TEXT_COLOR)
      .text(values[i], x, y + 30, { width: colWidth, align: 'center' })
    // Thin vertical separators between columns.
    if (i < 2) document.rect(x + colWidth - 0.4, y + 8, 0.8, 48).fill(RULE_COLOR)
  }

  return y + 78
}

/** Footer pass: "Ale-Bet · Logística" left, "Página X de Y" right, all pages. */
function drawFooters(document: VentasPdfDocument): void {
  const range = document.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    document.switchToPage(i)
    document.rect(MARGIN, FOOTER_RULE_Y, CONTENT_WIDTH, 0.8).fill(RULE_COLOR)
    document.font('Helvetica').fontSize(8).fillColor(LABEL_COLOR)
      .text('Ale-Bet · Logística', MARGIN, FOOTER_RULE_Y + 6)
      .text(`Página ${i + 1} de ${range.count}`, CONTENT_RIGHT - 200, FOOTER_RULE_Y + 6, {
        width: 200,
        align: 'right',
      })
  }
}

function productRows(input: VentasPdfInput): string[][] {
  return input.productos.map((p) => [
    p.nombre,
    p.sku,
    fmt.format(p.unidadesPorCaja),
    fmt.format(p.cajas),
    fmt.format(p.sueltos),
    fmt.format(p.unidades),
  ])
}

// ─── Renderer ────────────────────────────────────────────────────────────────

export function renderVentasPdf(document: VentasPdfDocument, input: VentasPdfInput): void {
  drawChrome(document, input)
  let y = CHROME_BOTTOM

  // ── CLIENTE (B) ──────────────────────────────────────────────────────────
  y = drawSectionTitle(document, 'CLIENTE', y)
  document.font('Helvetica-Bold').fontSize(15).fillColor(TEXT_COLOR)
    .text(input.clienteNombre, MARGIN, y)
  if (input.cuit) {
    document.font('Helvetica').fontSize(9).fillColor(LABEL_COLOR)
      .text(`CUIT ${input.cuit}`, MARGIN, y + 20)
  }
  y += 58

  // ── RESUMEN (C) ───────────────────────────────────────────────────────────
  y = drawResumen(document, input, y)

  if (input.modo === 'anual') {
    renderAnual(document, input, y)
  } else {
    // ── DETALLE DE PRODUCTOS (D) ───────────────────────────────────────────
    y = drawSectionTitle(document, 'DETALLE DE PRODUCTOS', y)
    y = drawTableHeader(document, PRODUCT_COLUMNS, y)
    drawRows(document, input, PRODUCT_COLUMNS, productRows(input), 'DETALLE DE PRODUCTOS', y)
  }

  drawFooters(document)
}

/** Anual sections: EVOLUCIÓN MENSUAL (only months with sales) + TOTAL ANUAL. */
function renderAnual(document: VentasPdfDocument, input: VentasPdfInput, startY: number): void {
  const meses = input.meses ?? []
  let y = startY

  if (meses.length > 0) {
    if (y + SECTION_MIN_HEIGHT > CONTENT_BOTTOM) {
      document.addPage()
      drawChrome(document, input)
      y = CHROME_BOTTOM
    }
    y = drawSectionTitle(document, 'EVOLUCIÓN MENSUAL', y)
    y = drawTableHeader(document, MES_COLUMNS, y)
    // Server order (ascending); never re-sorted.
    const rows = meses.map((m) => [
      MESES[m.month - 1],
      fmt.format(m.pedidosDespachados),
      fmt.format(m.productosDistintos),
      fmt.format(m.unidadesTotales),
    ])
    y = drawRows(document, input, MES_COLUMNS, rows, 'EVOLUCIÓN MENSUAL', y)
  }

  // TOTAL ANUAL POR PRODUCTO (same 6 columns as the mensual DETALLE table).
  if (y + SECTION_MIN_HEIGHT > CONTENT_BOTTOM) {
    document.addPage()
    drawChrome(document, input)
    y = CHROME_BOTTOM
  }
  y = drawSectionTitle(document, 'TOTAL ANUAL POR PRODUCTO', y)
  y = drawTableHeader(document, PRODUCT_COLUMNS, y)
  drawRows(document, input, PRODUCT_COLUMNS, productRows(input), 'TOTAL ANUAL POR PRODUCTO', y)
}
