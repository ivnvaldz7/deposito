import { Router } from 'express'
import { z } from 'zod'
import { platformDb as prisma } from '@platform/db'
import { requirePermission } from '../../middlewares/require-permission'

const router = Router()
const schema = z.object({ nombre: z.string().trim().min(2).max(160), direccion: z.string().trim().min(2).max(240), activo: z.boolean().optional() })

router.get('/', requirePermission('ale-bet', 'transportistas.read'), async (_req, res) => {
  res.json(await prisma.transportista.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }))
})
router.post('/', requirePermission('ale-bet', 'transportistas.manage'), async (req, res) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() }); return }
  res.status(201).json(await prisma.transportista.create({ data: parsed.data }))
})
router.patch('/:id', requirePermission('ale-bet', 'transportistas.manage'), async (req, res) => {
  const parsed = schema.partial().safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() }); return }
  res.json(await prisma.transportista.update({ where: { id: String(req.params.id) }, data: parsed.data }))
})
export default router