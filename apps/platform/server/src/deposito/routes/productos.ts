import { Categoria, EstadoProductoCatalogo, Mercado, Prisma } from '@platform/db'
import { Request, Response, Router } from 'express'
import multer from 'multer'
import ExcelJS from 'exceljs'
// SheetJS CE (xlsx) is used ONLY for legacy BIFF .xls files, which ExcelJS
// cannot read. It is the only mature npm package that supports them; it is
// used strictly read-only and the existing 5 MB upload limit bounds the
// attack surface of its known parser CVEs.
import * as XLSX from 'xlsx'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/require-role'
import { CatalogoError, CatalogoProductoService, isMarketCategory, normalizeCodigo, validateCatalogoInput } from '../services/catalogo-producto-service'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })
const service = new CatalogoProductoService(prisma)
const categorias = Object.values(Categoria) as [Categoria, ...Categoria[]]
const mercados = Object.values(Mercado) as [Mercado, ...Mercado[]]
const estados = Object.values(EstadoProductoCatalogo) as [EstadoProductoCatalogo, ...EstadoProductoCatalogo[]]

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

// ─── Import header recognition ────────────────────────────────────────────────
// Headers are normalized once in parseImport (trim + uppercase + collapse
// repeated spaces). coerceImportRow maps normalized headers to canonical
// fields through this dictionary, so CSV/XLSX/XLS files accept e.g.
// 'CODIGO ARTICULO' and 'CODIGO' for codigo, case-insensitive and
// space-tolerant. The camelCase forms are the canonical JSON payload keys.
const HEADER_ALIASES: Readonly<Record<string, string>> = {
  CODIGO: 'codigo',
  'CODIGO ARTICULO': 'codigo',
  CODIGOARTICULO: 'codigo',
  NOMBRE: 'nombre',
  'NOMBRE ARTICULO': 'nombre',
  NOMBREARTICULO: 'nombre',
  'NOMBRE COMPLETO': 'nombreCompleto',
  NOMBRECOMPLETO: 'nombreCompleto',
  NOMBREBASE: 'nombreBase',
  'NOMBRE BASE': 'nombreBase',
  CATEGORIA: 'categoria',
  'MERCADOS HABILITADOS': 'mercadosHabilitados',
  MERCADOSHABILITADOS: 'mercadosHabilitados',
  MERCADOS: 'mercados',
  PRESENTACION: 'presentacion',
  VOLUMEN: 'volumen',
  UNIDAD: 'unidad',
  VARIANTE: 'variante',
}

function normalizeHeader(value: string) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

function canonicalValue(row: Record<string, unknown>, field: string): unknown {
  for (const [key, value] of Object.entries(row)) {
    if (HEADER_ALIASES[normalizeHeader(key)] === field) return value
  }
  return undefined
}

const ERROR_UNSUPPORTED_EXTENSION = 'Solo se aceptan archivos .xls, .xlsx o .csv'
const ERROR_EMPTY_FILE = 'El archivo está vacío'
const ERROR_CORRUPT_EXCEL = 'El archivo está corrupto o no es un archivo Excel válido'
const ERROR_UNKNOWN_COLUMNS = 'No se reconocen las columnas del archivo. Columnas esperadas: CODIGO, NOMBRE, NOMBRE COMPLETO, CATEGORIA, MERCADOS, PRESENTACION, VOLUMEN, UNIDAD, VARIANTE.'
const ERROR_AMBIGUOUS_CATEGORY = 'No se pudo determinar la categoría automáticamente. Los códigos deben comenzar con ENV o se debe incluir la columna CATEGORIA.'

