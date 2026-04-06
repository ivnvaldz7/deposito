export type Mercado =
  | 'argentina'
  | 'colombia'
  | 'mexico'
  | 'ecuador'
  | 'bolivia'
  | 'paraguay'
  | 'no_exportable'

export interface MercadoConfig {
  value: Mercado
  label: string
  color: string
  bg: string
}

export const MERCADOS: MercadoConfig[] = [
  { value: 'argentina', label: 'Argentina', color: '#00AE42', bg: 'rgba(0,174,66,0.10)' },
  { value: 'colombia', label: 'Colombia', color: '#FF9800', bg: 'rgba(255,152,0,0.10)' },
  { value: 'mexico', label: 'México', color: '#2196F3', bg: 'rgba(33,150,243,0.10)' },
  { value: 'ecuador', label: 'Ecuador', color: '#9C27B0', bg: 'rgba(156,39,176,0.10)' },
  { value: 'bolivia', label: 'Bolivia', color: '#F44336', bg: 'rgba(244,67,54,0.10)' },
  { value: 'paraguay', label: 'Paraguay', color: '#00BCD4', bg: 'rgba(0,188,212,0.10)' },
  {
    value: 'no_exportable',
    label: 'No Exportable',
    color: '#757575',
    bg: 'rgba(117,117,117,0.10)',
  },
]

export function getMercadoStyle(mercado: Mercado): MercadoConfig {
  return MERCADOS.find((item) => item.value === mercado) ?? MERCADOS[0]
}
