import { Request, Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../../middlewares/require-permission'
import { CuarentenaLabelPrinterError, printCuarentenaLabel } from '../services/cuarentena-label-printer'

const router = Router()

const printCuarentenaSchema = z.object({
  itemId: z.string().uuid(),
  copias: z.number().int().min(1).max(100),
})

function formatIngresoDate(value: Date): string {
  const [year, month, day] = value.toISOString().slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

router.post('/cuarentena', authenticate, requirePermission('deposito', 'ingresos.create'), async (req: Request, res: Response): Promise<void> => {
  const parsed = printCuarentenaSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: 'Datos inválidos para imprimir la etiqueta.', errors: parsed.error.flatten() })
    return
  }

  try {
    const item = await prisma.actaItem.findUnique({
      where: { id: parsed.data.itemId },
      include: { acta: { select: { fecha: true } } },
    })
    if (!item) {
      res.status(404).json({ message: 'No se encontró el ingreso para imprimir.' })
      return
    }
    if (item.categoria !== 'droga') {
      res.status(422).json({ message: 'La etiqueta de cuarentena solo corresponde a materia prima.' })
      return
    }

    await printCuarentenaLabel({
      producto: item.productoNombre,
      lote: item.lote,
      fechaIngreso: formatIngresoDate(item.acta.fecha),
      copias: parsed.data.copias,
    })

    res.json({ message: `${parsed.data.copias} etiqueta${parsed.data.copias === 1 ? '' : 's'} enviada${parsed.data.copias === 1 ? '' : 's'} a la Brother QL-800.` })
  } catch (error) {
    if (error instanceof CuarentenaLabelPrinterError) {
      res.status(error.statusCode).json({ message: error.message })
      return
    }
    console.error('Cuarentena label print failed:', error)
    res.status(500).json({ message: 'No se pudo imprimir la etiqueta. El ingreso quedó registrado.' })
  }
})

export default router
