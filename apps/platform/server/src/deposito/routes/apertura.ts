import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { Categoria, Mercado } from '@platform/db'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { acquireIdempotencyRecord, calculateFingerprint, completeIdempotencyRecord, getSingleIdempotencyKey, toPersistableResponseBody } from '../../utils/idempotency'

const router = Router()
const schema = z.object({
  categoria: z.enum(['estuche', 'etiqueta', 'frasco', 'droga']),
  productoId: z.string().uuid().optional(),
  inventarioId: z.string().uuid().optional(),
  cantidad: z.number().finite().nonnegative(),
  fechaEfectiva: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lote: z.string().trim().min(1).max(100).optional(),
  vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mercado: z.string().optional(),
}).refine((value) => value.productoId || value.inventarioId, { message: 'productoId es requerido' })

function permissionFor(category: z.infer<typeof schema>['categoria']): 'estuches.manage' | 'etiquetas.manage' | 'frascos.manage' | 'ingresos.create' {
  return category === 'estuche' ? 'estuches.manage' : category === 'etiqueta' ? 'etiquetas.manage' : category === 'frasco' ? 'frascos.manage' : 'ingresos.create'
}

router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos de apertura inválidos', details: parsed.error.flatten() }); return }
  const data = parsed.data
  const permission = permissionFor(data.categoria)
  const user = req.depositoUser
  if (!user) { res.status(401).json({ error: 'Sesión de depósito requerida' }); return }
  // Permission is checked here because category determines the existing write permission.
  const payload = req.user
  if (!payload) { res.status(401).json({ error: 'Token requerido' }); return }
  const { hasPermission } = await import('@platform/core')
  if (!hasPermission(payload, 'deposito', permission)) { res.status(403).json({ error: 'Permiso insuficiente' }); return }
  let key: string | undefined
  try { key = getSingleIdempotencyKey(req.rawHeaders) } catch (error) { res.status(400).json(error); return }
  if (!key) { res.status(400).json({ error: 'Idempotency-Key es requerido' }); return }
  const scope = 'deposito.saldo-apertura'
  const productoId = data.productoId ?? data.inventarioId!
  const hash = calculateFingerprint(req.method, scope, productoId, data)
  try {
    const result = await prisma.$transaction(async (tx) => {
      const acquired = await acquireIdempotencyRecord(tx, user.id, scope, key!, hash)
      if (acquired.type === 'REPLAY') return acquired.body
      const effective = data.fechaEfectiva ? new Date(`${data.fechaEfectiva}T00:00:00.000Z`) : new Date()
      const amount = data.cantidad
      let productoNombre: string
      let lote: string | null = data.lote ?? null
      if (data.categoria === 'estuche') {
        let row = await tx.inventarioEstuche.findUnique({ where: { id: productoId } })
        if (!row) {
          const producto = await tx.depositoProducto.findUnique({ where: { id: productoId } }); if (!producto) throw new Error('NOT_FOUND')
          const mercado = data.mercado ?? producto.mercado
          if (!mercado) throw new Error('NOT_FOUND')
          row = await tx.inventarioEstuche.create({ data: { productoId: producto.id, articulo: producto.nombreCompleto, mercado: mercado as Mercado, cantidad: 0 } })
        }
        if (!Number.isInteger(amount)) throw new Error('INVALID_AMOUNT')
        if (row.cantidad > 0) throw new Error('ALREADY_SET')
        await tx.inventarioEstuche.update({ where: { id: row.id }, data: { cantidad: amount } }); productoNombre = row.articulo
      } else if (data.categoria === 'etiqueta') {
        let row = await tx.inventarioEtiqueta.findUnique({ where: { id: productoId } })
        if (!row) {
          const producto = await tx.depositoProducto.findUnique({ where: { id: productoId } }); if (!producto) throw new Error('NOT_FOUND')
          const mercado = data.mercado ?? producto.mercado
          if (!mercado) throw new Error('NOT_FOUND')
          row = await tx.inventarioEtiqueta.create({ data: { productoId: producto.id, articulo: producto.nombreCompleto, mercado: mercado as Mercado, cantidad: 0 } })
        }
        if (!Number.isInteger(amount)) throw new Error('INVALID_AMOUNT')
        if (row.cantidad > 0) throw new Error('ALREADY_SET')
        await tx.inventarioEtiqueta.update({ where: { id: row.id }, data: { cantidad: amount } }); productoNombre = row.articulo
      } else if (data.categoria === 'frasco') {
        if (!Number.isInteger(amount)) throw new Error('INVALID_AMOUNT')
        let row = await tx.inventarioFrasco.findUnique({ where: { id: productoId } })
        if (!row) {
          const producto = await tx.depositoProducto.findUnique({ where: { id: productoId } }); if (!producto) throw new Error('NOT_FOUND')
          row = await tx.inventarioFrasco.create({ data: { productoId: producto.id, articulo: producto.nombreCompleto, unidadesPorCaja: producto.presentacion ?? 1, cantidadCajas: 0, total: 0 } })
        }
        if (row.cantidadCajas > 0) throw new Error('ALREADY_SET')
        await tx.inventarioFrasco.update({ where: { id: row.id }, data: { cantidadCajas: amount, total: amount * row.unidadesPorCaja } }); productoNombre = row.articulo
      } else {
        // Para droga, productoId es el productoId. El stock se abre por lote.
        if (!data.lote) throw new Error('LOT_REQUIRED')
        const producto = await tx.depositoProducto.findUnique({ where: { id: productoId } }); if (!producto) throw new Error('NOT_FOUND')

        let row = await tx.inventarioDroga.findUnique({ where: { productoId_lote: { productoId: productoId, lote: data.lote } } })
        if (row && row.cantidad > 0) throw new Error('ALREADY_SET')

        if (row) {
          await tx.inventarioDroga.update({ where: { id: row.id }, data: { cantidad: amount, ...(data.vencimiento ? { vencimiento: new Date(`${data.vencimiento}T00:00:00.000Z`) } : {}) } })
        } else {
          row = await tx.inventarioDroga.create({
            data: {
              productoId: productoId,
              nombre: producto.nombreCompleto,
              lote: data.lote,
              cantidad: amount,
              vencimiento: data.vencimiento ? new Date(`${data.vencimiento}T00:00:00.000Z`) : null
            }
          })
        }
        productoNombre = row.nombre; lote = row.lote
      }
      const movement = await tx.movimiento.create({ data: { tipo: 'stock_inicial', categoria: data.categoria as Categoria, productoNombre, lote, cantidad: amount, referenciaId: data.categoria === 'droga' ? (lote || productoId) : productoId, fechaEfectiva: effective, justificacion: 'Saldo de apertura', createdBy: user.id } })
      const body = { productoId, categoria: data.categoria, cantidad: amount, movimientoId: movement.id, fechaEfectiva: effective.toISOString(), motivo: 'Saldo de apertura' }
      await completeIdempotencyRecord(tx, acquired.id, 201, toPersistableResponseBody(body))
      return body
    })
    res.status(201).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'NOT_FOUND') { res.status(404).json({ error: 'Inventario no encontrado' }); return }
    if (message === 'INVALID_AMOUNT') { res.status(400).json({ error: 'Frascos requiere cantidad de cajas entera' }); return }
    if (message === 'LOT_MISMATCH') { res.status(409).json({ error: 'El lote no coincide con el inventario seleccionado' }); return }
    if (message === 'ALREADY_SET') { res.status(409).json({ error: 'Este lote ya tiene un saldo registrado. Usá Ajuste si necesitás corregirlo.' }); return }
    res.status(500).json({ error: 'No se pudo registrar el saldo de apertura' })
  }
})

export default router
