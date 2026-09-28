import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GestionarStockModal } from '../GestionarStockModal'
import { aleBetApi } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  aleBetApi: {
    stock: {
      transferir: vi.fn(),
      transferRules: vi.fn(),
    },
    productos: {
      stock: {
        get: vi.fn(),
        lotes: {
          create: vi.fn(),
          ajuste: vi.fn(),
          ingreso: vi.fn(),
        }
      }
    }
  }
}))

function renderComponent(onClose = vi.fn(), productoNombre = 'Test Prod') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <GestionarStockModal
        producto={{ id: 'p1', nombre: productoNombre, sku: 'SKU1', stockMinimo: 0, activo: true, unidadesPorCaja: 1 } as any}
        onClose={onClose}
      />
    </QueryClientProvider>
  )
  return onClose
}

describe('GestionarStockModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(aleBetApi.stock.transferRules).mockResolvedValue({ rules: [] })
    vi.mocked(aleBetApi.productos.stock.get).mockResolvedValue({
      lotes: [
        { id: 'l1', numero: 'L01', fechaProduccion: null, fechaVencimiento: null, activo: true, stockTotal: 100, stockDeposito: 80, stockAcondicionado: 20 }
      ],
      ubicaciones: [
        { id: 'u1', codigo: 'DEPOSITO', nombre: 'Depósito' },
        { id: 'u2', codigo: 'ACONDICIONADO', nombre: 'Acondicionado' }
      ] as any[]
    } as any)
  })

  it('hides a zero-stock lot from the operational modal', async () => {
    vi.mocked(aleBetApi.productos.stock.get).mockResolvedValue({
      lotes: [
        { id: 'l1', numero: 'EN0124', fechaProduccion: null, fechaVencimiento: null, activo: true, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0 }
      ],
      ubicaciones: [
        { id: 'u1', codigo: 'DEPOSITO', nombre: 'Depósito' },
        { id: 'u2', codigo: 'ACONDICIONADO', nombre: 'Acondicionado' }
      ]
    } as any)
    vi.mocked(aleBetApi.stock.transferRules).mockResolvedValue({ rules: [] })

    renderComponent()
    await waitFor(() => expect(screen.getByText('Sin lotes registrados')).toBeInTheDocument())
    expect(screen.queryByText(/EN0124/)).not.toBeInTheDocument()
  })

  it('hides an inactive zero-stock lot from the operational modal', async () => {
    vi.mocked(aleBetApi.productos.stock.get).mockResolvedValue({
      lotes: [
        { id: 'l1', numero: 'L-INACTIVE', fechaProduccion: null, fechaVencimiento: null, activo: false, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0 }
      ],
      ubicaciones: [
        { id: 'u1', codigo: 'DEPOSITO', nombre: 'Depósito' },
        { id: 'u2', codigo: 'ACONDICIONADO', nombre: 'Acondicionado' }
      ]
    } as any)

    renderComponent()
    await waitFor(() => expect(screen.getByText('Sin lotes registrados')).toBeInTheDocument())
    expect(screen.queryByText(/L-INACTIVE/)).not.toBeInTheDocument()
  })

  it('ingreso flow: adds delta to existing stock atomically', async () => {
    vi.mocked(aleBetApi.productos.stock.get).mockResolvedValue({
      lotes: [
        { id: 'l1', numero: 'L01', fechaProduccion: null, fechaVencimiento: null, activo: true, stockTotal: 100, stockDeposito: 80, stockAcondicionado: 20 }
      ],
      ubicaciones: [
        { id: 'u1', codigo: 'DEPOSITO', nombre: 'Depósito' },
        { id: 'u2', codigo: 'ACONDICIONADO', nombre: 'Acondicionado' }
      ]
    } as any)

    const onClose = renderComponent()
    await waitFor(() => expect(screen.getAllByText(/L01/)[0]).toBeInTheDocument())
    
    const ingresarBtns = screen.getAllByRole('button', { name: 'Ingresar' })
    fireEvent.click(ingresarBtns[0]) // Ingresar to Acondicionado

    fireEvent.change(screen.getByLabelText('Cantidad a ingresar'), { target: { value: '600' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar ingreso' }))

    // Should show confirmation dialog with delta semantics
    expect(screen.getByText('A ingresar:')).toBeInTheDocument()
    expect(screen.getByText('+600')).toBeInTheDocument()
    expect(screen.getByText('620')).toBeInTheDocument() // 20 (acondicionado) + 600

    vi.mocked(aleBetApi.productos.stock.lotes.ingreso).mockResolvedValue({} as any)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar ingreso' }))

    await waitFor(() => {
      expect(aleBetApi.productos.stock.lotes.ingreso).toHaveBeenCalledWith(
        'p1',
        'l1',
        expect.objectContaining({ cantidad: 600 }),
        expect.anything()
      )
    })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('crea el lote con cantidad inicial absoluta y refleja ACONDICIONADO sin recarga manual', async () => {
    vi.mocked(aleBetApi.productos.stock.get)
      .mockResolvedValueOnce({
        producto: { id: 'p1', nombre: 'Test Prod' },
        lotes: [
          { id: 'l1', numero: 'L01', fechaProduccion: null, fechaVencimiento: null, activo: true, stockTotal: 100, stockDeposito: 80, stockAcondicionado: 20 }
        ],
        ubicaciones: [
          { id: 'u1', codigo: 'DEPOSITO', nombre: 'Depósito' },
          { id: 'u2', codigo: 'ACONDICIONADO', nombre: 'Acondicionado' }
        ]
      })
      .mockResolvedValueOnce({
        producto: { id: 'p1', nombre: 'Test Prod' },
        lotes: [
          { id: 'l1', numero: 'L01', fechaProduccion: null, fechaVencimiento: null, activo: true, stockTotal: 100, stockDeposito: 80, stockAcondicionado: 20 },
          { id: 'new-id', numero: 'L02', fechaProduccion: '2026-08-01T00:00:00.000Z', fechaVencimiento: '2028-08-31T23:59:59.000Z', activo: true, stockTotal: 600, stockDeposito: 0, stockAcondicionado: 600 }
        ],
        ubicaciones: [
          { id: 'u1', codigo: 'DEPOSITO', nombre: 'Depósito' },
          { id: 'u2', codigo: 'ACONDICIONADO', nombre: 'Acondicionado' }
        ]
      })

    renderComponent()
    await waitFor(() => expect(screen.getAllByText(/L01/)[0]).toBeInTheDocument())
    
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo lote' }))
    expect(screen.getByText('Nuevo lote')).toBeInTheDocument()

    const prodInput = screen.getByLabelText('Fecha de producción (MM/AAAA)')
    const expInput = screen.getByLabelText('Fecha de vencimiento (+24 meses)')
    
    expect(expInput).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Número de lote'), { target: { value: 'L02' } })
    fireEvent.change(prodInput, { target: { value: '2026-08' } })
    fireEvent.change(screen.getByLabelText('Cantidad inicial'), { target: { value: '600' } })
    
    expect(expInput).toHaveValue('08/2028')

    vi.mocked(aleBetApi.productos.stock.lotes.create).mockResolvedValue({
      id: 'new-id',
      numero: 'L02',
      fechaProduccion: '2026-08-01T00:00:00.000Z',
      fechaVencimiento: '2028-08-31T23:59:59.000Z',
      activo: true,
      stockTotal: 600,
      stockDeposito: 0,
      stockAcondicionado: 600,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear lote' }))

    await waitFor(() => {
      expect(aleBetApi.productos.stock.lotes.create).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          numero: 'L02',
          cantidadInicial: 600,
          fechaProduccion: '2026-08-01T00:00:00.000Z',
          fechaVencimiento: '2028-08-31T23:59:59.000Z'
        }),
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      )
    })

    await waitFor(() => {
      expect(screen.getByText('LOTE L02')).toBeInTheDocument()
      expect(screen.getAllByText('600').length).toBeGreaterThanOrEqual(2)
      expect(screen.getByText('700')).toBeInTheDocument()
    })
  })

  it('flujo de ajuste: no usa window.confirm y muestra Confirmar ajuste in-app', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const onClose = renderComponent()
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
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('flujo de transferencia: ACONDICIONADO -> DEPOSITO', async () => {
    const onClose = renderComponent()
    await waitFor(() => expect(screen.getAllByText(/L01/)[0]).toBeInTheDocument())
    
    // The second Transferir button is for Acondicionado
    const transferirBtns = screen.getAllByRole('button', { name: 'Transferir' })
    fireEvent.click(transferirBtns[1])

    expect(screen.getByText('Origen')).toBeInTheDocument()
    expect(screen.getByText('Lote L01 · ACONDICIONADO')).toBeInTheDocument()
    
    fireEvent.change(screen.getByLabelText('Cantidad a transferir'), { target: { value: '10' } })
    
    vi.mocked(aleBetApi.stock.transferir).mockResolvedValue({ movimientoId: 'm1' })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar transferencia' }))

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
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('keeps the stock modal open when a transfer fails', async () => {
    const onClose = renderComponent()
    await waitFor(() => expect(screen.getAllByText(/L01/)[0]).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: 'Transferir' })[1])
    fireEvent.change(screen.getByLabelText('Cantidad a transferir'), { target: { value: '10' } })
    vi.mocked(aleBetApi.stock.transferir).mockRejectedValue(new Error('Sin stock disponible'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar transferencia' }))

    await waitFor(() => expect(screen.getByText('Sin stock disponible')).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Transferir stock')).toBeInTheDocument()
  })

  it('uses only backend-provided Amino 1 L presentations, without a false destination before selection', async () => {
    vi.mocked(aleBetApi.stock.transferRules).mockResolvedValue({
      rules: [
        { id: 'rule-aves', label: 'Aves', tipo: 'PRESENTATION', targetProduct: { id: 'p-aves', nombre: 'AMINOÁCIDOS 1 L AVES' } },
        { id: 'rule-equino', label: 'Equino', tipo: 'PRESENTATION', targetProduct: { id: 'p-equino', nombre: 'AMINOÁCIDOS 1 L EQUINO' } },
        { id: 'rule-cerdos', label: 'Cerdos', tipo: 'PRESENTATION', targetProduct: { id: 'p-cerdos', nombre: 'AMINOÁCIDOS 1 L CERDOS' } },
      ],
    })
    const onClose = renderComponent()
    await waitFor(() => expect(screen.getAllByText(/L01/)[0]).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Transferir a presentación' }))
    await waitFor(() => expect(screen.getByLabelText('Preparar como')).toBeInTheDocument())
    expect(screen.getByRole('option', { name: 'Aves' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Equino' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Cerdos' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Normal' })).not.toBeInTheDocument()
    expect(screen.queryByText('AMINOÁCIDOS 1 L EQUINO')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Preparar como'), { target: { value: 'rule-equino' } })
    fireEvent.change(screen.getByLabelText('Cantidad a transferir'), { target: { value: '10' } })
    expect(screen.getByText('AMINOÁCIDOS 1 L EQUINO')).toBeInTheDocument()
    expect(screen.getByText((_, element) => element?.textContent === '10 → AMINOÁCIDOS 1 L EQUINO')).toBeInTheDocument()
    expect(screen.getByText('Quedarán 10 en Acondicionado')).toBeInTheDocument()
    vi.mocked(aleBetApi.stock.transferir).mockResolvedValue({ movimientoId: 'm1' })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar transferencia' }))

    await waitFor(() => expect(aleBetApi.stock.transferir).toHaveBeenCalledWith(
      expect.objectContaining({ transferRuleId: 'rule-equino', cantidad: 10 }),
      expect.anything(),
    ))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('shows configured presentations but blocks a conversion when Acondicionado is zero', async () => {
    vi.mocked(aleBetApi.productos.stock.get).mockResolvedValue({
      lotes: [
        { id: 'l-amino', numero: 'A00298', fechaProduccion: '2026-01-01T00:00:00.000Z', fechaVencimiento: '2027-10-31T00:00:00.000Z', activo: true, stockTotal: 606, stockDeposito: 606, stockAcondicionado: 0 },
      ],
      ubicaciones: [
        { id: 'u1', codigo: 'DEPOSITO', nombre: 'Depósito' },
        { id: 'u2', codigo: 'ACONDICIONADO', nombre: 'Acondicionado' },
      ],
    } as any)
    vi.mocked(aleBetApi.stock.transferRules).mockResolvedValue({
      rules: [
        { id: 'rule-aves', label: 'Aves', tipo: 'PRESENTATION', targetProduct: { id: 'p-aves', nombre: 'AMINOÁCIDOS 1 L AVES' } },
        { id: 'rule-equino', label: 'Equino', tipo: 'PRESENTATION', targetProduct: { id: 'p-equino', nombre: 'AMINOÁCIDOS 1 L EQUINO' } },
        { id: 'rule-cerdos', label: 'Cerdos', tipo: 'PRESENTATION', targetProduct: { id: 'p-cerdos', nombre: 'AMINOÁCIDOS 1 L CERDOS' } },
      ],
    })

    renderComponent()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Transferir a presentación' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Transferir a presentación' }))

    await waitFor(() => expect(screen.getByLabelText('Preparar como')).toBeInTheDocument())
    expect(screen.getByRole('option', { name: 'Aves' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Equino' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Cerdos' })).toBeInTheDocument()
    expect(screen.getByText('Disponible: 0 unidades en Acondicionado.')).toBeInTheDocument()
    expect(screen.getByText('No hay stock en Acondicionado disponible para preparar esta presentación.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar transferencia' })).toBeDisabled()
    expect(screen.getByLabelText('Cantidad a transferir')).toBeDisabled()
  })

  it.each([
    ['AMINOÁCIDOS 50 ML', ['Aves', 'Mascota']],
    ['ENERGIZANTE 250 ML', ['Normal', 'Vacas']],
    ['SUPERCOMPLEJO B 1 L', ['Normal', 'Equino', 'Aves']],
  ])('shows only the configured presentation choices for %s', async (productoNombre, labels) => {
    vi.mocked(aleBetApi.stock.transferRules).mockResolvedValue({
      rules: labels.map((label) => ({
        id: `rule-${label.toLowerCase()}`,
        label,
        tipo: label === 'Normal' ? 'SAME_PRODUCT' : 'PRESENTATION',
        targetProduct: { id: `p-${label.toLowerCase()}`, nombre: label === 'Normal' ? 'Producto base' : `Producto ${label}` },
      })),
    })

    renderComponent(vi.fn(), productoNombre)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Transferir a presentación' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Transferir a presentación' }))
    await waitFor(() => expect(screen.getByLabelText('Preparar como')).toBeInTheDocument())
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Seleccionar presentación', ...labels])
  })
})
