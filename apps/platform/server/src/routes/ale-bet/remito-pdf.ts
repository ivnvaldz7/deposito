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
  caiSnapshot?: unknown
}

type DisplayClient = { nombre?: string; direccion?: string; localidad?: string; provincia?: string; cuit?: string; condicionIva?: string; condicionVenta?: string }
type DisplayTransport = { nombre?: string; direccion?: string }
type DisplayItem = { cantidad?: string; nombre?: string }
type DisplayCai = { numero?: string; vencimiento?: Date }

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 28
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const TEXT_COLOR = '#111111'
const MUTED_COLOR = '#3F3F46'
const ROW_HEIGHT = 25

function isRecord(value: unknown): value is object { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function getString(record: object, key: string): string | undefined {
  const value = Object.entries(record).find(([entryKey]) => entryKey === key)?.[1]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
function getQuantity(record: object): string | undefined {
  const value = Object.entries(record).find(([entryKey]) => entryKey === 'cantidad')?.[1]
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
function clientFromSnapshot(snapshot: unknown): DisplayClient {
  if (!isRecord(snapshot)) return {}
  return { nombre: getString(snapshot, 'nombre'), direccion: getString(snapshot, 'direccion'), localidad: getString(snapshot, 'localidad'), provincia: getString(snapshot, 'provincia'), cuit: getString(snapshot, 'cuit'), condicionIva: getString(snapshot, 'condicionIva'), condicionVenta: getString(snapshot, 'condicionVenta') }
}
function transportFromSnapshot(snapshot: unknown, fallbackName: string, fallbackAddress: string): DisplayTransport {
  const name = isRecord(snapshot) ? getString(snapshot, 'nombre') : undefined
  const address = isRecord(snapshot) ? getString(snapshot, 'direccion') : undefined
  return { nombre: name ?? nonEmpty(fallbackName), direccion: address ?? nonEmpty(fallbackAddress) }
}
function itemsFromSnapshot(snapshot: unknown): DisplayItem[] {
  return Array.isArray(snapshot) ? snapshot.filter(isRecord).map((item) => ({ cantidad: getQuantity(item), nombre: getString(item, 'nombre') })) : []
}
function caiFromSnapshot(snapshot: unknown): DisplayCai {
  if (!isRecord(snapshot)) return { numero: '52166218186464', vencimiento: new Date('2027-04-17T00:00:00.000Z') }
  const rawDate = Object.entries(snapshot).find(([key]) => key === 'vencimiento')?.[1]
  const vencimiento = rawDate instanceof Date ? rawDate : typeof rawDate === 'string' ? new Date(rawDate) : undefined
  return { numero: getString(snapshot, 'numero'), vencimiento: vencimiento && !Number.isNaN(vencimiento.valueOf()) ? vencimiento : undefined }
}
function nonEmpty(value: string): string | undefined { const trimmed = value.trim(); return trimmed || undefined }
function date(value: Date): string { return `${String(value.getUTCDate()).padStart(2, '0')}/${String(value.getUTCMonth() + 1).padStart(2, '0')}/${value.getUTCFullYear()}` }
function rule(document: RemitoPdfDocument, y: number, from = MARGIN, to = PAGE_WIDTH - MARGIN): void { document.lineWidth(0.8).moveTo(from, y).lineTo(to, y).stroke() }
function vertical(document: RemitoPdfDocument, x: number, from: number, to: number): void { document.lineWidth(0.8).moveTo(x, from).lineTo(x, to).stroke() }
function label(document: RemitoPdfDocument, text: string, value: string | undefined, x: number, y: number, width: number, offset: number): void {
  document.font('Helvetica-Bold').fontSize(8.5).fillColor(TEXT_COLOR).text(text, x, y, { width })
  if (value) document.font('Helvetica').fontSize(8.5).text(value, x + offset, y, { width: Math.max(0, width - offset) })
}
function drawAbMark(document: RemitoPdfDocument, x: number, y: number): void {
  const centerX = x + 29; const centerY = y + 20
  document.lineWidth(2).moveTo(centerX, y).lineTo(x + 58, centerY).lineTo(centerX, y + 40).lineTo(x, centerY).lineTo(centerX, y).stroke()
  document.font('Helvetica-Bold').fontSize(15).fillColor(TEXT_COLOR).text('AB', x + 5, y + 13, { width: 48, align: 'center' })
}

export function renderRemitoPdf(document: RemitoPdfDocument, input: RemitoPdfInput): void {
  const client = clientFromSnapshot(input.clienteSnapshot)
  const transport = transportFromSnapshot(input.transporteSnapshot, input.transporteNombre, input.transporteDireccion)
  const items = itemsFromSnapshot(input.itemsSnapshot)
  const cai = caiFromSnapshot(input.caiSnapshot)
  const companyRight = 286; const codeRight = 364; const headerBottom = 174; const customerBottom = 324; const quantityRight = 126; const right = PAGE_WIDTH - MARGIN

  document.font('Helvetica').fillColor(TEXT_COLOR).lineWidth(0.8)
  document.rect(MARGIN, MARGIN, CONTENT_WIDTH, PAGE_HEIGHT - MARGIN * 2).stroke()
  vertical(document, companyRight, MARGIN, headerBottom); vertical(document, codeRight, MARGIN, headerBottom)
  rule(document, 111, companyRight, right); rule(document, headerBottom)
  drawAbMark(document, MARGIN + 23, MARGIN + 18)
  document.font('Helvetica-Bold').fontSize(22).text('ale.bet', MARGIN + 90, MARGIN + 28, { width: 160 })
  document.font('Helvetica-Bold').fontSize(8.3).text('LABORATORIOS DE ESPECIALIDADES', MARGIN + 16, MARGIN + 77, { width: 244, align: 'center' })
  document.text('VETERINARIAS ALE BET S.R.L.', MARGIN + 16, MARGIN + 88, { width: 244, align: 'center' })
  document.font('Helvetica').fontSize(7.6).text('Condarco 3071 · C1417CZI Ciudad de Buenos Aires', MARGIN + 12, MARGIN + 108, { width: 252, align: 'center' })
  document.text('Tel. 4501-5575 / 9271 · info@ale-bet.com.ar', MARGIN + 12, MARGIN + 120, { width: 252, align: 'center' })
  document.font('Helvetica-Bold').fontSize(7.8).text('IVA RESPONSABLE INSCRIPTO', MARGIN + 12, MARGIN + 134, { width: 252, align: 'center' })
  document.font('Helvetica-Bold').fontSize(35).text('R', companyRight, MARGIN + 15, { width: codeRight - companyRight, align: 'center' })
  document.font('Helvetica-Bold').fontSize(6.6).text('CÓDIGO N° 091', companyRight + 5, MARGIN + 59, { width: codeRight - companyRight - 10, align: 'center' })
  document.font('Helvetica-Bold').fontSize(6.3).text('DOCUMENTO', companyRight + 5, MARGIN + 72, { width: codeRight - companyRight - 10, align: 'center' })
  document.text('NO VÁLIDO', companyRight + 5, MARGIN + 80, { width: codeRight - companyRight - 10, align: 'center' })
  document.text('COMO FACTURA', companyRight + 5, MARGIN + 88, { width: codeRight - companyRight - 10, align: 'center' })
  document.font('Helvetica-Bold').fontSize(18).text('REMITO', codeRight + 8, MARGIN + 20, { width: right - codeRight - 16, align: 'center' })
  const displayNumber = /^\d{5}-\d{8}$/.test(input.numero) ? input.numero.replace('-', ' - ') : input.numero
  document.font('Helvetica-Bold').fontSize(10.5).text(`N° ${displayNumber}`, codeRight + 8, MARGIN + 54, { width: right - codeRight - 16, align: 'center' })
  document.font('Helvetica').fontSize(9).text(`Fecha: ${date(input.fecha)}`, codeRight + 8, MARGIN + 74, { width: right - codeRight - 16, align: 'center' })
  document.font('Helvetica').fontSize(7.8).text('CUIT 30-61348051-6', codeRight + 14, 121).text('Ing. Brutos 901-406310-8', codeRight + 14, 132).text('Imp. Internos: No Responsable', codeRight + 14, 143).text('Inicio de actividades: 23/04/1984', codeRight + 14, 154)
  document.font('Helvetica-Bold').fontSize(11).text('CLIENTE', MARGIN + 14, 184)
  const fieldX = MARGIN + 14; const fieldW = CONTENT_WIDTH - 28
  label(document, 'SEÑOR:', client.nombre, fieldX, 207, fieldW, 79); label(document, 'DOMICILIO:', client.direccion, fieldX, 229, fieldW, 79)
  label(document, 'LOCALIDAD / PROVINCIA:', [client.localidad, client.provincia].filter(Boolean).join(' / ') || undefined, fieldX, 251, fieldW, 138)
  label(document, 'IVA:', client.condicionIva, fieldX, 273, 245, 35); label(document, 'C.U.I.T.:', client.cuit, MARGIN + 276, 273, 260, 45)
  label(document, 'CONDICIONES DE VENTA:', client.condicionVenta, fieldX, 295, fieldW, 138)
  rule(document, customerBottom)
  document.font('Helvetica-Bold').fontSize(10).text('CANTIDAD', MARGIN + 8, customerBottom + 8, { width: 82, align: 'center' }).text('DETALLE', quantityRight + 12, customerBottom + 8, { width: right - quantityRight - 20 })
  rule(document, customerBottom + ROW_HEIGHT)
  let y = customerBottom + ROW_HEIGHT; let pageItemsTop = customerBottom
  for (const item of items) {
    if (y + ROW_HEIGHT > PAGE_HEIGHT - 162) {
      vertical(document, quantityRight, pageItemsTop, PAGE_HEIGHT - MARGIN); document.addPage(); document.rect(MARGIN, MARGIN, CONTENT_WIDTH, PAGE_HEIGHT - MARGIN * 2).stroke()
      document.font('Helvetica-Bold').fontSize(10).text('CANTIDAD', MARGIN + 8, MARGIN + 8, { width: 82, align: 'center' }).text('DETALLE', quantityRight + 12, MARGIN + 8, { width: right - quantityRight - 20 })
      rule(document, MARGIN + ROW_HEIGHT); y = MARGIN + ROW_HEIGHT; pageItemsTop = MARGIN
    }
    document.font('Helvetica').fontSize(9.2).text(item.cantidad ?? '', MARGIN + 8, y + 7, { width: 82, align: 'center' }).text(item.nombre ?? '', quantityRight + 12, y + 7, { width: right - quantityRight - 20, height: ROW_HEIGHT - 8, ellipsis: true })
    rule(document, y + ROW_HEIGHT); y += ROW_HEIGHT
  }
  const footerTop = Math.max(y + 10, PAGE_HEIGHT - 160); const signatureLeft = 365
  vertical(document, quantityRight, pageItemsTop, footerTop); rule(document, footerTop); vertical(document, signatureLeft, footerTop, PAGE_HEIGHT - MARGIN - 42)
  document.font('Helvetica-Bold').fontSize(9).text('BULTOS:', MARGIN + 12, footerTop + 16).text('PESO:', MARGIN + 12, footerTop + 37).text('TRANSPORTISTA:', MARGIN + 12, footerTop + 65).text('DIRECCIÓN / TRANSPORTE:', MARGIN + 12, footerTop + 87)
  document.font('Helvetica').fontSize(8.5).text(transport.nombre ?? '', MARGIN + 100, footerTop + 65, { width: 235, ellipsis: true }).text(transport.direccion ?? '', MARGIN + 145, footerTop + 87, { width: 190, ellipsis: true })
  document.font('Helvetica-Bold').fontSize(10).text('RECIBÍ CONFORME', signatureLeft + 20, footerTop + 18, { width: right - signatureLeft - 25, align: 'center' })
  document.moveTo(signatureLeft + 18, footerTop + 91).lineTo(right - 15, footerTop + 91).stroke(); document.font('Helvetica').fontSize(8.3).fillColor(MUTED_COLOR).text('Firma y aclaración', signatureLeft + 20, footerTop + 98, { width: right - signatureLeft - 25, align: 'center' })
  rule(document, PAGE_HEIGHT - MARGIN - 42)
  if (cai.numero && cai.vencimiento) {
    document.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXT_COLOR).text(`C.A.I. N° ${cai.numero}`, MARGIN, PAGE_HEIGHT - MARGIN - 28, { width: CONTENT_WIDTH - 12, align: 'right' })
    document.font('Helvetica').fontSize(9).text(`Vto. ${date(cai.vencimiento)}`, MARGIN, PAGE_HEIGHT - MARGIN - 15, { width: CONTENT_WIDTH - 12, align: 'right' })
  }
}
