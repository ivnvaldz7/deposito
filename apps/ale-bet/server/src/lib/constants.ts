export const UNIDADES_POR_CAJA = 15
export const MAX_SUELTOS = UNIDADES_POR_CAJA - 1
export const VENCIMIENTO_DEFAULT_AÑOS = 2

export function calcularUnidades(cajas: number, sueltos: number): number {
  return cajas * UNIDADES_POR_CAJA + sueltos
}
