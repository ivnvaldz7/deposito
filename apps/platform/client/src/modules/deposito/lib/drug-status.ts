export type DrugStatus =
  | 'optimo'
  | 'en_seguimiento'
  | 'reanalizar_pronto'
  | 'reanalisis_proximo'
  | 'reanalisis_requerido'
  | 'vencido'
  | 'sin_informacion'

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
