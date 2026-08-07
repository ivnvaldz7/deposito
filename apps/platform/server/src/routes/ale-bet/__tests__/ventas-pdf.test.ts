import { describe, expect, it } from 'vitest'
import { renderVentasPdf, type VentasPdfDocument, type VentasPdfInput, type VentasPdfTextOptions } from '../ventas-pdf'

/**
 * Records every text draw (value + x/y + options), every addPage, and the
 * current page index — the structural harness for the pure renderer.
 * Mirrors the remito-pdf RecordingDocument pattern.
 */
class RecordingDocument implements VentasPdfDocument {
  readonly texts: Array<{ value: string; x: number; y: number; options?: VentasPdfTextOptions }> = []
  readonly operations: string[] = []
  private pageCount = 1
  private currentPageIndex = 0

  fontSize(_size: number): this { return this }
  font(_name: string): this { return this }
  fillColor(_color: string): this { return this }
  lineWidth(_width: number): this { return this }
  text(value: string, x?: number, y?: number, options?: VentasPdfTextOptions): this {
    this.texts.push({ value, x: x ?? 0, y: y ?? 0, options })
    return this
  }
  rect(_x: number, _y: number, _width: number, _height: number): this { return this }
  fill(_color?: string): this { return this }
  moveTo(_x: number, _y: number): this { return this }
  lineTo(_x: number, _y: number): this { return this }
  stroke(): this { return this }
  addPage(): this { this.operations.push('addPage'); this.pageCount += 1; return this }
  bufferedPageRange(): { start: number; count: number } { return { start: 0, count: this.pageCount } }
  switchToPage(index: number): this { this.currentPageIndex = index; return this }

  content(): string { return this.texts.map((t) => t.value).join('\n') }
  pages(): number { return this.pageCount }
  currentPage(): number { return this.currentPageIndex }
}

const GENERADO = '07 de agosto de 2026'

function anualInput(overrides: Partial<VentasPdfInput> = {}): VentasPdfInput {
  return {
    modo: 'anual',
    year: 2026,
    month: null,
    clienteNombre: 'Veterinaria Oeste S.A.',
    cuit: '30-12345678-9',
    generado: GENERADO,
    resumen: { pedidosDespachados: 8, productosDistintos: 3, unidadesTotales: 440 },
    productos: [
      { nombre: 'Producto A', sku: 'SKU-A', unidadesPorCaja: 10, cajas: 2, sueltos: 5, unidades: 25 },
      { nombre: 'Producto B', sku: 'SKU-B', unidadesPorCaja: 6, cajas: 7, sueltos: 4, unidades: 144 },
      { nombre: 'Producto C', sku: 'SKU-C', unidadesPorCaja: 12, cajas: 100, sueltos: 57, unidades: 1257 },
    ],
    meses: [
      { month: 1, pedidosDespachados: 3, productosDistintos: 2, unidadesTotales: 120 },
      { month: 7, pedidosDespachados: 5, productosDistintos: 3, unidadesTotales: 320 },
    ],
    ...overrides,
  }
}

function mensualInput(overrides: Partial<VentasPdfInput> = {}): VentasPdfInput {
  return {
    modo: 'mensual',
    year: 2026,
    month: 8,
    clienteNombre: 'Veterinaria Ñandú S.A.',
    cuit: '30-71234567-9',
    generado: GENERADO,
    resumen: { pedidosDespachados: 8, productosDistintos: 3, unidadesTotales: 1426 },
    productos: [
      { nombre: 'Producto A', sku: 'SKU-A', unidadesPorCaja: 10, cajas: 2, sueltos: 5, unidades: 25 },
      { nombre: 'Producto B', sku: 'SKU-B', unidadesPorCaja: 6, cajas: 7, sueltos: 4, unidades: 144 },
      { nombre: 'Producto C', sku: 'SKU-C', unidadesPorCaja: 12, cajas: 100, sueltos: 57, unidades: 1257 },
    ],
    ...overrides,
  }
}

