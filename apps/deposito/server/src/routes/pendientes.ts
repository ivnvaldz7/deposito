import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { EstadoPendiente } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { requireRole } from '../middleware/require-role'

const router = Router()

const crearPendienteSchema = z.object({
  articulo: z.string().min(2).max(150),
  cantidad: z.number().int().positive(),
  destino: z.string().min(2).max(200),
  fechaEnvio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido (YYYY-MM-DD)'),
  fechaRetornoEstimada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notas: z.string().max(500).optional(),
})

const editarPendienteSchema = z
  .object({
    articulo: z.string().min(2).max(150).optional(),
    cantidad: z.number().int().positive().optional(),
    destino: z.string().min(2).max(200).optional(),
    fechaEnvio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    fechaRetornoEstimada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    notas: z.string().max(500).nullable().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'Al menos un campo requerido',
  })

const recibirPendienteSchema = z.object({
  cantidadRecibida: z.number().int().positive(),
})

const include = { user: { select: { name: true } } } as const

// ─── GET /api/pendientes ──────────────────────────────────────────────────────

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { estado } = req.query
  const where: { estado?: EstadoPendiente } = {}
  if (estado === 'en_esterilizacion' || estado === 'recibido') {
    where.estado = estado as EstadoPendiente
  }

  try {
    const pendientes = await prisma.insumoPendiente.findMany({
      where,
      orderBy: { fechaEnvio: 'desc' },
      include,
    })
    res.json(pendientes)
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// ─── POST /api/pendientes ─────────────────────────────────────────────────────

router.post(
  '/',
  authenticate,
  requireRole('encargado'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const result = crearPendienteSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { articulo, cantidad, destino, fechaEnvio, fechaRetornoEstimada, notas } = result.data

    try {
      const pendiente = await prisma.insumoPendiente.create({
        data: {
          articulo,
          cantidad,
          destino,
          fechaEnvio: new Date(fechaEnvio + 'T00:00:00.000Z'),
          fechaRetornoEstimada: fechaRetornoEstimada
            ? new Date(fechaRetornoEstimada + 'T00:00:00.000Z')
            : null,
          notas: notas ?? null,
          createdBy: req.user!.id,
        },
        include,
      })
      res.status(201).json(pendiente)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

// ─── PUT /api/pendientes/:id ──────────────────────────────────────────────────

router.put(
  '/:id',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    const result = editarPendienteSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { articulo, cantidad, destino, fechaEnvio, fechaRetornoEstimada, notas } = result.data

    try {
      const existing = await prisma.insumoPendiente.findUnique({ where: { id } })
      if (!existing) {
        res.status(404).json({ message: 'Pendiente no encontrado' })
        return
      }

      const pendiente = await prisma.insumoPendiente.update({
        where: { id },
        data: {
          ...(articulo !== undefined ? { articulo } : {}),
          ...(cantidad !== undefined ? { cantidad } : {}),
          ...(destino !== undefined ? { destino } : {}),
          ...(fechaEnvio !== undefined
            ? { fechaEnvio: new Date(fechaEnvio + 'T00:00:00.000Z') }
            : {}),
          ...(fechaRetornoEstimada !== undefined
            ? {
                fechaRetornoEstimada: fechaRetornoEstimada
                  ? new Date(fechaRetornoEstimada + 'T00:00:00.000Z')
                  : null,
              }
            : {}),
          ...(notas !== undefined ? { notas } : {}),
        },
        include,
      })
      res.json(pendiente)
    } catch {
      res.status(404).json({ message: 'Pendiente no encontrado' })
    }
  }
)

// ─── PUT /api/pendientes/:id/recibir ─────────────────────────────────────────

router.put(
  '/:id/recibir',
  authenticate,
  requireRole('encargado'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string

    const result = recibirPendienteSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() })
      return
    }

    const { cantidadRecibida } = result.data

    try {
      const existing = await prisma.insumoPendiente.findUnique({ where: { id } })
      if (!existing) {
        res.status(404).json({ message: 'Pendiente no encontrado' })
        return
      }
      if (existing.estado === 'recibido') {
        res.status(409).json({ message: 'El pendiente ya está marcado como recibido' })
        return
      }

      if (cantidadRecibida > existing.cantidad) {
        res.status(400).json({ message: 'La cantidad recibida no puede superar la cantidad enviada' })
        return
      }

      const fechaRecibido = new Date()

      const response = await prisma.$transaction(async (tx) => {
        const recibido = await tx.insumoPendiente.update({
          where: { id },
          data: {
            cantidad: cantidadRecibida,
            estado: 'recibido',
            fechaRecibido,
          },
          include,
        })

        let pendienteRestante = null

        if (cantidadRecibida < existing.cantidad) {
          pendienteRestante = await tx.insumoPendiente.create({
            data: {
              categoria: existing.categoria,
              articulo: existing.articulo,
              cantidad: existing.cantidad - cantidadRecibida,
              destino: existing.destino,
              estado: 'en_esterilizacion',
              fechaEnvio: existing.fechaEnvio,
              fechaRetornoEstimada: existing.fechaRetornoEstimada,
              notas: existing.notas,
              createdBy: existing.createdBy,
            },
            include,
          })
        }

        return { recibido, pendienteRestante }
      })

      res.json(response)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  }
)

export default router
