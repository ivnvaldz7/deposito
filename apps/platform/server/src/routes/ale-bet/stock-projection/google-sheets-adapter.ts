import { google, type sheets_v4 } from 'googleapis'
import { readFile } from 'node:fs/promises'
import type { StockProjectionSnapshot } from './snapshot'
import type { StockProjectionSheetAdapter, StockProjectionSheetConfig } from './sheet-adapter'

const DEPOSITO_HEADER = 'PRODUCTO TERMINADO'
const ACONDICIONADO_HEADER = 'SIN ACONDICIONAR'
const TABLE_HEADERS = ['PRODUCTO', 'LOTE', 'TOTAL'] as const

const DEPOSITO_RANGE_PREFIX = 'A'
const ACONDICIONADO_RANGE_PREFIX = 'E'
const HEADER_ROW = 1
const COLUMN_HEADERS_ROW = 2
const DATA_START_ROW = 3
const MAX_DATA_ROWS = 1000

function columnLetter(index: number): string {
  return String.fromCharCode(65 + index)
}

function buildClearRange(prefix: string): string {
  const colStart = prefix
  const colEnd = columnLetter(prefix.charCodeAt(0) - 65 + 2)
  return `${colStart}${DATA_START_ROW}:${colEnd}${DATA_START_ROW + MAX_DATA_ROWS - 1}`
}

async function readServiceAccountCredentials(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf-8')
  return content
}

async function ensureSheet(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string): Promise<number> {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
  const existing = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === sheetName,
  )
  if (existing?.properties?.sheetId != null) {
    return existing.properties.sheetId
  }
  const addResponse = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  })
  return addResponse.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0
}

async function clearAdminRanges(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string): Promise<void> {
  const ranges = [
    `${sheetName}!${buildClearRange(DEPOSITO_RANGE_PREFIX)}`,
    `${sheetName}!${buildClearRange(ACONDICIONADO_RANGE_PREFIX)}`,
  ]
  await sheets.spreadsheets.values.batchClear({
    spreadsheetId,
    requestBody: { ranges },
  })
}

function snapshotToValues(rows: StockProjectionSnapshot['productoTerminado']): (string | number)[][] {
  return rows.map((row) => [row.producto, row.lote, row.total])
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
  const range = `${sheetName}!${prefix}${HEADER_ROW}:${columnLetter(prefix.charCodeAt(0) - 65 + 2)}${HEADER_ROW + values.length - 1}`
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

  let sheetEnsured = false

  return {
    async writeSnapshot(snapshot: StockProjectionSnapshot): Promise<void> {
      const sheets = await getSheets()
      if (!sheetEnsured) {
        await ensureSheet(sheets, spreadsheetId, sheetName)
        sheetEnsured = true
      }
      await clearAdminRanges(sheets, spreadsheetId, sheetName)
      await writeTable(sheets, spreadsheetId, sheetName, DEPOSITO_RANGE_PREFIX, DEPOSITO_HEADER, snapshot.productoTerminado)
      await writeTable(sheets, spreadsheetId, sheetName, ACONDICIONADO_RANGE_PREFIX, ACONDICIONADO_HEADER, snapshot.sinAcondicionar)
    },
  }
}