describe('renderVentasPdf — mensual (ALEBET-FACT-02 R2/R4/R5/R6)', () => {
  it('renders title, CLIENTE, RESUMEN "1.426" and verbatim cajas/sueltos/unidades', () => {
    const document = new RecordingDocument()
    renderVentasPdf(document, mensualInput())

    const content = document.content()
    expect(content).toContain('REPORTE DE VENTAS POR CLIENTE')
    expect(content).toContain('CLIENTE')
    expect(content).toContain('Veterinaria Ñandú S.A.')
    expect(content).toContain('CUIT 30-71234567-9')
    expect(content).toContain('PEDIDOS DESPACHADOS')
    expect(content).toContain('PRODUCTOS')
    expect(content).toContain('UNIDADES')
    expect(content).toContain('1.426')
    expect(content).toContain('8')
    expect(content).toContain('3')
    expect(content).toContain('DETALLE DE PRODUCTOS')
    // Verbatim contract values, right-aligned numeric cells.
    expect(content).toContain('Producto A')
    expect(content).toContain('SKU-A')
    expect(content).toContain('2')
    expect(content).toContain('5')
    expect(content).toContain('25')
    expect(content).toContain('Producto C')
    expect(content).toContain('100')
    expect(content).toContain('57')
    expect(content).toContain('1.257')
    // Metadata: GENERADO + PERÍODO.
    expect(content).toContain('GENERADO')
    expect(content).toContain(GENERADO)
    expect(content).toContain('PERÍODO')
    expect(content).toContain('AGOSTO 2026')
  })

  it('shows nombre only when CUIT is absent', () => {
    const document = new RecordingDocument()
    renderVentasPdf(document, mensualInput({ cuit: undefined }))

    const content = document.content()
    expect(content).toContain('Veterinaria Ñandú S.A.')
    expect(content).not.toContain('CUIT')
    expect(content).not.toContain('30-71234567-9')
  })

  it('formats numbers with Spanish thousands and no decimals (R5)', () => {
    const document = new RecordingDocument()
    renderVentasPdf(document, mensualInput())

    const content = document.content()
    expect(content).toContain('1.426')
    expect(content).toContain('1.257')
    expect(content).toContain('5')
    expect(content).not.toContain('5,00')
    expect(content).not.toContain('1.426,00')
    expect(content).not.toContain('1426')
  })

  it('never renders forbidden fiscal or technical content (R4)', () => {
    const document = new RecordingDocument()
    renderVentasPdf(document, mensualInput())

    const content = document.content()
    expect(content).not.toMatch(/\$/)
    expect(content).not.toMatch(/precio/i)
    expect(content).not.toMatch(/subtotal/i)
    expect(content).not.toMatch(/importe/i)
    expect(content).not.toMatch(/moneda/i)
    expect(content).not.toMatch(/iva/i)
    expect(content).not.toMatch(/bultos/i)
    expect(content).not.toMatch(/peso/i)
    expect(content).not.toMatch(/d[ií]as de venta/i)
    expect(content).not.toMatch(/ranking/i)
    expect(content).not.toMatch(/proyeccion/i)
    expect(content).not.toMatch(/porcentaje/i)
    expect(content).not.toContain('productoId')
    expect(content).not.toContain('clienteId')
    expect(content).not.toContain('localhost')
    expect(content).not.toContain('/api/')
  })

  it('renders a single page for few products (R6)', () => {
    const document = new RecordingDocument()
    renderVentasPdf(document, mensualInput())

    expect(document.pages()).toBe(1)
    expect(document.operations).not.toContain('addPage')
    // Footer pass ran: brand + "Página 1 de 1".
    const content = document.content()
    expect(content).toContain('Ale-Bet · Logística')
    expect(content).toContain('Página 1 de 1')
    expect(content).toContain('LOGÍSTICA')
  })

  it('keeps every text draw inside the page margins (R6)', () => {
    const document = new RecordingDocument()
    renderVentasPdf(document, mensualInput())

    for (const entry of document.texts) {
      expect(entry.x).toBeGreaterThanOrEqual(50)
      expect(entry.x).toBeLessThanOrEqual(595.28 - 50)
    }
  })
})

