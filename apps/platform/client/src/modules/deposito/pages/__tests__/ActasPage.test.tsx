import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../lib/api'
import ActasPage, { buildActasCsv } from '../ActasPage'
import { createActaList, createActaListItem } from './fixtures/deposito-mock-factories'
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
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user: createMockUser(), token: 'token' })
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
    expect(screen.getByText('EC', { selector: 'span' })).toHaveAttribute('title', 'Ecuador')

    await user.selectOptions(screen.getByLabelText('País'), 'ecuador')
    expect(screen.getByText('ETIQUETA OLIFAMISOL 500 ML')).toBeInTheDocument()
    expect(screen.queryByText('AMINOÁCIDOS 20 ML')).not.toBeInTheDocument()
  })

  it('builds a CSV with the filtered quantity and packaging identifiers', () => {
    const csv = buildActasCsv([{
      id: 'pack-1', fecha: '2026-09-28T00:00:00.000Z', userName: 'Administrador',
      item: {
        id: 'item-1', lote: '3508', categoria: 'etiqueta', productoNombre: 'OLIFAMISOL 500 ML',
        cantidadIngresada: 300, cantidadDistribuida: 0, mercado: 'ecuador',
        temperaturaTransporte: null, condicionEmbalaje: null, observacionesCalidad: null, aprobadoCalidad: false,
      },
    }])

    expect(csv).toContain('"Tipo de insumo"')
    expect(csv).toContain('"ETIQUETA OLIFAMISOL 500 ML";"Etiqueta";"Ecuador";"3508";"300 uds"')
  })

  it('uses compact market badges and keeps Argentina, Colombia, and México in that filter order', async () => {
    vi.mocked(api.get).mockResolvedValue(['argentina', 'colombia', 'mexico'].map((mercado, index) => createActaListItem({
      id: `acta-${mercado}`,
      items: [{
        id: `item-${mercado}`, lote: `L-${index}`, categoria: 'etiqueta', productoNombre: `PRODUCTO ${mercado}`,
        cantidadIngresada: 10, cantidadDistribuida: 0, mercado,
        temperaturaTransporte: null, condicionEmbalaje: null, observacionesCalidad: null, aprobadoCalidad: false,
      }],
    })))
    render(<MemoryRouter><ActasPage /></MemoryRouter>)

    expect(await screen.findByText('AR', { selector: 'span' })).toHaveAttribute('title', 'Argentina')
    expect(screen.getByText('COL', { selector: 'span' })).toHaveAttribute('title', 'Colombia')
    expect(screen.getByText('MEX', { selector: 'span' })).toHaveAttribute('title', 'México')
    expect(Array.from(screen.getByLabelText('País').querySelectorAll('option')).map((option) => option.textContent)).toEqual([
      'Todos los países', 'Argentina', 'Colombia', 'México',
    ])
  })

  it('hides create button without ingresos.create permission', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: createMockUser({ apps: { deposito: { rol: 'observador', activo: true } } }),
      token: 'token'
    })
    render(<MemoryRouter><ActasPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.queryByText(/Cargando/i)).not.toBeInTheDocument()
    })
    expect(screen.queryByText(/\+ Nueva Acta/i)).not.toBeInTheDocument()
  })
})
