import { Mercado } from '@prisma/client'
import type { Router, Response } from 'express'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth'
import { requireRole } from '../../middleware/require-role'

export const MERCADOS_VALIDOS = Object.values(Mercado) as [Mercado, ...Mercado[]]

export const crearMercadoInventorySchema = z.object({
  articulo: z.string().min(2).max(150),
  mercado: z.enum(MERCADOS_VALIDOS),
  cantidad: z.number().int().min(0),
})

export const editarMercadoInventorySchema = z
  .object({
    articulo: z.string().min(2).max(150).optional(),
    mercado: z.enum(MERCADOS_VALIDOS).optional(),
    cantidad: z.number().int().min(0).optional(),
  })
  .refine((data) => data.articulo !== undefined || data.mercado !== undefined || data.cantidad !== undefined, {
    message: 'Al menos un campo requerido',
  })

export function resolveMercadoQuery(mercado: unknown): Mercado | undefined {
  if (typeof mercado !== 'string') {
    return undefined
  }

  return MERCADOS_VALIDOS.includes(mercado as Mercado) ? (mercado as Mercado) : undefined
}

export function getMercadoInventoryOrderBy() {
  return [{ mercado: 'asc' as const }, { articulo: 'asc' as const }]
}

export type CrearMercadoInventoryData = z.infer<typeof crearMercadoInventorySchema>
export type EditarMercadoInventoryData = z.infer<typeof editarMercadoInventorySchema>
export type MercadoInventoryOrderBy = ReturnType<typeof getMercadoInventoryOrderBy>

interface MercadoInventoryRecord {
  id: string
  articulo: string
  mercado: Mercado
  cantidad: number
}

interface MercadoInventoryOperations<TRecord extends MercadoInventoryRecord, TWhereInput> {
  buildWhere: (mercado?: Mercado) => TWhereInput
  findMany: (args: { where: TWhereInput; orderBy: MercadoInventoryOrderBy }) => Promise<TRecord[]>
  findByComposite: (articulo: string, mercado: Mercado) => Promise<TRecord | null>
  findById: (id: string) => Promise<TRecord | null>
  findConflict: (articulo: string, mercado: Mercado, id: string) => Promise<TRecord | null>
  create: (data: CrearMercadoInventoryData) => Promise<TRecord>
  update: (id: string, data: Partial<CrearMercadoInventoryData>) => Promise<TRecord>
  delete: (id: string) => Promise<void>
}

interface MercadoInventoryRouteMessages {
  conflict: string
  notFound: string
}

interface RegisterMercadoInventoryRoutesOptions<TRecord extends MercadoInventoryRecord, TWhereInput> {
  router: Router
  operations: MercadoInventoryOperations<TRecord, TWhereInput>
  messages: MercadoInventoryRouteMessages
}

export function parseCrearMercadoInventoryBody(body: unknown) {
  return crearMercadoInventorySchema.safeParse(body)
}

export function parseEditarMercadoInventoryBody(body: unknown) {
  return editarMercadoInventorySchema.safeParse(body)
}

export function sendInvalidMercadoInventoryBody(res: Response, error: z.ZodError) {
  res.status(400).json({ message: 'Datos inválidos', errors: error.flatten() })
}

export async function hasMercadoInventoryConflict<TRecord extends MercadoInventoryRecord>(
  findByComposite: MercadoInventoryOperations<TRecord, unknown>['findByComposite'],
  articulo: string,
  mercado: Mercado
) {
  const existing = await findByComposite(articulo, mercado)
  return Boolean(existing)
}

export async function resolveMercadoInventoryUpdate<TRecord extends MercadoInventoryRecord>(
  operations: Pick<MercadoInventoryOperations<TRecord, unknown>, 'findById' | 'findConflict'>,
  id: string,
  data: EditarMercadoInventoryData
) {
  const existing = await operations.findById(id)
  if (!existing) {
    return { existing: null, hasConflict: false }
  }

  const nextArticulo = data.articulo ?? existing.articulo
  const nextMercado = data.mercado ?? existing.mercado

  if (data.articulo !== undefined || data.mercado !== undefined) {
    const conflict = await operations.findConflict(nextArticulo, nextMercado, id)
    if (conflict) {
      return { existing, hasConflict: true }
    }
  }

  return { existing, hasConflict: false }
}

export function buildMercadoInventoryUpdateData(data: EditarMercadoInventoryData): Partial<CrearMercadoInventoryData> {
  return {
    ...(data.articulo !== undefined ? { articulo: data.articulo } : {}),
    ...(data.mercado !== undefined ? { mercado: data.mercado } : {}),
    ...(data.cantidad !== undefined ? { cantidad: data.cantidad } : {}),
  }
}

export function registerMercadoInventoryRoutes<TRecord extends MercadoInventoryRecord, TWhereInput>({
  router,
  operations,
  messages,
}: RegisterMercadoInventoryRoutesOptions<TRecord, TWhereInput>) {
  router.get('/', authenticate, async (req, res): Promise<void> => {
    const mercadoValue = resolveMercadoQuery(req.query['mercado'])

    try {
      const items = await operations.findMany({
        where: operations.buildWhere(mercadoValue),
        orderBy: getMercadoInventoryOrderBy(),
      })
      res.json(items)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  })

  router.post('/', authenticate, requireRole('encargado'), async (req, res): Promise<void> => {
    const result = parseCrearMercadoInventoryBody(req.body)
    if (!result.success) {
      sendInvalidMercadoInventoryBody(res, result.error)
      return
    }

    const { articulo, mercado, cantidad } = result.data

    try {
      if (await hasMercadoInventoryConflict(operations.findByComposite, articulo, mercado)) {
        res.status(409).json({ message: messages.conflict })
        return
      }

      const item = await operations.create({ articulo, mercado, cantidad })
      res.status(201).json(item)
    } catch {
      res.status(500).json({ message: 'Error interno del servidor' })
    }
  })

  router.put('/:id', authenticate, requireRole('encargado'), async (req, res): Promise<void> => {
    const id = req.params['id'] as string
    const result = parseEditarMercadoInventoryBody(req.body)
    if (!result.success) {
      sendInvalidMercadoInventoryBody(res, result.error)
      return
    }

    try {
      const resolution = await resolveMercadoInventoryUpdate(operations, id, result.data)
      if (!resolution.existing) {
        res.status(404).json({ message: messages.notFound })
        return
      }

      if (resolution.hasConflict) {
        res.status(409).json({ message: messages.conflict })
        return
      }

      const item = await operations.update(id, buildMercadoInventoryUpdateData(result.data))
      res.json(item)
    } catch {
      res.status(404).json({ message: messages.notFound })
    }
  })

  router.delete('/:id', authenticate, requireRole('encargado'), async (req, res): Promise<void> => {
    const id = req.params['id'] as string
    try {
      await operations.delete(id)
      res.status(204).send()
    } catch {
      res.status(404).json({ message: messages.notFound })
    }
  })
}
