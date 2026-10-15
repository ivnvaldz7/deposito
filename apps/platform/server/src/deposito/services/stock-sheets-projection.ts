import { Mercado, type PrismaClient } from '@platform/db'
import { google, type sheets_v4 } from 'googleapis'
import { readFile } from 'node:fs/promises'
import { validateSheetConfig } from '../../routes/ale-bet/stock-projection/sheet-adapter'

type MercadoStockRow = { articulo: string; mercado: Mercado; cantidad: number }
type FrascoStockRow = { articulo: string; cantidadCajas: number; unidadesPorCaja: number; total: number }

export type DepositoStockSheetsSnapshot = {
  estuches: MercadoStockRow[]
  etiquetas: MercadoStockRow[]
  frascos: FrascoStockRow[]
}

const SHEETS = {
  estuches: 'ESTUCHES',
  etiquetas: 'ETIQUETAS',
  frascos: 'FRASCO',
} as const

const MERCADOS_EN_ORDEN: Mercado[] = [
  Mercado.argentina,
  Mercado.colombia,
  Mercado.no_exportable,
  Mercado.mexico,
  Mercado.ecuador,
  Mercado.bolivia,
  Mercado.paraguay,
  Mercado.VENEZUELA,
]

const MARKET_LABEL: Record<Mercado, string> = {
  argentina: 'LOCAL',
  colombia: 'COLOMBIA',
  mexico: 'MÉXICO',
  ecuador: 'ECUADOR',
  bolivia: 'BOLIVIA',
  paraguay: 'PARAGUAY',
  VENEZUELA: 'VENEZUELA',
  no_exportable: 'NO EXPORTABLE',
}

function inventoryKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/(\d)\s+(ML|L|GR|G)\b/giu, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('es-AR')
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

