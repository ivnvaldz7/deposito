export type MovimientoSeedRow = {
  nombre: string
  lote: string
  unidadesPorCaja: number
  cajas: number
  sueltos: number
  total: number
}

export type AleBetSeedPlan = {
  productos: Array<{ nombre: string; unidadesPorCaja: number }>
  lotes: MovimientoSeedRow[]
}

function parsePositiveInteger(value: string, column: string, rowNumber: number): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`CAJA inválida en fila ${rowNumber} (${column})`)
  }
  return parsed
}

function parseNonNegativeInteger(value: string, column: string, rowNumber: number): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${column} inválido en fila ${rowNumber}`)
  }
  return parsed
}

export function buildAleBetSeedPlan(rows: string[][]): AleBetSeedPlan {
  const products = new Map<string, number>()
  const lotes: MovimientoSeedRow[] = []

  for (let index = 1; index < rows.length; index += 1) {
    const [rawNombre, rawLote, rawCaja, rawCant, rawSuelto, rawTotal] = rows[index] ?? []
    const nombre = rawNombre?.trim()
    if (!nombre || nombre.startsWith('---') || nombre.startsWith('///')) continue

    const rowNumber = index + 1
    const unidadesPorCaja = parsePositiveInteger(rawCaja ?? '', 'CAJA', rowNumber)
    const cajasFuente = parseNonNegativeInteger(rawCant ?? '', 'CANT.', rowNumber)
    const sueltosFuente = parseNonNegativeInteger(rawSuelto ?? '', 'SUELTO', rowNumber)
    const total = parseNonNegativeInteger(rawTotal ?? '', 'TOTAL', rowNumber)
    const totalFuente = cajasFuente * unidadesPorCaja + sueltosFuente
    if (totalFuente !== total) {
      throw new Error(`TOTAL inconsistente en fila ${rowNumber} para ${nombre}: CAJA * CANT. + SUELTO = ${totalFuente}, TOTAL = ${total}`)
    }

    const existing = products.get(nombre)
    if (existing !== undefined && existing !== unidadesPorCaja) {
      throw new Error(`CAJA inconsistente para ${nombre}: ${existing} y ${unidadesPorCaja}`)
    }
    products.set(nombre, unidadesPorCaja)

    if (total === 0) continue
    lotes.push({
      nombre,
      lote: rawLote?.trim() ?? '',
      unidadesPorCaja,
      cajas: Math.floor(total / unidadesPorCaja),
      sueltos: total % unidadesPorCaja,
      total,
    })
  }

  return {
    productos: [...products.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([nombre, unidadesPorCaja]) => ({ nombre, unidadesPorCaja })),
    lotes,
  }
}
