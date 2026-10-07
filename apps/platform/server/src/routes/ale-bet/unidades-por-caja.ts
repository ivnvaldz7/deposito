export const VENCIMIENTO_DEFAULT_AÑOS = 2

export function validarUnidadesPorCaja(unidadesPorCaja: number): boolean {
  return Number.isInteger(unidadesPorCaja) && unidadesPorCaja > 0
}

export function validarSueltos(sueltos: number, unidadesPorCaja: number): boolean {
  return Number.isInteger(sueltos)
    && sueltos >= 0
    && validarUnidadesPorCaja(unidadesPorCaja)
    && sueltos < unidadesPorCaja
}

export function calcularUnidades(cajas: number, sueltos: number, unidadesPorCaja: number): number {
  return cajas * unidadesPorCaja + sueltos
}

export function descomponerUnidades(unidades: number, unidadesPorCaja: number): { cajas: number; sueltos: number } {
  if (!Number.isInteger(unidades) || unidades < 0 || !validarUnidadesPorCaja(unidadesPorCaja)) {
    throw new Error('Cantidad o unidades por caja inválidas')
  }

  return {
    cajas: Math.floor(unidades / unidadesPorCaja),
    sueltos: unidades % unidadesPorCaja,
  }
}
