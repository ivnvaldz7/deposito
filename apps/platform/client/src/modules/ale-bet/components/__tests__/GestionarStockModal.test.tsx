import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GestionarStockModal } from '../GestionarStockModal'
import { aleBetApi } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  aleBetApi: {
    stock: {
      transferir: vi.fn(),
    },
    productos: {
      stock: {
        get: vi.fn(),
        lotes: {
          create: vi.fn(),
          ajuste: vi.fn(),
        }
      }
    }
  }
}))

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <GestionarStockModal
        producto={{ id: 'p1', nombre: 'Test Prod', sku: 'SKU1', stockMinimo: 0, activo: true, unidadesPorCaja: 1 }}
        onClose={vi.fn()}
      />
    </QueryClientProvider>
  )
}

describe('GestionarStockModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(aleBetApi.productos.stock.get).mockResolvedValue({
      lotes: [
        { id: 'l1', numero: 'L01', fechaProduccion: null, fechaVencimiento: null, activo: true, stockTotal: 100, stockDeposito: 80, stockAcondicionado: 20 }
      ],
      ubicaciones: [
        { id: 'u1', codigo: 'DEPOSITO' },
        { id: 'u2', codigo: 'ACONDICIONADO' }
      ]
    })
  })

  it('flujo de creacion de lote: usa MM/AAAA y autocalcula vencimiento +24 meses', async () => {
    renderComponent()
    await waitFor(() => expect(screen.getAllByText(/L01/)[0]).toBeInTheDocument())
    
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo lote' }))
    expect(screen.getByText('Nuevo lote')).toBeInTheDocument()

    const prodInput = screen.getByLabelText('Fecha de producción (MM/AAAA)')
    const expInput = screen.getByLabelText('Fecha de vencimiento (+24 meses)')
    
    expect(expInput).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Número de lote'), { target: { value: 'L02' } })
    fireEvent.change(prodInput, { target: { value: '2026-08' } })
    
    expect(expInput).toHaveValue('08/2028')

    vi.mocked(aleBetApi.productos.stock.lotes.create).mockResolvedValue({ id: 'new-id' } as any)
    fireEvent.click(screen.getByRole('button', { name: 'Crear lote' }))

    await waitFor(() => {
      expect(aleBetApi.productos.stock.lotes.create).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          numero: 'L02',
          fechaProduccion: '2026-08-01T00:00:00.000Z',
          fechaVencimiento: '2028-08-31T23:59:59.000Z'
        })
      )
    })
  })

  it('flujo de ajuste: no usa window.confirm y muestra Confirmar ajuste in-app', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    renderComponent()
    await waitFor(() => expect(screen.getAllByText(/L01/)[0]).toBeInTheDocument())
    
    const ajustarBtns = screen.getAllByRole('button', { name: 'Ajustar' })
    fireEvent.click(ajustarBtns[0]) // Ajustar deposito

    fireEvent.change(screen.getByLabelText('Cantidad final'), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar ajuste' }))

    expect(screen.getByText('Cantidad nueva:')).toBeInTheDocument()
    expect(screen.getByText('150')).toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled()

    vi.mocked(aleBetApi.productos.stock.lotes.ajuste).mockResolvedValue({} as any)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar ajuste' })) // the second one inside the confirm state

    await waitFor(() => {
      expect(aleBetApi.productos.stock.lotes.ajuste).toHaveBeenCalledWith(
        'p1',
        'l1',
        expect.objectContaining({ cantidadFinal: 150 }),
        expect.anything()
      )
    })
  })

  it('flujo de transferencia: ACONDICIONADO -> DEPOSITO', async () => {
    renderComponent()
    await waitFor(() => expect(screen.getAllByText(/L01/)[0]).toBeInTheDocument())
    
    // The second Transferir button is for Acondicionado
    const transferirBtns = screen.getAllByRole('button', { name: 'Transferir' })
    fireEvent.click(transferirBtns[1])

    expect(screen.getByText('Origen:')).toBeInTheDocument()
    expect(screen.getByText('ACONDICIONADO')).toBeInTheDocument()
    
    fireEvent.change(screen.getByLabelText('Cantidad a transferir'), { target: { value: '10' } })
    
    vi.mocked(aleBetApi.stock.transferir).mockResolvedValue({ movimientoId: 'm1' })
    const submitBtns = screen.getAllByRole('button', { name: 'Transferir' })
    fireEvent.click(submitBtns[submitBtns.length - 1])

    await waitFor(() => {
      expect(aleBetApi.stock.transferir).toHaveBeenCalledWith(
        expect.objectContaining({
          origen: 'ACONDICIONADO',
          destino: 'DEPOSITO',
          cantidad: 10
        }),
        expect.anything()
      )
    })
  })
})
