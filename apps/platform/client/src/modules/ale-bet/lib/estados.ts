import { calcularUnidades } from './constants'
import type { Pedido, PedidoEstado } from './api'

export type RolAleBet = 'admin' | 'vendedor' | 'armador' | 'facturacion' | 'observador'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'warning-soft' | 'error' | 'info'

export interface EstadoMeta {
  label: string
  variant: BadgeVariant
  /** Bandeja priority: lower sorts first. EN_ARMADO ranks below PREPARADO so the
   *  operational queue can boost "own EN_ARMADO" (0.5) between APROBADO and PREPARADO. */
  priority: number
}

export const ESTADO_META: Record<PedidoEstado, EstadoMeta> = {
  BORRADOR: { label: 'Borrador', variant: 'default', priority: 3 },
  APROBADO: { label: 'Aprobado', variant: 'warning-soft', priority: 0 },
  EN_ARMADO: { label: 'En armado', variant: 'info', priority: 2 },
  PREPARADO: { label: 'Preparado', variant: 'info', priority: 1 },
  DESPACHADO: { label: 'Despachado', variant: 'success', priority: 4 },
  CANCELADO: { label: 'Cancelado', variant: 'error', priority: 5 },
}

export function calcularCajasSueltos(cantidad: number, unidadesPorCaja: number): { cajas: number; sueltos: number } {
  return { cajas: Math.floor(cantidad / unidadesPorCaja), sueltos: cantidad % unidadesPorCaja }
}

export function cantidadLinea(cajas: number, sueltos: number, unidadesPorCaja: number): number {
  return calcularUnidades(cajas, sueltos, unidadesPorCaja)
}

export function pedidoClientePendiente(pedido: Pedido): boolean {
  return pedido.cliente?.estado === 'PENDIENTE_CLIENTE'
}

export function esArmadorAsignado(pedido: Pedido, userId: string): boolean {
  return pedido.armadorId === userId
}

export function canAprobar(pedido: Pedido, rol: string, userId: string): boolean {
  if (pedido.estado !== 'BORRADOR') return false
  if (rol === 'admin') return true
  return rol === 'vendedor' && pedido.vendedorId === userId
}

export function canTomar(pedido: Pedido, rol: string, userId: string): boolean {
  return (rol === 'admin' || rol === 'armador') && pedido.estado === 'APROBADO'
}

export function canPreparar(pedido: Pedido, rol: string, userId: string): boolean {
  if (pedido.estado !== 'EN_ARMADO') return false
  if (rol !== 'admin' && rol !== 'armador') return false
  if (rol !== 'admin' && !esArmadorAsignado(pedido, userId)) return false
  return pedido.items.length > 0 && pedido.items.every((item) => item.completado)
}

export function canDespachar(pedido: Pedido, rol: string, userId: string): boolean {
  return (
    (rol === 'admin' || rol === 'armador') &&
    pedido.estado === 'PREPARADO' &&
    Boolean(pedido.remitos?.some((r) => r.estado === 'VIGENTE'))
  )
}

export function canCancelarDirecto(pedido: Pedido, rol: string, userId: string): boolean {
  if (pedido.estado !== 'BORRADOR' && pedido.estado !== 'APROBADO') return false
  if (rol === 'admin') return true
  return rol === 'vendedor' && pedido.vendedorId === userId
}

export function canSolicitarCancelacion(pedido: Pedido, rol: string, userId: string): boolean {
  if (pedido.estado !== 'EN_ARMADO' || pedido.cancelacionSolicitadaAt) return false
  if (rol === 'admin') return true
  return rol === 'vendedor' && pedido.vendedorId === userId
}

export function canConfirmarCancelacion(pedido: Pedido, rol: string, userId: string): boolean {
  return (
    (rol === 'admin' || rol === 'armador') &&
    pedido.estado === 'EN_ARMADO' &&
    Boolean(pedido.cancelacionSolicitadaAt)
  )
}

export function canEmitirRemito(pedido: Pedido, rol: string): boolean {
  if (rol !== 'admin' && rol !== 'facturacion') return false
  if (pedido.estado !== 'APROBADO' && pedido.estado !== 'EN_ARMADO' && pedido.estado !== 'PREPARADO') return false
  return !pedido.remitos?.some((r) => r.estado === 'VIGENTE')
}

export function canAccionesBarraArmador(pedido: Pedido, rol: string, userId: string): boolean {
  if (rol !== 'admin' && rol !== 'armador') return false
  return (
    canTomar(pedido, rol, userId) ||
    (pedido.estado === 'EN_ARMADO' && (rol === 'admin' || esArmadorAsignado(pedido, userId))) ||
    canDespachar(pedido, rol, userId) ||
    canConfirmarCancelacion(pedido, rol, userId)
  )
}

export function canEditarPedido(pedido: Pedido, rol: string, userId: string): boolean {
  if (pedido.estado !== 'BORRADOR' && pedido.estado !== 'APROBADO') return false
  if (rol === 'admin') return true
  return rol === 'vendedor' && pedido.vendedorId === userId
}
