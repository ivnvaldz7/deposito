import { calcularUnidades } from './constants'
import type { Pedido, PedidoEstado } from './api'

export type RolAleBet = 'admin' | 'vendedor' | 'armador' | 'facturacion' | 'observador'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'warning-soft' | 'error' | 'info'

/**
 * Semantic card-level color tokens per order state.
 * Using inline CSS vars intentionally — these dark-mode colors do not exist
 * in the Tailwind theme and adding them as one-off utilities would pollute
 * the token space. Inline styles are the correct choice here.
 *
 * Contrast rationale (WCAG AA, dark mode):
 *   bg values are very dark (L ~12-18%), accent values are medium-light
 *   (L ~60-75%), ensuring ≥ 4.5:1 against the dark background.
 */
export interface CardStyle {
  /** CSS value for background-color */
  bg: string
  /** CSS value for border-color */
  border: string
  /** CSS value for accent / icon / secondary text */
  accent: string
  /** CSS value for background-color on hover (slightly lighter) */
  bgHover: string
  /** CSS value for border-color on hover */
  borderHover: string
}

export interface EstadoMeta {
  label: string
  variant: BadgeVariant
  /** Bandeja priority: lower sorts first. EN_ARMADO ranks below PREPARADO so the
   *  operational queue can boost "own EN_ARMADO" (0.5) between APROBADO and PREPARADO. */
  priority: number
  /** Semantic card-level styling — background, border, accent derived from state */
  card: CardStyle
  /** Short operational label shown below the client name */
  operativeLabel?: string
}

