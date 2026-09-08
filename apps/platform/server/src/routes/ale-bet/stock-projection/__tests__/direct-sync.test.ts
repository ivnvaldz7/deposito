import { describe, expect, it, vi } from 'vitest'
import type { StockProjectionSnapshot } from '../snapshot'
import type { StockProjectionSheetAdapter } from '../sheet-adapter'
import { syncStockProjectionNow } from '../direct-sync'

describe('syncStockProjectionNow', () => {
  const snapshot: StockProjectionSnapshot = {
    productoTerminado: [{ producto: 'AMANTINA 500 ML', lote: 'L1', total: 108 }],
    sinAcondicionar: [],
  }

  it('builds the authoritative snapshot and writes it once when enabled', async () => {
    const buildSnapshot = vi.fn().mockResolvedValue(snapshot)
    const writeSnapshot = vi.fn().mockResolvedValue(undefined)
    const adapter: StockProjectionSheetAdapter = { writeSnapshot }

    await expect(syncStockProjectionNow({
      config: {
        enabled: true,
        spreadsheetId: 'spreadsheet-id',
        sheetName: 'STOCK APP',
        serviceAccountFile: '/external/service-account.json',
      },
      buildSnapshot,
      adapter,
    })).resolves.toBe('SYNCED')

    expect(buildSnapshot).toHaveBeenCalledOnce()
    expect(writeSnapshot).toHaveBeenCalledOnce()
    expect(writeSnapshot).toHaveBeenCalledWith(snapshot)
  })

  it('does not build a snapshot or instantiate Google when disabled', async () => {
    const buildSnapshot = vi.fn().mockRejectedValue(new Error('must not run'))
    const createAdapter = vi.fn()

    await expect(syncStockProjectionNow({
      config: { enabled: false },
      buildSnapshot,
      createAdapter,
    })).resolves.toBe('DISABLED')

    expect(buildSnapshot).not.toHaveBeenCalled()
    expect(createAdapter).not.toHaveBeenCalled()
  })
})
