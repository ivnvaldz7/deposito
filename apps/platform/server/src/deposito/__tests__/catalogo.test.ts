import request from 'supertest'
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { Prisma } from '@platform/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

vi.mock('@platform/db', () => ({
  Categoria: {
    droga: 'droga',
    estuche: 'estuche',
    etiqueta: 'etiqueta',
    frasco: 'frasco',
  },
  Mercado: { argentina: 'argentina', VENEZUELA: 'VENEZUELA' },
  EstadoProductoCatalogo: { PENDIENTE_REVISION: 'PENDIENTE_REVISION', ACTIVO: 'ACTIVO', INACTIVO: 'INACTIVO' },
  OrigenProductoCatalogo: { MANUAL: 'MANUAL', IMPORTACION: 'IMPORTACION', MIGRACION: 'MIGRACION' },
  TipoAuditoriaCatalogo: {},
  Prisma: {
    Decimal: class Decimal {
      value: number
      constructor(v: number) { this.value = v }
      toString() { return String(this.value) }
      toNumber() { return this.value }
    },
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string
      constructor(message: string, opts: { code: string }) {
        super(message)
        this.code = opts.code
      }
    },
  },
  default: {},
}))

interface Producto {
  id: string
  codigo: string | null
  nombreBase: string
  volumen: number | null
  unidad: string | null
  variante: string | null
  categoria: 'droga' | 'estuche' | 'etiqueta' | 'frasco'
  nombreCompleto: string
  activo: boolean
}

const MOCK_PRODUCTOS: Producto[] = [
  { id: 'prod-1', codigo: null, nombreBase: 'ACIDO ACETILSALICILICO', volumen: 500, unidad: 'MG', variante: null, categoria: 'droga', nombreCompleto: 'ACIDO ACETILSALICILICO 500 MG', activo: true },
  { id: 'prod-2', codigo: null, nombreBase: 'IBUPROFENO', volumen: 400, unidad: 'MG', variante: null, categoria: 'droga', nombreCompleto: 'IBUPROFENO 400 MG', activo: true },
  { id: 'prod-3', codigo: null, nombreBase: 'ESTUCHE BASICO', volumen: null, unidad: null, variante: null, categoria: 'estuche', nombreCompleto: 'ESTUCHE BASICO', activo: true },
  { id: 'prod-4', codigo: null, nombreBase: 'ESTUCHE PREMIUM', volumen: 1, unidad: 'L', variante: 'VIDRIO', categoria: 'estuche', nombreCompleto: 'ESTUCHE PREMIUM 1 L VIDRIO', activo: true },
  { id: 'prod-5', codigo: null, nombreBase: 'ETIQUETA 10x5', volumen: null, unidad: null, variante: null, categoria: 'etiqueta', nombreCompleto: 'ETIQUETA 10x5', activo: true },
  { id: 'prod-6', codigo: null, nombreBase: 'ETIQUETA 15x8', volumen: null, unidad: null, variante: null, categoria: 'etiqueta', nombreCompleto: 'ETIQUETA 15x8', activo: true },
  { id: 'prod-7', codigo: null, nombreBase: 'FRASCO 100 ML', volumen: 100, unidad: 'ML', variante: null, categoria: 'frasco', nombreCompleto: 'FRASCO 100 ML', activo: true },
  { id: 'prod-8', codigo: null, nombreBase: 'FRASCO 250 ML', volumen: 250, unidad: 'ML', variante: null, categoria: 'frasco', nombreCompleto: 'FRASCO 250 ML', activo: true },
  { id: 'prod-9', codigo: null, nombreBase: 'PARACETAMOL', volumen: 500, unidad: 'MG', variante: null, categoria: 'droga', nombreCompleto: 'PARACETAMOL 500 MG', activo: false },
]

const mocks = vi.hoisted(() => {
  const state = {
    productos: [] as Producto[],
  }

  const prisma = {
    depositoProducto: {
      findMany: vi.fn(async ({ where }: any) =>
        state.productos.filter((producto) => {
          if (where?.activo != null && producto.activo !== where.activo) return false
          if (where?.categoria && producto.categoria !== where.categoria) return false
          if (where?.codigo?.in && !where.codigo.in.includes(producto.codigo)) return false
          if (where?.nombreCompleto?.contains) {
            return producto.nombreCompleto.toLowerCase().includes(where.nombreCompleto.contains.toLowerCase())
          }
          return true
        })),
      findUnique: vi.fn(async ({ where }: any) =>
        state.productos.find((p) =>
          p.nombreCompleto === where.nombreCompleto_categoria?.nombreCompleto &&
          p.categoria === where.nombreCompleto_categoria?.categoria
        ) ?? null),
      create: vi.fn(async ({ data }: any) => {
        const producto: Producto = {
          id: `producto-${state.productos.length + 1}`,
          codigo: data.codigo ?? null,
          nombreBase: data.nombreBase,
          volumen: data.volumen?.toNumber() ?? null,
          unidad: data.unidad ?? null,
          variante: data.variante ?? null,
          categoria: data.categoria,
          nombreCompleto: data.nombreCompleto,
          activo: true,
        }
        state.productos.push(producto)
        return producto
      }),
    },
  }

  function reset() {
    state.productos = MOCK_PRODUCTOS.map((p) => ({ ...p }))
    prisma.depositoProducto.findMany.mockClear()
    prisma.depositoProducto.findUnique.mockClear()
    prisma.depositoProducto.create.mockClear()
  }

  return { prisma, state, reset }
})

