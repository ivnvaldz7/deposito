import { Router, type Request, type Response } from 'express'
import ExcelJS from 'exceljs'
import { Prisma } from '@platform/db'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../../middlewares/require-permission'
import { categoriaZerox, type ZeroxCategoria } from '../services/zerox-catalogo'

const router = Router()

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Fecha inválida')
const movimientoSchema = z.object({
  claveOperacion: z.string().uuid(),
  productoId: z.string().uuid(),
  tipo: z.enum(['ingreso', 'salida']),
  cantidad: z.number().int().positive().max(2147483647),
  fechaMovimiento: fecha,
  observacion: z.string().trim().max(500).optional(),
})
const filtroSchema = z.object({
  categoria: z.enum(['frasco', 'tapa']).optional(),
  productoId: z.string().uuid().optional(),
  tipo: z.enum(['ingreso', 'salida']).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  cantidadMin: z.coerce.number().int().positive().optional(),
  cantidadMax: z.coerce.number().int().positive().optional(),
  buscar: z.string().trim().max(100).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
}).refine((value) => !value.desde || !value.hasta || value.desde <= value.hasta, 'Período inválido')
  .refine((value) => !value.cantidadMin || !value.cantidadMax || value.cantidadMin <= value.cantidadMax, 'Rango de cantidades inválido')

type Filtros = z.infer<typeof filtroSchema>

function whereMovimientos(filtros: Filtros): Prisma.ZeroxMovimientoWhereInput {
  return {
    ...(filtros.productoId ? { productoId: filtros.productoId } : {}),
    ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
    ...(filtros.categoria ? { categoria: filtros.categoria } : {}),
    ...(filtros.desde || filtros.hasta ? { fechaMovimiento: {
      ...(filtros.desde ? { gte: new Date(`${filtros.desde}T00:00:00.000Z`) } : {}),
      ...(filtros.hasta ? { lte: new Date(`${filtros.hasta}T00:00:00.000Z`) } : {}),
    } } : {}),
    ...(filtros.cantidadMin || filtros.cantidadMax ? { cantidad: {
      ...(filtros.cantidadMin ? { gte: filtros.cantidadMin } : {}),
      ...(filtros.cantidadMax ? { lte: filtros.cantidadMax } : {}),
    } } : {}),
  }
}

async function saldos(categoria?: ZeroxCategoria) {
  const sums = await prisma.zeroxMovimiento.groupBy({ by: ['productoId', 'categoria'], _sum: { delta: true } })
  const historicos = new Map(sums.map((sum) => [sum.productoId, { categoria: sum.categoria as ZeroxCategoria, saldo: sum._sum.delta ?? 0 }]))
  const productos = await prisma.depositoProducto.findMany({
    where: { OR: [
      { categoria: { in: categoria === 'frasco' ? ['frasco'] : categoria === 'tapa' ? ['material_empaque'] : ['frasco', 'material_empaque'] } },
      { id: { in: [...historicos.keys()] } },
    ] },
    select: { id: true, nombreCompleto: true, categoria: true, codigo: true, activo: true },
    orderBy: { nombreCompleto: 'asc' },
  })
  const elegibles = productos.filter((producto) => {
    const tipo = historicos.get(producto.id)?.categoria ?? categoriaZerox(producto)
    return tipo && (!categoria || tipo === categoria)
  })
  return elegibles.map((producto) => ({
    productoId: producto.id,
    nombre: producto.nombreCompleto,
    codigo: producto.codigo,
    categoria: historicos.get(producto.id)?.categoria ?? categoriaZerox(producto),
    activo: producto.activo,
    permiteIngreso: producto.activo && categoriaZerox(producto) !== null,
    saldo: historicos.get(producto.id)?.saldo ?? 0,
  }))
}

function hojaZerox(workbook: ExcelJS.Workbook, nombre: string, columns: Array<{ header: string; key: string; width: number }>): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = columns
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  sheet.getRow(1).height = 25
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17362E' } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { vertical: 'middle' }
  })
  return sheet
}

async function exportarExcel(res: Response, workbook: ExcelJS.Workbook, fileName: string): Promise<void> {
  const file = await workbook.xlsx.writeBuffer()
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
  res.send(Buffer.isBuffer(file) ? file : Buffer.from(file))
}

