import { Mercado } from '@prisma/client'
import { z } from 'zod'

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