const importMocks = vi.hoisted(() => ({
  createManual: vi.fn(async (producto: { codigo: string }) => ({ id: 'manual-1', ...producto, estado: 'ACTIVO' })),
  update: vi.fn(async (id: string, producto: { codigo: string }, actorId: string) => ({ id, ...producto, actorId })),
  reactivate: vi.fn(async (id: string, actorId: string) => ({ id, actorId, codigo: 'MP-LOAD-1', estado: 'ACTIVO', activo: true })),
  createImportPendingBatch: vi.fn(async (productos: Array<{ codigo: string }>) => ({
    productos: productos.map((producto, index) => ({
      id: `importado-${index + 1}`,
      ...producto,
      estado: 'PENDIENTE_REVISION',
    })),
    omitidosPorCarrera: 0,
  })),
}))

vi.mock('../services/catalogo-producto-service', () => ({
  CatalogoError: class CatalogoError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  },
  CatalogoProductoService: class CatalogoProductoService {
    createManual = importMocks.createManual
    update = importMocks.update
    reactivate = importMocks.reactivate
    createImportPendingBatch = importMocks.createImportPendingBatch
  },
  isMarketCategory: (categoria: string) => categoria === 'etiqueta' || categoria === 'estuche',
  validateCatalogoInput: (input: { categoria: string; mercadosHabilitados?: string[] }) => {
    const hasMarkets = input.categoria === 'etiqueta' || input.categoria === 'estuche'
    if (hasMarkets && !input.mercadosHabilitados?.length) throw new Error('La categoría requiere al menos un mercado habilitado')
    if (!hasMarkets && input.mercadosHabilitados?.length) throw new Error('La categoría no utiliza mercados habilitados')
  },  normalizeCodigo: (codigo: string | null | undefined) => codigo?.trim().toUpperCase() || null,
  isCodigoRequiredForCategoria: (categoria: string) => categoria === 'etiqueta' || categoria === 'estuche',
}))

vi.mock('../lib/prisma', () => ({ prisma: mocks.prisma }))

// Legacy supplier list equivalent: CODIGO ARTICULO + NOMBRE ARTICULO columns,
// generated in-memory as real BIFF8 (the format of the user's .xls file).
function buildLegacyXls(rows: Array<[string, string]>): Buffer {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['CODIGO ARTICULO', 'NOMBRE ARTICULO'],
    ...rows,
  ])
  XLSX.utils.book_append_sheet(workbook, sheet, 'Listado')
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'biff8' }))
}
vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const role = req.header('x-test-role')
    if (!role) {
      res.status(401).json({ message: 'No autenticado' })
      return
    }
    req.depositoUser = {
      id: req.header('x-test-user-id') ?? 'enc-1',
      role,
      name: 'Usuario Test',
    }
    next()
  },
}))

import productosRouter from '../routes/productos'