function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`
}

/**
 * Reads the same canonical inventory that Depósito shows in its screens.
 * Products without an inventory row are deliberately included at zero: Sheets
 * is a consultation projection, not a second source of truth.
 */
export async function buildDepositoStockSheetsSnapshot(db: PrismaClient): Promise<DepositoStockSheetsSnapshot> {
  const [productos, estuches, etiquetas, frascos] = await Promise.all([
    db.depositoProducto.findMany({
      where: { categoria: { in: ['estuche', 'etiqueta', 'frasco'] }, activo: true },
      orderBy: { nombreCompleto: 'asc' },
      select: { id: true, nombreCompleto: true, categoria: true, mercado: true, mercadosHabilitados: true, presentacion: true },
    }),
    db.inventarioEstuche.findMany({ select: { productoId: true, articulo: true, mercado: true, cantidad: true } }),
    db.inventarioEtiqueta.findMany({ select: { productoId: true, articulo: true, mercado: true, cantidad: true } }),
    db.inventarioFrasco.findMany({ select: { productoId: true, articulo: true, cantidadCajas: true, unidadesPorCaja: true, total: true } }),
  ])

  const estucheByProductMarket = new Map(estuches.filter((row) => row.productoId).map((row) => [`${row.productoId}:${row.mercado}`, row]))
  const etiquetaByProductMarket = new Map(etiquetas.filter((row) => row.productoId).map((row) => [`${row.productoId}:${row.mercado}`, row]))
  const frascoByProduct = new Map(frascos.filter((row) => row.productoId).map((row) => [row.productoId!, row]))

  const mercadoRows = (categoria: 'estuche' | 'etiqueta') => productos
    .filter((producto) => producto.categoria === categoria)
    .flatMap((producto) => {
      const mercados = producto.mercadosHabilitados.length > 0
        ? producto.mercadosHabilitados
        : producto.mercado ? [producto.mercado] : []
      const index = categoria === 'estuche' ? estucheByProductMarket : etiquetaByProductMarket
      return mercados.map((mercado) => {
        const inventory = index.get(`${producto.id}:${mercado}`)
        return { articulo: inventory?.articulo ?? producto.nombreCompleto, mercado, cantidad: inventory?.cantidad ?? 0 }
      })
    })
    .sort((a, b) => a.mercado.localeCompare(b.mercado) || a.articulo.localeCompare(b.articulo, 'es'))

  return {
    estuches: mercadoRows('estuche'),
    etiquetas: mercadoRows('etiqueta'),
    frascos: productos
      .filter((producto) => producto.categoria === 'frasco')
      .map((producto) => {
        const inventory = frascoByProduct.get(producto.id)
        const unidadesPorCaja = inventory?.unidadesPorCaja ?? producto.presentacion ?? 1
        return {
          articulo: inventory?.articulo ?? producto.nombreCompleto,
          cantidadCajas: inventory?.cantidadCajas ?? 0,
          unidadesPorCaja,
          total: inventory?.total ?? 0,
        }
      })
      .sort((a, b) => a.articulo.localeCompare(b.articulo, 'es')),
  }
}

async function ensureManagedSheet(sheets: sheets_v4.Sheets, spreadsheetId: string, baseName: string): Promise<string> {
  const nextTitle = `${baseName} ${formatTabDate(new Date())}`
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
  const matches = spreadsheet.data.sheets?.filter((sheet) => {
    const title = sheet.properties?.title
    return title != null && isManagedSheetTitle(title, baseName)
  }) ?? []
  if (matches.length > 1) throw new Error(`Hay más de una solapa administrada para ${baseName}`)

  const existing = matches[0]?.properties
  if (existing?.sheetId !== undefined) {
    if (existing.title !== nextTitle) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId: existing.sheetId, title: nextTitle }, fields: 'title' } }] },
      })
    }
    return nextTitle
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: nextTitle } } }] },
  })
  return nextTitle
}

type MarketBlock = {
  range: string
  values: (string | number)[][]
  startRow: number
  startColumnIndex: number
}

function marketBlocks(rows: MercadoStockRow[], kind: 'ESTUCHES' | 'ETIQUETAS'): MarketBlock[] {
  const starts = ['A', 'D', 'G']
  const startColumns = [0, 3, 6]
  const heights = [1, 1, 1]
  return MERCADOS_EN_ORDEN.flatMap((mercado, index) => {
    const column = index < 3 ? index : (index - 3) % 3
    const startRow = heights[column]
    const entries = rows.filter((row) => row.mercado === mercado)
    // Do not invent empty country sections. A market is listed when the
    // catalogue currently has at least one enabled item for it.
    if (entries.length === 0) return []
    const values: (string | number)[][] = [
      [`${kind} · ${MARKET_LABEL[mercado]}`, 'STOCK'],
      ['ARTÍCULO', 'CANTIDAD'],
      ...entries.map((row) => [row.articulo, row.cantidad]),
    ]
    heights[column] += values.length + 2
    return [{ range: `${starts[column]}${startRow}`, values, startRow, startColumnIndex: startColumns[column] }]
  })
}

async function getSheetId(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string): Promise<number | undefined> {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
  const sheet = spreadsheet.data.sheets?.find((entry) => entry.properties?.title === sheetName)
  return sheet?.properties?.sheetId ?? undefined
}

const DARK_GREEN = { red: 0.0, green: 0.45, blue: 0.32 }
const GREEN = { red: 0.0, green: 0.62, blue: 0.44 }
const GRID = { red: 0.84, green: 0.87, blue: 0.85 }

async function resetMarketInventoryFormatting(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string): Promise<number | undefined> {
  const sheetId = await getSheetId(sheets, spreadsheetId, sheetName)
  if (sheetId === undefined) return undefined
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 2000, startColumnIndex: 0, endColumnIndex: 9 }, cell: { userEnteredFormat: {} }, fields: 'userEnteredFormat' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 230 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 24 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 230 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 24 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 230 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 24 }, fields: 'pixelSize' } },
      ],
    },
  })
  return sheetId
}

async function applyMarketInventoryFormatting(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number,
  blocks: MarketBlock[],
): Promise<void> {
  const requests: sheets_v4.Schema$Request[] = []
  for (const block of blocks) {
    const titleRow = block.startRow - 1
    const headerRow = titleRow + 1
    const dataEndRow = titleRow + block.values.length
    const baseRange = { sheetId, startColumnIndex: block.startColumnIndex, endColumnIndex: block.startColumnIndex + 2 }
    requests.push(
      { repeatCell: { range: { ...baseRange, startRowIndex: titleRow, endRowIndex: titleRow + 1 }, cell: { userEnteredFormat: { backgroundColorStyle: { rgbColor: DARK_GREEN }, textFormat: { bold: true, foregroundColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } } }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColorStyle,textFormat,verticalAlignment)' } },
      { repeatCell: { range: { ...baseRange, startRowIndex: headerRow, endRowIndex: headerRow + 1 }, cell: { userEnteredFormat: { backgroundColorStyle: { rgbColor: GREEN }, textFormat: { bold: true, foregroundColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } } }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColorStyle,textFormat,horizontalAlignment,verticalAlignment)' } },
      { repeatCell: { range: { ...baseRange, startRowIndex: headerRow + 1, endRowIndex: dataEndRow }, cell: { userEnteredFormat: { borders: { bottom: { style: 'SOLID', colorStyle: { rgbColor: GRID } } }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(borders,verticalAlignment)' } },
      { repeatCell: { range: { sheetId, startRowIndex: headerRow + 1, endRowIndex: dataEndRow, startColumnIndex: block.startColumnIndex + 1, endColumnIndex: block.startColumnIndex + 2 }, cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat.horizontalAlignment' } },
    )
  }
  if (requests.length > 0) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
}

async function writeMarketInventorySheet(sheets: sheets_v4.Sheets, spreadsheetId: string, baseName: string, kind: 'ESTUCHES' | 'ETIQUETAS', rows: MercadoStockRow[]): Promise<void> {
  const sheetName = await ensureManagedSheet(sheets, spreadsheetId, baseName)
  const quoted = quoteSheetName(sheetName)
  await sheets.spreadsheets.values.batchClear({ spreadsheetId, requestBody: { ranges: [`${quoted}!A1:I2000`] } })
  const blocks = marketBlocks(rows, kind)
  const sheetId = await resetMarketInventoryFormatting(sheets, spreadsheetId, sheetName)
  if (blocks.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: blocks.map((block) => ({ range: `${quoted}!${block.range}`, values: block.values })) },
    })
  }
  if (sheetId !== undefined) await applyMarketInventoryFormatting(sheets, spreadsheetId, sheetId, blocks)
}

async function writeFrascoInventorySheet(sheets: sheets_v4.Sheets, spreadsheetId: string, rows: FrascoStockRow[]): Promise<void> {
  const sheetName = await ensureManagedSheet(sheets, spreadsheetId, SHEETS.frascos)
  const quoted = quoteSheetName(sheetName)
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoted}!A1:D2000`,
    valueRenderOption: 'FORMULA',
  })
  const current = existing.data.values ?? []

  // FRASCO deliberately retains its B and D columns: B is the controlled
  // "unidades por caja" master data and D is a protected spreadsheet formula
  // (B × C).  Updating only names and C keeps that protection and its formula
  // intact while making the stock value a live projection from the app.
  if (current.length > 1) {
    const existingRows = new Map<string, { rowNumber: number; unidadesPorCaja: number }>()
    current.slice(1).forEach((values, index) => {
      const articulo = values[0]
      if (typeof articulo === 'string' && articulo.trim()) {
        const unidadesPorCaja = typeof values[1] === 'number' ? values[1] : Number(values[1])
        existingRows.set(inventoryKey(articulo), { rowNumber: index + 2, unidadesPorCaja })
      }
    })
    const quantities = new Map(rows.map((row) => [inventoryKey(row.articulo), row]))
    const updates: sheets_v4.Schema$ValueRange[] = []
    for (const [articulo, existingRow] of existingRows) {
      const inventory = quantities.get(articulo)
      // Products no longer active in the application remain visible at zero;
      // this avoids leaving a misleading old total in the protected formula.
      const cantidad = inventory && Number.isFinite(existingRow.unidadesPorCaja) && existingRow.unidadesPorCaja > 0
        ? inventory.total / existingRow.unidadesPorCaja
        : 0
      updates.push({ range: `${quoted}!C${existingRow.rowNumber}`, values: [[cantidad]] })
      if (inventory) updates.push({ range: `${quoted}!A${existingRow.rowNumber}`, values: [[inventory.articulo]] })
      quantities.delete(articulo)
    }
    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data: updates } })
    }
    if (quantities.size > 0) {
      console.warn(`[deposito-stock-sheets] ${quantities.size} frasco(s) no se sincronizaron porque no existen en la plantilla protegida de FRASCO`)
    }
    return
  }

  // Only a recovery sheet created after an accidental tab deletion has no
  // protected formulas. In that case write a complete, usable base table.
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoted}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [
      ['ARTÍCULO', 'FRASCOS', 'CANTIDAD', 'TOTAL'],
      ...rows.map((row) => [row.articulo, row.unidadesPorCaja, row.cantidadCajas, row.total]),
    ] },
  })
  const sheetId = await getSheetId(sheets, spreadsheetId, sheetName)
  if (sheetId !== undefined) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [
        { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 }, cell: { userEnteredFormat: { backgroundColorStyle: { rgbColor: DARK_GREEN }, textFormat: { bold: true, foregroundColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } } }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColorStyle,textFormat,horizontalAlignment)' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 230 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 4 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } },
      ] },
    })
  }
}

