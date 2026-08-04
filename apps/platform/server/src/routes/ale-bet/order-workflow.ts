export const orderStates = [
  'BORRADOR',
  'APROBADO',
  'EN_ARMADO',
  'PREPARADO',
  'DESPACHADO',
  'CANCELADO',
] as const

export type OrderState = (typeof orderStates)[number]

const transitions: Readonly<Record<OrderState, readonly OrderState[]>> = {
  BORRADOR: ['APROBADO', 'CANCELADO'],
  APROBADO: ['EN_ARMADO', 'CANCELADO'],
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

export function canEmitRemito(state: OrderState): boolean {
  return state === 'APROBADO' || state === 'EN_ARMADO' || state === 'PREPARADO'
}

export function canVendorCancelDirectly(state: OrderState): boolean {
  return state === 'BORRADOR' || state === 'APROBADO'
}

export function canReadRemitoPdf(role: string | undefined, ownerId: string, actorId: string): boolean {
  return role !== 'vendedor' || ownerId === actorId
}
