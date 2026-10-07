import { Router } from 'express'
import { z } from 'zod'
import { platformDb as prisma } from '@platform/db'
import { requirePermission } from '../../middlewares/require-permission'
import { getOrCreateRemitoConfiguration, isCaiExpired, RemitoConfigurationConflict, updateRemitoConfiguration } from './remito-config-service'

const router = Router()
const updateSchema = z.object({
  proximoCorrelativo: z.number().int().min(1).max(99_999_999).optional(),
  cai: z.string().trim().regex(/^\d{14}$/, 'El CAI debe tener 14 dígitos').optional(),
  caiVencimiento: z.string().datetime().optional(),
}).refine((data) => Object.keys(data).length > 0, { message: 'Ingresá un cambio de configuración' })

function response(config: { puntoVenta: string; proximoCorrelativo: number | null; numeracionInicializadaAt: Date | null; cai: string; caiVencimiento: Date }) {
  return { ...config, caiVencido: isCaiExpired(config.caiVencimiento) }
}

router.get('/configuracion', requirePermission('ale-bet', 'remitos.create'), async (_req, res) => {
  const config = await prisma.$transaction((tx) => getOrCreateRemitoConfiguration(tx))
  res.json(response(config))
})

router.put('/configuracion', requirePermission('ale-bet', 'remitos.create'), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() }); return }
  const caiVencimiento = parsed.data.caiVencimiento ? new Date(parsed.data.caiVencimiento) : undefined
  try {
    const config = await prisma.$transaction((tx) => updateRemitoConfiguration(tx, {
      proximoCorrelativo: parsed.data.proximoCorrelativo,
      cai: parsed.data.cai,
      caiVencimiento,
    }))
    res.json(response(config))
  } catch (error) {
    if (error instanceof RemitoConfigurationConflict) { res.status(409).json({ error: error.message }); return }
    throw error
  }
})

export default router
