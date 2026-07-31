export type IngresoCategoria = 'droga' | 'estuche' | 'etiqueta' | 'frasco'
export type IngresoEstado = 'PENDIENTE_REVISION' | 'ACTIVO' | 'INACTIVO'

export interface IngresoCatalogoInput {
  categoria: IngresoCategoria
  estado: IngresoEstado | null
  mercadosHabilitados: string[]
  mercado?: string
  cantidad?: number
  cantidadCajas?: number
  unidadesPorCaja?: number
  lote?: string
  vencimiento?: string
}

export function validateIngresoCatalogo(input: IngresoCatalogoInput): void {
  if (input.estado !== 'ACTIVO') throw new Error('El producto debe estar activo para registrar ingresos')
  const usaMercado = input.categoria === 'etiqueta' || input.categoria === 'estuche'
  if (usaMercado) {
    if (!input.mercado) throw new Error('El mercado es obligatorio para etiquetas y estuches')
    if (!input.mercadosHabilitados.includes(input.mercado)) throw new Error('El mercado no está habilitado para el producto')
    if (!input.cantidad) throw new Error('La cantidad es obligatoria')
    return
  }
  if (input.mercado) throw new Error('Esta categoría no utiliza mercado')
  if (input.categoria === 'droga' && !input.lote) throw new Error('El lote es obligatorio para materia prima')
  if (input.categoria === 'droga' && !input.vencimiento) throw new Error('El vencimiento es obligatorio para materia prima')
  if (input.categoria === 'droga' && !input.cantidad) throw new Error('La cantidad es obligatoria')
  if (input.categoria === 'frasco' && (!input.cantidadCajas || !input.unidadesPorCaja)) throw new Error('Frasco requiere cantidadCajas y unidadesPorCaja')
}
