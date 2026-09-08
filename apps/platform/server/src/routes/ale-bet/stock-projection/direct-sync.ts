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
