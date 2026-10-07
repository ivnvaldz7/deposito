export const orderStates = [
  'BORRADOR',
  'APROBADO',
  'PENDIENTE_PRODUCCION',
  'PENDIENTE_PARCIAL',
  'EN_ARMADO',
  'PREPARADO',
  'DESPACHADO',
  'CANCELADO',
] as const

export type OrderState = (typeof orderStates)[number]

const transitions: Readonly<Record<OrderState, readonly OrderState[]>> = {
  BORRADOR: ['APROBADO', 'CANCELADO'],
  APROBADO: ['EN_ARMADO', 'CANCELADO'],
  PENDIENTE_PRODUCCION: ['PENDIENTE_PARCIAL', 'PREPARADO', 'CANCELADO'],
  PENDIENTE_PARCIAL: ['PREPARADO', 'DESPACHADO', 'CANCELADO'],
  EN_ARMADO: ['PREPARADO', 'CANCELADO'],
  PREPARADO: ['DESPACHADO', 'CANCELADO'],
  DESPACHADO: [],
  CANCELADO: [],
}

export function canTransitionOrder(from: OrderState, to: OrderState): boolean {
  return transitions[from].includes(to)
}

export function canEditOrder(state: OrderState): boolean {
  return state === 'BORRADOR' || state === 'APROBADO'
}

export function canCancelOrder(state: OrderState): boolean {
  return state !== 'DESPACHADO' && state !== 'CANCELADO'
}

export function canConfirmDispatch(state: OrderState, hasValidRemito: boolean): boolean {
  return state === 'PREPARADO' && hasValidRemito
}

/**
 * Automation confirms an order after consuming its FEFO reservation.  It
 * deliberately remains APROBADO because it does not use the manual armador /
 * despacho flow.  Returns must follow the consumption, not the screen label.
 */
export function canReturnConsumedOrder(origen: 'MANUAL' | 'AUTOMATION', state: OrderState): boolean {
  return state === 'DESPACHADO' || (origen === 'AUTOMATION' && state === 'APROBADO')
}

export function canEmitRemito(state: OrderState): boolean {
  return state === 'APROBADO' || state === 'PENDIENTE_PRODUCCION' || state === 'PENDIENTE_PARCIAL' || state === 'EN_ARMADO' || state === 'PREPARADO'
}

export function canVendorCancelDirectly(state: OrderState): boolean {
  return state === 'BORRADOR' || state === 'APROBADO'
}

export function canReadRemitoPdf(role: string | undefined, ownerId: string | null, actorId: string): boolean {
  return role !== 'vendedor' || ownerId === actorId
}