const optionalText = z.string().trim().max(100).nullable().optional().transform((value) => {
  if (value === undefined) return undefined
  return value ? normalizeName(value) : null
})
const positivePresentation = z.number().int().positive()
const commonCatalogSchema = z.object({
  nombreBase: z.string().trim().min(2).max(100).transform(normalizeName),
  nombreCompleto: z.string().trim().min(2).max(200).transform(normalizeName),
  volumen: z.number().positive().nullable().optional(),
  unidad: optionalText,
  variante: optionalText,
})
const baseSchema = z.discriminatedUnion('categoria', [
  commonCatalogSchema.extend({
    categoria: z.literal('etiqueta'),
    codigo: z.string().trim().min(1).max(100)
      .transform((value) => value.toUpperCase())
      .refine((value) => value.startsWith('IGET'), 'El código de etiqueta debe comenzar con IGET'),
    presentacion: positivePresentation,
    mercadosHabilitados: z.array(z.enum(mercados)).min(1),
  }),
  commonCatalogSchema.extend({
    categoria: z.literal('estuche'),
    codigo: z.string().trim().min(1).max(100)
      .transform((value) => value.toUpperCase())
      .refine((value) => value.startsWith('IGES'), 'El código de estuche debe comenzar con IGES'),
    presentacion: positivePresentation,
    mercadosHabilitados: z.array(z.enum(mercados)).min(1),
  }),
  commonCatalogSchema.extend({
    categoria: z.literal('frasco'),
    codigo: z.string().trim().max(100).nullable().optional().transform(v => v || null),
    presentacion: positivePresentation.nullable().optional(),
    mercadosHabilitados: z.array(z.enum(mercados)).max(0).optional().default([]),
  }),
  commonCatalogSchema.extend({
    categoria: z.literal('droga'),
    codigo: z.string().trim().max(100).nullable().optional().transform(v => v || null),
    presentacion: positivePresentation.nullable().optional(),
    mercadosHabilitados: z.array(z.enum(mercados)).max(0).optional().default([]),
  }),
])
const editSchema = z.object({
  nombreBase: z.string().trim().min(2).max(100).transform(normalizeName).optional(),
  nombreCompleto: z.string().trim().min(2).max(200).transform(normalizeName).optional(),
  codigo: z.string().trim().min(1).max(100).nullable().optional(),
  categoria: z.enum(categorias).optional(),
  presentacion: positivePresentation.nullable().optional(),
  mercadosHabilitados: z.array(z.enum(mercados)).optional(),
  volumen: z.number().positive().nullable().optional(),
  unidad: optionalText,
  variante: optionalText,
}).refine((value) => Object.keys(value).length > 0, 'Al menos un campo es requerido')
const importPayloadSchema = z.object({ archivoBase64: z.string().min(1), nombreArchivo: z.string().min(1).max(200) })

type CatalogoRow = z.infer<typeof baseSchema>
type ImportResult = { fila: number; valido: boolean; errores?: unknown; producto?: CatalogoRow }

function toCreateInput(value: CatalogoRow) {
  return { ...value, codigo: normalizeCodigo(value.codigo), volumen: value.volumen == null ? null : new Prisma.Decimal(value.volumen) }
}

function sendError(res: Response, error: unknown) {
  if (error instanceof CatalogoError) {
    if (error.code === 'CONFLICT') res.status(409).json({ message: error.message })
    else if (error.code === 'NOT_FOUND') res.status(404).json({ message: error.message })
    else res.status(400).json({ message: error.message })
    return
  }
  if (error instanceof Error) {
    res.status(400).json({ message: error.message })
    return
  }
  res.status(500).json({ message: 'Error interno del servidor' })
}


function parseCsvRecords(csv: string): Array<Record<string, string>> {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
      continue
    }
    if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field)
      if (row.some((value) => value.trim().length > 0)) rows.push(row)
      row = []
      field = ''
    } else if (character !== '\r') {
      field += character
    }
  }
  if (quoted) throw new Error('CSV inválido: comillas sin cerrar')
  row.push(field)
  if (row.some((value) => value.trim().length > 0)) rows.push(row)
  const [header, ...data] = rows
  if (!header) return []
  const keys = header.map((key) => normalizeHeader(key))
  return data.map((values) => Object.fromEntries(keys.map((key, index) => [key, values[index]?.trim() ?? ''])))
}