router.get('/saldos', authenticate, requirePermission('deposito', 'pendientes.read'), async (req: Request, res: Response): Promise<void> => {
  const categoria = z.enum(['frasco', 'tapa']).optional().safeParse(req.query.categoria)
  if (!categoria.success) { res.status(400).json({ message: 'Categoría inválida' }); return }
  try { res.json(await saldos(categoria.data)) }
  catch { res.status(500).json({ message: 'No se pudieron cargar los saldos de ZEROX' }) }
})

router.get('/movimientos', authenticate, requirePermission('deposito', 'pendientes.read'), async (req: Request, res: Response): Promise<void> => {
  const parsed = filtroSchema.safeParse(req.query)
  if (!parsed.success) { res.status(400).json({ message: 'Filtros inválidos', errors: parsed.error.flatten() }); return }
  const where = whereMovimientos(parsed.data)
  try {
    const [items, total] = await Promise.all([
      prisma.zeroxMovimiento.findMany({ where, include: { usuario: { select: { name: true } } }, orderBy: [{ registradoAt: 'desc' }, { id: 'desc' }], take: 50, skip: (parsed.data.pagina - 1) * 50 }),
      prisma.zeroxMovimiento.count({ where }),
    ])
    res.json({ items, total, pagina: parsed.data.pagina, paginas: Math.ceil(total / 50) })
  } catch { res.status(500).json({ message: 'No se pudo cargar el historial de ZEROX' }) }
})

router.get('/exportar', authenticate, requirePermission('deposito', 'pendientes.read'), async (req: Request, res: Response): Promise<void> => {
  const parsed = filtroSchema.safeParse(req.query)
  const vista = z.enum(['movimientos', 'saldos']).safeParse(req.query.vista)
  if (!parsed.success || !vista.success) { res.status(400).json({ message: 'Filtros de exportación inválidos' }); return }
  try {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'ZEROX'
    if (vista.data === 'saldos') {
      const rows = (await saldos(parsed.data.categoria)).filter((row) => {
        const buscar = parsed.data.buscar?.toLocaleLowerCase()
        return !buscar || `${row.nombre} ${row.codigo ?? ''}`.toLocaleLowerCase().includes(buscar)
      })
      const sheet = hojaZerox(workbook, 'Saldos', [
        { header: 'Categoría', key: 'categoria', width: 16 },
        { header: 'Producto', key: 'producto', width: 35 },
        { header: 'Código', key: 'codigo', width: 18 },
        { header: 'Saldo (unidades)', key: 'saldo', width: 20 },
      ])
      rows.forEach((row) => sheet.addRow({ categoria: row.categoria === 'frasco' ? 'Frasco' : 'Tapa', producto: row.nombre, codigo: row.codigo ?? '', saldo: row.saldo }))
      sheet.getColumn('saldo').numFmt = '#,##0'
      await exportarExcel(res, workbook, `zerox-saldos-${parsed.data.categoria ?? 'todos'}.xlsx`)
      return
    }
    const items = await prisma.zeroxMovimiento.findMany({ where: whereMovimientos(parsed.data), include: { usuario: { select: { name: true } } }, orderBy: [{ registradoAt: 'desc' }, { id: 'desc' }] })
    const sheet = hojaZerox(workbook, 'Movimientos', [
      { header: 'Fecha movimiento', key: 'fechaMovimiento', width: 20 },
      { header: 'Cargado el (UTC)', key: 'registradoAt', width: 23 },
      { header: 'Categoría', key: 'categoria', width: 16 },
      { header: 'Producto', key: 'producto', width: 35 },
      { header: 'Movimiento', key: 'tipo', width: 17 },
      { header: 'Cantidad (unidades)', key: 'cantidad', width: 23 },
      { header: 'Saldo tras carga', key: 'saldo', width: 22 },
      { header: 'Cargado por', key: 'usuario', width: 24 },
      { header: 'Observación', key: 'observacion', width: 50 },
      { header: 'ID movimiento', key: 'id', width: 40 },
    ])
    items.forEach((item) => sheet.addRow({
      fechaMovimiento: item.fechaMovimiento, registradoAt: item.registradoAt,
      categoria: item.categoria === 'frasco' ? 'Frasco' : 'Tapa', producto: item.nombreProducto,
      tipo: item.tipo === 'ingreso' ? 'Ingreso' : 'Salida',
      cantidad: item.tipo === 'ingreso' ? item.cantidad : -item.cantidad,
      saldo: item.saldoResultante, usuario: item.usuario.name,
      observacion: item.observacion ?? '', id: item.id,
    }))
    sheet.getColumn('fechaMovimiento').numFmt = 'dd/mm/yyyy'
    sheet.getColumn('registradoAt').numFmt = 'dd/mm/yyyy hh:mm:ss'
    sheet.getColumn('cantidad').numFmt = '+#,##0;-#,##0;0'
    sheet.getColumn('saldo').numFmt = '#,##0'
    await exportarExcel(res, workbook, `zerox-historial-${parsed.data.categoria ?? 'todos'}.xlsx`)
  } catch { res.status(500).json({ message: 'No se pudo exportar ZEROX' }) }
})

