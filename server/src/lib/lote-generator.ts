import { Categoria } from '@prisma/client'
import { prisma } from './prisma'

type CategoriaConLoteAuto = Exclude<Categoria, 'droga'>

const PREFIJOS: Record<CategoriaConLoteAuto, string> = {
  estuche: 'EST',
  etiqueta: 'ETQ',
  frasco: 'FRA',
}

/**
 * Genera el siguiente lote secuencial para una categoría que no sea droga.
 * Formato: "EST-0001", "ETQ-0002", "FRA-0003", etc.
 *
 * Nota: no usa una transacción de DB para reservar el número, por lo que en
 * alta concurrencia podría haber colisiones (aceptable para MVP).
 */
export async function generarLote(categoria: CategoriaConLoteAuto): Promise<string> {
  const prefijo = PREFIJOS[categoria]

  const ultimoItem = await prisma.actaItem.findFirst({
    where: {
      categoria,
      lote: { startsWith: `${prefijo}-` },
    },
    orderBy: { createdAt: 'desc' },
    select: { lote: true },
  })

  let siguienteNum = 1
  if (ultimoItem?.lote) {
    const numStr = ultimoItem.lote.slice(prefijo.length + 1) // "EST-0007" → "0007"
    const num = parseInt(numStr, 10)
    if (!isNaN(num)) siguienteNum = num + 1
  }

  return `${prefijo}-${String(siguienteNum).padStart(4, '0')}`
}
