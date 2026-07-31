import { Categoria, EstadoProductoCatalogo, Mercado, Prisma } from '@platform/db'
import { Request, Response, Router } from 'express'
import multer from 'multer'
import ExcelJS from 'exceljs'
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
    presentacion: positivePresentation,
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
    res.status(error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID' ? 400 : 409).json({ message: error.message })
    return
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    res.status(409).json({ message: 'El código debe ser globalmente único' })
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
  const keys = header.map((key, index) => index === 0 ? key.replace(/^\uFEFF/, '').trim() : key.trim())
  return data.map((values) => Object.fromEntries(keys.map((key, index) => [key, values[index]?.trim() ?? ''])))
}

async function parseImport(bytes: Buffer, fileName: string) {
  const name = fileName.toLowerCase()
  const rows: unknown[] = []
  if (name.endsWith('.csv')) {
    rows.push(...parseCsvRecords(bytes.toString('utf8')))
  } else if (name.endsWith('.xlsx')) {
    const book = new ExcelJS.Workbook()
    await Reflect.apply(book.xlsx.load, book.xlsx, [bytes])
    const sheet = book.worksheets[0]
    if (!sheet) return []
    const headerRow = sheet.getRow(1)
    const header = Array.from({ length: headerRow.cellCount }, (_, column) => String(headerRow.getCell(column + 1).value ?? '').trim())
    sheet.eachRow((row, index) => {
      if (index === 1) return
      rows.push(Object.fromEntries(header.map((key, column) => [key, row.getCell(column + 1).value])))
    })
  } else {
    throw new Error('Solo se aceptan archivos CSV o XLSX')
  }
  return rows
}

function coerceImportRow(row: Record<string, unknown>) {
  const marketsRaw = String(row.mercadosHabilitados ?? row.mercados ?? '')
  return {
    nombreBase: String(row.nombreBase ?? row.nombre ?? ''),
    nombreCompleto: String(row.nombreCompleto ?? row.nombre ?? ''),
    categoria: String(row.categoria ?? '').toLowerCase(),
    codigo: String(row.codigo ?? ''),
    presentacion: row.presentacion === '' || row.presentacion == null ? undefined : Number(row.presentacion),
    mercadosHabilitados: marketsRaw ? marketsRaw.split('|').map((market) => market.trim()) : [],
    volumen: row.volumen === '' || row.volumen == null ? undefined : Number(row.volumen),
    unidad: row.unidad == null ? undefined : String(row.unidad),
    variante: row.variante == null ? undefined : String(row.variante),
  }
}


class ImportValidationError extends Error {
  constructor(public readonly filas: ImportResult[]) {
    super('El archivo contiene filas inválidas')
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
  const existingCodes = new Set(existing.map((item) => item.codigo))
  for (const row of result) {
    if (row.valido && row.producto && existingCodes.has(normalizeCodigo(row.producto.codigo))) {
      row.valido = false
      row.errores = { codigo: ['Código global ya existente'] }
    }
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

router.post('/importaciones/confirmar', authenticate, requireRole('encargado'), upload.single('archivo'), async (req, res): Promise<void> => {
  const multipart = getMultipartFile(req)
  try {
    if (multipart) {
      const result = await validateImportAgainstCatalog(await parseImport(multipart.bytes, multipart.fileName))
      if (result.some((row) => !row.valido)) throw new ImportValidationError(result)
      const productos = result
        .map((row) => row.producto)
        .filter((producto): producto is CatalogoRow => producto !== undefined)
        .map(toCreateInput)
      const created = await service.createImportPendingBatch(productos, req.depositoUser!.id)
      res.status(201).json(created)
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
    if (result.some((row) => !row.valido)) throw new ImportValidationError(result)
    const productos = result
      .map((row) => row.producto)
      .filter((producto): producto is CatalogoRow => producto !== undefined)
      .map(toCreateInput)
    const created = await service.createImportPendingBatch(productos, req.depositoUser!.id)
    res.status(201).json(created)
  } catch (error) {
    if (error instanceof ImportValidationError) {
      res.status(400).json({ message: error.message, filas: error.filas })
      return
    }
    sendError(res, error)
  }
})

export { isMarketCategory }
export default router