async function parseImport(bytes: Buffer, fileName: string) {
  const name = fileName.toLowerCase()
  if (bytes.length === 0) throw new Error(ERROR_EMPTY_FILE)
  const rows: Array<Record<string, unknown>> = []
  if (name.endsWith('.csv')) {
    rows.push(...parseCsvRecords(bytes.toString('utf8')))
  } else if (name.endsWith('.xlsx')) {
    let book: ExcelJS.Workbook
    try {
      book = new ExcelJS.Workbook()
      await Reflect.apply(book.xlsx.load, book.xlsx, [bytes])
    } catch {
      throw new Error(ERROR_CORRUPT_EXCEL)
    }
    const sheet = book.worksheets[0]
    if (!sheet) throw new Error(ERROR_CORRUPT_EXCEL)
    const headerRow = sheet.getRow(1)
    const header = Array.from({ length: headerRow.cellCount }, (_, column) => normalizeHeader(String(headerRow.getCell(column + 1).value ?? '')))
    sheet.eachRow((row, index) => {
      if (index === 1) return
      rows.push(Object.fromEntries(header.map((key, column) => [key, row.getCell(column + 1).value])))
    })
  } else if (name.endsWith('.xls')) {
    // Legacy BIFF `.xls` files cannot be read by ExcelJS. SheetJS CE is the
    // only mature npm package that reads them; see the import comment at the
    // top of this file for the read-only + 5 MB limit mitigation rationale.
    let matrix: unknown[][]
    try {
      const book = XLSX.read(bytes, { type: 'buffer' })
      const sheet = book.Sheets[book.SheetNames[0]]
      if (!sheet) throw new Error(ERROR_CORRUPT_EXCEL)
      matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][]
    } catch (error) {
      if (error instanceof Error && error.message === ERROR_CORRUPT_EXCEL) throw error
      throw new Error(ERROR_CORRUPT_EXCEL)
    }
    if (matrix.length === 0) throw new Error(ERROR_CORRUPT_EXCEL)
    const header = (matrix[0] ?? []).map((cell) => normalizeHeader(String(cell ?? '')))
    rows.push(...matrix.slice(1).map((values) => Object.fromEntries(header.map((key, column) => [key, values[column]]))))
  } else {
    throw new Error(ERROR_UNSUPPORTED_EXTENSION)
  }
  return annotateImportRows(rows)
}

function annotateImportRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  if (rows.length === 0) return rows
  const headerKeys = Object.keys(rows[0])
  const hasKnownColumn = headerKeys.some((key) => HEADER_ALIASES[normalizeHeader(key)] !== undefined)
  if (!hasKnownColumn) throw new Error(ERROR_UNKNOWN_COLUMNS)
  const hasCategoriaColumn = headerKeys.some((key) => HEADER_ALIASES[normalizeHeader(key)] === 'categoria')
  // Legacy supplier lists (exactly CODIGO ARTICULO + NOMBRE ARTICULO, no
  // CATEGORIA column) where ALL non-empty codes start with ENV are
  // interpreted as FRASCO. This is SCOPED to this legacy format detected
  // during import — it is NOT a global business rule. Ambiguous files (no
  // category column and codes that are not all ENV) are rejected with a
  // descriptive dry-run error instead of inventing a category. FRASCO
  // presentation is allowed to be null during import (PENDIENTE_REVISION),
  // and the encargado reviews/edits them before activation.
  if (!hasCategoriaColumn) {
    const codes = rows
      .map((row) => String(canonicalValue(row, 'codigo') ?? '').trim())
      .filter((code) => code.length > 0)
    const allEnv = codes.length > 0 && codes.every((code) => code.toUpperCase().startsWith('ENV'))
    if (!allEnv) throw new Error(ERROR_AMBIGUOUS_CATEGORY)
    for (const row of rows) {
      row['CATEGORIA'] = 'frasco'
    }
  }
  return rows
}