export const ESTADO_META: Record<PedidoEstado, EstadoMeta> = {
  BORRADOR: {
    label: 'Borrador',
    variant: 'default',
    priority: 3,
    operativeLabel: undefined,
    card: {
      bg:          '#151b17',           // surface-container — neutral, not competing
      border:      'rgba(255,255,255,0.07)',
      accent:      '#a4ada6',           // on-surface-variant
      bgHover:     '#1a211d',
      borderHover: 'rgba(255,255,255,0.12)',
    },
  },

  APROBADO: {
    label: 'Aprobado',
    variant: 'warning-soft',
    priority: 0,
    operativeLabel: 'Pendiente de armado',
    card: {
      // Rose-dark: comunicates "action required", not "error"
      bg:          '#2a1619',
      border:      '#5c2528',
      accent:      '#f28b8b',
      bgHover:     '#321b1e',
      borderHover: '#7a3035',
    },
  },

  EN_ARMADO: {
    label: 'En armado',
    variant: 'info',
    priority: 2,
    operativeLabel: 'En preparación',
    card: {
      // Teal-dark: "active work"
      bg:          '#112421',
      border:      '#1e5248',
      accent:      '#5ec9b8',
      bgHover:     '#162d29',
      borderHover: '#286b5e',
    },
  },

  PREPARADO: {
    label: 'Preparado',
    variant: 'info',
    priority: 1,
    operativeLabel: 'Listo para despacho',
    card: {
      // Blue-dark: "ready / waiting next step"
      bg:          '#111e2e',
      border:      '#1a3b5c',
      accent:      '#62a8ff',
      bgHover:     '#162437',
      borderHover: '#234e78',
    },
  },

  DESPACHADO: {
    label: 'Despachado',
    variant: 'success',
    priority: 4,
    operativeLabel: 'Pedido despachado',
    card: {
      // Green-dark: "done / shipped"
      bg:          '#0f2420',
      border:      '#1a4d3a',
      accent:      '#5ee6a1',
      bgHover:     '#132c27',
      borderHover: '#22654d',
    },
  },

  CANCELADO: {
    label: 'Cancelado',
    variant: 'error',
    priority: 5,
    operativeLabel: undefined,
    card: {
      // Muted destructive: "closed / inactive" — less vivid than APROBADO rose
      bg:          '#1c1416',
      border:      '#3d1f22',
      accent:      '#c47878',
      bgHover:     '#211618',
      borderHover: '#4f282c',
    },
  },
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

import { roleHasPermission } from '@platform/core/permissions'

export function canAprobar(pedido: Pedido, rol: string, userId: string): boolean {
  if (pedido.estado !== 'BORRADOR') return false
  if (roleHasPermission('ale-bet', rol, 'pedidos.approve')) return true
  return rol === 'vendedor' && pedido.vendedorId === userId // ownership
}

export function canTomar(pedido: Pedido, rol: string, userId: string): boolean {
  return roleHasPermission('ale-bet', rol, 'pedidos.take') && pedido.estado === 'APROBADO'
}

export function canPreparar(pedido: Pedido, rol: string, userId: string): boolean {
  if (pedido.estado !== 'EN_ARMADO') return false
  if (!roleHasPermission('ale-bet', rol, 'pedidos.prepare')) return false
  if (rol !== 'admin' && rol !== 'encargado' && !esArmadorAsignado(pedido, userId)) return false
  return pedido.items.length > 0 && pedido.items.every((item) => item.completado)
}

export function canDespachar(pedido: Pedido, rol: string, userId: string): boolean {
  if (!roleHasPermission('ale-bet', rol, 'pedidos.dispatch') || pedido.estado !== 'PREPARADO') return false
  if (rol !== 'admin' && rol !== 'encargado' && !esArmadorAsignado(pedido, userId)) return false
  return Boolean(pedido.remitos?.some((r) => r.estado === 'VIGENTE'))
}

export function canCancelarDirecto(pedido: Pedido, rol: string, userId: string): boolean {
  if (pedido.estado !== 'BORRADOR' && pedido.estado !== 'APROBADO') return false
  if (roleHasPermission('ale-bet', rol, 'pedidos.cancel')) return true
  return rol === 'vendedor' && pedido.vendedorId === userId
}

export function canSolicitarCancelacion(pedido: Pedido, rol: string, userId: string): boolean {
  if (pedido.estado !== 'EN_ARMADO' || pedido.cancelacionSolicitadaAt) return false
  if (roleHasPermission('ale-bet', rol, 'pedidos.cancel')) return true
  return rol === 'vendedor' && pedido.vendedorId === userId
}

export function canConfirmarCancelacion(pedido: Pedido, rol: string, userId: string): boolean {
  if (!roleHasPermission('ale-bet', rol, 'pedidos.confirm_cancel') || pedido.estado !== 'EN_ARMADO' || !pedido.cancelacionSolicitadaAt) return false
  if (rol !== 'admin' && rol !== 'encargado' && !esArmadorAsignado(pedido, userId)) return false
  return true
}

export function canEmitirRemito(pedido: Pedido, rol: string): boolean {
  if (!roleHasPermission('ale-bet', rol, 'remitos.create')) return false
  if (pedido.estado !== 'APROBADO' && pedido.estado !== 'EN_ARMADO' && pedido.estado !== 'PREPARADO') return false
  return !pedido.remitos?.some((r) => r.estado === 'VIGENTE')
}

export function canAccionesBarraArmador(pedido: Pedido, rol: string, userId: string): boolean {
  if (!roleHasPermission('ale-bet', rol, 'pedidos.take') && !roleHasPermission('ale-bet', rol, 'pedidos.prepare')) return false
  return (
    canTomar(pedido, rol, userId) ||
    (pedido.estado === 'EN_ARMADO' && (rol === 'admin' || rol === 'encargado' || esArmadorAsignado(pedido, userId))) ||
    canDespachar(pedido, rol, userId) ||
    canConfirmarCancelacion(pedido, rol, userId)
  )
}

export function canEditarPedido(pedido: Pedido, rol: string, userId: string): boolean {
  if (pedido.estado !== 'BORRADOR' && pedido.estado !== 'APROBADO') return false
  if (roleHasPermission('ale-bet', rol, 'pedidos.edit')) return true
  return rol === 'vendedor' && pedido.vendedorId === userId
}

export function canGestionarStock(rol: string | undefined): boolean {
  if (!rol) return false
  return roleHasPermission('ale-bet', rol, 'stock.lots.create') || roleHasPermission('ale-bet', rol, 'stock.lots.adjust')
}
