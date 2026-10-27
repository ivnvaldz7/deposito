export type FrascoStockInput = {
  unidadesPorCaja: number
  cantidadCajas: number
  unidadesSueltas: number
}

export type FrascoStock = FrascoStockInput & { total: number }

function assertUnidadesPorCaja(unidadesPorCaja: number): void {
  if (!Number.isInteger(unidadesPorCaja) || unidadesPorCaja <= 0) {
    throw new Error('Las unidades por caja deben ser un entero positivo')
  }
}

export function descomponerTotalFrasco(total: number, unidadesPorCaja: number): FrascoStock {
  assertUnidadesPorCaja(unidadesPorCaja)
  if (!Number.isInteger(total) || total < 0) throw new Error('El total de frascos debe ser un entero no negativo')

  return {
    unidadesPorCaja,
    cantidadCajas: Math.floor(total / unidadesPorCaja),
    unidadesSueltas: total % unidadesPorCaja,
    total,
  }
}

export function calcularStockFrasco(input: FrascoStockInput): FrascoStock {
  assertUnidadesPorCaja(input.unidadesPorCaja)
  if (!Number.isInteger(input.cantidadCajas) || input.cantidadCajas < 0) {
    throw new Error('La cantidad de cajas debe ser un entero no negativo')
  }
  if (!Number.isInteger(input.unidadesSueltas) || input.unidadesSueltas < 0 || input.unidadesSueltas >= input.unidadesPorCaja) {
    throw new Error('Las unidades sueltas deben ser menores que una caja')
  }

  return {
    ...input,
    total: input.cantidadCajas * input.unidadesPorCaja + input.unidadesSueltas,
  }
}

/** Legacy rows and test fixtures may not yet expose unidadesSueltas. */
export function obtenerUnidadesSueltas(input: { total: number; unidadesPorCaja: number; unidadesSueltas?: number }): number {
  return input.unidadesSueltas ?? descomponerTotalFrasco(input.total, input.unidadesPorCaja).unidadesSueltas
}
