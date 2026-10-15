export type DrugStatus =
  | 'optimo'
  | 'en_seguimiento'
  | 'reanalizar_pronto'
  | 'reanalisis_proximo'
  | 'reanalisis_requerido'
  | 'vencido'
  | 'sin_informacion'

export type DrugExpiryStatus =
  | 'vigente'
  | 'proximo_a_vencer'
  | 'vence_hoy'
  | 'vencido'
  | 'sin_vencimiento'

export interface DrugLotDates {
  vencimiento: string | null
  reanalisis?: string | null
  ingreso?: string | null
  lote?: string | null
}

function utcCalendarDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

function storedCalendarDay(value: string): number | null {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : utcCalendarDay(parsed)
}

export function getDrugExpiryStatus(vencimiento: string | null | undefined, todayDate: Date = new Date()): DrugExpiryStatus {
  if (!vencimiento) return 'sin_vencimiento'
  const expiryDay = storedCalendarDay(vencimiento)
  if (expiryDay === null) return 'sin_vencimiento'
  const daysToExpiry = Math.round((expiryDay - utcCalendarDay(todayDate)) / (1000 * 60 * 60 * 24))
  if (daysToExpiry < 0) return 'vencido'
  if (daysToExpiry === 0) return 'vence_hoy'
  if (daysToExpiry <= 90) return 'proximo_a_vencer'
  return 'vigente'
}

export function getDrugExpiryStatusDescription(status: DrugExpiryStatus): string {
  switch (status) {
    case 'vigente': return 'La fecha de vencimiento registrada sigue vigente.'
    case 'proximo_a_vencer': return 'El lote vence dentro de los próximos 90 días.'
    case 'vence_hoy': return 'El lote vence hoy.'
    case 'vencido': return 'La fecha de vencimiento registrada ya fue superada.'
    case 'sin_vencimiento': return 'No hay fecha de vencimiento registrada para este lote.'
  }
}

export function getDrugLotStatus(dates: DrugLotDates, todayDate: Date = new Date()): DrugStatus {
  if (!dates.lote) {
    return 'sin_informacion'
  }

  // Priority 1: Vencido
  if (dates.vencimiento) {
    const vencimiento = storedCalendarDay(dates.vencimiento)
    if (vencimiento !== null && vencimiento < utcCalendarDay(todayDate)) {
      return 'vencido'
    }
  }

  // If we don't have reanalysis date, we can't calculate the rest.
  if (!dates.reanalisis) {
    return 'sin_informacion'
  }

  const reanalisis = storedCalendarDay(dates.reanalisis)
  if (reanalisis === null) return 'sin_informacion'
  const daysToReanalisis = Math.round((reanalisis - utcCalendarDay(todayDate)) / (1000 * 60 * 60 * 24))

  if (daysToReanalisis < 0) {
    return 'reanalisis_requerido'
  }
  if (daysToReanalisis <= 30) {
    return 'reanalisis_proximo'
  }
  if (daysToReanalisis <= 90) {
    return 'reanalizar_pronto'
  }
  if (daysToReanalisis <= 180) {
    return 'en_seguimiento'
  }

  return 'optimo'
}

export function getDrugStatusDescription(status: DrugStatus): string {
  switch (status) {
    case 'optimo':
      return 'Dentro del período normal de control.'
    case 'en_seguimiento':
      return 'Período normal de control.'
    case 'reanalizar_pronto':
      return 'Se aproxima la fecha programada de reanálisis.'
    case 'reanalisis_proximo':
      return 'El lote requiere reanálisis inminentemente.'
    case 'reanalisis_requerido':
      return 'Se alcanzó la fecha de reanálisis. El lote todavía no figura como vencido.'
    case 'vencido':
      return 'Se alcanzó o superó la fecha de vencimiento registrada.'
    case 'sin_informacion':
      return 'Faltan fechas registradas para calcular el estado operativo.'
  }
}