describe('renderVentasPdf — anual (ALEBET-FACT-02 R3/R4)', () => {
  it('renders PERÍODO "AÑO 2026", EVOLUCIÓN rows ascending and TOTAL ANUAL table', () => {
    const document = new RecordingDocument()
    renderVentasPdf(document, anualInput())

    const content = document.content()
    expect(content).toContain('AÑO 2026')
    expect(content).toContain('EVOLUCIÓN MENSUAL')
    expect(content).toContain('MES')
    expect(content).toContain('PEDIDOS')
    expect(content).toContain('PRODUCTOS')
    expect(content).toContain('UNIDADES')
    expect(content).toContain('ENERO')
    expect(content).toContain('JULIO')
    // Server order (ascending): Ene before Jul.
    expect(content.indexOf('ENERO')).toBeLessThan(content.indexOf('JULIO'))
    // Per-month values verbatim.
    expect(content).toContain('120')
    expect(content).toContain('320')
    expect(content).toContain('TOTAL ANUAL POR PRODUCTO')
    // Annual totals table uses the same 6 columns as mensual.
    expect(content).toContain('U/CAJA')
    expect(content).toContain('CAJAS')
    expect(content).toContain('SUELTOS')
    expect(content).toContain('SKU-A')
  })

  it('omits the EVOLUCIÓN MENSUAL section when meses is empty', () => {
    const document = new RecordingDocument()
    renderVentasPdf(document, anualInput({ meses: [] }))

    const content = document.content()
    expect(content).not.toContain('EVOLUCIÓN MENSUAL')
    expect(content).not.toContain('ENERO')
    expect(content).toContain('TOTAL ANUAL POR PRODUCTO')
  })

  it('never renders forbidden fiscal or technical content in anual mode (R4)', () => {
    const document = new RecordingDocument()
    renderVentasPdf(document, anualInput())

    const content = document.content()
    expect(content).not.toMatch(/\$/)
    expect(content).not.toMatch(/precio/i)
    expect(content).not.toMatch(/subtotal/i)
    expect(content).not.toMatch(/importe/i)
    expect(content).not.toMatch(/moneda/i)
    expect(content).not.toMatch(/iva/i)
    expect(content).not.toMatch(/bultos/i)
    expect(content).not.toMatch(/peso/i)
    expect(content).not.toMatch(/d[ií]as de venta/i)
    expect(content).not.toMatch(/ranking/i)
    expect(content).not.toMatch(/proyeccion/i)
    expect(content).not.toMatch(/porcentaje/i)
    expect(content).not.toContain('productoId')
    expect(content).not.toContain('clienteId')
    expect(content).not.toContain('localhost')
    expect(content).not.toContain('/api/')
  })
})

describe('renderVentasPdf — pagination (ALEBET-FACT-02 R6)', () => {
  function manyProducts(count: number): VentasPdfInput['productos'] {
    return Array.from({ length: count }, (_, i) => ({
      nombre: `Producto de prueba número ${i + 1} con un nombre bastante largo para verificar el truncado`,
      sku: `SKU-${String(i + 1).padStart(3, '0')}`,
      unidadesPorCaja: 10,
      cajas: i + 1,
      sueltos: i % 10,
      unidades: (i + 1) * 10 + (i % 10),
    }))
  }

  it('breaks pages, repeats chrome/table header and draws the footer on every page for 50+ products', () => {
    const document = new RecordingDocument()
    renderVentasPdf(document, mensualInput({ productos: manyProducts(60) }))

    const pageCount = document.pages()
    expect(pageCount).toBeGreaterThan(1)
    expect(document.operations.filter((op) => op === 'addPage').length).toBe(pageCount - 1)

    // Table header repeated on every page (exact label, not RESUMEN's PRODUCTOS).
    const headerCount = document.texts.filter((t) => t.value === 'PRODUCTO').length
    expect(headerCount).toBe(pageCount)
    // Section title repeated on every page.
    const sectionCount = document.texts.filter((t) => t.value === 'DETALLE DE PRODUCTOS').length
    expect(sectionCount).toBe(pageCount)

    // Footer on every page: brand left, "Página X de Y" right.
    const footerTexts = document.texts.filter((t) => t.value.startsWith('Página '))
    expect(footerTexts).toHaveLength(pageCount)
    for (let i = 0; i < pageCount; i++) {
      expect(footerTexts.some((t) => t.value === `Página ${i + 1} de ${pageCount}`)).toBe(true)
    }
    const brandFooter = document.texts.filter((t) => t.value === 'Ale-Bet · Logística')
    expect(brandFooter).toHaveLength(pageCount)

    // Every draw stays inside the margins.
    for (const entry of document.texts) {
      expect(entry.x).toBeGreaterThanOrEqual(50)
      expect(entry.x).toBeLessThanOrEqual(595.28 - 50)
    }
  })

  it('switches pages during the anual EVOLUCIÓN table too', () => {
    const document = new RecordingDocument()
    const muchosMeses = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      pedidosDespachados: i + 1,
      productosDistintos: 2,
      unidadesTotales: (i + 1) * 40,
    }))
    renderVentasPdf(document, anualInput({ meses: muchosMeses, productos: manyProducts(60) }))

    const pageCount = document.pages()
    expect(pageCount).toBeGreaterThan(1)
    // Footer still complete on every page.
    const footerTexts = document.texts.filter((t) => t.value.startsWith('Página '))
    expect(footerTexts).toHaveLength(pageCount)
    for (let i = 0; i < pageCount; i++) {
      expect(footerTexts.some((t) => t.value === `Página ${i + 1} de ${pageCount}`)).toBe(true)
    }
  })
})
