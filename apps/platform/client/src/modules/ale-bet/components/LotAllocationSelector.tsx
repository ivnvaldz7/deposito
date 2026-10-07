import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { PedidoDisponibilidadStock } from '../lib/api'

type OrderItem = { id: string; productoId: string; nombre: string; cantidad: number }
type Selection = PedidoDisponibilidadStock['allocations'][number]
type LotCandidate = NonNullable<PedidoDisponibilidadStock['lotes']>[number]

function dateLabel(value: string | null): string {
  return value ? `Vto. ${new Date(value).toLocaleDateString('es-AR')}` : 'Vto. no informado'
}

function keyOf(itemId: string, lotId: string): string {
  return `${itemId}:${lotId}`
}

function normalizeSelections(selections: Selection[]): Selection[] {
  const totals = new Map<string, Selection>()
  for (const selection of selections) {
    const key = keyOf(selection.itemPedidoId, selection.loteId)
    const current = totals.get(key)
    totals.set(key, current
      ? { ...current, cantidad: current.cantidad + selection.cantidad }
      : { ...selection })
  }
  return [...totals.values()]
}

function groupByLot(candidates: LotCandidate[]): Array<{ loteId: string; numero: string; fechaVencimiento: string | null; vencido: boolean; deposito?: LotCandidate; acondicionado?: LotCandidate }> {
  const groups = new Map<string, { loteId: string; numero: string; fechaVencimiento: string | null; vencido: boolean; deposito?: LotCandidate; acondicionado?: LotCandidate }>()
  for (const candidate of candidates) {
    const group = groups.get(candidate.loteId) ?? {
      loteId: candidate.loteId,
      numero: candidate.numero,
      fechaVencimiento: candidate.fechaVencimiento,
      vencido: candidate.vencido,
    }
    if (candidate.ubicacion === 'DEPOSITO') group.deposito = candidate
    else group.acondicionado = candidate
    group.vencido ||= candidate.vencido
    groups.set(candidate.loteId, group)
  }
  return [...groups.values()].sort((left, right) => left.numero.localeCompare(right.numero, 'es', { numeric: true }))
}

