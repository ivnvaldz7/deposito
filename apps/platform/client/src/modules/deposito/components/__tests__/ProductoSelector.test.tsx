import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { ProductoSelector } from '../ProductoSelector'

const scrollIntoView = vi.fn()
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue([
      {
        id: '550e8400-e29b-41d4-a716-446655440010',
        nombreBase: 'OLIVITASAN',
        nombreCompleto: 'OLIVITASAN 25 ML',
        volumen: null,
        unidad: null,
        variante: null,
        codigo: 'IGET034',
        categoria: 'etiqueta',
        presentacion: 25,
        activo: true,
        estado: 'ACTIVO',
        mercadosHabilitados: ['argentina'],
        stockActual: 740,
        stockPorMercado: { argentina: 740 },
      },
    ]),
  },
}))

describe('ProductoSelector', () => {
  it('shows the actual stock instead of the catalog presentation', async () => {
    render(
      <ProductoSelector
        categoria="etiqueta"
        expandirMercados={false}
        displayValue=""
        onChange={() => undefined}
      />,
    )

    const input = screen.getByPlaceholderText('Buscá una etiqueta del catálogo...')
    await waitFor(() => {
      expect(api.get).toHaveBeenCalled()
    })
    await waitFor(() => {
      fireEvent.focus(input)
      expect(screen.getByText('OLIVITASAN 25 ML')).toBeInTheDocument()
    })

    expect(screen.getByText('Stock total: 740', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('IGET034', { exact: false })).toBeInTheDocument()
  })

  it('keeps the keyboard selection visible while moving through results', async () => {
    scrollIntoView.mockClear()
    render(
      <ProductoSelector
        categoria="etiqueta"
        expandirMercados={false}
        displayValue=""
        onChange={() => undefined}
      />,
    )

    const input = screen.getByPlaceholderText('Buscá una etiqueta del catálogo...')
    await waitFor(() => {
      expect(api.get).toHaveBeenCalled()
    })
    await waitFor(() => {
      fireEvent.focus(input)
      expect(screen.getByRole('option')).toBeInTheDocument()
    })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    await waitFor(() => {
      expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true')
      expect(input).toHaveAttribute('aria-activedescendant')
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    })
  })
})
