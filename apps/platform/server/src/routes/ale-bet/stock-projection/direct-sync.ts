import { createGoogleSheetsAdapter } from './google-sheets-adapter'
import { validateSheetConfig, type StockProjectionSheetAdapter, type StockProjectionSheetConfig } from './sheet-adapter'
import { buildCurrentStockProjectionSnapshot } from './snapshot-repository'
import type { StockProjectionSnapshot } from './snapshot'

type DirectSyncDependencies = {
  config?: StockProjectionSheetConfig
  buildSnapshot?: () => Promise<StockProjectionSnapshot>
  adapter?: StockProjectionSheetAdapter
  createAdapter?: (config: StockProjectionSheetConfig) => StockProjectionSheetAdapter
}

export type StockProjectionSyncResult = 'DISABLED' | 'SYNCED'

export const STOCK_PROJECTION_SYNC_FAILURE_LOG = '[stock-projection] Google Sheets sync failed after physical stock mutation'

type PostCommitSyncDependencies = {
  syncStockProjectionNow?: () => Promise<unknown>
  logger?: Pick<Console, 'error'>
}

let postCommitSyncQueue: Promise<void> = Promise.resolve()

export async function syncStockProjectionNow(
  dependencies: DirectSyncDependencies = {},
): Promise<StockProjectionSyncResult> {
  const config = dependencies.config ?? validateSheetConfig(process.env)
  if (!config.enabled) return 'DISABLED'

  const buildSnapshot = dependencies.buildSnapshot ?? (async () => {
    const { platformDb } = await import('@platform/db')
    return buildCurrentStockProjectionSnapshot(platformDb)
  })
  const snapshot = await buildSnapshot()
  const createAdapter = dependencies.createAdapter ?? createGoogleSheetsAdapter
  const adapter = dependencies.adapter ?? createAdapter(config)
  await adapter.writeSnapshot(snapshot)
  return 'SYNCED'
}

/**
 * Serializes outbound snapshots after committed stock mutations. Google is a
 * projection only: an external failure is logged without invalidating the
 * already-committed inventory transaction or its HTTP response.
 */
export function syncStockProjectionAfterCommit(
  dependencies: PostCommitSyncDependencies = {},
): Promise<void> {
  const sync = dependencies.syncStockProjectionNow ?? syncStockProjectionNow
  const logger = dependencies.logger ?? console
  const run = async (): Promise<void> => {
    try {
      await sync()
    } catch {
      logger.error(STOCK_PROJECTION_SYNC_FAILURE_LOG)
    }
  }

  const queued = postCommitSyncQueue.then(run, run)
  postCommitSyncQueue = queued
  return queued
}
