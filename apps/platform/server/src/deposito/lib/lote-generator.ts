import { prisma } from './prisma'

/**
 * Genera el siguiente lote secuencial para productos ME (no drogas).
 *
 * Busca el número más alto entre todos los items de ME existentes (extrayendo
 * solo la parte numérica del lote) y devuelve ese número + 1 como string.
 *
 * Ejemplos:
 *   - Último lote "3435" → devuelve "3436"
 *   - Último lote "EST-0007" → devuelve "8"
 *   - Sin items previos → devuelve "1"
 *
 * Nota: no usa una transacción de DB para reservar el número, por lo que en
 * alta concurrencia podría haber colisiones (aceptable para MVP).
 */
export async function generarLote(): Promise<string> {
  const result = await prisma.$queryRaw<{ max_num: number | null }[]>`
    SELECT MAX(CAST(REGEXP_REPLACE(lote, '[^0-9]', '', 'g') AS INTEGER)) as max_num
    FROM deposito.acta_items
    WHERE categoria != 'droga'
  `

  const maxNum = result[0]?.max_num ?? 0
  return String(maxNum + 1)
}