router.post('/movimientos', authenticate, requirePermission('deposito', 'pendientes.manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = movimientoSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: 'Movimiento inválido', errors: parsed.error.flatten() }); return }
  const { claveOperacion, productoId, tipo, cantidad, fechaMovimiento, observacion } = parsed.data
  const equalsRequest = (existing: { productoId: string; tipo: string; cantidad: number; fechaMovimiento: Date; observacion: string | null }) =>
    existing.productoId === productoId && existing.tipo === tipo && existing.cantidad === cantidad &&
    existing.fechaMovimiento.toISOString().slice(0, 10) === fechaMovimiento && (existing.observacion ?? '') === (observacion ?? '')
  try {
    const previous = await prisma.zeroxMovimiento.findUnique({ where: { claveOperacion }, include: { usuario: { select: { name: true } } } })
    if (previous) {
      if (!equalsRequest(previous)) { res.status(409).json({ message: 'La clave de operación ya corresponde a otro movimiento' }); return }
      res.json(previous)
      return
    }
    const movimiento = await prisma.$transaction(async (tx) => {
      // El bloqueo del producto serializa escrituras para el mismo saldo externo.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM deposito.productos WHERE id = ${productoId} FOR UPDATE`
      if (locked.length === 0) throw new Error('PRODUCTO_NO_ENCONTRADO')
      const producto = await tx.depositoProducto.findUnique({ where: { id: productoId }, select: { id: true, nombreCompleto: true, categoria: true, activo: true } })
      if (!producto) throw new Error('PRODUCTO_NO_ENCONTRADO')
      const anterior = await tx.zeroxMovimiento.findFirst({ where: { productoId }, select: { categoria: true }, orderBy: { registradoAt: 'desc' } })
      const categoria = (anterior?.categoria as ZeroxCategoria | undefined) ?? categoriaZerox(producto)
      if (!categoria || (tipo === 'ingreso' && (!producto.activo || categoriaZerox(producto) !== categoria))) throw new Error('PRODUCTO_NO_ELEGIBLE')
      const actual = await tx.zeroxMovimiento.aggregate({ where: { productoId }, _sum: { delta: true } })
      const delta = tipo === 'ingreso' ? cantidad : -cantidad
      const nuevoSaldo = (actual._sum.delta ?? 0) + delta
      if (nuevoSaldo < 0) throw new Error('SALDO_INSUFICIENTE')
      if (nuevoSaldo > 2147483647) throw new Error('SALDO_EXCESIVO')
      return tx.zeroxMovimiento.create({
        data: { claveOperacion, productoId, nombreProducto: producto.nombreCompleto, categoria, tipo, cantidad, delta, saldoResultante: nuevoSaldo, fechaMovimiento: new Date(`${fechaMovimiento}T00:00:00.000Z`), usuarioId: req.depositoUser!.id, observacion: observacion || null },
        include: { usuario: { select: { name: true } } },
      })
    })
    res.status(201).json(movimiento)
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      const replay = await prisma.zeroxMovimiento.findUnique({ where: { claveOperacion }, include: { usuario: { select: { name: true } } } })
      if (replay && equalsRequest(replay)) { res.json(replay); return }
      res.status(409).json({ message: 'La clave de operación ya está usada' }); return
    }
    if (error instanceof Error && error.message === 'SALDO_INSUFICIENTE') { res.status(409).json({ message: 'La salida supera las unidades disponibles en ZEROX' }); return }
    if (error instanceof Error && error.message === 'SALDO_EXCESIVO') { res.status(409).json({ message: 'El saldo excede el máximo permitido' }); return }
    if (error instanceof Error && error.message === 'PRODUCTO_NO_ENCONTRADO') { res.status(404).json({ message: 'Producto no encontrado' }); return }
    if (error instanceof Error && error.message === 'PRODUCTO_NO_ELEGIBLE') { res.status(400).json({ message: 'Producto no habilitado para ZEROX' }); return }
    res.status(500).json({ message: 'No se pudo registrar el movimiento' })
  }
})

export default router
