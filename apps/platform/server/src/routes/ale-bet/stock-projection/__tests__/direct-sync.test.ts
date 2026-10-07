import { describe, expect, it, vi } from 'vitest'
import type { StockProjectionSnapshot } from '../snapshot'
import type { StockProjectionSheetAdapter } from '../sheet-adapter'
import { STOCK_PROJECTION_SYNC_FAILURE_LOG, syncStockProjectionAfterCommit, syncStockProjectionNow } from '../direct-sync'

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

  it('contains an external sync failure after the stock transaction has committed', async () => {
    const logger = { error: vi.fn<(message: string) => void>() }
    const sync = vi.fn().mockRejectedValue(new Error('private_key=must-not-leak'))

    await expect(syncStockProjectionAfterCommit({ syncStockProjectionNow: sync, logger })).resolves.toBeUndefined()

    expect(sync).toHaveBeenCalledOnce()
    expect(logger.error).toHaveBeenCalledWith(STOCK_PROJECTION_SYNC_FAILURE_LOG)
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private_key')
  })

  it('serializes snapshots so a later mutation cannot be overwritten by an earlier write', async () => {
    let releaseFirst: (() => void) | undefined
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
    const order: string[] = []
    const first = vi.fn(async () => { order.push('first:start'); await firstGate; order.push('first:end') })
    const second = vi.fn(async () => { order.push('second') })

    const firstRun = syncStockProjectionAfterCommit({ syncStockProjectionNow: first })
    const secondRun = syncStockProjectionAfterCommit({ syncStockProjectionNow: second })
    await Promise.resolve()
    expect(order).toEqual(['first:start'])
    releaseFirst?.()
    await Promise.all([firstRun, secondRun])

    expect(order).toEqual(['first:start', 'first:end', 'second'])
  })
})