function coerceImportRow(row: Record<string, unknown>) {
  const get = (field: string) => canonicalValue(row, field)
  const marketsRaw = String(get('mercadosHabilitados') ?? get('mercados') ?? '')
  return {
    nombreBase: String(get('nombreBase') ?? get('nombre') ?? ''),
    nombreCompleto: String(get('nombreCompleto') ?? get('nombre') ?? ''),
    categoria: String(get('categoria') ?? '').toLowerCase(),
    codigo: String(get('codigo') ?? ''),
    presentacion: get('presentacion') === '' || get('presentacion') == null ? undefined : Number(get('presentacion')),
    mercadosHabilitados: marketsRaw ? marketsRaw.split('|').map((market) => market.trim()) : [],
    volumen: get('volumen') === '' || get('volumen') == null ? undefined : Number(get('volumen')),
    unidad: get('unidad') == null ? undefined : String(get('unidad')),
    variante: get('variante') == null ? undefined : String(get('variante')),
  }
}


function validateImportRows(rows: unknown[]): ImportResult[] {
  const codes = new Set<string>()
  return rows.map((raw, index) => {
    const parsed = baseSchema.safeParse(coerceImportRow(raw as Record<string, unknown>))
    if (!parsed.success) return { fila: index + 2, valido: false, errores: parsed.error.flatten() }
    // S1 cleanup: for etiqueta/estuche the schema above already enforces a
    // non-empty codigo (min 1) and the IGET/IGES prefix via refine, so the
    // friendly Spanish messages surface from parsed.error.flatten(). The old
    // flat branches for "código obligatorio" and prefix checks were unreachable.
    const codigo = normalizeCodigo(parsed.data.codigo)
    try {
      validateCatalogoInput({
        categoria: parsed.data.categoria,
        codigo,
        mercadosHabilitados: parsed.data.mercadosHabilitados,
        presentacion: parsed.data.presentacion,
        estado: 'PENDIENTE_REVISION',
      })
    } catch (error) {
      return { fila: index + 2, valido: false, errores: { categoria: [error instanceof Error ? error.message : 'Categoría inválida'] } }
    }
    if (codigo) {
      const duplicateInFile = codes.has(codigo)
      codes.add(codigo)
      if (duplicateInFile) {
        return { fila: index + 2, valido: false, errores: { codigo: ['Código duplicado dentro del archivo'] }, producto: parsed.data }
      }
    }
    return { fila: index + 2, valido: true, producto: parsed.data }
  })
}

async function validateImportAgainstCatalog(rows: unknown[]): Promise<ImportResult[]> {
  const result = validateImportRows(rows)
  const validCodes = result
    .filter((row) => row.valido && row.producto)
    .map((row) => normalizeCodigo(row.producto!.codigo))
    .filter((codigo): codigo is string => codigo !== null)
  const existing = validCodes.length
    ? await prisma.depositoProducto.findMany({ where: { codigo: { in: validCodes } }, select: { codigo: true } })
    : []
  
  const validProducts = result.filter((row) => row.valido && row.producto).map(r => r.producto!)
  const existingNames = validProducts.length
    ? await prisma.depositoProducto.findMany({
        where: { OR: validProducts.map(p => ({ nombreCompleto: p.nombreCompleto, categoria: p.categoria })) },
        select: { nombreCompleto: true, categoria: true }
      })
    : []

  const existingCodes = new Set(existing.map((item) => item.codigo))
  const existingNamesSet = new Set(existingNames.map((item) => `${item.nombreCompleto}|${item.categoria}`))

  for (const row of result) {
    if (!row.valido || !row.producto) continue
    
    const codigo = normalizeCodigo(row.producto.codigo)
    if (codigo && existingCodes.has(codigo)) {
      row.valido = false
      row.errores = { codigo: ['Código ya existente'] }
      continue
    }
    
    if (existingNamesSet.has(`${row.producto.nombreCompleto}|${row.producto.categoria}`)) {
      row.valido = false
      row.errores = { nombreBase: ['Producto ya existente con este nombre y categoría'] }
      continue
    }
    
    if (codigo) existingCodes.add(codigo)
    existingNamesSet.add(`${row.producto.nombreCompleto}|${row.producto.categoria}`)
  }
  return result
}

