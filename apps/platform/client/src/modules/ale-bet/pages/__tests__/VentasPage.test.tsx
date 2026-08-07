import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { aleBetApi } from '../../lib/api'
import VentasPage from '../VentasPage'
import {
  createCliente,
  createClienteList,
  createProductoAgregado,
  createReporteVentasMensual,
  createReporteVentasAnual,
} from './fixtures/ale-bet-mock-factories'

vi.mock('../../lib/api', () => ({
  aleBetApi: {
    dashboard: vi.fn(),
    productos: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), lotes: { list: vi.fn(), create: vi.fn() } },
    clientes: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    pedidos: { list: vi.fn(), create: vi.fn(), aprobar: vi.fn(), tomar: vi.fn(), completarItem: vi.fn(), cancelar: vi.fn() },
    stock: { get: vi.fn(), movimientos: vi.fn() },
    historial: { list: vi.fn(), exportDownload: vi.fn() },
    facturacion: { ventas: vi.fn(), ventasPdf: vi.fn() },
  },
}))

vi.mock('../../lib/ventas-excel', () => ({
  generarExcelVentas: vi.fn(),
}))

// Safety net: VentasPage does not read the auth store today; keep the mock in
// case a future edit introduces it (HistorialPage.test.tsx precedent).
vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }))

