export type Mercado =
  | 'argentina'
  | 'colombia'
  | 'mexico'
  | 'ecuador'
  | 'bolivia'
  | 'paraguay'
  | 'VENEZUELA'
  | 'no_exportable'

export const MERCADOS: { value: Mercado; label: string }[] = [
  { value: 'argentina', label: 'Argentina' },
  { value: 'colombia', label: 'Colombia' },
  { value: 'mexico', label: 'México' },
  { value: 'ecuador', label: 'Ecuador' },
  { value: 'bolivia', label: 'Bolivia' },
  { value: 'paraguay', label: 'Paraguay' },
  { value: 'VENEZUELA', label: 'Venezuela' },
  { value: 'no_exportable', label: 'No exportable' },
]

export function formatMercadoLabel(mercado: Mercado): string {
  return MERCADOS.find((m) => m.value === mercado)?.label ?? mercado
}
