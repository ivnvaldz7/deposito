import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { Categoria, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/require-role'
import { normalizeProductName } from '../lib/producto-catalogo'

const router = Router()

const CATEGORIAS = Object.values(Categoria) as [Categoria, ...Categoria[]]

const crearProductoSchema = z.object({
  nombreBase: z.string().min(2).max(100).transform(normalizeProductName),
  volumen: z.number().positive().nullable().optional(),
  unidad: z
    .string()
    .max(10)
    .nullable()
    .optional()
    .transform((s) => (s ? normalizeProductName(s) : null)),
  variante: z
    .string()
    .max(100)
    .nullable()
    .optional()
    .transform((s) => (s ? normalizeProductName(s) : null)),
  categoria: z.enum(CATEGORIAS),
  nombreCompleto: z.string().min(2).max(200).transform(normalizeProductName),
})

// ─── GET /api/productos — listar (auth) ──────────────────────────────────────

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { categoria, buscar } = req.query

  const where: Prisma.ProductoWhereInput = { activo: true }

  if (typeof categoria === 'string' && CATEGORIAS.includes(categoria as Categoria)) {
    where.categoria = categoria as Categoria
  }

  if (typeof buscar === 'string' && buscar.trim()) {
    where.nombreCompleto = { contains: normalizeProductName(buscar), mode: 'insensitive' }
  }

  try {
    const productos = await prisma.producto.findMany({
      where,
      orderBy: { nombreCompleto: 'asc' },
      select: {
        id: true,
        nombreBase: true,
        volumen: true,
        unidad: true,
        variante: true,
        categoria: true,
        nombreCompleto: true,
        activo: true,
      },
    })
    res.json(productos)
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// ─── POST /api/productos — crear (encargado) ─────────────────────────────────

router.post(
  '/',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const result = crearProductoSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { nombreBase, volumen, unidad, variante, categoria, nombreCompleto } = result.data

    try {
      const existing = await prisma.producto.findUnique({
        where: { nombreCompleto_categoria: { nombreCompleto, categoria } },
      })
      if (existing) {
        res.status(409).json({ message: `Ya existe un producto "${nombreCompleto}" en la categoría "${categoria}"` })
        return
      }

      const producto = await prisma.producto.create({
        data: {
          nombreBase,
          volumen: volumen != null ? new Prisma.Decimal(volumen) : null,
          unidad: unidad ?? null,
          variante: variante ?? null,
          categoria,
          nombreCompleto,
        },
      })
      res.status(201).json(producto)
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        res.status(409).json({ message: `Ya existe un producto "${nombreCompleto}" en la categoría "${categoria}"` })
        return
      }
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

export default router