function getMultipartFile(req: Request): { bytes: Buffer; fileName: string } | null {
  if (!req.file) return null
  return { bytes: req.file.buffer, fileName: req.file.originalname }
}

router.get('/', authenticate, async (req, res): Promise<void> => {
  const categoria = typeof req.query.categoria === 'string' && categorias.includes(req.query.categoria as Categoria) ? req.query.categoria as Categoria : undefined
  const estado = typeof req.query.estado === 'string' && estados.includes(req.query.estado as EstadoProductoCatalogo) ? req.query.estado as EstadoProductoCatalogo : undefined
  const buscar = typeof req.query.buscar === 'string' ? req.query.buscar.trim() : undefined
  try {
    const productos = await prisma.depositoProducto.findMany({
      where: { ...(categoria ? { categoria } : {}), ...(estado ? { estado } : {}), ...(buscar ? { OR: [{ nombreCompleto: { contains: buscar, mode: 'insensitive' } }, { codigo: { contains: buscar, mode: 'insensitive' } }] } : {}) },
      orderBy: { nombreCompleto: 'asc' },
    })
    res.json(productos)
  } catch { res.status(500).json({ message: 'Error interno del servidor' }) }
})

router.get('/:id', authenticate, async (req, res): Promise<void> => {
  const producto = await prisma.depositoProducto.findUnique({ where: { id: String(req.params.id) }, include: { auditoriasCatalogo: { orderBy: { createdAt: 'desc' } } } })
  if (!producto) { res.status(404).json({ message: 'Producto no encontrado' }); return }
  res.json(producto)
})

router.post('/', authenticate, requireRole('encargado'), async (req, res): Promise<void> => {
  const parsed = baseSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: 'Datos inválidos', errors: parsed.error.flatten() }); return }
  try { res.status(201).json(await service.createManual(toCreateInput(parsed.data), req.depositoUser!.id)) } catch (error) { sendError(res, error) }
})

router.patch('/:id', authenticate, requireRole('encargado'), async (req, res): Promise<void> => {
  const parsed = editSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: 'Datos inválidos', errors: parsed.error.flatten() }); return }
  const input: Parameters<CatalogoProductoService['update']>[1] = {
    ...(parsed.data.nombreBase !== undefined ? { nombreBase: parsed.data.nombreBase } : {}),
    ...(parsed.data.nombreCompleto !== undefined ? { nombreCompleto: parsed.data.nombreCompleto } : {}),
    ...(parsed.data.presentacion !== undefined ? { presentacion: parsed.data.presentacion } : {}),
    ...(parsed.data.codigo !== undefined ? { codigo: normalizeCodigo(parsed.data.codigo) } : {}),
    ...(parsed.data.categoria !== undefined ? { categoria: parsed.data.categoria } : {}),
    ...(parsed.data.mercadosHabilitados !== undefined ? { mercadosHabilitados: parsed.data.mercadosHabilitados } : {}),
    ...(parsed.data.volumen !== undefined ? { volumen: parsed.data.volumen == null ? null : new Prisma.Decimal(parsed.data.volumen) } : {}),
    ...(parsed.data.unidad !== undefined ? { unidad: parsed.data.unidad } : {}),
    ...(parsed.data.variante !== undefined ? { variante: parsed.data.variante } : {}),
  }
  try { res.json(await service.update(String(req.params.id), input, req.depositoUser!.id)) } catch (error) { sendError(res, error) }
})

