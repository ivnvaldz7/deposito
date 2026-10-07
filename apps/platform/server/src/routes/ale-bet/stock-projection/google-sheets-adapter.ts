import { google, type sheets_v4 } from 'googleapis'
import { readFile } from 'node:fs/promises'
import type { StockProjectionSnapshot } from './snapshot'
import type { StockProjectionSheetAdapter, StockProjectionSheetConfig } from './sheet-adapter'

const DEPOSITO_HEADER = 'PRODUCTO TERMINADO'
const ACONDICIONADO_HEADER = 'SIN ACONDICIONAR'
const TABLE_HEADERS = ['PRODUCTO', 'LOTE', 'VENCIMIENTO', 'TOTAL', 'ACTUALIZADO AL'] as const

const DEPOSITO_RANGE_PREFIX = 'A'
const ACONDICIONADO_RANGE_PREFIX = 'H'
const HEADER_ROW = 1
const COLUMN_HEADERS_ROW = 2
const DATA_START_ROW = 3
const MAX_DATA_ROWS = 1000

function columnLetter(index: number): string {
  return String.fromCharCode(65 + index)
}

function buildClearRange(prefix: string): string {
  const colStart = prefix
  const colEnd = columnLetter(prefix.charCodeAt(0) - 65 + 4)
  return `${colStart}${DATA_START_ROW}:${colEnd}${DATA_START_ROW + MAX_DATA_ROWS - 1}`
}

async function readServiceAccountCredentials(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf-8')
  return content
}

function formatTabDate(date: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: 'numeric',
    month: 'numeric',
  }).format(date).replace(/\//g, '-')
}

function isManagedSheetTitle(title: string, baseName: string): boolean {
  if (title === baseName) return true
  const escapedBaseName = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escapedBaseName} \\d{1,2}-\\d{1,2}$`).test(title)
}

/**
 * GOOGLE_SHEETS_SHEET_NAME is deliberately a stable base identifier, while
 * the visible tab adds the snapshot date (for example, "STOCK APP 5-10").
 * This lets an operator adjust the date text manually without changing any
 * environment variable; the next sync finds the managed tab by its base name.
 */
async function ensureSheet(sheets: sheets_v4.Sheets, spreadsheetId: string, baseName: string): Promise<string> {
  const sheetName = `${baseName} ${formatTabDate(new Date())}`
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
  const matches = spreadsheet.data.sheets?.filter((sheet) => {
    const title = sheet.properties?.title
    return title != null && isManagedSheetTitle(title, baseName)
  }) ?? []

  if (matches.length > 1) {
    throw new Error(`Se encontraron varias solapas administradas para ${baseName}; se requiere una sola.`)
  }

  const existing = matches[0]
  if (existing?.properties?.sheetId != null) {
    if (existing.properties.title !== sheetName) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            updateSheetProperties: {
              properties: { sheetId: existing.properties.sheetId, title: sheetName },
              fields: 'title',
            },
          }],
        },
      })
    }
    return sheetName
  }
  const addResponse = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  })
  if (addResponse.data.replies?.[0]?.addSheet?.properties?.sheetId == null) {
    throw new Error(`No se pudo crear la solapa ${sheetName}`)
  }
  return sheetName
}

async function clearAdminRanges(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string): Promise<void> {
  const ranges = [
    `${sheetName}!${buildClearRange(DEPOSITO_RANGE_PREFIX)}`,
    `${sheetName}!${buildClearRange(ACONDICIONADO_RANGE_PREFIX)}`,
    // Previous versions used E:G for this second table. Clear that managed
    // space once the expanded table moves to H:L, preventing old totals from
    // looking like live stock beside the new report.
    `${sheetName}!E1:G${DATA_START_ROW + MAX_DATA_ROWS - 1}`,
  ]
  await sheets.spreadsheets.values.batchClear({
    spreadsheetId,
    requestBody: { ranges },
  })
}

function snapshotToValues(rows: StockProjectionSnapshot['productoTerminado']): (string | number)[][] {
  return rows.map((row) => [row.producto, row.lote, row.vencimiento ?? 'SIN VTO', row.total, row.actualizadoEn ?? ''])
}

async function writeTable(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  prefix: string,
  headerTitle: string,
  rows: StockProjectionSnapshot['productoTerminado'],
): Promise<void> {
  const values: (string | number)[][] = [
    [headerTitle, '', ''],
    [...TABLE_HEADERS],
    ...snapshotToValues(rows),
  ]
  const range = `${sheetName}!${prefix}${HEADER_ROW}:${columnLetter(prefix.charCodeAt(0) - 65 + 4)}${HEADER_ROW + values.length - 1}`
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values },
  })
}

export function createGoogleSheetsAdapter(config: StockProjectionSheetConfig): StockProjectionSheetAdapter {
  if (!config.enabled) {
    return {
      async writeSnapshot() {
        throw new Error('Google Sheets está deshabilitado')
      },
    }
  }

  if (!config.spreadsheetId || !config.sheetName || !config.serviceAccountFile) {
    throw new Error('Configuración de Google Sheets incompleta')
  }

  const { spreadsheetId, sheetName, serviceAccountFile } = config

  let sheetsClient: sheets_v4.Sheets | null = null

  async function getSheets(): Promise<sheets_v4.Sheets> {
    if (sheetsClient) return sheetsClient
    const credentials = await readServiceAccountCredentials(serviceAccountFile)
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(credentials),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    sheetsClient = google.sheets({ version: 'v4', auth })
    return sheetsClient
  }

  return {
    async writeSnapshot(snapshot: StockProjectionSnapshot): Promise<void> {
      const sheets = await getSheets()
      const currentSheetName = await ensureSheet(sheets, spreadsheetId, sheetName)
      await clearAdminRanges(sheets, spreadsheetId, currentSheetName)
      await writeTable(sheets, spreadsheetId, currentSheetName, DEPOSITO_RANGE_PREFIX, DEPOSITO_HEADER, snapshot.productoTerminado)
      await writeTable(sheets, spreadsheetId, currentSheetName, ACONDICIONADO_RANGE_PREFIX, ACONDICIONADO_HEADER, snapshot.sinAcondicionar)
    },
  }
}
