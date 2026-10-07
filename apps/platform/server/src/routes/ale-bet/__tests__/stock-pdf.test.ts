import { describe, expect, it } from 'vitest'
import { buildStockPdfInput } from '../stock-report'
import { renderStockPdf, type StockPdfDocument } from '../stock-pdf'

class RecordingDocument implements StockPdfDocument {
  texts: string[] = []
  pages = 1
  fontSize() { return this }
  font() { return this }
  fillColor() { return this }
  rect() { return this }
  fill() { return this }
  text(value: string) { this.texts.push(value); return this }
  addPage() { this.pages += 1; return this }
  bufferedPageRange() { return { start: 0, count: this.pages } }
  switchToPage() { return this }
}

describe('finished stock PDF', () => {
  it('keeps only physical lots and reports both locations, expiration, and totals', () => {
    const input = buildStockPdfInput([{
      id: 'product-1',
      nombre: 'AMANTINA 250 ML',
      lotes: [
        { id: 'empty', numero: 'AM0140', createdAt: new Date('2026-01-01'), fechaVencimiento: null, saldos: [] },
        {
          id: 'physical', numero: 'AM0141', createdAt: new Date('2026-02-01'), fechaVencimiento: new Date('2027-04-17'),
          saldos: [{ cantidad: 75, ubicacion: { codigo: 'DEPOSITO' } }, { cantidad: 12, ubicacion: { codigo: 'ACONDICIONADO' } }],
        },
      ],
    }], new Date('2026-10-05T15:00:00Z'))

    expect(input.productos).toEqual([{
      nombre: 'AMANTINA 250 ML',
      lotes: [{ numero: 'AM0141', vencimiento: '17/4/2027', deposito: 75, acondicionado: 12, total: 87 }],
    }])

    const document = new RecordingDocument()
    renderStockPdf(document, input)
    expect(document.texts.join('\n')).toContain('STOCK DE PRODUCTO TERMINADO')
    expect(document.texts.join('\n')).toContain('AM0141')
    expect(document.texts.join('\n')).toContain('VENCIMIENTO')
    expect(document.texts.join('\n')).toContain('TOTAL GENERAL')
  })
})