router.post('/:id/activar', authenticate, requireRole('encargado'), async (req, res): Promise<void> => {
  try { res.json(await service.activate(String(req.params.id), req.depositoUser!.id)) } catch (error) { sendError(res, error) }
})
router.post('/:id/reactivar', authenticate, requireRole('encargado'), async (req, res): Promise<void> => {
  try { res.json(await service.reactivate(String(req.params.id), req.depositoUser!.id)) } catch (error) { sendError(res, error) }
})
router.post('/:id/desactivar', authenticate, requireRole('encargado'), async (req, res): Promise<void> => {
  try { res.json(await service.deactivate(String(req.params.id), req.depositoUser!.id)) } catch (error) { sendError(res, error) }
})
router.delete('/:id', authenticate, requireRole('encargado'), async (req, res): Promise<void> => {
  try { await service.deletePending(String(req.params.id)); res.status(204).send() } catch (error) { sendError(res, error) }
})

router.post('/importaciones/dry-run', authenticate, requireRole('encargado'), upload.single('archivo'), async (req, res): Promise<void> => {
  const multipart = getMultipartFile(req)
  const payload = multipart ? null : importPayloadSchema.safeParse(req.body)
  const fallback = payload?.success ? payload.data : null
  if (!multipart && !fallback) {
    res.status(400).json({ message: 'Archivo inválido', errors: payload && !payload.success ? payload.error.flatten() : undefined })
    return
  }
  const bytes = multipart?.bytes ?? Buffer.from(fallback!.archivoBase64, 'base64')
  const fileName = multipart?.fileName ?? fallback!.nombreArchivo
  try {
    const result = await validateImportAgainstCatalog(await parseImport(bytes, fileName))
    res.json({ filas: result, validas: result.filter((row) => row.valido).length, invalidas: result.filter((row) => !row.valido).length })
  } catch (error) {
    sendError(res, error)
  }
})

// Partial-import confirmation (MVP-01): invalid rows are OMITTED, only the
// valid rows are created. The ONLY blocking case is a file with zero valid
// rows. `omitidas` reports every row that did not become a product (invalid
// rows + rows skipped because their code came to exist between preview and
// confirm); `omitidasPorCarrera` isolates the race-skipped ones so the client
// can tell them apart. `productos` carries the created rows for counts.
async function confirmPendingImport(res: Response, result: ImportResult[], usuarioId: string): Promise<void> {
  const validRows = result.filter((row) => row.valido)
  const invalidas = result.length - validRows.length
  if (validRows.length === 0) {
    res.status(400).json({ message: 'No hay filas válidas para importar.', filas: result })
    return
  }
  const productos = validRows
    .map((row) => row.producto)
    .filter((producto): producto is CatalogoRow => producto !== undefined)
    .map(toCreateInput)
  const created = await service.createImportPendingBatch(productos, usuarioId)
  res.status(201).json({
    filas: result,
    importadas: created.productos.length,
    omitidas: invalidas + created.omitidosPorCarrera,
    omitidasPorCarrera: created.omitidosPorCarrera,
    total: result.length,
    productos: created.productos,
  })
}

router.post('/importaciones/confirmar', authenticate, requireRole('encargado'), upload.single('archivo'), async (req, res): Promise<void> => {
  const multipart = getMultipartFile(req)
  try {
    if (multipart) {
      const result = await validateImportAgainstCatalog(await parseImport(multipart.bytes, multipart.fileName))
      await confirmPendingImport(res, result, req.depositoUser!.id)
      return
    }

    const payload = z.object({ productos: z.array(z.unknown()).min(1) }).safeParse(req.body)
    if (!payload.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: payload.error.flatten() })
      return
    }
    // JSON bodies share the SAME per-row validation as the multipart path so
    // category rules, IGET/IGES prefixes, duplicates and global codes all apply.
    const result = await validateImportAgainstCatalog(payload.data.productos)
    await confirmPendingImport(res, result, req.depositoUser!.id)
  } catch (error) {
    sendError(res, error)
  }
})

export { isMarketCategory }
export default router
