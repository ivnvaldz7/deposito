import 'dotenv/config'

import { platformDb } from '@platform/db'
import { createHash } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import { google } from 'googleapis'
import { createGoogleSheetsAdapter } from '../routes/ale-bet/stock-projection/google-sheets-adapter'
import { validateSheetConfig } from '../routes/ale-bet/stock-projection/sheet-adapter'
import { buildCurrentStockProjectionSnapshot } from '../routes/ale-bet/stock-projection/snapshot-repository'

type Cell = string | number | boolean | null
type Stage = 'CONFIG' | 'AUTH' | 'SPREADSHEET ACCESS' | 'SHEET' | 'SNAPSHOT' | 'WRITE' | 'COMPARISON'

function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`
}

function trimTrailingEmptyCells(row: readonly Cell[]): Cell[] {
  const trimmed = [...row]
  while (trimmed.length > 0 && (trimmed.at(-1) === '' || trimmed.at(-1) === null)) {
    trimmed.pop()
  }
  return trimmed
}

function normalizeRows(rows: Cell[][] | null | undefined): Cell[][] {
  return (rows ?? []).map(trimTrailingEmptyCells)
}

function equalRows(actual: Cell[][], expected: Cell[][]): boolean {
  return JSON.stringify(normalizeRows(actual)) === JSON.stringify(normalizeRows(expected))
}

function fingerprint(value: Cell[][][]): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
}

function isRecord(value: object | null): value is Record<string, object | string | number | boolean | null | undefined> {
  return value !== null
}

function errorDetails(error: object): { code?: number; message: string } {
  if (!isRecord(error)) return { message: '' }
  const code = typeof error.code === 'number' ? error.code : undefined
  const message = typeof error.message === 'string' ? error.message : ''
  return { code, message }
}

function classifyError(stage: Stage, error: object): string {
  const { code, message } = errorDetails(error)
  const normalized = message.toLowerCase()

  if (stage === 'CONFIG') return 'CONFIG'
  if (stage === 'AUTH' || normalized.includes('invalid_grant') || normalized.includes('invalid jwt')) return 'AUTH'
  if (code === 404) return 'SPREADSHEET_NOT_FOUND'
  if (code === 403 && (normalized.includes('disabled') || normalized.includes('not been used'))) return 'API_DISABLED'
  if (code === 401) return 'AUTH'
  if (code === 403) return 'PERMISSION'
  if (stage === 'SHEET') return 'SHEET'
  if (normalized.includes('network') || normalized.includes('enotfound') || normalized.includes('econnreset')) return 'NETWORK'
  return 'OTHER'
}

async function main(): Promise<void> {
  let stage: Stage = 'CONFIG'

  try {
    const config = validateSheetConfig(process.env)
    if (!config.enabled) throw new Error('Google Sheets está deshabilitado')

    const { spreadsheetId, sheetName, serviceAccountFile } = config
    const credentialPath = isAbsolute(serviceAccountFile)
      ? serviceAccountFile
      : resolve(process.cwd(), serviceAccountFile)
    console.log('CONFIG: PASS')

    stage = 'AUTH'
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    await auth.getClient()
    console.log('AUTH: PASS')

    const sheets = google.sheets({ version: 'v4', auth })
    stage = 'SPREADSHEET ACCESS'
    const before = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties',
    })
    console.log('SPREADSHEET ACCESS: PASS')

    const existed = before.data.sheets?.some((sheet) => sheet.properties?.title === sheetName) ?? false

    stage = 'SNAPSHOT'
    const snapshot = await buildCurrentStockProjectionSnapshot(platformDb)
    console.log('SNAPSHOT: PASS')
    console.log(`Producto Terminado: ${snapshot.productoTerminado.length} filas`)
    console.log(`Sin Acondicionar: ${snapshot.sinAcondicionar.length} filas`)

    stage = 'WRITE'
    const adapter = createGoogleSheetsAdapter({ ...config, serviceAccountFile: credentialPath })
    await adapter.writeSnapshot(snapshot)
    console.log('WRITE: PASS')

    stage = 'SHEET'
    const after = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties',
    })
    const nowExists = after.data.sheets?.some((sheet) => sheet.properties?.title === sheetName) ?? false
    if (!nowExists) throw new Error('La solapa configurada no existe después de la escritura')
    console.log(`SHEET: ${existed ? 'REUSED' : 'CREATED'}`)

    stage = 'COMPARISON'
    const quotedSheet = quoteSheetName(sheetName)
    const leftEndRow = Math.max(2, snapshot.productoTerminado.length + 2)
    const rightEndRow = Math.max(2, snapshot.sinAcondicionar.length + 2)
    const readback = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: [
        `${quotedSheet}!A1:C${leftEndRow}`,
        `${quotedSheet}!E1:G${rightEndRow}`,
      ],
      valueRenderOption: 'UNFORMATTED_VALUE',
    })

    const expectedLeft: Cell[][] = [
      ['PRODUCTO TERMINADO', '', ''],
      ['PRODUCTO', 'LOTE', 'TOTAL'],
      ...snapshot.productoTerminado.map((row) => [row.producto, row.lote, row.total]),
    ]
    const expectedRight: Cell[][] = [
      ['SIN ACONDICIONAR', '', ''],
      ['PRODUCTO', 'LOTE', 'TOTAL'],
      ...snapshot.sinAcondicionar.map((row) => [row.producto, row.lote, row.total]),
    ]
    const actualLeft = normalizeRows(readback.data.valueRanges?.[0]?.values)
    const actualRight = normalizeRows(readback.data.valueRanges?.[1]?.values)
    const totalsAreNumeric = [...actualLeft.slice(2), ...actualRight.slice(2)]
      .every((row) => typeof row[2] === 'number')

    if (!equalRows(actualLeft, expectedLeft) || !equalRows(actualRight, expectedRight) || !totalsAreNumeric) {
      throw new Error('La lectura de Google no coincide con el snapshot')
    }

    console.log('COMPARISON: PASS')
    console.log(`CONTENT FINGERPRINT: ${fingerprint([actualLeft, actualRight])}`)
  } catch (error) {
    const safeError = error instanceof Error ? error : new Error('Error no identificable')
    console.log(`${stage}: FAIL`)
    console.log(`ERROR CATEGORY: ${classifyError(stage, safeError)}`)
    process.exitCode = 1
  } finally {
    await platformDb.$disconnect()
  }
}

void main()
