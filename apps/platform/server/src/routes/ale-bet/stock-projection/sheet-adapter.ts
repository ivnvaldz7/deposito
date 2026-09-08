import type { StockProjectionSnapshot } from './snapshot'

export type StockProjectionSheetConfig = {
  enabled: boolean
  spreadsheetId?: string
  sheetName?: string
  serviceAccountFile?: string
}

export interface StockProjectionSheetAdapter {
  writeSnapshot(snapshot: StockProjectionSnapshot): Promise<void>
}

export function validateSheetConfig(raw: Record<string, string | undefined>): StockProjectionSheetConfig {
  const enabled = (raw.GOOGLE_SHEETS_ENABLED ?? 'false').toLowerCase() === 'true'
  if (!enabled) {
    return { enabled: false }
  }
  const spreadsheetId = raw.GOOGLE_SHEETS_SPREADSHEET_ID
  const sheetName = raw.GOOGLE_SHEETS_SHEET_NAME
  const serviceAccountFile = raw.GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE
  if (!spreadsheetId || !sheetName || !serviceAccountFile) {
    throw new Error(
      'Google Sheets está habilitado pero falta configuración requerida: ' +
      [
        !spreadsheetId && 'GOOGLE_SHEETS_SPREADSHEET_ID',
        !sheetName && 'GOOGLE_SHEETS_SHEET_NAME',
        !serviceAccountFile && 'GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE',
      ].filter(Boolean).join(', ')
    )
  }
  return { enabled: true, spreadsheetId, sheetName, serviceAccountFile }
}
