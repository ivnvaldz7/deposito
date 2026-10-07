import { mkdirSync } from 'node:fs'
import { createWriteStream } from 'node:fs'
import { resolve } from 'node:path'
import PDFDocument from 'pdfkit'
import { buildStockPdfInput } from '../routes/ale-bet/stock-report'
import { renderStockPdf } from '../routes/ale-bet/stock-pdf'

const outputDir = resolve(process.cwd(), '../../../output/pdf')
mkdirSync(outputDir, { recursive: true })
const output = resolve(outputDir, 'stock-producto-terminado-demo.pdf')

const input = buildStockPdfInput([
  { id: 'a', nombre: 'AMANTINA 250 ML', lotes: [{ id: 'a1', numero: 'AM0141', createdAt: new Date('2026-01-01'), fechaVencimiento: new Date('2027-04-17'), saldos: [{ cantidad: 75, ubicacion: { codigo: 'DEPOSITO' } }, { cantidad: 10, ubicacion: { codigo: 'ACONDICIONADO' } }] }] },
  { id: 'b', nombre: 'AMANTINA 500 ML', lotes: [{ id: 'b1', numero: 'AM0142', createdAt: new Date('2026-02-01'), fechaVencimiento: new Date('2027-05-10'), saldos: [{ cantidad: 445, ubicacion: { codigo: 'DEPOSITO' } }] }] },
  { id: 'c', nombre: 'AMINOÁCIDOS 20 ML', lotes: [{ id: 'c1', numero: 'AO0301', createdAt: new Date('2026-03-01'), fechaVencimiento: new Date('2027-06-01'), saldos: [{ cantidad: 1150, ubicacion: { codigo: 'DEPOSITO' } }] }] },
  { id: 'd', nombre: 'OLIVITASAN PLUS 500 ML', lotes: [{ id: 'd1', numero: 'PL0614', createdAt: new Date('2026-04-01'), fechaVencimiento: new Date('2027-09-30'), saldos: [{ cantidad: 730, ubicacion: { codigo: 'DEPOSITO' } }] }, { id: 'd2', numero: 'PL0618', createdAt: new Date('2026-05-01'), fechaVencimiento: new Date('2028-01-15'), saldos: [{ cantidad: 220, ubicacion: { codigo: 'ACONDICIONADO' } }] }] },
  { id: 'e', nombre: 'COMPLEJO B B12 B15 100 ML', lotes: [{ id: 'e1', numero: 'CB0251', createdAt: new Date('2026-06-01'), fechaVencimiento: new Date('2027-12-20'), saldos: [{ cantidad: 40, ubicacion: { codigo: 'DEPOSITO' } }, { cantidad: 100, ubicacion: { codigo: 'ACONDICIONADO' } }] }] },
], new Date('2026-10-05T15:00:00Z'))

const document = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true })
document.pipe(createWriteStream(output))
renderStockPdf(document as unknown as import('../routes/ale-bet/stock-pdf').StockPdfDocument, input)
document.end()
console.log(output)
