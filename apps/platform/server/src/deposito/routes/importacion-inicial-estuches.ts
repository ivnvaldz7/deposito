import { Router } from 'express'
import { z } from 'zod'
import { Mercado } from '@platform/db'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../../middlewares/require-permission'
import { ImportacionInicialEstuchesService, InitialEstuchesImportError } from '../services/importacion-inicial-estuches-service'

const router = Router()
const service = new ImportacionInicialEstuchesService(prisma)
const mercados = ['argentina', 'colombia', 'bolivia', 'ecuador', 'paraguay', 'VENEZUELA', 'mexico'] as const satisfies readonly Mercado[]

const payloadSchema = z.object({
  rows: z.array(z.object({
    sourceRow: z.number().int().positive(),
    nombreBase: z.string().trim().min(1).max(100),
    nombreCompleto: z.string().trim().min(1).max(200),
    presentacion: z.number().int().positive(),
    mercado: z.enum(mercados),
    categoria: z.enum(['estuche', 'etiqueta']).optional(),
    codigo: z.string().trim().min(1).max(100).optional(),
  }).strict()).min(1),
}).strict()

router.post('/estuches-inicial', authenticate, requirePermission('deposito', 'importaciones_iniciales.create'), async (req, res): Promise<void> => {
  const parsed = payloadSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: 'Datos inválidos', errors: parsed.error.flatten() })
    return
  }
  try {
    const response = await service.import(parsed.data)
    res.status(response.replay ? 200 : 201).json(response.result)
  } catch (error) {
    if (error instanceof InitialEstuchesImportError) {
      res.status(error.code === 'CONFLICT' ? 409 : 400).json({ message: error.message })
      return
    }
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

export default router