describe('Catálogo de productos', () => {
  const app = createTestApp('/api/productos', productosRouter)

  beforeEach(() => {
    mocks.reset()
    importMocks.createManual.mockClear()
    importMocks.createImportPendingBatch.mockClear()
    importMocks.update.mockClear()
    importMocks.reactivate.mockClear()
  })

  it('GET /api/productos con filtro categoria devuelve solo esa categoría', async () => {
    const res = await request(app)
      .get('/api/productos?categoria=frasco')
      .set('x-test-role', 'encargado')

    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body.every((producto: any) => producto.categoria === 'frasco')).toBe(true)
  })

  it('POST /api/productos sin código rechaza para etiqueta', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('x-test-role', 'encargado')
      .send({
        nombreBase: 'ETIQUETA SIN CODIGO',
        nombreCompleto: 'ETIQUETA SIN CODIGO',
        categoria: 'etiqueta',
        presentacion: 10,
        mercadosHabilitados: ['argentina'],
      })

    expect(res.status).toBe(400)
  })

  it('POST /api/productos permite frasco sin código', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('x-test-role', 'encargado')
      .send({
        nombreBase: 'FRASCO SIN CODIGO',
        nombreCompleto: 'FRASCO SIN CODIGO',
        categoria: 'frasco',
        presentacion: 100,
      })

    expect(res.status).toBe(201)
  })

  it('permite CODE_LOAD manual solo al encargado y normaliza el código', async () => {
    const denied = await request(app)
      .patch('/api/productos/prod-1')
      .set('x-test-role', 'observador')
      .send({ codigo: ' et-code-load-1 ' })

    expect(denied.status).toBe(403)
    expect(importMocks.update).not.toHaveBeenCalled()

    const accepted = await request(app)
      .patch('/api/productos/prod-1')
      .set('x-test-role', 'encargado')
      .send({ codigo: ' et-code-load-1 ' })

    expect(accepted.status).toBe(200)
    expect(importMocks.update).toHaveBeenCalledWith('prod-1', expect.objectContaining({ codigo: 'ET-CODE-LOAD-1' }), 'enc-1')
  })

  it('allows an inactive historical product to load a code and then reactivate through HTTP', async () => {
    const loaded = await request(app)
      .patch('/api/productos/inactive-without-code')
      .set('x-test-role', 'encargado')
      .send({ codigo: ' mp-load-1 ' })

    expect(loaded.status).toBe(200)
    expect(importMocks.update).toHaveBeenCalledWith('inactive-without-code', expect.objectContaining({ codigo: 'MP-LOAD-1' }), 'enc-1')

    const reactivated = await request(app)
      .post('/api/productos/inactive-without-code/reactivar')
      .set('x-test-role', 'encargado')

    expect(reactivated.status).toBe(200)
    expect(reactivated.body).toMatchObject({ id: 'inactive-without-code', codigo: 'MP-LOAD-1', estado: 'ACTIVO', activo: true })
  })

  it('rejects a colliding CODE_LOAD value through HTTP', async () => {
    importMocks.update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('duplicate code', {
      code: 'P2002',
      clientVersion: 'test',
    }))

    const collision = await request(app)
      .patch('/api/productos/inactive-without-code')
      .set('x-test-role', 'encargado')
      .send({ codigo: ' MP-EXISTENTE ' })

    expect(collision.status).toBe(409)
    expect(collision.body.message).toContain('globalmente único')
  })

  it('rechaza una etiqueta sin presentación antes de invocar el servicio', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('x-test-role', 'encargado')
      .send({
        nombreBase: 'ETIQUETA SIN PRESENTACION',
        nombreCompleto: 'ETIQUETA SIN PRESENTACION',
        categoria: 'etiqueta',
        codigo: 'ET-SIN-PRESENTACION',
        mercadosHabilitados: ['argentina'],
      })

    expect(res.status).toBe(400)
    expect(importMocks.createManual).not.toHaveBeenCalled()
  })

  it('el mock contiene 9 productos de prueba', () => {
    expect(mocks.state.productos).toHaveLength(9)
  })

  it('confirma un CSV multipart como lote pendiente sin stock ni movimientos', async () => {
    const csv = [
      'nombreBase,nombreCompleto,categoria,codigo,presentacion,mercadosHabilitados',
      'ETIQUETA PARA CONFIRMAR,ETIQUETA PARA CONFIRMAR,etiqueta,IGET-CONFIRM-1,10,argentina',
      'ESTUCHE PARA CONFIRMAR,ESTUCHE PARA CONFIRMAR,estuche,IGES-CONFIRM-1,20,argentina',
    ].join('\n')

    const res = await request(app)
      .post('/api/productos/importaciones/confirmar')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(csv), { filename: 'catalogo.csv', contentType: 'text/csv' })

    expect(res.status).toBe(201)
    expect(res.body.importadas).toBe(2)
    expect(res.body.omitidas).toBe(0)
    expect(res.body.omitidasPorCarrera).toBe(0)
    expect(res.body.total).toBe(2)
    expect(res.body.productos).toHaveLength(2)
    expect(res.body.productos.every((producto: { estado: string }) => producto.estado === 'PENDIENTE_REVISION')).toBe(true)
    expect(importMocks.createImportPendingBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ codigo: 'IGET-CONFIRM-1', categoria: 'etiqueta' }),
        expect.objectContaining({ codigo: 'IGES-CONFIRM-1', categoria: 'estuche' }),
      ]),
      'enc-1',
    )
  })
  it('confirma parcialmente si el archivo repite un código: primera ocurrencia creada, repeticiones omitidas', async () => {
    const csv = [
      'nombreBase,nombreCompleto,categoria,codigo,presentacion,mercadosHabilitados',
      'ETIQUETA DUPLICADA A,ETIQUETA DUPLICADA A,etiqueta,IGET-DUPLICADO,10,argentina',
      'ETIQUETA DUPLICADA B,ETIQUETA DUPLICADA B,etiqueta,IGET-DUPLICADO,10,argentina',
    ].join('\n')

    const res = await request(app)
      .post('/api/productos/importaciones/confirmar')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(csv), { filename: 'duplicados.csv', contentType: 'text/csv' })

    expect(res.status).toBe(201)
    expect(res.body.importadas).toBe(1)
    expect(res.body.omitidas).toBe(1)
    expect(res.body.total).toBe(2)
    expect(res.body.filas[1].valido).toBe(false)
    expect(res.body.productos.map((producto: { codigo: string }) => producto.codigo)).toEqual(['IGET-DUPLICADO'])
    // Only the FIRST occurrence is created; the repetition never reaches the service.
    expect(importMocks.createImportPendingBatch).toHaveBeenCalledTimes(1)
    const batch = importMocks.createImportPendingBatch.mock.calls[0][0] as Array<{ codigo: string }>
    expect(batch).toHaveLength(1)
    expect(batch[0].codigo).toBe('IGET-DUPLICADO')
  })
  it('analiza un XLSX multipart en dry-run sin mutar el catálogo', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Catálogo')
    sheet.addRow(['nombreBase', 'nombreCompleto', 'categoria', 'codigo', 'presentacion', 'mercadosHabilitados'])
    sheet.addRow(['ESTUCHE XLSX', 'ESTUCHE XLSX', 'estuche', 'IGES-XLSX-1', 10, 'argentina'])
    const bytes = await workbook.xlsx.writeBuffer()

    const res = await request(app)
      .post('/api/productos/importaciones/dry-run')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(bytes), { filename: 'catalogo.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    expect(res.status).toBe(200)
    expect(res.body.validas).toBe(1)
    expect(res.body.filas[0].producto.codigo).toBe('IGES-XLSX-1')
    expect(mocks.prisma.depositoProducto.create).not.toHaveBeenCalled()
  })
  it('respeta comas encerradas entre comillas en un CSV multipart', async () => {
    const csv = [
      'nombreBase,nombreCompleto,categoria,codigo,presentacion,mercadosHabilitados',
      '"ETIQUETA, ESPECIAL","ETIQUETA, ESPECIAL",etiqueta,IGET-CSV-QUOTED,10,argentina',
    ].join('\n')

    const res = await request(app)
      .post('/api/productos/importaciones/dry-run')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(csv), { filename: 'comillas.csv', contentType: 'text/csv' })

    expect(res.status).toBe(200)
    expect(res.body.filas[0].producto.nombreCompleto).toBe('ETIQUETA, ESPECIAL')
  })

  it('analiza un CSV multipart en dry-run sin crear productos', async () => {
    const csv = [
      'nombreBase,nombreCompleto,categoria,codigo,presentacion,mercadosHabilitados',
      'ETIQUETA DE PRUEBA,ETIQUETA DE PRUEBA,etiqueta,IGET-IMPORT-1,10,argentina',
    ].join('\n')

    const res = await request(app)
      .post('/api/productos/importaciones/dry-run')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(csv), { filename: 'catalogo.csv', contentType: 'text/csv' })

    expect(res.status).toBe(200)
    expect(res.body.validas).toBe(1)
    expect(res.body.invalidas).toBe(0)
    expect(res.body.filas[0].producto.codigo).toBe('IGET-IMPORT-1')
    expect(mocks.prisma.depositoProducto.create).not.toHaveBeenCalled()
  })

  it('POST /api/productos permite MP (droga) sin código y la crea ACTIVA', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('x-test-role', 'encargado')
      .send({
        nombreBase: 'DROGA SIN CODIGO',
        nombreCompleto: 'DROGA SIN CODIGO',
        categoria: 'droga',
      })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ estado: 'ACTIVO', codigo: null, categoria: 'droga' })
  })

  it('POST /api/productos sin código rechaza para estuche', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('x-test-role', 'encargado')
      .send({
        nombreBase: 'ESTUCHE SIN CODIGO',
        nombreCompleto: 'ESTUCHE SIN CODIGO',
        categoria: 'estuche',
        presentacion: 20,
        mercadosHabilitados: ['argentina'],
      })

    expect(res.status).toBe(400)
  })

  it('POST /api/productos rechaza un prefijo incorrecto en etiqueta con mensaje IGET', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('x-test-role', 'encargado')
      .send({
        nombreBase: 'ETIQUETA PREFIJO',
        nombreCompleto: 'ETIQUETA PREFIJO',
        categoria: 'etiqueta',
        codigo: 'FOO123',
        presentacion: 10,
        mercadosHabilitados: ['argentina'],
      })

    expect(res.status).toBe(400)
    const codigoErrors = res.body.errors?.fieldErrors?.codigo ?? []
    expect(codigoErrors.join(' ')).toContain('IGET')
    expect(importMocks.createManual).not.toHaveBeenCalled()
  })

  it('POST /api/productos rechaza un prefijo incorrecto en estuche con mensaje IGES', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('x-test-role', 'encargado')
      .send({
        nombreBase: 'ESTUCHE PREFIJO',
        nombreCompleto: 'ESTUCHE PREFIJO',
        categoria: 'estuche',
        codigo: 'FOO123',
        presentacion: 20,
        mercadosHabilitados: ['argentina'],
      })

    expect(res.status).toBe(400)
    const codigoErrors = res.body.errors?.fieldErrors?.codigo ?? []
    expect(codigoErrors.join(' ')).toContain('IGES')
    expect(importMocks.createManual).not.toHaveBeenCalled()
  })

  it('POST /api/productos acepta iget-001 en minúsculas y lo normaliza a IGET-001', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('x-test-role', 'encargado')
      .send({
        nombreBase: 'ETIQUETA MINUSCULA',
        nombreCompleto: 'ETIQUETA MINUSCULA',
        categoria: 'etiqueta',
        codigo: 'iget-001',
        presentacion: 10,
        mercadosHabilitados: ['argentina'],
      })

    expect(res.status).toBe(201)
    expect(importMocks.createManual).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'IGET-001' }), 'enc-1')
  })

  it('PATCH devuelve 400 cuando el servicio rechaza dejar una etiqueta pendiente sin código', async () => {
    importMocks.update.mockRejectedValueOnce(new Error('El código es obligatorio para etiquetas y estuches'))

    const res = await request(app)
      .patch('/api/productos/prod-5')
      .set('x-test-role', 'encargado')
      .send({ nombreBase: 'ETIQUETA 10x5 RENOMBRADA' })

    expect(res.status).toBe(400)
    expect(res.body.message).toContain('código es obligatorio')
  })

  it('rechaza una confirmación JSON sin filas válidas (prefijo incorrecto en una fila de etiqueta)', async () => {
    const res = await request(app)
      .post('/api/productos/importaciones/confirmar')
      .set('x-test-role', 'encargado')
      .send({
        productos: [{
          nombreBase: 'ETIQUETA MALA',
          nombreCompleto: 'ETIQUETA MALA',
          categoria: 'etiqueta',
          codigo: 'FOO123',
          presentacion: 10,
          mercadosHabilitados: ['argentina'],
        }],
      })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('No hay filas válidas para importar.')
    expect(res.body.filas).toHaveLength(1)
    expect(res.body.filas[0].valido).toBe(false)
    // Evidence for the S1 cleanup: the message the user gets comes from the zod
    // refine (fieldErrors shape), NOT from the legacy flat branches in
    // validateImportRows (which were unreachable — the schema already rejects
    // the row before they could run).
    expect(JSON.stringify(res.body.filas[0].errores)).toContain('El código de etiqueta debe comenzar con IGET')
    expect(JSON.stringify(res.body.filas[0].errores)).toContain('fieldErrors')
    expect(importMocks.createImportPendingBatch).not.toHaveBeenCalled()
  })

  it('documenta el mensaje que recibe el usuario por una fila de importación etiqueta sin código', async () => {
    const res = await request(app)
      .post('/api/productos/importaciones/confirmar')
      .set('x-test-role', 'encargado')
      .send({
        productos: [{
          nombreBase: 'ETIQUETA SIN CODIGO',
          nombreCompleto: 'ETIQUETA SIN CODIGO',
          categoria: 'etiqueta',
          presentacion: 10,
          mercadosHabilitados: ['argentina'],
        }],
      })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('No hay filas válidas para importar.')
    expect(res.body.filas).toHaveLength(1)
    expect(res.body.filas[0].valido).toBe(false)
    // The dead branch would have produced a flat { codigo: [...] } object; the
    // schema path produces fieldErrors — this locks in what the user actually
    // sees so the S1 cleanup stays behavior-neutral.
    expect(JSON.stringify(res.body.filas[0].errores)).toContain('fieldErrors')
    expect(importMocks.createImportPendingBatch).not.toHaveBeenCalled()
  })

  it('PATCH permite editar un frasco ACTIVO sin código sin tocar codigo', async () => {
    const res = await request(app)
      .patch('/api/productos/prod-7')
      .set('x-test-role', 'encargado')
      .send({ nombreBase: 'FRASCO 100 ML EDITADO', presentacion: 120 })

    expect(res.status).toBe(200)
    expect(importMocks.update).toHaveBeenCalledWith(
      'prod-7',
      expect.objectContaining({ nombreBase: 'FRASCO 100 ML EDITADO', presentacion: 120 }),
      'enc-1',
    )
    // The route must not invent or clear a codigo — the service keeps the
    // existing null when the payload omits it.
    expect(importMocks.update).toHaveBeenCalledWith('prod-7', expect.not.objectContaining({ codigo: expect.anything() }), 'enc-1')
    expect(res.body.codigo).toBeUndefined()
  })

  it('PATCH permite editar una droga ACTIVO sin código sin tocar codigo', async () => {
    const res = await request(app)
      .patch('/api/productos/prod-1')
      .set('x-test-role', 'encargado')
      .send({ nombreBase: 'ACIDO ACETILSALICILICO EDITADO' })

    expect(res.status).toBe(200)
    expect(importMocks.update).toHaveBeenCalledWith(
      'prod-1',
      expect.not.objectContaining({ codigo: expect.anything() }),
      'enc-1',
    )
    expect(res.body.codigo).toBeUndefined()
  })

  it('reactiva una etiqueta INACTIVO con código IGET válido a través de HTTP', async () => {
    const res = await request(app)
      .post('/api/productos/prod-5/reactivar')
      .set('x-test-role', 'encargado')

    expect(res.status).toBe(200)
    expect(importMocks.reactivate).toHaveBeenCalledWith('prod-5', 'enc-1')
    expect(res.body).toMatchObject({ id: 'prod-5', estado: 'ACTIVO', activo: true })
  })

  it('reactiva un estuche INACTIVO con código IGES válido a través de HTTP', async () => {
    const res = await request(app)
      .post('/api/productos/prod-3/reactivar')
      .set('x-test-role', 'encargado')

    expect(res.status).toBe(200)
    expect(importMocks.reactivate).toHaveBeenCalledWith('prod-3', 'enc-1')
    expect(res.body).toMatchObject({ id: 'prod-3', estado: 'ACTIVO', activo: true })
  })

  it('POST /api/productos acepta iges-001 en minúsculas y lo normaliza a IGES-001', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('x-test-role', 'encargado')
      .send({
        nombreBase: 'ESTUCHE MINUSCULA',
        nombreCompleto: 'ESTUCHE MINUSCULA',
        categoria: 'estuche',
        codigo: 'iges-001',
        presentacion: 20,
        mercadosHabilitados: ['argentina'],
      })

    expect(res.status).toBe(201)
    expect(importMocks.createManual).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'IGES-001' }), 'enc-1')
    expect(res.body.codigo).toBe('IGES-001')
  })

  it('considera válida una fila de importación MP (droga) sin código', async () => {
    const csv = [
      'nombreBase,nombreCompleto,categoria,codigo,presentacion,mercadosHabilitados',
      'DROGA IMPORTADA,DROGA IMPORTADA,droga,,,',
    ].join('\n')

    const res = await request(app)
      .post('/api/productos/importaciones/dry-run')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(csv), { filename: 'mp.csv', contentType: 'text/csv' })

    expect(res.status).toBe(200)
    expect(res.body.validas).toBe(1)
    expect(res.body.filas[0].valido).toBe(true)
    expect(res.body.filas[0].producto.codigo).toBeNull()
  })

  // ─── MVP-01 corrective: legacy .xls + ENV frasco import ────────────────────

  it('analiza un XLS legacy (CODIGO ARTICULO / NOMBRE ARTICULO) en dry-run como FRASCO sin mutar', async () => {
    const bytes = buildLegacyXls([
      ['ENV001', 'FRASCO AGROPECUARIO 25 ML'],
      ['ENV006', 'BIDON 1 L'],
    ])

    const res = await request(app)
      .post('/api/productos/importaciones/dry-run')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(bytes), { filename: 'listado.xls', contentType: 'application/vnd.ms-excel' })

    expect(res.status).toBe(200)
    expect(res.body.validas).toBe(2)
    expect(res.body.invalidas).toBe(0)
    expect(res.body.filas[0].producto).toMatchObject({
      codigo: 'ENV001',
      nombreBase: 'FRASCO AGROPECUARIO 25 ML',
      categoria: 'frasco',
    })
    expect(res.body.filas[1].producto.codigo).toBe('ENV006')
    expect(mocks.prisma.depositoProducto.create).not.toHaveBeenCalled()
  })

  it('confirma un XLS legacy como lote FRASCO pendiente (batch = filas únicas)', async () => {
    const bytes = buildLegacyXls([
      ['ENV001', 'FRASCO AGROPECUARIO 25 ML'],
      ['ENV006', 'BIDON 1 L'],
    ])

    const res = await request(app)
      .post('/api/productos/importaciones/confirmar')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(bytes), { filename: 'listado.xls', contentType: 'application/vnd.ms-excel' })

    expect(res.status).toBe(201)
    expect(res.body.importadas).toBe(2)
    expect(res.body.omitidas).toBe(0)
    expect(res.body.total).toBe(2)
    expect(res.body.productos).toHaveLength(2)
    expect(res.body.productos.every((producto: { estado: string }) => producto.estado === 'PENDIENTE_REVISION')).toBe(true)
    expect(importMocks.createImportPendingBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ codigo: 'ENV001', categoria: 'frasco' }),
        expect.objectContaining({ codigo: 'ENV006', categoria: 'frasco' }),
      ]),
      'enc-1',
    )
    // Route-level: confirm only goes through the batch service — no direct
    // depositoProducto writes here. The batch service never creates
    // inventory or movements (locked in catalogo-producto-service.test.ts).
    expect(mocks.prisma.depositoProducto.create).not.toHaveBeenCalled()
  })

  it('reconoce encabezados legacy también en CSV (case/space tolerant)', async () => {
    const csv = [
      'CODIGO ARTICULO,NOMBRE ARTICULO',
      'ENV001,FRASCO AGROPECUARIO 25 ML',
      'ENV006,BIDON 1 L',
    ].join('\n')

    const res = await request(app)
      .post('/api/productos/importaciones/dry-run')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(csv), { filename: 'legacy.csv', contentType: 'text/csv' })

    expect(res.status).toBe(200)
    expect(res.body.validas).toBe(2)
    expect(res.body.filas[0].producto).toMatchObject({ codigo: 'ENV001', categoria: 'frasco' })
  })

  it('marca el duplicado dentro del archivo como inválido con la razón visible (DUPLICADO_EN_ARCHIVO)', async () => {
    const bytes = buildLegacyXls([
      ['ENV001', 'FRASCO AGROPECUARIO 25 ML'],
      ['ENV002', 'FRASCO AGROPECUARIO 100 ML'],
      ['ENV001', 'FRASCO AGROPECUARIO 25 ML (repetido)'],
    ])

    const res = await request(app)
      .post('/api/productos/importaciones/dry-run')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(bytes), { filename: 'duplicados.xls', contentType: 'application/vnd.ms-excel' })

    expect(res.status).toBe(200)
    expect(res.body.validas).toBe(2)
    expect(res.body.invalidas).toBe(1)
    expect(res.body.filas[2].valido).toBe(false)
    expect(res.body.filas[2].errores.codigo).toEqual(['Código duplicado dentro del archivo'])
    // The dry-run preview shows fila, código, nombre and the reason: the
    // producto (with codigo) is kept on the invalid duplicate row.
    expect(res.body.filas[2].producto.codigo).toBe('ENV001')

    const confirm = await request(app)
      .post('/api/productos/importaciones/confirmar')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(bytes), { filename: 'duplicados.xls', contentType: 'application/vnd.ms-excel' })

    expect(confirm.status).toBe(201)
    expect(confirm.body.importadas).toBe(2)
    expect(confirm.body.omitidas).toBe(1)
    expect(confirm.body.total).toBe(3)
    expect(confirm.body.filas).toHaveLength(3)
    // The duplicate row never reaches the batch service: only the first
    // occurrences of ENV001/ENV002 are created.
    expect(importMocks.createImportPendingBatch).toHaveBeenCalledTimes(1)
    const batch = importMocks.createImportPendingBatch.mock.calls[0][0] as Array<{ codigo: string }>
    expect(batch.map((producto) => producto.codigo)).toEqual(['ENV001', 'ENV002'])
  })

  it('detecta un código ya existente en el catálogo (CODIGO_YA_EXISTENTE)', async () => {
    mocks.state.productos.push({
      id: 'prod-env-existente', codigo: 'ENV001', nombreBase: 'FRASCO AGROPECUARIO 25 ML',
      volumen: null, unidad: null, variante: null, categoria: 'frasco',
      nombreCompleto: 'FRASCO AGROPECUARIO 25 ML', activo: true,
    })
    const bytes = buildLegacyXls([
      ['ENV001', 'FRASCO AGROPECUARIO 25 ML'],
      ['ENV002', 'FRASCO AGROPECUARIO 100 ML'],
    ])

    const res = await request(app)
      .post('/api/productos/importaciones/dry-run')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(bytes), { filename: 'listado.xls', contentType: 'application/vnd.ms-excel' })

    expect(res.status).toBe(200)
    expect(res.body.filas[0].valido).toBe(false)
    expect(res.body.filas[0].errores.codigo).toEqual(['Código ya existente'])
    expect(res.body.filas[1].valido).toBe(true)

    const confirm = await request(app)
      .post('/api/productos/importaciones/confirmar')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(bytes), { filename: 'listado.xls', contentType: 'application/vnd.ms-excel' })

    expect(confirm.status).toBe(201)
    expect(confirm.body.importadas).toBe(1)
    expect(confirm.body.omitidas).toBe(1)
    expect(confirm.body.total).toBe(2)
    // ENV001 already exists → skipped (no duplicate created); ENV002 imports.
    expect(importMocks.createImportPendingBatch).toHaveBeenCalledTimes(1)
    const batch = importMocks.createImportPendingBatch.mock.calls[0][0] as Array<{ codigo: string }>
    expect(batch.map((producto) => producto.codigo)).toEqual(['ENV002'])
  })

  it('confirma parcialmente un archivo mixto 34 válidas / 27 inválidas creando solo las válidas', async () => {
    // Fixture mirroring the user's real .xls shape: 34 unique codes, each with
    // a duplicated row (26 duplicates), plus 1 incomplete row = 61 rows,
    // 34 validas / 27 invalidas.
    const rows: string[] = []
    const expectedCodes: string[] = []
    for (let i = 1; i <= 34; i += 1) {
      const codigo = `ENV${String(i).padStart(3, '0')}`
      const nombre = `FRASCO TEST ${i}`
      rows.push(`${nombre},${nombre},frasco,${codigo},1,`)
      expectedCodes.push(codigo)
      if (i <= 26) rows.push(`${nombre},${nombre},frasco,${codigo},1,`)
    }
    rows.push(',,frasco,,1,')
    expect(rows).toHaveLength(61)
    const csv = ['nombreBase,nombreCompleto,categoria,codigo,presentacion,mercadosHabilitados', ...rows].join('\n')

    const dry = await request(app)
      .post('/api/productos/importaciones/dry-run')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(csv), { filename: 'mixto.csv', contentType: 'text/csv' })

    expect(dry.status).toBe(200)
    expect(dry.body.validas).toBe(34)
    expect(dry.body.invalidas).toBe(27)

    const confirm = await request(app)
      .post('/api/productos/importaciones/confirmar')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(csv), { filename: 'mixto.csv', contentType: 'text/csv' })

    expect(confirm.status).toBe(201)
    expect(confirm.body.importadas).toBe(34)
    expect(confirm.body.omitidas).toBe(27)
    expect(confirm.body.omitidasPorCarrera).toBe(0)
    expect(confirm.body.total).toBe(61)
    expect(confirm.body.productos).toHaveLength(34)
    // Invalid rows never reach the batch service: exactly the 34 first
    // occurrences are sent, in file order, duplicates and the incomplete row
    // are excluded.
    expect(importMocks.createImportPendingBatch).toHaveBeenCalledTimes(1)
    const batch = importMocks.createImportPendingBatch.mock.calls[0][0] as Array<{ codigo: string }>
    expect(batch).toHaveLength(34)
    expect(batch.map((producto) => producto.codigo)).toEqual(expectedCodes)
  })

  it('omite una fila incompleta (FILA_INCOMPLETA) y crea las demás', async () => {
    const csv = [
      'nombreBase,nombreCompleto,categoria,codigo,presentacion,mercadosHabilitados',
      'FRASCO VALIDO A,FRASCO VALIDO A,frasco,ENV900,1,',
      ', ,frasco,ENV901,1,',
      'FRASCO VALIDO B,FRASCO VALIDO B,frasco,ENV902,1,',
    ].join('\n')

    const res = await request(app)
      .post('/api/productos/importaciones/confirmar')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(csv), { filename: 'incompleto.csv', contentType: 'text/csv' })

    expect(res.status).toBe(201)
    expect(res.body.importadas).toBe(2)
    expect(res.body.omitidas).toBe(1)
    expect(res.body.total).toBe(3)
    expect(res.body.filas[1].valido).toBe(false)
    const batch = importMocks.createImportPendingBatch.mock.calls[0][0] as Array<{ codigo: string }>
    expect(batch.map((producto) => producto.codigo)).toEqual(['ENV900', 'ENV902'])
  })

  it('bloquea la confirmación con 400 cuando ninguna fila es válida', async () => {
    const csv = [
      'nombreBase,nombreCompleto,categoria,codigo,presentacion,mercadosHabilitados',
      ', ,frasco,,1,',
      ', ,frasco,,1,',
    ].join('\n')

    const res = await request(app)
      .post('/api/productos/importaciones/confirmar')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(csv), { filename: 'todo-invalido.csv', contentType: 'text/csv' })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('No hay filas válidas para importar.')
    expect(res.body.filas).toHaveLength(2)
    expect(res.body.filas.every((fila: { valido: boolean }) => fila.valido === false)).toBe(true)
    expect(importMocks.createImportPendingBatch).not.toHaveBeenCalled()
  })

  it('MVP-01: permite confirmar parcialmente un archivo con filas válidas e inválidas, y procesa FRASCOS sin presentacion', async () => {
    // 34 valid, 27 invalid
    const csvLines = ['nombreBase,nombreCompleto,categoria,codigo,presentacion,mercadosHabilitados']
    // Valid frascos without presentation
    for(let i=0; i<34; i++) {
      csvLines.push(`Valida${i},Valida${i},frasco,,,`)
    }
    // Invalid rows (missing category)
    for(let i=0; i<27; i++) {
      csvLines.push(`Invalida${i},Invalida${i},,,,`)
    }
    const csv = csvLines.join('\n')

    const res = await request(app)
      .post('/api/productos/importaciones/confirmar')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(csv), { filename: 'mixed.csv', contentType: 'text/csv' })

    // If it fails with 400, this expect will catch it
    if (res.status === 400) {
      console.log('HTTP 400 BAD REQUEST RESPONSE:', JSON.stringify(res.body, null, 2))
    }
    expect(res.status).toBe(201)
    expect(res.body.importadas).toBe(34)
    expect(res.body.omitidas).toBe(27)
  })

  it('rechaza un XLS legacy ambiguo (sin CATEGORIA y códigos no ENV) con error descriptivo', async () => {
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([
      ['CODIGO ARTICULO', 'NOMBRE ARTICULO'],
      ['ABC123', 'PRODUCTO SIN CATEGORIA'],
    ])
    XLSX.utils.book_append_sheet(workbook, sheet, 'Listado')

    const res = await request(app)
      .post('/api/productos/importaciones/dry-run')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'biff8' })), { filename: 'ambiguo.xls', contentType: 'application/vnd.ms-excel' })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('No se pudo determinar la categoría automáticamente. Los códigos deben comenzar con ENV o se debe incluir la columna CATEGORIA.')
  })

  it('rechaza extensiones no soportadas con el mensaje actualizado', async () => {
    const res = await request(app)
      .post('/api/productos/importaciones/dry-run')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from('contenido'), { filename: 'catalogo.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Solo se aceptan archivos .xls, .xlsx o .csv')
  })

  it('rechaza un archivo vacío', async () => {
    const res = await request(app)
      .post('/api/productos/importaciones/dry-run')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.alloc(0), { filename: 'vacio.csv', contentType: 'text/csv' })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('El archivo está vacío')
  })

  it('rechaza un XLS corrupto con mensaje claro sin stack traces', async () => {
    const valid = buildLegacyXls([['ENV001', 'FRASCO AGROPECUARIO 25 ML']])
    const corrupt = Buffer.from(valid.subarray(0, 60))

    const res = await request(app)
      .post('/api/productos/importaciones/dry-run')
      .set('x-test-role', 'encargado')
      .attach('archivo', corrupt, { filename: 'corrupto.xls', contentType: 'application/vnd.ms-excel' })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('El archivo está corrupto o no es un archivo Excel válido')
  })

  it('lista las columnas esperadas cuando no reconoce ninguna', async () => {
    const csv = ['FOO,BAR', 'a,b'].join('\n')

    const res = await request(app)
      .post('/api/productos/importaciones/dry-run')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(csv), { filename: 'raro.csv', contentType: 'text/csv' })

    expect(res.status).toBe(400)
    expect(res.body.message).toContain('No se reconocen las columnas')
  })
})
