import { Router } from 'express'
import { z } from 'zod'
import { platformDb as prisma } from '@platform/db'
import { requireApp } from '../../middlewares/require-app'

const router = Router()
const optionalContact = z.string().trim().min(1).max(120).optional()
const baseClienteSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  contacto: optionalContact,
  referencia: optionalContact,
  direccion: z.string().trim().max(200).optional(),
  localidad: z.string().trim().max(120).optional(),
  provincia: z.string().trim().max(120).optional(),
  cuit: z.string().trim().max(30).optional(),
  condicionIva: z.string().trim().max(80).optional(),
  condicionVenta: z.string().trim().max(80).optional(),
})
const updateClienteSchema = z.object({ nombre: z.string().min(2).max(120).optional(), contacto: z.string().max(120).optional().nullable(), referencia: z.string().max(120).optional().nullable(), direccion: z.string().max(200).optional().nullable(), localidad: z.string().max(120).optional().nullable(), provincia: z.string().max(120).optional().nullable(), cuit: z.string().max(30).optional().nullable(), condicionIva: z.string().max(80).optional().nullable(), condicionVenta: z.string().max(80).optional().nullable(), activo: z.boolean().optional(), estado: z.enum(['PENDIENTE_CLIENTE', 'VALIDADO']).optional() })

router.get('/', requireApp('ale-bet'), async (_req, res) => { res.json(await prisma.cliente.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } })) })
router.post('/', requireApp('ale-bet', ['admin', 'vendedor', 'facturacion']), async (req, res) => {
  const parsed = baseClienteSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() }); return }
  const role = (req.user?.apps['ale-bet']?.rol)
  
  if (role === 'vendedor' && !parsed.data.contacto && !parsed.data.referencia) {
    res.status(400).json({ error: 'Datos inválidos', details: { formErrors: [], fieldErrors: { contacto: ['Debe informar un contacto o referencia para crear un cliente'] } } })
    return
  }
  
  const estado = role === 'vendedor' ? 'PENDIENTE_CLIENTE' : 'VALIDADO'
  res.status(201).json(await prisma.cliente.create({ data: { ...parsed.data, estado } }))
})
router.put('/:id', requireApp('ale-bet', ['admin', 'facturacion']), async (req, res) => {
  const parsed = updateClienteSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() }); return }
  res.json(await prisma.cliente.update({ where: { id: String(req.params.id) }, data: parsed.data }))
})
router.post('/import', requireApp('ale-bet', ['admin', 'facturacion']), async (req, res) => {
  const parsed = z.object({ clientes: z.array(clienteSchema).min(1).max(500) }).safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() }); return }
  const result = await prisma.cliente.createMany({ data: parsed.data.clientes.map((cliente) => ({ ...cliente, estado: 'VALIDADO' })), skipDuplicates: true })
  res.status(201).json({ imported: result.count, total: parsed.data.clientes.length })
})
export default router