let sheetsClient: sheets_v4.Sheets | undefined

async function getSheetsClient(serviceAccountFile: string): Promise<sheets_v4.Sheets> {
  if (sheetsClient) return sheetsClient
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(await readFile(serviceAccountFile, 'utf8')),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  sheetsClient = google.sheets({ version: 'v4', auth })
  return sheetsClient
}

export async function syncDepositoStockSheetsNow(db: PrismaClient): Promise<'DISABLED' | 'SYNCED'> {
  const config = validateSheetConfig(process.env)
  if (!config.enabled) return 'DISABLED'
  const [snapshot, sheets] = await Promise.all([
    buildDepositoStockSheetsSnapshot(db),
    getSheetsClient(config.serviceAccountFile!),
  ])
  await writeMarketInventorySheet(sheets, config.spreadsheetId!, SHEETS.estuches, 'ESTUCHES', snapshot.estuches)
  await writeMarketInventorySheet(sheets, config.spreadsheetId!, SHEETS.etiquetas, 'ETIQUETAS', snapshot.etiquetas)
  await writeFrascoInventorySheet(sheets, config.spreadsheetId!, snapshot.frascos)
  return 'SYNCED'
}

let pendingSync: Promise<void> = Promise.resolve()

/** Starts a serialized, non-blocking projection only after a DB commit. */
export function syncDepositoStockSheetsAfterCommit(): Promise<void> {
  pendingSync = pendingSync
    .catch(() => undefined)
    .then(async () => {
      try {
        const { prisma } = await import('../lib/prisma')
        const result = await syncDepositoStockSheetsNow(prisma)
        if (result === 'SYNCED') console.info('[deposito-stock-sheets] Proyección actualizada')
      } catch (error) {
        console.error('[deposito-stock-sheets] No se pudo actualizar Google Sheets', error)
      }
    })
  return pendingSync
}
