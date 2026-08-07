import { describe, expect, it, vi } from 'vitest'
import { generarExcelVentas, miniSlugify } from '../ventas-excel'
import type { Cliente, ReporteVentas } from '../api'

// We will mock ExcelJS so it doesn't actually try to build a huge binary locally in tests,
// or we can just let it run if it's fast enough. Let's mock it for speed and verification.
const mockWriteBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8))
const mockAddWorksheet = vi.fn()

vi.mock('exceljs', () => {
  return {
    default: {
      Workbook: vi.fn(() => ({
        calcProperties: {},
        addWorksheet: (...args: any[]) => {
          mockAddWorksheet(...args)
          return {
            pageSetup: {},
            headerFooter: {},
            mergeCells: vi.fn(),
            getCell: vi.fn(() => ({})),
            getRow: vi.fn(() => ({
              getCell: vi.fn(() => ({})),
              eachCell: vi.fn()
            })),
            autoFilter: {},
            views: []
          }
        },
        xlsx: {
          writeBuffer: mockWriteBuffer
        }
      }))
    }
  }
})

describe('ventas-excel', () => {
  const cliente: Cliente = {
    id: 'c-1',
    nombre: 'DEMO Agropecuaria',
    cuit: '20-12345678-9',
  }

  const reporteMensual: ReporteVentas = {
    modo: 'mensual',
    clienteId: 'c-1',
    year: 2026,
    month: 8,
    pedidosDespachados: 1,
    productosDistintos: 1,
    unidadesTotales: 10,
    productos: [
      {
        productoId: 'p-1',
        nombre: 'Producto A',
        sku: 'SKU-A',
        unidadesPorCaja: 10,
        cajas: 1,
        sueltos: 0,
        unidades: 10,
      }
    ],
  }

  const reporteAnual: ReporteVentas = {
    modo: 'anual',
    clienteId: 'c-1',
    year: 2026,
    pedidosDespachados: 1,
    productosDistintos: 1,
    unidadesTotales: 10,
    productos: [
      {
        productoId: 'p-1',
        nombre: 'Producto A',
        sku: 'SKU-A',
        unidadesPorCaja: 10,
        cajas: 1,
        sueltos: 0,
        unidades: 10,
      }
    ],
    meses: [
      { month: 8, pedidosDespachados: 1, productosDistintos: 1, unidadesTotales: 10 }
    ],
  }

  it('miniSlugify works correctly', () => {
    expect(miniSlugify('Áéíóú Ññ')).toBe('aeiou-nn')
    expect(miniSlugify('Veterinaria "El Gato" S.A.')).toBe('veterinaria-el-gato-s-a')
  })

  it('generates mensual Excel with correct name and sheet', async () => {
    vi.clearAllMocks()
    
    // Stub URL.createObjectURL and document.createElement
    const mockCreateObjectURL = vi.fn(() => 'blob:mock')
    const mockRevokeObjectURL = vi.fn()
    const mockClick = vi.fn()
    
    vi.stubGlobal('URL', {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL
    })
    
    const origCreate = document.createElement.bind(document)
    const mockAnchor = { href: '', download: '', click: mockClick }
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as any
      return origCreate(tag)
    })

    await generarExcelVentas(cliente, reporteMensual)
    
    expect(mockAddWorksheet).toHaveBeenCalledWith('Ventas', expect.anything())
    expect(mockWriteBuffer).toHaveBeenCalled()
    expect(mockAnchor.download).toBe('ventas-demo-agropecuaria-2026-08.xlsx')
    expect(mockClick).toHaveBeenCalled()
    
    vi.restoreAllMocks()
  })

  it('generates anual Excel with multiple sheets', async () => {
    vi.clearAllMocks()
    
    const mockCreateObjectURL = vi.fn(() => 'blob:mock')
    const mockRevokeObjectURL = vi.fn()
    const mockClick = vi.fn()
    
    vi.stubGlobal('URL', {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL
    })
    
    const origCreate = document.createElement.bind(document)
    const mockAnchor = { href: '', download: '', click: mockClick }
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as any
      return origCreate(tag)
    })

    await generarExcelVentas(cliente, reporteAnual)
    
    expect(mockAddWorksheet).toHaveBeenCalledWith('Resumen anual', expect.anything())
    expect(mockAddWorksheet).toHaveBeenCalledWith('Productos')
    expect(mockWriteBuffer).toHaveBeenCalled()
    expect(mockAnchor.download).toBe('ventas-demo-agropecuaria-2026.xlsx')
    expect(mockClick).toHaveBeenCalled()
    
    vi.restoreAllMocks()
  })
})
