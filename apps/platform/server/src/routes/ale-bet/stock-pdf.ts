/**
 * Printable finished-stock report. Kept separate from the HTTP route so the
 * layout can be exercised with a recording PDF document in tests.
 */
export type StockPdfTextOptions = {
  width?: number
  align?: 'left' | 'center' | 'right'
  ellipsis?: boolean
}

export interface StockPdfDocument {
  fontSize(size: number): this
  font(name: string): this
  fillColor(color: string): this
  rect(x: number, y: number, width: number, height: number): this
  fill(color?: string): this
  text(value: string, x?: number, y?: number, options?: StockPdfTextOptions): this
  addPage(): this
  bufferedPageRange(): { start: number; count: number }
  switchToPage(index: number): this
}

export type StockPdfInput = {
  generado: string
  productos: Array<{
    nombre: string
    lotes: Array<{
      numero: string
      vencimiento: string
      deposito: number
      acondicionado: number
      total: number
    }>
  }>
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 38
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN
const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN - 20
const TITLE_BOTTOM = 112
const HEADER_HEIGHT = 20
const PRODUCT_HEIGHT = 19
const ROW_HEIGHT = 18
const TEXT = '#1A1A1A'
const MUTED = '#6B7280'
const RULE = '#9CA3AF'
const ACCENT = '#3D6852'
const TINT = '#F3F4F6'
const fmt = new Intl.NumberFormat('es-AR')

type Column = { label: string; x: number; width: number; align: 'left' | 'right' }
const COLUMNS: Column[] = [
  { label: 'LOTE', x: MARGIN + 8, width: 78, align: 'left' },
  { label: 'VENCIMIENTO', x: MARGIN + 86, width: 92, align: 'left' },
  { label: 'DEPÓSITO', x: MARGIN + 178, width: 82, align: 'right' },
  { label: 'ACONDICIONADO', x: MARGIN + 260, width: 112, align: 'right' },
  { label: 'TOTAL', x: MARGIN + 372, width: 116, align: 'right' },
]

function drawChrome(document: StockPdfDocument, input: StockPdfInput): void {
  document.font('Helvetica-Bold').fontSize(11).fillColor(TEXT).text('ALE-BET', MARGIN, MARGIN)
  document.font('Helvetica').fontSize(7.5).fillColor(MUTED).text('LOGÍSTICA', MARGIN, MARGIN + 13)
  document.font('Helvetica').fontSize(7).fillColor(MUTED).text('GENERADO', CONTENT_RIGHT - 175, MARGIN, { width: 175, align: 'right' })
  document.font('Helvetica-Bold').fontSize(8.5).fillColor(TEXT).text(input.generado, CONTENT_RIGHT - 175, MARGIN + 12, { width: 175, align: 'right' })
  document.font('Helvetica-Bold').fontSize(21).fillColor(TEXT).text('STOCK DE PRODUCTO TERMINADO', MARGIN, MARGIN + 38, { width: CONTENT_WIDTH, align: 'center' })
  document.font('Helvetica').fontSize(8).fillColor(MUTED).text('Detalle por lote y ubicación al momento de la exportación', MARGIN, MARGIN + 65, { width: CONTENT_WIDTH, align: 'center' })
  document.rect(MARGIN, MARGIN + 84, CONTENT_WIDTH, 1.2).fill(ACCENT)
}

function drawTableHeader(document: StockPdfDocument, y: number): number {
  document.rect(MARGIN, y, CONTENT_WIDTH, HEADER_HEIGHT).fill(TINT)
  document.font('Helvetica-Bold').fontSize(7.5).fillColor(TEXT)
  for (const column of COLUMNS) document.text(column.label, column.x, y + 6, { width: column.width, align: column.align })
  return y + HEADER_HEIGHT
}

function drawProduct(document: StockPdfDocument, nombre: string, y: number): number {
  document.font('Helvetica-Bold').fontSize(9.5).fillColor(ACCENT).text(nombre, MARGIN, y + 5, { width: CONTENT_WIDTH, ellipsis: true })
  return y + PRODUCT_HEIGHT
}

function drawLot(document: StockPdfDocument, lot: StockPdfInput['productos'][number]['lotes'][number], y: number): void {
  const cells = [lot.numero, lot.vencimiento, fmt.format(lot.deposito), fmt.format(lot.acondicionado), fmt.format(lot.total)]
  document.font('Helvetica').fontSize(8.5).fillColor(TEXT)
  for (let index = 0; index < COLUMNS.length; index += 1) {
    const column = COLUMNS[index]!
    document.text(cells[index]!, column.x, y + 5, { width: column.width, align: column.align, ellipsis: index < 2 })
  }
}

function drawFooter(document: StockPdfDocument): void {
  const pages = document.bufferedPageRange()
  for (let index = pages.start; index < pages.start + pages.count; index += 1) {
    document.switchToPage(index)
    document.rect(MARGIN, PAGE_HEIGHT - MARGIN + 1, CONTENT_WIDTH, 0.8).fill(RULE)
    document.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text('Ale-Bet · Logística', MARGIN, PAGE_HEIGHT - MARGIN + 7)
      .text(`Página ${index + 1} de ${pages.count}`, CONTENT_RIGHT - 150, PAGE_HEIGHT - MARGIN + 7, { width: 150, align: 'right' })
  }
}

export function renderStockPdf(document: StockPdfDocument, input: StockPdfInput): void {
  drawChrome(document, input)
  let y = TITLE_BOTTOM
  let totalDeposito = 0
  let totalAcondicionado = 0

  const pageBreak = (): void => {
    document.addPage()
    drawChrome(document, input)
    y = TITLE_BOTTOM
  }

  for (const producto of input.productos) {
    const sectionHeight = PRODUCT_HEIGHT + HEADER_HEIGHT + producto.lotes.length * ROW_HEIGHT + 8
    if (y + Math.min(sectionHeight, PRODUCT_HEIGHT + HEADER_HEIGHT + ROW_HEIGHT) > CONTENT_BOTTOM) pageBreak()
    y = drawProduct(document, producto.nombre, y)
    y = drawTableHeader(document, y)
    for (const lot of producto.lotes) {
      if (y + ROW_HEIGHT > CONTENT_BOTTOM) {
        pageBreak()
        y = drawProduct(document, `${producto.nombre} (continuación)`, y)
        y = drawTableHeader(document, y)
      }
      drawLot(document, lot, y)
      totalDeposito += lot.deposito
      totalAcondicionado += lot.acondicionado
      y += ROW_HEIGHT
    }
    y += 8
  }

  if (y + 38 > CONTENT_BOTTOM) pageBreak()
  const total = totalDeposito + totalAcondicionado
  document.rect(MARGIN, y, CONTENT_WIDTH, 30).fill(TINT)
  document.font('Helvetica-Bold').fontSize(8).fillColor(TEXT).text('TOTAL GENERAL', MARGIN + 8, y + 10)
  document.font('Helvetica-Bold').fontSize(9).fillColor(TEXT)
    .text(`Depósito: ${fmt.format(totalDeposito)}`, MARGIN + 170, y + 10, { width: 105, align: 'right' })
    .text(`Acondicionado: ${fmt.format(totalAcondicionado)}`, MARGIN + 280, y + 10, { width: 130, align: 'right' })
    .text(`${fmt.format(total)} unidades`, MARGIN + 410, y + 10, { width: 78, align: 'right' })

  drawFooter(document)
}
