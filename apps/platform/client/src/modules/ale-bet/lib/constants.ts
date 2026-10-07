export function calcularUnidades(cajas: number, sueltos: number, unidadesPorCaja: number): number {
  return cajas * unidadesPorCaja + sueltos
}

export function maxSueltos(unidadesPorCaja: number): number {
  return unidadesPorCaja - 1
}