/** Lets the operator keep or correct the suggested lot assignment before stock is reserved. */
export function LotAllocationSelector({
  items,
  disponibilidad,
  submitting,
  onCancel,
  onConfirm,
  mode = 'reserva',
}: {
  items: OrderItem[]
  disponibilidad: PedidoDisponibilidadStock
  submitting?: boolean
  onCancel: () => void
  onConfirm: (selecciones: Selection[]) => void
  /** A remito approval consumes stock; an order approval only reserves it. */
  mode?: 'reserva' | 'descuento'
}) {
  const [selecciones, setSelecciones] = useState<Selection[]>(() => normalizeSelections(disponibilidad.allocations))
  const selectedByKey = useMemo(() => new Map(selecciones.map((entry) => [keyOf(entry.itemPedidoId, entry.loteId), entry.cantidad])), [selecciones])
  const complete = items.every((item) => selecciones
    .filter((entry) => entry.itemPedidoId === item.id)
    .reduce((total, entry) => total + entry.cantidad, 0) === item.cantidad)

  function setQuantity(item: OrderItem, loteId: string, cantidad: number): void {
    setSelecciones((current) => {
      const without = current.filter((entry) => !(entry.itemPedidoId === item.id && entry.loteId === loteId))
      return cantidad > 0 ? [...without, { itemPedidoId: item.id, productoId: item.productoId, loteId, cantidad }] : without
    })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-5">
      <section role="dialog" aria-modal="true" aria-label="Seleccionar lotes" className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-surface-container-low shadow-float sm:rounded-2xl">
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-on-surface">{mode === 'descuento' ? 'Elegí los lotes a descontar' : 'Confirmá los lotes a reservar'}</h2>
            <p className="mt-1 text-sm text-on-surface-variant">{mode === 'descuento' ? 'Al aprobar, se descuenta el stock solo de este remito.' : 'La propuesta es editable. Los lotes vencidos están bloqueados; los que no tienen fecha siguen disponibles y se identifican para poder completarlos después.'}</p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {items.map((item) => {
            const candidates = (disponibilidad.lotes ?? [])
              .filter((lote) => lote.itemPedidoId === item.id)
            const lotGroups = groupByLot(candidates)
            const selected = selecciones.filter((entry) => entry.itemPedidoId === item.id).reduce((total, entry) => total + entry.cantidad, 0)
            return (
              <article key={item.id} className="rounded-xl border border-white/10 bg-surface-container-high p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-bold text-on-surface">{item.nombre}</h3>
                  <p className={selected === item.cantidad ? 'text-sm font-semibold text-success' : 'text-sm font-semibold text-warning'}>{selected} / {item.cantidad} un</p>
                </div>
                <div className="mt-3 space-y-2">
                  {lotGroups.map((lote) => {
                    const selectionKey = keyOf(item.id, lote.loteId)
                    const value = selectedByKey.get(selectionKey) ?? 0
                    const automaticTransfer = disponibilidad.transferencias
                      .filter((transfer) => transfer.productoId === item.productoId && transfer.loteId === lote.loteId)
                      .reduce((total, transfer) => total + transfer.cantidad, 0)
                    const availableInDeposito = lote.deposito?.disponible ?? 0
                    const availableAfterTransfer = availableInDeposito + automaticTransfer
                    const minimumSelection = automaticTransfer
                    const disabled = lote.vencido || availableAfterTransfer === 0
                    return (
                      <div key={lote.loteId} className={`rounded-lg border p-3 ${lote.vencido ? 'border-error/40 bg-error/5' : 'border-white/10 bg-surface-container'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <p className="text-sm font-bold text-on-surface">Lote {lote.numero}</p>
                          <p className={lote.vencido ? 'text-xs font-semibold text-error' : 'text-xs text-on-surface-variant'}>{lote.vencido ? 'VENCIDO · bloqueado' : dateLabel(lote.fechaVencimiento)}</p>
                        </div>
                        <div className="mt-1 space-y-1 text-xs text-on-surface-variant">
                          <p>Depósito · {availableInDeposito} un disponibles{automaticTransfer > 0 ? ` + ${automaticTransfer} un a trasladar` : ''}</p>
                          {lote.acondicionado && <p>Acondicionado · {lote.acondicionado.disponible} un disponibles{automaticTransfer === 0 ? ' · no se descuentan desde aquí' : ''}</p>}
                          {automaticTransfer > 0 && <p className="font-semibold text-primary">Traslado automático: {automaticTransfer} un de Acondicionado a Depósito antes del descuento.</p>}
                        </div>
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <span className="mr-2 text-xs font-medium text-on-surface-variant">A descontar de Depósito</span>
                          <button type="button" aria-label={`Restar lote ${lote.numero}`} disabled={disabled || value <= minimumSelection} onClick={() => setQuantity(item, lote.loteId, value - 1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 text-on-surface disabled:opacity-35"><Minus className="h-4 w-4" /></button>
                          <output className="min-w-10 text-center font-bold text-on-surface">{value}</output>
                          <button type="button" aria-label={`Sumar lote ${lote.numero}`} disabled={disabled || value >= availableAfterTransfer || selected >= item.cantidad} onClick={() => setQuantity(item, lote.loteId, value + 1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 text-on-surface disabled:opacity-35"><Plus className="h-4 w-4" /></button>
                        </div>
                      </div>
                    )
                  })}
                  {lotGroups.length === 0 && <p className="text-sm text-error">No hay lotes disponibles para este producto.</p>}
                </div>
              </article>
            )
          })}
        </div>
        {!complete && <p className="mt-4 flex items-center gap-2 text-sm text-warning"><AlertTriangle className="h-4 w-4" />Cada producto debe quedar asignado exactamente a la cantidad solicitada.</p>}
        </div>
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-white/10 bg-surface-container-low p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:flex-row sm:justify-end sm:gap-3 sm:p-4">
          <Button variant="outline" onClick={onCancel} disabled={submitting} className="min-h-11">Volver</Button>
          <Button onClick={() => onConfirm(selecciones)} disabled={!complete} loading={submitting} className="min-h-11">{mode === 'descuento' ? 'Aprobar y descontar stock' : 'Reservar lotes y confirmar'}</Button>
        </div>
      </section>
    </div>
  )
}
