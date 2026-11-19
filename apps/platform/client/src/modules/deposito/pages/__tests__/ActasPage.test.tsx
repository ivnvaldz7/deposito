import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../lib/api'
import ActasPage, { buildActasCsv, buildActasPrintHtml, openActasPrintWindow } from '../ActasPage'
import { createActa, createActaList, createActaListItem } from './fixtures/deposito-mock-factories'
import { createMockUser } from '@/test-utils'
import { useAuthStore } from '@/stores/auth-store'

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); this.name = 'ApiError' }
  },
}))

vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }))

describe('ActasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(createMockUser())
  })

  it('renders loading state', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><ActasPage /></MemoryRouter>)
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Error'))
    render(<MemoryRouter><ActasPage /></MemoryRouter>)
    await waitFor(() => expect(screen.queryByText(/no se pudieron cargar/i)).toBeInTheDocument())
  })

  it('renders empty state', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    render(<MemoryRouter><ActasPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('No hay actas registradas todavía.')).toBeInTheDocument())
  })

  it('renders table with items', async () => {
    vi.mocked(api.get).mockImplementation(async url => {
      if (url.startsWith('/actas')) return createActaList()
      throw new Error(`Endpoint inesperado en test: ${url}`)
    })
    render(<MemoryRouter><ActasPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.queryByText(/Cargando/i)).not.toBeInTheDocument()
    })
    expect(screen.getByText('Actas', { selector: 'h1' })).toBeInTheDocument()
  })

  it('opens the action panel from a row and generates quarantine labels for that item', async () => {
    const user = userEvent.setup()
    const listItem = createActaListItem({
      id: 'acta-1',
      items: [{
        id: 'item-1', lote: 'L2401', categoria: 'droga', productoNombre: 'Vitamina B12',
        cantidadIngresada: 100, cantidadDistribuida: 50, mercado: null,
        temperaturaTransporte: '2-8°C', condicionEmbalaje: 'bueno', observacionesCalidad: 'Sin observaciones', aprobadoCalidad: true,
      }],
    })
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/actas') return [listItem] as never
      if (url === '/actas/acta-1') return { ...createActa(), notas: 'Remito de prueba' } as never
      throw new Error(`Endpoint inesperado en test: ${url}`)
    })
    vi.mocked(api.post).mockResolvedValue({ message: 'Etiquetas enviadas a impresión.' } as never)
    render(<MemoryRouter><ActasPage /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: 'Ver acciones de Vitamina B12' }))
    const actionPanel = await screen.findByRole('dialog', { name: 'Panel de acciones del ingreso' })
    expect(actionPanel).toBeInTheDocument()
    expect(actionPanel).toHaveClass('max-h-[calc(100vh-1.5rem)]', 'flex', 'flex-col', 'overflow-hidden')
    expect(actionPanel.parentElement).toHaveClass('bg-surface/30')
    expect(actionPanel.parentElement).toHaveClass('items-start', 'justify-center', 'overflow-hidden')
    expect(actionPanel.parentElement).not.toHaveClass('bg-black/60')
    expect(await screen.findByText('31/12/2026')).toBeInTheDocument()
    expect(screen.getByText('Remito de prueba')).toBeInTheDocument()
    expect(screen.queryByText('Control de calidad')).not.toBeInTheDocument()

    const copies = screen.getByRole('spinbutton', { name: 'Copias de etiquetas de cuarentena' })
    await user.clear(copies)
    await user.type(copies, '2')
    await user.click(screen.getByRole('button', { name: 'Generar etiquetas' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/labels/cuarentena', { itemId: 'item-1', copias: 2 }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Panel de acciones del ingreso' })).not.toBeInTheDocument())
  })

  it('identifies packaging by type and market, then filters it by country', async () => {
    const user = userEvent.setup()
    vi.mocked(api.get).mockResolvedValue([
      createActaListItem({
        items: [{
          id: 'pack-1', lote: '3508', categoria: 'etiqueta', productoNombre: 'OLIFAMISOL 500 ML',
          cantidadIngresada: 300, cantidadDistribuida: 0, mercado: 'ecuador',
          temperaturaTransporte: null, condicionEmbalaje: null, observacionesCalidad: null, aprobadoCalidad: false,
        }],
      }),
      createActaListItem({
        id: 'acta-druga',
        items: [{
          id: 'drug-1', lote: '3509', categoria: 'droga', productoNombre: 'AMINOÁCIDOS 20 ML',
          cantidadIngresada: 1900, cantidadDistribuida: 0, mercado: null,
          temperaturaTransporte: null, condicionEmbalaje: null, observacionesCalidad: null, aprobadoCalidad: false,
        }],
      }),
    ])
    render(<MemoryRouter><ActasPage /></MemoryRouter>)

    expect(await screen.findByText('ETIQUETA OLIFAMISOL 500 ML')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Bandera de Ecuador' })).toHaveAttribute('title', 'Ecuador')

    await user.selectOptions(screen.getByLabelText('País'), 'ecuador')
    expect(screen.getByText('ETIQUETA OLIFAMISOL 500 ML')).toBeInTheDocument()
    expect(screen.queryByText('AMINOÁCIDOS 20 ML')).not.toBeInTheDocument()
  })

  it('builds a CSV with the filtered quantity and packaging identifiers', () => {
    const csv = buildActasCsv([{
      id: 'pack-1', actaId: 'acta-1', fecha: '2026-09-28T00:00:00.000Z', userName: 'Administrador',
      item: {
        id: 'item-1', lote: '3508', categoria: 'etiqueta', productoNombre: 'OLIFAMISOL 500 ML',
        cantidadIngresada: 300, cantidadDistribuida: 0, mercado: 'ecuador',
        temperaturaTransporte: null, condicionEmbalaje: null, observacionesCalidad: null, aprobadoCalidad: false,
      },
    }])

    expect(csv).toContain('"Tipo de insumo"')
    expect(csv).toContain('"ETIQUETA OLIFAMISOL 500 ML";"Etiqueta";"Ecuador";"3508";"300 uds"')
  })

  it('builds the operational print document with all export columns and print sheets', () => {
    const row = {
      id: 'pack-1', actaId: 'acta-1', fecha: '2026-09-28T00:00:00.000Z', userName: 'Administrador',
      item: {
        id: 'item-1', lote: '3508', categoria: 'etiqueta' as const, productoNombre: 'OLIFAMISOL 500 ML',
        cantidadIngresada: 300, cantidadDistribuida: 0, mercado: 'ecuador' as const,
        temperaturaTransporte: null, condicionEmbalaje: null, observacionesCalidad: null, aprobadoCalidad: false,
      },
    }
    const html = buildActasPrintHtml([row], 'Documento completo')

    expect(html).toContain('ACTAS DE INGRESO')
    expect(html).toContain('Tipo de insumo')
    expect(html).toContain('Documento completo')
    expect(html).toContain('ETIQUETA OLIFAMISOL 500 ML')
    expect(html).toContain('Hoja 1 de 1')
  })

  it('opens the native print dialog even when the popup does not emit onload', () => {
    vi.useFakeTimers()
    const printWindow = { closed: false, document: { open: vi.fn(), write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn(), onload: null }
    vi.spyOn(window, 'open').mockReturnValue(printWindow as Window)
    const row = {
      id: 'pack-1', actaId: 'acta-1', fecha: '2026-09-28T00:00:00.000Z', userName: 'Administrador',
      item: { id: 'item-1', lote: '3508', categoria: 'etiqueta' as const, productoNombre: 'OLIFAMISOL 500 ML', cantidadIngresada: 300, cantidadDistribuida: 0, mercado: 'ecuador' as const, temperaturaTransporte: null, condicionEmbalaje: null, observacionesCalidad: null, aprobadoCalidad: false },
    }

    expect(openActasPrintWindow([row], 'Documento completo')).toBe(true)
    vi.advanceTimersByTime(250)
    expect(printWindow.print).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('shows auxiliary materials by their product name without a category prefix', async () => {
    vi.mocked(api.get).mockResolvedValue([
      createActaListItem({
        items: [{
          id: 'aux-1', lote: '3515', categoria: 'material_empaque', productoNombre: 'TAPA VERDE',
          cantidadIngresada: 30000, cantidadDistribuida: 0, mercado: null,
          temperaturaTransporte: null, condicionEmbalaje: null, observacionesCalidad: null, aprobadoCalidad: false,
        }],
      }),
    ])
    render(<MemoryRouter><ActasPage /></MemoryRouter>)

    expect(await screen.findByText('TAPA VERDE')).toBeInTheDocument()
    expect(screen.queryByText('MATERIAL AUXILIAR TAPA VERDE')).not.toBeInTheDocument()

    expect(buildActasCsv([{
      id: 'aux-1', actaId: 'acta-1', fecha: '2026-10-13T00:00:00.000Z', userName: 'Administrador',
      item: {
        id: 'aux-1', lote: '3515', categoria: 'material_empaque', productoNombre: 'TAPA VERDE',
        cantidadIngresada: 30000, cantidadDistribuida: 0, mercado: null,
        temperaturaTransporte: null, condicionEmbalaje: null, observacionesCalidad: null, aprobadoCalidad: false,
      },
    }])).toContain('"TAPA VERDE";"Material auxiliar";"";"3515";"30000 uds"')
  })

  it('uses flag-only market indicators and keeps Argentina, Colombia, and México in that filter order', async () => {
    vi.mocked(api.get).mockResolvedValue(['argentina', 'colombia', 'mexico'].map((mercado, index) => createActaListItem({
      id: `acta-${mercado}`,
      items: [{
        id: `item-${mercado}`, lote: `L-${index}`, categoria: 'etiqueta', productoNombre: `PRODUCTO ${mercado}`,
        cantidadIngresada: 10, cantidadDistribuida: 0, mercado,
        temperaturaTransporte: null, condicionEmbalaje: null, observacionesCalidad: null, aprobadoCalidad: false,
      }],
    })))
    render(<MemoryRouter><ActasPage /></MemoryRouter>)

    expect(await screen.findByRole('img', { name: 'Bandera de Argentina' })).toHaveAttribute('title', 'Argentina')
    expect(screen.getByRole('img', { name: 'Bandera de Colombia' })).toHaveAttribute('title', 'Colombia')
    expect(screen.getByRole('img', { name: 'Bandera de México' })).toHaveAttribute('title', 'México')
    expect(Array.from(screen.getByLabelText('País').querySelectorAll('option')).map((option) => option.textContent)).toEqual([
      'Todos los países', 'Argentina', 'Colombia', 'México',
    ])
  })

  it('hides create button without ingresos.create permission', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(createMockUser({ apps: { deposito: { rol: 'observador', activo: true } } }))
    render(<MemoryRouter><ActasPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.queryByText(/Cargando/i)).not.toBeInTheDocument()
    })
    expect(screen.queryByText(/\+ Nueva Acta/i)).not.toBeInTheDocument()
  })

  it('lets the operator select the complete document, a month, or a print sheet', async () => {
    const user = userEvent.setup()
    vi.mocked(api.get).mockResolvedValue(createActaList())
    render(<MemoryRouter><ActasPage /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: 'Imprimir' }))
    expect(screen.getByRole('dialog', { name: 'Imprimir actas' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Documento completo/ })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Por mes' }))
    expect(screen.getByLabelText('Mes')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Por hoja' }))
    expect(screen.getByLabelText('Hoja')).toBeInTheDocument()
  })
})
