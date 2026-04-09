import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/require-role'

const router = Router()

// ─── Schemas ──────────────────────────────────────────────────────────────────

const crearDrogaSchema = z.object({
  nombre: z.string().min(2).max(100),
  lote: z.string().min(1).max(50).optional(),
  vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional(),
  cantidad: z.number().int().min(0).default(0),
})

const editarDrogaSchema = z
  .object({
    nombre: z.string().min(2).max(100).optional(),
    lote: z.string().min(1).max(50).optional().nullable(),
    vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    cantidad: z.number().int().min(0).optional(),
  })
  .refine(
    (d) =>
      d.nombre !== undefined ||
      d.lote !== undefined ||
      d.vencimiento !== undefined ||
      d.cantidad !== undefined,
    { message: 'Al menos un campo requerido' }
  )

// ─── GET /api/drogas — listar (con filtro opcional por nombre) ─────────────────

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const nombreFilter = typeof req.query['nombre'] === 'string' ? req.query['nombre'] : undefined

  try {
    const drogas = await prisma.inventarioDroga.findMany({
      where: nombreFilter ? { nombre: nombreFilter } : undefined,
      orderBy: [{ nombre: 'asc' }, { vencimiento: 'asc' }],
    })
    res.json(drogas)
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// ─── GET /api/drogas/por-vencer?dias=30 ───────────────────────────────────────

router.get('/por-vencer', authenticate, async (req: Request, res: Response): Promise<void> => {
  const dias = typeof req.query['dias'] === 'string' ? parseInt(req.query['dias'], 10) : 30
  const validDias = isNaN(dias) || dias <= 0 ? 30 : Math.min(dias, 365)

  const limitDate = new Date()
  limitDate.setDate(limitDate.getDate() + validDias)
  limitDate.setUTCHours(23, 59, 59, 999)

  try {
    const drogas = await prisma.inventarioDroga.findMany({
      where: {
        vencimiento: { lte: limitDate },
        cantidad: { gt: 0 },
      },
      orderBy: { vencimiento: 'asc' },
    })
    res.json(drogas)
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// ─── POST /api/drogas — crear nueva (encargado) ───────────────────────────────

router.post(
  '/',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const result = crearDrogaSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { nombre, lote, vencimiento, cantidad } = result.data
    const loteValue = lote ?? null
    const vencimientoValue = vencimiento ? new Date(vencimiento + 'T00:00:00.000Z') : null

    try {
      // For null lote: enforce app-level uniqueness (PG unique doesn't catch NULL+NULL)
      if (!loteValue) {
        const existing = await prisma.inventarioDroga.findFirst({
          where: { nombre, lote: null },
        })
        if (existing) {
          res.status(409).json({ message: 'Ya existe una droga con ese nombre sin lote específico' })
          return
        }
      }

      const droga = await prisma.inventarioDroga.create({
        data: { nombre, lote: loteValue, vencimiento: vencimientoValue, cantidad },
      })
      res.status(201).json(droga)
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        res.status(409).json({ message: `Ya existe una droga "${nombre}" con lote "${loteValue}"` })
        return
      }
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// ─── PUT /api/drogas/:id — editar registro (encargado) ────────────────────────

router.put(
  '/:id',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    const result = editarDrogaSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { nombre, lote, vencimiento, cantidad } = result.data

    try {
      const droga = await prisma.inventarioDroga.update({
        where: { id },
        data: {
          ...(nombre !== undefined ? { nombre } : {}),
          ...(lote !== undefined ? { lote: lote ?? null } : {}),
          ...(vencimiento !== undefined
            ? { vencimiento: vencimiento ? new Date(vencimiento + 'T00:00:00.000Z') : null }
            : {}),
          ...(cantidad !== undefined ? { cantidad } : {}),
        },
      })
      res.json(droga)
    } catch {
      res.status(404).json({ message: 'Droga no encontrada' })
    }
  }
)

// ─── DELETE /api/drogas/:id — eliminar (encargado) ───────────────────────────

router.delete(
  '/:id',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    try {
      await prisma.inventarioDroga.delete({ where: { id } })
      res.status(204).send()
    } catch {
      res.status(404).json({ message: 'Droga no encontrada' })
    }
  }
)

export default router
