import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GestionarStockModal } from '../GestionarStockModal'
import { aleBetApi, type ProductoAdminStock } from '../../lib/api'

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

function renderComponent(onClose = vi.fn(), productoNombre = 'Test Prod', unidadesPorCaja = 1) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <GestionarStockModal
        producto={{ id: 'p1', nombre: productoNombre, sku: 'SKU1', stockMinimo: 0, activo: true, unidadesPorCaja } as any}
        onClose={onClose}
      />
    </QueryClientProvider>
  )
  return onClose
}

function stockResponse(lotes: ProductoAdminStock['lotes']): ProductoAdminStock {
  return {
    producto: { id: 'p1', nombre: 'Test Prod' },
    lotes,
    ubicaciones: [
      { id: 'u1', codigo: 'DEPOSITO', nombre: 'Depósito' },
      { id: 'u2', codigo: 'ACONDICIONADO', nombre: 'Acondicionado' },
    ],
  }
}

async function selectLot(numero = 'L01'): Promise<void> {
  await waitFor(() => expect(screen.getByRole('button', { name: `Seleccionar lote ${numero}` })).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: `Seleccionar lote ${numero}` }))
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

  it('shows an active zero-stock lot so it can be adjusted or replenished', async () => {
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
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Agotados recientes (1)' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: 'Agotados recientes (1)' }))
    await selectLot('EN0124')
    expect(screen.getByRole('button', { name: 'Reactivar lote EN0124' })).toBeInTheDocument()
    expect(aleBetApi.productos.stock.get).toHaveBeenCalledWith('p1', { includeArchived: false, includeZero: true })
  })

  it('separates operable lots from the three most recent exhausted lots and reveals actions after selection', async () => {
    vi.mocked(aleBetApi.productos.stock.get).mockResolvedValue(stockResponse([
        { id: 'operable', numero: 'OP001', fechaProduccion: null, fechaVencimiento: null, activo: true, stockTotal: 120, stockDeposito: 120, stockAcondicionado: 0 },
        { id: 'zero-1', numero: 'Z001', fechaProduccion: null, fechaVencimiento: null, activo: true, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0 },
        { id: 'zero-2', numero: 'Z002', fechaProduccion: null, fechaVencimiento: null, activo: true, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0 },
        { id: 'zero-3', numero: 'Z003', fechaProduccion: null, fechaVencimiento: null, activo: true, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0 },
        { id: 'zero-4', numero: 'Z004', fechaProduccion: null, fechaVencimiento: null, activo: true, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0 },
    ]))

    renderComponent()
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Lotes operables (1)' })).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: 'Ingresar stock' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar lote OP001' }))
    expect(screen.getByRole('button', { name: 'Ingresar stock' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Agotados recientes (3)' }))
    expect(screen.queryByText('LOTE Z001')).not.toBeInTheDocument()
    expect(screen.getByText('LOTE Z004')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar lote Z003' }))
    expect(screen.getByRole('button', { name: 'Reactivar lote Z003' })).toBeInTheDocument()
  })

  it('asks for the destination before reactivating an exhausted lot', async () => {
    vi.mocked(aleBetApi.productos.stock.get).mockResolvedValue(stockResponse([
        { id: 'zero-1', numero: 'Z001', fechaProduccion: null, fechaVencimiento: null, activo: true, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0 },
    ]))

    renderComponent()
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Agotados recientes (1)' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: 'Agotados recientes (1)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar lote Z001' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reactivar lote Z001' }))

    expect(screen.getByRole('dialog', { name: 'Reactivar lote Z001' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Depósito' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Acondicionado' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('heading', { name: 'Reactivar lote' })).toBeInTheDocument()
    expect(screen.getByText((_, element) => element?.textContent === 'Lote: Z001 | Ubicación: Acondicionado')).toBeInTheDocument()
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
    await selectLot()
    
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar stock' }))

    fireEvent.change(screen.getByLabelText('Cajas'), { target: { value: '600' } })
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

  it('calcula el ingreso a partir de cajas y sueltos según las unidades por caja', async () => {
    const onClose = renderComponent(vi.fn(), 'Producto en cajas', 12)
    await selectLot()
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar stock' }))

    fireEvent.change(screen.getByLabelText('Cajas'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Sueltos'), { target: { value: '3' } })
    expect(screen.getByText('51 unidades')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar ingreso' }))

    vi.mocked(aleBetApi.productos.stock.lotes.ingreso).mockResolvedValue({} as any)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar ingreso' }))

    await waitFor(() => expect(aleBetApi.productos.stock.lotes.ingreso).toHaveBeenCalledWith(
      'p1',
      'l1',
      expect.objectContaining({ cantidad: 51 }),
      expect.anything(),
    ))
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
          { id: 'new-id', numero: 'TE02', fechaProduccion: '2026-08-01T00:00:00.000Z', fechaVencimiento: '2028-08-31T23:59:59.000Z', activo: true, stockTotal: 600, stockDeposito: 0, stockAcondicionado: 600 }
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

    fireEvent.change(screen.getByLabelText('Sigla del lote'), { target: { value: 'TE' } })
    fireEvent.change(screen.getByLabelText('Correlativo de lote'), { target: { value: '02' } })
    fireEvent.change(prodInput, { target: { value: '2026-08' } })
    fireEvent.change(screen.getByLabelText('Cajas'), { target: { value: '600' } })
    
    expect(expInput).toHaveValue('08/2028')

    vi.mocked(aleBetApi.productos.stock.lotes.create).mockResolvedValue({
      id: 'new-id',
      numero: 'TE02',
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
          numero: 'TE02',
          cantidadInicial: 600,
          fechaProduccion: '2026-08-01T00:00:00.000Z',
          fechaVencimiento: '2028-08-31T23:59:59.000Z'
        }),
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      )
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Seleccionar lote TE02' })).toBeInTheDocument()
      expect(screen.getByText('700')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar lote TE02' }))
    expect(screen.getAllByText('600').length).toBeGreaterThanOrEqual(2)
  })

  it('permite definir la sigla sin proponer iniciales', async () => {
    renderComponent(undefined, 'COMPLEJO B B12 B15 250 ML')
    await waitFor(() => expect(screen.getAllByText(/L01/)[0]).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo lote' }))
    const sigla = screen.getByLabelText('Sigla del lote')
    expect(sigla).toHaveValue('')
    fireEvent.change(sigla, { target: { value: 'cb' } })
    expect(sigla).toHaveValue('CB')
    expect(screen.getByText(/esta sigla quedará fija/)).toBeInTheDocument()
  })

  it('muestra la sigla guardada sin permitir modificarla', async () => {
    vi.mocked(aleBetApi.productos.stock.get).mockResolvedValue({ ...stockResponse([]), producto: { id: 'p1', nombre: 'Complejo', prefijoLote: 'CB' } })
    renderComponent()
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Nuevo lote' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo lote' }))
    expect(screen.getByLabelText('Sigla del lote')).toHaveValue('CB')
    expect(screen.getByLabelText('Sigla del lote')).toHaveAttribute('readonly')
  })

  it('flujo de ajuste: no usa window.confirm y muestra Confirmar ajuste in-app', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const onClose = renderComponent()
    await selectLot()
    
    const ajustarBtns = screen.getAllByRole('button', { name: 'Ajustar saldo' })
    fireEvent.click(ajustarBtns[0]) // Ajustar deposito

    fireEvent.change(screen.getByLabelText('Cajas'), { target: { value: '150' } })
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
    await selectLot()
    
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a depósito' }))

    expect(screen.getByText(/Origen · Acondicionado/)).toBeInTheDocument()
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

  it('permite transferir el total disponible del lote con un solo click', async () => {
    const onClose = renderComponent()
    await selectLot()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a depósito' }))

    fireEvent.click(screen.getByRole('button', { name: 'Transferir todo (20)' }))
    expect(screen.getByLabelText('Cantidad a transferir')).toHaveValue(20)

    vi.mocked(aleBetApi.stock.transferir).mockResolvedValue({ movimientoId: 'm-total' })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar transferencia' }))

    await waitFor(() => expect(aleBetApi.stock.transferir).toHaveBeenCalledWith(
      expect.objectContaining({ origen: 'ACONDICIONADO', destino: 'DEPOSITO', cantidad: 20 }),
      expect.anything(),
    ))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('keeps the stock modal open when a transfer fails', async () => {
    const onClose = renderComponent()
    await selectLot()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a depósito' }))
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
    await selectLot()
    fireEvent.click(screen.getByRole('button', { name: 'Preparar presentación' }))
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

  it('does not offer presentation conversion when Acondicionado is zero', async () => {
    vi.mocked(aleBetApi.productos.stock.get).mockResolvedValue(stockResponse([
      { id: 'l-amino', numero: 'A00298', fechaProduccion: '2026-01-01T00:00:00.000Z', fechaVencimiento: '2027-10-31T00:00:00.000Z', activo: true, stockTotal: 606, stockDeposito: 606, stockAcondicionado: 0 },
    ]))
    vi.mocked(aleBetApi.stock.transferRules).mockResolvedValue({
      rules: [
        { id: 'rule-aves', label: 'Aves', tipo: 'PRESENTATION', targetProduct: { id: 'p-aves', nombre: 'AMINOÁCIDOS 1 L AVES' } },
        { id: 'rule-equino', label: 'Equino', tipo: 'PRESENTATION', targetProduct: { id: 'p-equino', nombre: 'AMINOÁCIDOS 1 L EQUINO' } },
        { id: 'rule-cerdos', label: 'Cerdos', tipo: 'PRESENTATION', targetProduct: { id: 'p-cerdos', nombre: 'AMINOÁCIDOS 1 L CERDOS' } },
      ],
    })

    renderComponent()
    await selectLot('A00298')
    expect(screen.queryByRole('button', { name: 'Preparar presentación' })).not.toBeInTheDocument()
    expect(screen.getByText(/No hay stock en Acondicionado/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Cantidad a transferir')).not.toBeInTheDocument()
  })

  it('shows a converted lot already in Depósito without offering a second transfer', async () => {
    vi.mocked(aleBetApi.productos.stock.get).mockResolvedValue(stockResponse([
      { id: 'l-vacas', numero: 'EN0131', fechaProduccion: null, fechaVencimiento: '2026-09-01T15:00:00.000Z', activo: true, stockTotal: 72, stockDeposito: 72, stockAcondicionado: 0 },
    ]))

    renderComponent(vi.fn(), 'ENERGIZANTE 250 ML VACAS', 24)
    await selectLot('EN0131')

    expect(screen.getByText('72 unidades ya están en Depósito.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar a depósito' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Cantidad a transferir')).not.toBeInTheDocument()
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
    await selectLot()
    fireEvent.click(screen.getByRole('button', { name: 'Preparar presentación' }))
    await waitFor(() => expect(screen.getByLabelText('Preparar como')).toBeInTheDocument())
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Seleccionar presentación', ...labels])
  })
})
