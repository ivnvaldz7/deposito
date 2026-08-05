import { describe, expect, it } from 'vitest'
import { renderRemitoPdf, type RemitoPdfDocument } from '../remito-pdf'

class RecordingDocument implements RemitoPdfDocument {
  readonly texts: string[] = []
  readonly operations: string[] = []
  readonly lines: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> = []
  private currentPoint: { x: number; y: number } | undefined

  fontSize(size: number): this { this.operations.push(`fontSize:${size}`); return this }
  font(_name: string): this { return this }
  fillColor(_color: string): this { return this }
  lineWidth(_width: number): this { return this }
  text(value: string, _x?: number, _y?: number, _options?: { width?: number; align?: 'left' | 'center' | 'right' }): this { this.texts.push(value); return this }
  rect(_x: number, _y: number, _width: number, _height: number): this { return this }
  moveTo(x: number, y: number): this { this.currentPoint = { x, y }; return this }
  lineTo(x: number, y: number): this {
    if (this.currentPoint) this.lines.push({ from: this.currentPoint, to: { x, y } })
    return this
  }
  stroke(): this { return this }
  addPage(): this { this.operations.push('addPage'); return this }
}

describe('renderRemitoPdf', () => {
  it('renders only display-safe historical snapshot fields for a habitual transporter', () => {
    const document = new RecordingDocument()

    renderRemitoPdf(document, {
      numero: 'R-20260805-AB12CD34',
      fecha: new Date('2026-08-05T12:00:00.000Z'),
      clienteSnapshot: {
        id: 'clx_internal_123',
        nombre: 'Veterinaria El Ombú S.A.',
        direccion: 'Av. Siempre Viva 123',
        localidad: 'La Plata',
        provincia: 'Buenos Aires',
        cuit: '30-71234567-9',
        condicionIva: 'Responsable Inscripto',
        condicionVenta: 'Cuenta corriente 30 días',
        estado: 'VALIDADO',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:00.000Z',
      },
      transporteSnapshot: {
        id: 'tr_internal_456',
        nombre: 'Transporte La Estrella',
        direccion: 'Ruta 2 Km 45',
        activo: true,
        createdAt: '2026-08-01T00:00:00.000Z',
      },
      transporteNombre: 'Fallback ignored',
      transporteDireccion: 'Fallback ignored',
      itemsSnapshot: [
        { productoId: 'prod_internal_1', nombre: 'Olivitasan D', cantidad: 17, stock: 100, reservado: 10 },
        { productoId: 'prod_internal_2', nombre: 'Cefalexina 250', cantidad: 3 },
      ],
    })

    const content = document.texts.join('\n')
    expect(content).toContain('Ale-Bet')
    expect(content).toContain('Laboratorios de Especialidades Veterinarias Ale Bet S.R.L.')
    expect(content).toContain('R')
    expect(content).toContain('REMITO')
    expect(content).toContain('N°: R-20260805-AB12CD34')
    expect(content).toContain('Fecha: 2026-08-05')
    expect(content).toContain('SEÑOR:')
    expect(content).toContain('Veterinaria El Ombú S.A.')
    expect(content).toContain('DOMICILIO:')
    expect(content).toContain('Av. Siempre Viva 123')
    expect(content).toContain('LOCALIDAD / PROVINCIA:')
    expect(content).toContain('La Plata / Buenos Aires')
    expect(content).toContain('IVA:')
    expect(content).toContain('Responsable Inscripto')
    expect(content).toContain('C.U.I.T.:')
    expect(content).toContain('30-71234567-9')
    expect(content).toContain('CONDICIONES DE VENTA:')
    expect(content).toContain('Cuenta corriente 30 días')
    expect(content).toContain('17')
    expect(content).toContain('Olivitasan D')
    expect(content).toContain('TRANSPORTISTA:')
    expect(content).toContain('Transporte La Estrella')
    expect(content).toContain('DIRECCIÓN / TRANSPORTE:')
    expect(content).toContain('Ruta 2 Km 45')
    expect(content).toContain('BULTOS: __________________')
    expect(content).toContain('PESO: ____________________')
    expect(content).toContain('RECIBÍ CONFORME')

    expect(content).not.toContain('{')
    expect(content).not.toContain('productoId')
    expect(content).not.toContain('clx_internal_123')
    expect(content).not.toContain('tr_internal_456')
    expect(content).not.toContain('VALIDADO')
    expect(content).not.toContain('createdAt')
    expect(content).not.toContain('updatedAt')
    expect(content).not.toContain('stock')
    expect(content).not.toContain('reservado')
    expect(content).not.toContain('null')
  })

  it('uses persisted fallback transport fields and keeps missing optional client values blank', () => {
    const document = new RecordingDocument()

    renderRemitoPdf(document, {
      numero: 'R-20260805-EF56GH78',
      fecha: new Date('2026-08-05T12:00:00.000Z'),
      clienteSnapshot: { nombre: 'Cliente ocasional', direccion: null, localidad: '', provincia: null, cuit: undefined, condicionIva: null, condicionVenta: '' },
      transporteSnapshot: { id: 'technical-only' },
      transporteNombre: 'Flete Ocasional SRL',
      transporteDireccion: 'Calle 9 456',
      itemsSnapshot: [{ productoId: 'prod_internal_3', nombre: 'Antiparasitario', cantidad: 7 }],
    })

    const content = document.texts.join('\n')
    expect(content).toContain('SEÑOR:')
    expect(content).toContain('Cliente ocasional')
    expect(content).toContain('TRANSPORTISTA:')
    expect(content).toContain('Flete Ocasional SRL')
    expect(content).toContain('DIRECCIÓN / TRANSPORTE:')
    expect(content).toContain('Calle 9 456')
    expect(content).toContain('7')
    expect(content).toContain('Antiparasitario')
    expect(content).not.toContain('technical-only')
    expect(content).not.toContain('undefined')
    expect(content).not.toContain('null')
    expect(content).not.toContain('7 cajas')
  })

  it('stops the quantity-detail divider at the merchandise body before the footer', () => {
    const document = new RecordingDocument()

    renderRemitoPdf(document, {
      numero: 'R-20260805-LAYOUT',
      fecha: new Date('2026-08-05T12:00:00.000Z'),
      clienteSnapshot: { nombre: 'Cliente de prueba' },
      transporteSnapshot: { nombre: 'Transporte de prueba', direccion: 'Ruta 8 123' },
      transporteNombre: '',
      transporteDireccion: '',
      itemsSnapshot: [{ nombre: 'Producto de prueba', cantidad: 1 }],
    })

    const quantityDivider = document.lines.find((line) =>
      line.from.x === 152 && line.to.x === 152 && line.from.y === 284,
    )

    expect(quantityDivider).toBeDefined()
    expect(quantityDivider?.to.y).toBe(677.89)
  })
})
