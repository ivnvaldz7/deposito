import { google, type sheets_v4 } from 'googleapis'
import { readFile } from 'node:fs/promises'
import type { StockProjectionSnapshot } from './snapshot'
import type { StockProjectionSheetAdapter, StockProjectionSheetConfig } from './sheet-adapter'

const DEPOSITO_RANGE_PREFIX = 'A'
const ACONDICIONADO_RANGE_PREFIX = 'H'
// Las primeras siete filas contienen controles y encabezados de la planilla.
const DATA_START_ROW = 8
const MAX_DATA_ROWS = 997

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
  if (existing?.properties?.sheetId == null) {
    throw new Error(`No existe la solapa administrada ${baseName}; no se creará una hoja sin sus controles`)
  }
  const grid = existing.properties.gridProperties
  if ((grid?.rowCount ?? 0) < DATA_START_ROW + MAX_DATA_ROWS - 1 || (grid?.columnCount ?? 0) < 12) {
    throw new Error('La solapa no tiene el espacio necesario para las tablas de stock')
  }
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

function snapshotToValues(rows: StockProjectionSnapshot['productoTerminado']): (string | number)[][] {
  return rows.map((row) => [row.producto, row.lote, row.vencimiento ?? 'SIN VTO', row.total, row.actualizadoEn ?? ''])
}

function tableValues(rows: StockProjectionSnapshot['productoTerminado']): (string | number)[][] {
  const values = snapshotToValues(rows)
  return Array.from({ length: MAX_DATA_ROWS }, (_, index) => values[index] ?? ['', '', '', '', ''])
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
      if (snapshot.productoTerminado.length > MAX_DATA_ROWS || snapshot.sinAcondicionar.length > MAX_DATA_ROWS) {
        throw new Error('El stock excede el espacio disponible en la planilla')
      }
      const sheets = await getSheets()
      const currentSheetName = await ensureSheet(sheets, spreadsheetId, sheetName)
      const quotedSheet = `'${currentSheetName.replace(/'/g, "''")}'`
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            { range: `${quotedSheet}!${buildClearRange(DEPOSITO_RANGE_PREFIX)}`, values: tableValues(snapshot.productoTerminado) },
            { range: `${quotedSheet}!${buildClearRange(ACONDICIONADO_RANGE_PREFIX)}`, values: tableValues(snapshot.sinAcondicionar) },
          ],
        },
      })
    },
  }
}