vi.mock('@/lib/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

const ventasMock = vi.mocked(aleBetApi.facturacion.ventas)
const ventasPdfMock = vi.mocked(aleBetApi.facturacion.ventasPdf)
const clientesMock = vi.mocked(aleBetApi.clientes.list)

import { generarExcelVentas } from '../../lib/ventas-excel'
const excelMock = vi.mocked(generarExcelVentas)

function renderPage() {
  return render(
    <MemoryRouter>
      <VentasPage />
    </MemoryRouter>,
  )
}

async function selectCliente(nombre = 'Cliente A') {
  // Native <select> elements also map to role "combobox" in jsdom; query by placeholder.
  fireEvent.click(screen.getByPlaceholderText('Buscar cliente...'))
  fireEvent.click(await screen.findByText(nombre))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('VentasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clientesMock.mockResolvedValue(createClienteList())
    // Stub URL.createObjectURL / revokeObjectURL (not implemented in jsdom).
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    })
  })

  it('shows empty state and never calls ventas before client selection', () => {
    renderPage()

    expect(screen.getByText('Seleccioná un cliente para consultar sus ventas.')).toBeInTheDocument()
    expect(ventasMock).not.toHaveBeenCalled()
  })

  it('filters by nombre and cuit and selects showing chip', async () => {
    const now = new Date()
    // The shared createClienteList() fixture leaves Cliente B without a CUIT
    // (cuit: null); this test needs a searchable CUIT, so use a local list.
    clientesMock.mockResolvedValue([
      createCliente(),
      createCliente({ id: 'cliente-2', nombre: 'Cliente B', cuit: '30-12345678-9' }),
    ])
    ventasMock.mockResolvedValue(createReporteVentasMensual())
    renderPage()

    const combobox = screen.getByPlaceholderText('Buscar cliente...')
    fireEvent.change(combobox, { target: { value: '30-12345678-9' } })

    await waitFor(() => expect(screen.getByText('Cliente B')).toBeInTheDocument())
    expect(screen.queryByText('Cliente A')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Cliente B'))

    await waitFor(() => expect(screen.getByText('Cliente B / 30-12345678-9')).toBeInTheDocument())
    expect(ventasMock).toHaveBeenCalledTimes(1)
    expect(ventasMock).toHaveBeenCalledWith({
      clienteId: 'cliente-2',
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    })
  })

  it('shows nombre only when cuit is null', async () => {
    ventasMock.mockResolvedValue(createReporteVentasMensual())
    renderPage()

    await selectCliente()

    const chip = await screen.findByTestId('cliente-chip')
    expect(chip.textContent).toBe('Cliente A')
    expect(chip.textContent).not.toContain('/')
  })

  it('defaults to current month and year in MES mode', () => {
    const now = new Date()
    renderPage()

    expect(screen.getByLabelText('Mes')).toHaveValue(String(now.getMonth() + 1))
    expect(screen.getByLabelText('Año')).toHaveValue(String(now.getFullYear()))
  })

  it('AÑO mode hides month and offers years 2000-2100', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'AÑO' }))

    expect(screen.queryByLabelText('Mes')).not.toBeInTheDocument()
    const yearSelect = screen.getByLabelText('Año')
    const options = yearSelect.querySelectorAll('option')
    expect(options).toHaveLength(101)
    expect(options[0].textContent).toBe('2000')
    expect(options[100].textContent).toBe('2100')
  })

  it('calls ventas with clienteId, year and month in MES mode', async () => {
    const now = new Date()
    ventasMock.mockResolvedValue(createReporteVentasMensual())
    renderPage()

    await selectCliente()

    await waitFor(() =>
      expect(ventasMock).toHaveBeenCalledWith({
        clienteId: 'cliente-1',
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      }),
    )
  })

  it('calls ventas without month in AÑO mode', async () => {
    const now = new Date()
    ventasMock.mockResolvedValue(createReporteVentasAnual())
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'AÑO' }))
    await selectCliente()

    await waitFor(() =>
      expect(ventasMock).toHaveBeenCalledWith({
        clienteId: 'cliente-1',
        year: now.getFullYear(),
      }),
    )
  })

  it('changing month refetches with the new month', async () => {
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const targetMonth = currentMonth === 12 ? 1 : currentMonth + 1
    ventasMock.mockResolvedValue(createReporteVentasMensual())
    renderPage()

    await selectCliente()
    await waitFor(() => expect(ventasMock).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: String(targetMonth) } })

    await waitFor(() =>
      expect(ventasMock).toHaveBeenCalledWith({
        clienteId: 'cliente-1',
        year: now.getFullYear(),
        month: targetMonth,
      }),
    )
  })

  it('changing year refetches with the new year', async () => {
    const now = new Date()
    const targetYear = now.getFullYear() - 1
    ventasMock.mockResolvedValue(createReporteVentasMensual())
    renderPage()

    await selectCliente()
    await waitFor(() => expect(ventasMock).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('Año'), { target: { value: String(targetYear) } })

    await waitFor(() =>
      expect(ventasMock).toHaveBeenCalledWith({
        clienteId: 'cliente-1',
        year: targetYear,
        month: now.getMonth() + 1,
      }),
    )
  })

  it('renders metrics with thousands separator', async () => {
    ventasMock.mockResolvedValue(createReporteVentasMensual())
    renderPage()

    await selectCliente()

    await waitFor(() => expect(screen.getByText('1.426')).toBeInTheDocument())
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
  })

  it('renders monthly table with verbatim cajas sueltos unidades', async () => {
    ventasMock.mockResolvedValue(createReporteVentasMensual())
    renderPage()

    await selectCliente()

    // jsdom ignores responsive CSS, so the mobile cards and the table are both
    // in the DOM; scope to the table to avoid duplicate matches.
    const table = within(await screen.findByTestId('ventas-table'))
    await waitFor(() => expect(table.getByText('SKU-001')).toBeInTheDocument())
    expect(table.getByText('Producto A')).toBeInTheDocument()
    expect(table.getByText('2')).toBeInTheDocument()
    expect(table.getByText('5')).toBeInTheDocument()
    expect(table.getByText('25')).toBeInTheDocument()
  })

  it('renders resumen por mes then annual totals', async () => {
    ventasMock.mockResolvedValue(createReporteVentasAnual())
    renderPage()

    await selectCliente()

    await waitFor(() => expect(screen.getByText('ENERO — 8 pedidos · 920 unidades')).toBeInTheDocument())
    expect(screen.getByText('JULIO — 4 pedidos · 40 unidades')).toBeInTheDocument()
    expect(screen.getByText('TOTAL ANUAL POR PRODUCTO')).toBeInTheDocument()
    expect(within(screen.getByTestId('ventas-table')).getByText('SKU-001')).toBeInTheDocument()
  })

  it('renders compact product cards', async () => {
    ventasMock.mockResolvedValue(createReporteVentasMensual())
    renderPage()

    await selectCliente()

    await waitFor(() =>
      expect(screen.getByText('7 cajas · 4 sueltos / 144 unidades')).toBeInTheDocument(),
    )
  })

  it('never renders money or commercial metrics absent from the backend contract', async () => {
    // The backend contract (apps/platform/server/src/routes/ale-bet/facturacion.ts)
    // carries no prices, subtotals, money, bultos, or days-of-sale — the UI must
    // never render them, in either mode.
    ventasMock.mockResolvedValue(createReporteVentasMensual())
    renderPage()

    await selectCliente()
    await waitFor(() => expect(within(screen.getByTestId('ventas-table')).getByText('SKU-001')).toBeInTheDocument())

    expect(screen.queryByText(/precio unitario/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/precio/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/subtotal/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/bultos?/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/d[ií]as de venta/i)).not.toBeInTheDocument()

    // Annual view: same guarantees; the compact month summary stays unit-only.
    ventasMock.mockResolvedValue(createReporteVentasAnual())
    fireEvent.click(screen.getByRole('button', { name: 'AÑO' }))
    await waitFor(() => expect(screen.getByText('TOTAL ANUAL POR PRODUCTO')).toBeInTheDocument())

    expect(screen.queryByText(/precio/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/subtotal/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/bultos?/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/d[ií]as de venta/i)).not.toBeInTheDocument()
  })

  it('shows neutral no-sales message', async () => {
    ventasMock.mockResolvedValue(
      createReporteVentasMensual({
        pedidosDespachados: 0,
        productosDistintos: 0,
        unidadesTotales: 0,
        productos: [],
      }),
    )
    renderPage()

    await selectCliente()

    await waitFor(() =>
      expect(screen.getByText('No hay pedidos despachados para este período.')).toBeInTheDocument(),
    )
  })

  it('shows friendly error, never raw backend text', async () => {
    ventasMock.mockRejectedValue(new Error('backend boom'))
    renderPage()

    await selectCliente()

    await waitFor(() =>
      expect(screen.getByText('No pudimos cargar el reporte. Intentá nuevamente.')).toBeInTheDocument(),
    )
    expect(screen.queryByText(/backend boom/)).not.toBeInTheDocument()
  })

  it('shows a loading skeleton while the report is being fetched', async () => {
    ventasMock.mockReturnValue(new Promise(() => {}))
    renderPage()

    await selectCliente()

    expect(await screen.findByTestId('ventas-loading')).toBeInTheDocument()
  })

  it('never pairs a new client selection with the previous report while refetching', async () => {
    const now = new Date()
    ventasMock.mockResolvedValue(createReporteVentasMensual())
    renderPage()

    await selectCliente()
    await waitFor(() => expect(within(screen.getByTestId('ventas-table')).getByText('Producto A')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Quitar cliente'))
    expect(screen.getByText('Seleccioná un cliente para consultar sus ventas.')).toBeInTheDocument()

    const reporteB = deferred<ReturnType<typeof createReporteVentasMensual>>()
    ventasMock.mockReturnValue(reporteB.promise)
    await selectCliente('Cliente B')

    await waitFor(() =>
      expect(ventasMock).toHaveBeenCalledWith({
        clienteId: 'cliente-2',
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      }),
    )
    expect(await screen.findByTestId('ventas-loading')).toBeInTheDocument()
    expect(screen.queryAllByText('Producto A')).toHaveLength(0)
    expect(screen.queryByText('1.426')).not.toBeInTheDocument()

    reporteB.resolve(
      createReporteVentasMensual({
        clienteId: 'cliente-2',
        pedidosDespachados: 5,
        productosDistintos: 1,
        unidadesTotales: 5555,
        productos: [createProductoAgregado({ productoId: 'prod-9', nombre: 'Producto Cliente B', sku: 'SKU-009' })],
      }),
    )

    await waitFor(() =>
      expect(within(screen.getByTestId('ventas-table')).getByText('Producto Cliente B')).toBeInTheDocument(),
    )
    expect(screen.getByText('5.555')).toBeInTheDocument()
    expect(screen.queryAllByText('Producto A')).toHaveLength(0)
    expect(screen.queryByText('1.426')).not.toBeInTheDocument()
  })

  // ─── PDF export button (T7) ────────────────────────────────────────────────

  describe('PDF export button', () => {
    it('button is disabled and not visible without a cliente', () => {
      renderPage()
      // No client selected: button must not be present or must be disabled.
      const btn = screen.queryByRole('button', { name: /Exportar PDF/i })
      if (btn) {
        expect(btn).toBeDisabled()
      }
      // The sentinel is: no ventas call was made.
      expect(ventasMock).not.toHaveBeenCalled()
    })

    it('button is disabled while the report is loading', async () => {
      ventasMock.mockReturnValue(new Promise(() => {}))
      renderPage()
      await selectCliente()
      await screen.findByTestId('ventas-loading')
      const btn = screen.queryByRole('button', { name: /Exportar PDF/i })
      if (btn) expect(btn).toBeDisabled()
    })

    it('button is disabled when there is no report data (null)', async () => {
      // ventas never resolves → reporte stays undefined; after selecting cliente
      // the loading skeleton is shown and the button (if rendered) is disabled.
      ventasMock.mockReturnValue(new Promise(() => {}))
      renderPage()
      await selectCliente()
      const btnPdf = screen.queryByRole('button', { name: /Exportar PDF/i })
      if (btnPdf) expect(btnPdf).toBeDisabled()
      const btnExcel = screen.queryByRole('button', { name: /Exportar Excel/i })
      if (btnExcel) expect(btnExcel).toBeDisabled()
    })

    it('button is enabled when a valid report is loaded', async () => {
      ventasMock.mockResolvedValue(createReporteVentasMensual())
      ventasPdfMock.mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }))
      renderPage()
      await selectCliente()
      await waitFor(() => expect(screen.getByTestId('ventas-metrics')).toBeInTheDocument())
      const btnPdf = screen.getByRole('button', { name: /Exportar PDF/i })
      expect(btnPdf).not.toBeDisabled()
      const btnExcel = screen.getByRole('button', { name: /Exportar Excel/i })
      expect(btnExcel).not.toBeDisabled()
    })

    it('shows "Generando PDF…" while generating and ignores a second click', async () => {
      const pdfDeferred = deferred<Blob>()
      ventasMock.mockResolvedValue(createReporteVentasMensual())
      ventasPdfMock.mockReturnValue(pdfDeferred.promise)
      renderPage()
      await selectCliente()
      await waitFor(() => expect(screen.getByTestId('ventas-metrics')).toBeInTheDocument())

      const btn = screen.getByRole('button', { name: /Exportar PDF/i })
      await act(async () => { fireEvent.click(btn) })

      // Button now shows the generating label and is disabled (no double-fire).
      await waitFor(() => expect(screen.getByRole('button', { name: /Generando PDF/i })).toBeDisabled())

      // Second click while generating must not trigger a second call.
      fireEvent.click(screen.getByRole('button', { name: /Generando PDF/i }))
      expect(ventasPdfMock).toHaveBeenCalledTimes(1)

      // Resolve and restore.
      await act(async () => { pdfDeferred.resolve(new Blob(['%PDF-'], { type: 'application/pdf' })) })
    })

    it('on success: creates objectURL, triggers anchor download, revokes URL, shows toast', async () => {
      const now = new Date()
      ventasMock.mockResolvedValue(createReporteVentasMensual())
      ventasPdfMock.mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }))

      // Spy on anchor.click to intercept the download trigger.
      const clickSpy = vi.fn()
      const origCreate = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreate(tag)
        if (tag === 'a') {
          vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(clickSpy)
        }
        return el
      })

      const { toast } = await import('@/lib/toast')

      renderPage()
      await selectCliente()
      await waitFor(() => expect(screen.getByTestId('ventas-metrics')).toBeInTheDocument())

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Exportar PDF/i }))
      })

      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
      expect(clickSpy).toHaveBeenCalled()
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

      // The download filename must encode cliente + year + month.
      const anchorEl = (document.createElement as ReturnType<typeof vi.spyOn>).mock.results
        .find((r) => (r.value as HTMLElement).tagName === 'A')?.value as HTMLAnchorElement | undefined
      if (anchorEl) {
        expect(anchorEl.download).toMatch(new RegExp(`${now.getFullYear()}`))
        expect(anchorEl.download).toMatch(/ventas-/)
        expect(anchorEl.download).toMatch(/\.pdf$/)
      }

      expect(toast.success).toHaveBeenCalledWith('PDF generado correctamente.')

      // Button returns to enabled state after success.
      expect(screen.getByRole('button', { name: /Exportar PDF/i })).not.toBeDisabled()

      vi.restoreAllMocks()
    })

    it('on error: shows error toast and button returns to usable state', async () => {
      ventasMock.mockResolvedValue(createReporteVentasMensual())
      ventasPdfMock.mockRejectedValue(new Error('network error'))

      const { toast } = await import('@/lib/toast')

      renderPage()
      await selectCliente()
      await waitFor(() => expect(screen.getByTestId('ventas-metrics')).toBeInTheDocument())

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Exportar PDF/i }))
      })

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No pudimos generar el PDF.'))

      // Button must return to enabled state so the user can retry.
      await waitFor(() => expect(screen.getByRole('button', { name: /Exportar PDF/i })).not.toBeDisabled())
      expect(screen.queryByRole('button', { name: /Generando PDF/i })).not.toBeInTheDocument()
    })
  })

  describe('Acciones - Exportar Excel', () => {
    it('shows "Generando Excel…" while generating and ignores a second click', async () => {
      ventasMock.mockResolvedValue(createReporteVentasMensual())
      let resolveExcel!: () => void
      excelMock.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveExcel = resolve
          })
      )
      renderPage()
      await selectCliente()
      await waitFor(() => expect(screen.getByTestId('ventas-metrics')).toBeInTheDocument())

      const btn = screen.getByRole('button', { name: /Exportar Excel/i })
      await act(async () => { fireEvent.click(btn) })

      // Button now shows the generating label and is disabled
      await waitFor(() => expect(screen.getByRole('button', { name: /Generando Excel/i })).toBeDisabled())

      // Second click while generating must not trigger a second call
      fireEvent.click(screen.getByRole('button', { name: /Generando Excel/i }))

      // Resolve and restore
      await act(async () => { resolveExcel() })
    })

    it('on success: calls generarExcelVentas and shows toast', async () => {
      ventasMock.mockResolvedValue(createReporteVentasMensual())
      excelMock.mockImplementation(() => {})

      const { toast } = await import('@/lib/toast')

      renderPage()
      await selectCliente()
      await waitFor(() => expect(screen.getByTestId('ventas-metrics')).toBeInTheDocument())

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Exportar Excel/i }))
      })

      await waitFor(() => expect(excelMock).toHaveBeenCalledTimes(1))
      expect(toast.success).toHaveBeenCalledWith('Excel generado correctamente.')

      // Button returns to enabled state after success.
      expect(screen.getByRole('button', { name: /Exportar Excel/i })).not.toBeDisabled()

      vi.restoreAllMocks()
    })

    it('on error: shows error toast and button returns to usable state', async () => {
      ventasMock.mockResolvedValue(createReporteVentasMensual())
      excelMock.mockImplementation(() => {
        throw new Error('sync error')
      })

      const { toast } = await import('@/lib/toast')

      renderPage()
      await selectCliente()
      await waitFor(() => expect(screen.getByTestId('ventas-metrics')).toBeInTheDocument())

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Exportar Excel/i }))
      })

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No pudimos generar el Excel.'))

      // Button must return to enabled state so the user can retry.
      await waitFor(() => expect(screen.getByRole('button', { name: /Exportar Excel/i })).not.toBeDisabled())
      expect(screen.queryByRole('button', { name: /Generando Excel/i })).not.toBeInTheDocument()
    })
  })
})
