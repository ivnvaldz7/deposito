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

export function getDrugLotStatus(dates: DrugLotDates, todayDate: Date = new Date()): DrugStatus {
  if (!dates.lote) {
    return 'sin_informacion'
  }

  // Priority 1: Vencido
  if (dates.vencimiento) {
    const vencimiento = new Date(dates.vencimiento)
    vencimiento.setHours(23, 59, 59, 999)
    if (vencimiento.getTime() < todayDate.getTime()) {
      return 'vencido'
    }
  }

  // If we don't have reanalysis date, we can't calculate the rest.
  if (!dates.reanalisis) {
    return 'sin_informacion'
  }

  const reanalisis = new Date(dates.reanalisis)
  reanalisis.setHours(23, 59, 59, 999)
  const daysToReanalisis = Math.ceil((reanalisis.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))

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
