export type RemitoPdfTextOptions = {
  width?: number
  height?: number
  ellipsis?: boolean
  align?: 'left' | 'center' | 'right'
}

export interface RemitoPdfDocument {
  fontSize(size: number): this
  font(name: string): this
  fillColor(color: string): this
  lineWidth(width: number): this
  text(value: string, x?: number, y?: number, options?: RemitoPdfTextOptions): this
  rect(x: number, y: number, width: number, height: number): this
  moveTo(x: number, y: number): this
  lineTo(x: number, y: number): this
  stroke(): this
  addPage(): this
}

export type RemitoPdfInput = {
  numero: string
  fecha: Date
  clienteSnapshot: unknown
  transporteSnapshot: unknown
  transporteNombre: string
  transporteDireccion: string
  itemsSnapshot: unknown
}

type DisplayClient = {
  nombre?: string
  direccion?: string
  localidad?: string
  provincia?: string
  cuit?: string
  condicionIva?: string
  condicionVenta?: string
}

type DisplayTransport = {
  nombre?: string
  direccion?: string
}

type DisplayItem = {
  cantidad?: string
  nombre?: string
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const RULE_COLOR = '#333333'
const TEXT_COLOR = '#111111'
const MUTED_COLOR = '#4B5563'
const ROW_HEIGHT = 28

function isRecord(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getString(record: object, key: string): string | undefined {
  const entry = Object.entries(record).find(([entryKey]) => entryKey === key)
  const value = entry?.[1]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function getQuantity(record: object): string | undefined {
  const entry = Object.entries(record).find(([entryKey]) => entryKey === 'cantidad')
  const value = entry?.[1]
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function clientFromSnapshot(snapshot: unknown): DisplayClient {
  if (!isRecord(snapshot)) return {}
  return {
    nombre: getString(snapshot, 'nombre'),
    direccion: getString(snapshot, 'direccion'),
    localidad: getString(snapshot, 'localidad'),
    provincia: getString(snapshot, 'provincia'),
    cuit: getString(snapshot, 'cuit'),
    condicionIva: getString(snapshot, 'condicionIva'),
    condicionVenta: getString(snapshot, 'condicionVenta'),
  }
}

function transportFromSnapshot(snapshot: unknown, fallbackName: string, fallbackAddress: string): DisplayTransport {
  const snapshotName = isRecord(snapshot) ? getString(snapshot, 'nombre') : undefined
  const snapshotAddress = isRecord(snapshot) ? getString(snapshot, 'direccion') : undefined
  return {
    nombre: snapshotName ?? nonEmpty(fallbackName),
    direccion: snapshotAddress ?? nonEmpty(fallbackAddress),
  }
}

function itemsFromSnapshot(snapshot: unknown): DisplayItem[] {
  if (!Array.isArray(snapshot)) return []
  return snapshot.filter(isRecord).map((item) => ({ cantidad: getQuantity(item), nombre: getString(item, 'nombre') }))
}

function nonEmpty(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function drawHorizontalRule(document: RemitoPdfDocument, y: number): void {
  document.lineWidth(0.8).moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke()
}

function drawVerticalRule(document: RemitoPdfDocument, x: number, from: number, to: number): void {
  document.lineWidth(0.8).moveTo(x, from).lineTo(x, to).stroke()
}

function drawLabel(document: RemitoPdfDocument, label: string, value: string | undefined, x: number, y: number, width: number, valueOffset = 78): void {
  document.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_COLOR).text(label, x, y, { width })
  if (value) document.font('Helvetica').fontSize(9).fillColor(TEXT_COLOR).text(value, x + valueOffset, y, { width: Math.max(0, width - valueOffset) })
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function renderRemitoPdf(document: RemitoPdfDocument, input: RemitoPdfInput): void {
  const client = clientFromSnapshot(input.clienteSnapshot)
  const transport = transportFromSnapshot(input.transporteSnapshot, input.transporteNombre, input.transporteDireccion)
  const items = itemsFromSnapshot(input.itemsSnapshot)
  const contentRight = PAGE_WIDTH - MARGIN
  const headerDivider = MARGIN + 62
  const headerBottom = MARGIN + 112
  const customerBottom = headerBottom + 124
  const quantityColumn = MARGIN + 104

  document.font('Helvetica').fillColor(TEXT_COLOR).lineWidth(0.8)
  document.rect(MARGIN, MARGIN, CONTENT_WIDTH, PAGE_HEIGHT - MARGIN * 2).stroke()
  drawHorizontalRule(document, headerDivider)
  drawHorizontalRule(document, headerBottom)
  drawVerticalRule(document, MARGIN + 248, MARGIN, headerBottom)
  drawVerticalRule(document, MARGIN + 320, MARGIN, headerBottom)

  document.font('Helvetica-Bold').fontSize(19).text('Ale-Bet', MARGIN + 15, MARGIN + 16, { width: 218, align: 'center' })
  document.font('Helvetica').fontSize(7.5).fillColor(MUTED_COLOR).text('Laboratorios de Especialidades Veterinarias Ale Bet S.R.L.', MARGIN + 15, MARGIN + 47, { width: 218, align: 'center' })
  document.font('Helvetica-Bold').fontSize(28).fillColor(TEXT_COLOR).text('R', MARGIN + 248, MARGIN + 27, { width: 72, align: 'center' })
  document.font('Helvetica-Bold').fontSize(16).text('REMITO', MARGIN + 332, MARGIN + 18, { width: contentRight - (MARGIN + 344), align: 'right' })
  document.font('Helvetica').fontSize(9).text(`N°: ${input.numero}`, MARGIN + 332, MARGIN + 51, { width: contentRight - (MARGIN + 344), align: 'right' })
  document.text(`Fecha: ${formatDate(input.fecha)}`, MARGIN + 332, MARGIN + 68, { width: contentRight - (MARGIN + 344), align: 'right' })

  const clientX = MARGIN + 16
  const clientWidth = CONTENT_WIDTH - 32
  const clientValueOffset = 148

  document.font('Helvetica-Bold').fontSize(11).text('CLIENTE', clientX, headerBottom + 12)
  drawLabel(document, 'SEÑOR:', client.nombre, clientX, headerBottom + 34, clientWidth, clientValueOffset)
  drawLabel(document, 'DOMICILIO:', client.direccion, clientX, headerBottom + 53, clientWidth, clientValueOffset)
  const location = [client.localidad, client.provincia].filter((value): value is string => Boolean(value)).join(' / ')
  drawLabel(document, 'LOCALIDAD / PROVINCIA:', location || undefined, clientX, headerBottom + 72, clientWidth, clientValueOffset)
  drawLabel(document, 'IVA:', client.condicionIva, clientX, headerBottom + 91, 236, 42)
  drawLabel(document, 'C.U.I.T.:', client.cuit, MARGIN + 270, headerBottom + 91, CONTENT_WIDTH - 286, 54)
  drawLabel(document, 'CONDICIONES DE VENTA:', client.condicionVenta, clientX, headerBottom + 110, clientWidth, clientValueOffset)
  drawHorizontalRule(document, customerBottom)

  document.font('Helvetica-Bold').fontSize(10).text('CANTIDAD', MARGIN + 10, customerBottom + 10, { width: 84, align: 'center' })
  document.text('DETALLE', quantityColumn + 12, customerBottom + 10, { width: CONTENT_WIDTH - 116 })
  drawHorizontalRule(document, customerBottom + ROW_HEIGHT)

  let y = customerBottom + ROW_HEIGHT
  let merchandiseTop = customerBottom
  for (const item of items) {
    if (y + ROW_HEIGHT > PAGE_HEIGHT - 184) {
      drawVerticalRule(document, quantityColumn, merchandiseTop, PAGE_HEIGHT - MARGIN)
      document.addPage()
      document.rect(MARGIN, MARGIN, CONTENT_WIDTH, PAGE_HEIGHT - MARGIN * 2).stroke()
      document.font('Helvetica-Bold').fontSize(10).text('CANTIDAD', MARGIN + 10, MARGIN + 10, { width: 84, align: 'center' })
      document.text('DETALLE', quantityColumn + 12, MARGIN + 10, { width: CONTENT_WIDTH - 116 })
      drawHorizontalRule(document, MARGIN + ROW_HEIGHT)
      y = MARGIN + ROW_HEIGHT
      merchandiseTop = MARGIN
    }
    document.font('Helvetica').fontSize(10).fillColor(TEXT_COLOR).text(item.cantidad ?? '', MARGIN + 10, y + 8, { width: 84, align: 'center' })
    document.text(item.nombre ?? '', quantityColumn + 12, y + 8, { width: CONTENT_WIDTH - 116, height: ROW_HEIGHT - 10, ellipsis: true })
    drawHorizontalRule(document, y + ROW_HEIGHT)
    y += ROW_HEIGHT
  }

  const footerTop = Math.max(y + 12, PAGE_HEIGHT - 164)
  drawVerticalRule(document, quantityColumn, merchandiseTop, footerTop)
  drawHorizontalRule(document, footerTop)
  document.font('Helvetica-Bold').fontSize(9).text('BULTOS: __________________', MARGIN + 12, footerTop + 16)
  document.text('PESO: ____________________', MARGIN + 12, footerTop + 37)
  document.text('TRANSPORTISTA:', MARGIN + 12, footerTop + 66)
  document.font('Helvetica').text(transport.nombre ?? '', MARGIN + 108, footerTop + 66, { width: 202 })
  document.font('Helvetica-Bold').text('DIRECCIÓN / TRANSPORTE:', MARGIN + 12, footerTop + 86)
  document.font('Helvetica').text(transport.direccion ?? '', MARGIN + 172, footerTop + 86, { width: 138 })

  const signatureX = MARGIN + 342
  drawVerticalRule(document, signatureX - 12, footerTop, PAGE_HEIGHT - MARGIN)
  document.font('Helvetica-Bold').fontSize(10).text('RECIBÍ CONFORME', signatureX, footerTop + 18, { width: 150, align: 'center' })
  document.font('Helvetica').fontSize(8.5).fillColor(MUTED_COLOR).text('Firma y aclaración', signatureX, PAGE_HEIGHT - 82, { width: 150, align: 'center' })
  document.moveTo(signatureX, PAGE_HEIGHT - 98).lineTo(contentRight - 10, PAGE_HEIGHT - 98).stroke()
}
