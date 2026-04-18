import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import {
  MAX_SUELTOS,
  VENCIMIENTO_DEFAULT_AÑOS,
  calcularUnidades,
} from '../lib/constants'
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth'
import { TipoMovimiento } from '@prisma/client'

const router = Router()

const productoSchema = z.object({
  nombre: z.string().min(2).max(120),
  sku: z.string().min(2).max(40),
  stockMinimo: z.number().int().min(0).optional(),
})

const updateProductoSchema = z.object({
  nombre: z.string().min(2).max(120).optional(),
  stockMinimo: z.number().int().min(0).optional(),
  activo: z.boolean().optional(),
})

const loteSchema = z.object({
  numero: z.string().min(2).max(60).optional(),
  cajas: z.number().int().min(0),
  sueltos: z.number().int().min(0).max(MAX_SUELTOS),
  fechaProduccion: z.string().datetime(),
})

function buildLoteNumber(sku: string, sequence: number): string {
  return `${sku}${String(sequence).padStart(4, '0')}`
}

function isUniqueConstraintError(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

async function getProductStock(productId: string): Promise<number> {
  const lotes = await prisma.lote.findMany({
    where: {
      productoId: productId,
      activo: true,
    },
    select: {
      cajas: true,
      sueltos: true,
    },
  })

  return lotes.reduce(
    (total, lote) => total + calcularUnidades(lote.cajas, lote.sueltos),
    0
  )
}

router.get('/', authenticate, async (_req, res) => {
  const productos = await prisma.producto.findMany({
    include: {
      lotes: {
        where: { activo: true },
        select: {
          id: true,
          numero: true,
          cajas: true,
          sueltos: true,
          fechaProduccion: true,
          fechaVencimiento: true,
        },
      },
    },
    orderBy: {
      nombre: 'asc',
    },
  })

  const response = productos.map((producto) => {
    const stock = producto.lotes.reduce(
      (total, lote) => total + calcularUnidades(lote.cajas, lote.sueltos),
      0
    )

    return {
      ...producto,
      stock,
      stockBajo: stock < producto.stockMinimo,
    }
  })

  res.json(response)
})

router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  const parsed = productoSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    return
  }

  const producto = await prisma.producto.create({
    data: parsed.data,
  })

  res.status(201).json({
    ...producto,
    stock: 0,
    stockBajo: true,
  })
})

router.put('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const productoId = String(req.params.id)
  const parsed = updateProductoSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    return
  }

  const producto = await prisma.producto.update({
    where: { id: productoId },
    data: parsed.data,
  })

  const stock = await getProductStock(producto.id)

  res.json({
    ...producto,
    stock,
    stockBajo: stock < producto.stockMinimo,
  })
})

router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const productoId = String(req.params.id)
  const activeItems = await prisma.itemPedido.findFirst({
    where: {
      productoId,
      pedido: {
        estado: {
          in: ['PENDIENTE', 'APROBADO', 'EN_ARMADO'],
        },
      },
    },
  })

  if (activeItems) {
    res.status(409).json({ error: 'El producto tiene pedidos activos asociados' })
    return
  }

  await prisma.producto.delete({
    where: { id: productoId },
  })

  res.status(204).send()
})

router.get('/:id/lotes', authenticate, requireRole('admin'), async (req, res) => {
  const productoId = String(req.params.id)
  const lotes = await prisma.lote.findMany({
    where: {
      productoId,
    },
    orderBy: {
      fechaVencimiento: 'asc',
    },
  })

  res.json(
    lotes.map((lote) => ({
      ...lote,
      unidades: calcularUnidades(lote.cajas, lote.sueltos),
    }))
  )
})

router.post('/:id/lotes', authenticate, requireRole('admin'), async (req, res) => {
  const productoId = String(req.params.id)
  const parsed = loteSchema.safeParse(req.body)
  const authReq = req as AuthRequest

  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    return
  }

  const producto = await prisma.producto.findUnique({
    where: { id: productoId },
  })

  if (!producto) {
    res.status(404).json({ error: 'Producto no encontrado' })
    return
  }

  const fechaProduccion = new Date(parsed.data.fechaProduccion)
  const fechaVencimiento = new Date(fechaProduccion)
  fechaVencimiento.setFullYear(
    fechaVencimiento.getFullYear() + VENCIMIENTO_DEFAULT_AÑOS
  )

  const sequence = (await prisma.lote.count({ where: { productoId: producto.id } })) + 1
  const numero = parsed.data.numero ?? buildLoteNumber(producto.sku, sequence)
  const cantidad = calcularUnidades(parsed.data.cajas, parsed.data.sueltos)

  let lote

  try {
    lote = await prisma.$transaction(async (tx) => {
      const created = await tx.lote.create({
        data: {
          numero,
          productoId: producto.id,
          cajas: parsed.data.cajas,
          sueltos: parsed.data.sueltos,
          fechaProduccion,
          fechaVencimiento,
        },
      })

      await tx.movimientoStock.create({
        data: {
          productoId: producto.id,
          cantidad,
          tipo: TipoMovimiento.ENTRADA_MANUAL,
          referencia: created.id,
          usuarioId: authReq.user!.id,
        },
      })

      return created
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Ya existe un lote con ese número para este producto' })
      return
    }

    throw error
  }

  res.status(201).json({
    ...lote,
    unidades: cantidad,
  })
})

export default router
