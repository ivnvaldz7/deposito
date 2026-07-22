import { Router } from 'express'
import { z } from 'zod'
import { platformDb as prisma } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { requireApp } from '../../middlewares/require-app'

const router = Router()

const clienteSchema = z.object({
  nombre: z.string().min(2).max(120),
  contacto: z.string().max(120).optional(),
  direccion: z.string().max(200).optional(),
})

const updateClienteSchema = z.object({
  nombre: z.string().min(2).max(120).optional(),
  contacto: z.string().max(120).optional().nullable(),
  direccion: z.string().max(200).optional().nullable(),
  activo: z.boolean().optional(),
})

router.get('/', requireApp('ale-bet'), async (_req, res) => {
  const clientes = await prisma.cliente.findMany({
    where: { activo: true },
    orderBy: { nombre: 'asc' },
  })

  res.json(clientes)
})

router.post('/', requireApp('ale-bet', ['admin', 'vendedor']), async (req, res) => {
  const parsed = clienteSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    return
  }

  const cliente = await prisma.cliente.create({
    data: parsed.data,
  })

  res.status(201).json(cliente)
})

router.put('/:id', requireApp('ale-bet', ['admin']), async (req, res) => {
  const clienteId = String(req.params.id)
  const parsed = updateClienteSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    return
  }

  const cliente = await prisma.cliente.update({
    where: { id: clienteId },
    data: parsed.data,
  })

  res.json(cliente)
})

export default router
