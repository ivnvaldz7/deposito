import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CommandPalette } from '../CommandPalette'

class ResizeObserverMock { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverMock)
Element.prototype.scrollIntoView = vi.fn()

vi.mock('@/stores/auth-store', () => ({ useAuthStore: (selector: (s: object) => unknown) => selector({ user: {}, token: 'token' }) }))
vi.mock('../../../stores/command-palette-store', () => ({ useCommandPaletteStore: () => ({ isOpen: true, closePalette: vi.fn() }) }))
vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn((path: string) => Promise.resolve(
      path.includes('categoria=droga')
        ? [{ id: 'p1', nombreCompleto: 'Aspirina', categoria: 'droga' }]
        : path.includes('categoria=estuche')
          ? [{ id: 'p2', nombreCompleto: 'AMANTINA PREMIUM 100 ML', categoria: 'estuche', mercadosHabilitados: ['argentina', 'VENEZUELA'] }]
          : path.includes('categoria=etiqueta')
            ? [{ id: 'p3', nombreCompleto: 'AMANTINA 250 ML', categoria: 'etiqueta', mercadosHabilitados: ['argentina'] }]
            : [],
    )),
  },
}))

function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output> }

describe('CommandPalette', () => {
  it('navigates product results inside Depósito with stable focus parameters', async () => {
    render(<MemoryRouter initialEntries={['/deposito/dashboard']}><CommandPalette /><Location /></MemoryRouter>)
    fireEvent.change(screen.getByPlaceholderText(/Buscá productos/), { target: { value: 'Aspirina' } })
    await screen.findByText('Aspirina')
    fireEvent.click(screen.getByRole('option', { name: /Aspirina/ }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/deposito/drogas?productoId=p1'))
    expect(screen.getByTestId('location')).toHaveTextContent('focus=')
  })

  it('hides unrelated navigation actions and exposes the empty state for nonsense queries', async () => {
    render(<MemoryRouter><CommandPalette /></MemoryRouter>)
    fireEvent.change(screen.getByPlaceholderText(/Buscá productos/), { target: { value: 'zzzz-no-result' } })
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    expect(await screen.findByText(/Sin resultados para/)).toBeInTheDocument()
  })

  it('requires every typed term and identifies the product category and markets', async () => {
    render(<MemoryRouter><CommandPalette /></MemoryRouter>)
    fireEvent.change(screen.getByPlaceholderText(/Buscá productos/), { target: { value: 'amantina premium' } })

    expect(await screen.findByText('AMANTINA PREMIUM 100 ML')).toBeInTheDocument()
    expect(screen.queryByText('AMANTINA 250 ML')).not.toBeInTheDocument()
    expect(screen.getByText('Estuche')).toBeInTheDocument()
    expect(screen.getByLabelText('Argentina')).toBeInTheDocument()
    expect(screen.getByLabelText('Venezuela')).toBeInTheDocument()
    expect(screen.getByLabelText('Atajos del buscador')).toHaveTextContent('Enter')
  })
})
