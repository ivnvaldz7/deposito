import { useState } from 'react'
import { AlertTriangle, ArrowRight, ArrowRightLeft, Boxes, ClipboardPenLine, PackageCheck, PackagePlus, PencilLine, Warehouse, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { type Producto, type LoteAdminStock } from '../lib/api'
import { useProductoAdminStock, useAjusteAdminStock, useIngresarAdminStock, useTransferirStock, useCreateAdminLote, useProductTransferRules, useUpdateLote } from '../queries'
import { formatOptionalDate } from '../lib/logistics-display'

interface GestionarStockModalProps {
  producto: Producto
  onClose: () => void
}

type LotesTab = 'operables' | 'agotados'

const operationSheetBackdropClass = 'fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-5'
const operationSheetCardClass = 'max-h-[calc(100dvh-1.5rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-surface-container p-4 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl sm:p-6'
const operationSheetActionsClass = 'flex flex-col-reverse gap-2 pt-5 sm:flex-row sm:justify-end sm:gap-3 sm:pt-6'
const operationSheetSecondaryButtonClass = 'min-h-11 w-full rounded-full border border-white/10 px-4 py-2 font-body text-[12px] text-outline transition hover:text-on-surface disabled:opacity-50 sm:w-auto'
const operationSheetPrimaryButtonClass = 'min-h-11 w-full rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50 sm:w-auto'

function quantityFromBoxes(cajas: string, sueltos: string, unidadesPorCaja: number): number | null {
  const cajasNumber = cajas === '' ? 0 : Number(cajas)
  const sueltosNumber = sueltos === '' ? 0 : Number(sueltos)
  if (!Number.isInteger(cajasNumber) || !Number.isInteger(sueltosNumber) || cajasNumber < 0 || sueltosNumber < 0) return null
  return cajasNumber * unidadesPorCaja + sueltosNumber
}

function splitQuantity(quantity: number, unidadesPorCaja: number): { cajas: string; sueltos: string } {
  return {
    cajas: String(Math.floor(quantity / unidadesPorCaja)),
    sueltos: String(quantity % unidadesPorCaja),
  }
}

function QuantityByBoxesFields({
  idPrefix,
  cajas,
  sueltos,
  unidadesPorCaja,
  onCajasChange,
  onSueltosChange,
  resultLabel,
}: {
  idPrefix: string
  cajas: string
  sueltos: string
  unidadesPorCaja: number
  onCajasChange: (value: string) => void
  onSueltosChange: (value: string) => void
  resultLabel: string
}) {
  const total = quantityFromBoxes(cajas, sueltos, unidadesPorCaja)

  return (
    <fieldset className="rounded-xl border border-white/10 bg-surface-container-highest/20 p-3 sm:p-4">
      <legend className="sr-only">Carga por cajas y unidades sueltas</legend>
      <div className="flex items-center gap-2 text-primary">
        <Boxes size={16} aria-hidden="true" />
        <p className="font-body text-[12px] font-semibold">Carga por cajas y sueltos</p>
      </div>
      <p className="mt-1 font-body text-[11px] text-on-surface-variant">1 caja = {unidadesPorCaja} unidades</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
        <div>
          <label htmlFor={`${idPrefix}-cajas`} className="font-body text-[12px] text-outline">Cajas</label>
          <input id={`${idPrefix}-cajas`} type="number" min={0} step={1} inputMode="numeric" value={cajas} onChange={(event) => onCajasChange(event.target.value)} className="input-field mt-1 min-h-11 w-full text-[16px]" />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-sueltos`} className="font-body text-[12px] text-outline">Sueltos</label>
          <input id={`${idPrefix}-sueltos`} type="number" min={0} step={1} inputMode="numeric" value={sueltos} onChange={(event) => onSueltosChange(event.target.value)} className="input-field mt-1 min-h-11 w-full text-[16px]" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3" role="status">
        <span className="font-body text-[12px] text-on-surface-variant">{resultLabel}</span>
        <span className="text-[15px] font-bold tabular-nums text-primary">{total === null ? '—' : `${total} unidades`}</span>
      </div>
    </fieldset>
  )
}

export function GestionarStockModal({ producto, onClose }: GestionarStockModalProps) {
  // A zero balance remains traceable. The UI separates it from daily work and
  // exposes the latest exhausted lots only for deliberate replenishment.
  const { data: stockData, isLoading, error } = useProductoAdminStock(producto.id, { includeZero: true })
  const transferRulesQuery = useProductTransferRules(producto.id, true)
  
  const [ajusteModal, setAjusteModal] = useState<{ loteId: string; loteNumero: string; ubicacionId: string; ubicacionNombre: string; cantidadActual: number; activo: boolean } | null>(null)
  const [ingresoModal, setIngresoModal] = useState<{ loteId: string; loteNumero: string; ubicacionId: string; ubicacionNombre: string; cantidadActual: number; activo: boolean; isReactivation: boolean } | null>(null)
  const [transferirModal, setTransferirModal] = useState<{ loteId: string; loteNumero: string; origen: 'DEPOSITO' | 'ACONDICIONADO'; cantidadActual: number } | null>(null)
  const [reactivarModal, setReactivarModal] = useState<LoteAdminStock | null>(null)
  const [createLoteModal, setCreateLoteModal] = useState(false)
  const [editingExpiration, setEditingExpiration] = useState<{ loteId: string; value: string } | null>(null)
  const [activeTab, setActiveTab] = useState<LotesTab>('operables')
  const [selectedLoteId, setSelectedLoteId] = useState<string | null>(null)
  const updateLote = useUpdateLote()

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
        <div className="w-full max-w-2xl rounded-t-2xl border border-white/10 bg-surface-container-low p-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
          <p className="font-body text-sm text-on-surface-variant">Cargando información de stock...</p>
        </div>
      </div>
    )
  }

  if (error || !stockData) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
        <div className="w-full max-w-2xl rounded-t-2xl border border-white/10 bg-surface-container-low p-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
          <p className="font-body text-sm text-error">Error al cargar información de stock.</p>
          <button onClick={onClose} className="mt-4 rounded-full border border-white/10 px-4 py-2 text-[12px]">Cerrar</button>
        </div>
      </div>
    )
  }

  const { lotes, ubicaciones } = stockData
  const operationalLotes = lotes.filter((lote) => lote.activo && lote.stockTotal > 0)
  // getManagedProductStock returns lots by number; the most recent three are
  // enough to replenish a recently exhausted lot without cluttering operations.
  const exhaustedLotes = lotes.filter((lote) => lote.activo && lote.stockTotal === 0).slice(-3).reverse()
  const depositoUbicacion = ubicaciones.find(u => u.codigo === 'DEPOSITO')
  const acondicionadoUbicacion = ubicaciones.find(u => u.codigo === 'ACONDICIONADO')
  const stockTotal = operationalLotes.reduce((acc, lote) => acc + lote.stockTotal, 0)
  const stockDeposito = operationalLotes.reduce((acc, lote) => acc + lote.stockDeposito, 0)
  const stockAcondicionado = operationalLotes.reduce((acc, lote) => acc + lote.stockAcondicionado, 0)
  const hasPresentationDestinations = transferRulesQuery.data?.rules.some((rule) => rule.tipo === 'PRESENTATION') ?? false

  async function saveExpiration(loteId: string): Promise<void> {
    if (!editingExpiration) return
    try {
      await updateLote.mutateAsync({
        productoId: producto.id,
        loteId,
        fechaVencimiento: editingExpiration.value ? new Date(`${editingExpiration.value}T12:00:00.000Z`).toISOString() : null,
      })
      toast.success('Vencimiento del lote actualizado')
      setEditingExpiration(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el vencimiento')
    }
  }

  function changeTab(tab: LotesTab): void {
    setActiveTab(tab)
    setSelectedLoteId(null)
    setEditingExpiration(null)
  }

  function toggleLotSelection(loteId: string): void {
    setSelectedLoteId((selectedId) => selectedId === loteId ? null : loteId)
    setEditingExpiration(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-5" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-white/10 bg-surface-container-low p-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:max-h-[85dvh] sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-[18px] font-semibold tracking-tight text-on-surface sm:text-[20px]">{producto.nombre}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar gestión de stock" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"><X className="h-5 w-5" /></button>
        </div>
        
        <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl border border-white/5 bg-surface-container/50 p-2 text-center sm:mt-6 sm:p-3">
          <div className="rounded-lg p-2">
            <p className="font-body text-[10px] font-medium uppercase tracking-wide text-on-surface-variant sm:text-[12px]">Total</p>
            <p className="mt-1 text-[20px] font-semibold text-on-surface sm:text-[24px]">{stockTotal}</p>
          </div>
          <div className="rounded-lg border border-sky-400/25 bg-sky-400/10 p-2">
            <p className="flex items-center justify-center gap-1 font-body text-[10px] font-semibold uppercase tracking-wide text-sky-200 sm:text-[12px]"><Warehouse size={13} aria-hidden="true" />Depósito</p>
            <p className="mt-1 text-[20px] font-bold text-sky-100 sm:text-[24px]">{stockDeposito}</p>
          </div>
          <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-2">
            <p className="flex items-center justify-center gap-1 font-body text-[10px] font-semibold uppercase tracking-wide text-amber-200 sm:text-[12px]" title="Acondicionado"><PackageCheck size={13} aria-hidden="true" /><span className="sm:hidden">Acond.</span><span className="hidden sm:inline">Acondicionado</span></p>
            <p className="mt-1 text-[20px] font-bold text-amber-100 sm:text-[24px]">{stockAcondicionado}</p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 sm:mt-8">
          <h3 className="text-[16px] font-semibold text-on-surface">Lotes</h3>
          <button
            type="button"
            onClick={() => setCreateLoteModal(true)}
            className="min-h-11 shrink-0 rounded-xl border border-primary px-3 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20"
          >
            + Nuevo lote
          </button>
        </div>

        <div className="mt-4 flex gap-2 border-b border-white/10" role="tablist" aria-label="Estado de los lotes">
          <button type="button" role="tab" aria-selected={activeTab === 'operables'} onClick={() => changeTab('operables')} className={`min-h-11 border-b-2 px-3 font-body text-[12px] font-semibold transition ${activeTab === 'operables' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
            Lotes operables ({operationalLotes.length})
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'agotados'} onClick={() => changeTab('agotados')} className={`min-h-11 border-b-2 px-3 font-body text-[12px] font-semibold transition ${activeTab === 'agotados' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
            Agotados recientes ({exhaustedLotes.length})
          </button>
        </div>

        {activeTab === 'operables' ? (
          operationalLotes.length === 0 ? (
            <p className="mt-4 py-6 text-center font-body text-[13px] text-on-surface-variant">No hay lotes con stock disponible.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {operationalLotes.map((lote) => {
                const isSelected = selectedLoteId === lote.id
                return (
                  <div key={lote.id} className={`rounded-xl border p-4 transition ${isSelected ? 'border-primary/70 bg-surface-container-high ring-1 ring-primary/20' : 'border-white/10 bg-surface-container-high'}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <button type="button" aria-label={`${isSelected ? 'Cerrar selección del lote' : 'Seleccionar lote'} ${lote.numero}`} onClick={() => toggleLotSelection(lote.id)} className="flex min-w-0 items-center justify-between gap-3 rounded-lg text-left hover:text-primary">
                        <span className="font-semibold text-[15px] text-primary">LOTE {lote.numero}</span>
                        <span className={`shrink-0 rounded-full px-2 py-1 font-body text-[10px] font-medium ${isSelected ? 'bg-primary/20 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>{isSelected ? 'Seleccionado' : 'Seleccionar'}</span>
                      </button>
                      {isSelected && (editingExpiration?.loteId === lote.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input aria-label={`Vencimiento del lote ${lote.numero}`} type="date" value={editingExpiration.value} onChange={(event) => setEditingExpiration({ loteId: lote.id, value: event.target.value })} className="min-h-10 rounded border border-white/15 bg-surface-container px-2 text-[14px] text-on-surface" />
                          <button type="button" disabled={updateLote.isPending} onClick={() => void saveExpiration(lote.id)} className="min-h-10 rounded-lg px-2 text-xs font-semibold text-primary disabled:opacity-50">Guardar</button>
                          <button type="button" disabled={updateLote.isPending} onClick={() => setEditingExpiration(null)} className="min-h-10 rounded-lg px-2 text-xs text-on-surface-variant">Cancelar</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setEditingExpiration({ loteId: lote.id, value: lote.fechaVencimiento ? lote.fechaVencimiento.slice(0, 10) : '' })} className="min-h-10 rounded-lg px-2 text-left font-body text-[12px] text-on-surface-variant hover:bg-surface-container hover:text-primary">Vto: {formatOptionalDate(lote.fechaVencimiento)} · Editar</button>
                      ))}
                    </div>

                    {!isSelected ? (
                      <p className="mt-3 font-body text-[12px] text-on-surface-variant">Disponible: {lote.stockTotal} · Tocá para operar este lote.</p>
                    ) : (
                      <>
                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                          <div className="rounded-xl border border-sky-400/25 bg-sky-400/5 p-3">
                            <div className="mb-3 flex items-center justify-between gap-2"><p className="flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-wide text-sky-200"><Warehouse size={15} aria-hidden="true" />Depósito</p><p className="text-[18px] font-bold tabular-nums text-sky-100">{lote.stockDeposito}</p></div>
                            {depositoUbicacion && <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                              <button type="button" onClick={() => setAjusteModal({ loteId: lote.id, loteNumero: lote.numero, ubicacionId: depositoUbicacion.id, ubicacionNombre: 'Depósito', cantidadActual: lote.stockDeposito, activo: lote.activo })} className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-sky-300/35 px-2 py-2 font-body text-[12px] font-semibold text-sky-100 transition hover:bg-sky-300/15"><PencilLine size={15} aria-hidden="true" />Ajustar saldo</button>
                              {lote.stockDeposito > 0 && <button type="button" onClick={() => setTransferirModal({ loteId: lote.id, loteNumero: lote.numero, origen: 'DEPOSITO', cantidadActual: lote.stockDeposito })} className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-sky-300/25 px-2 py-2 font-body text-[12px] font-semibold text-sky-100 transition hover:bg-sky-300/15"><ArrowRight size={15} aria-hidden="true" />A acondicionado</button>}
                            </div>}
                          </div>
                          <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3">
                            <div className="mb-3 flex items-center justify-between gap-2"><p className="flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-wide text-amber-200"><PackageCheck size={15} aria-hidden="true" />Acondicionado</p><p className="text-[18px] font-bold tabular-nums text-amber-100">{lote.stockAcondicionado}</p></div>
                            {acondicionadoUbicacion && <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                              <button type="button" onClick={() => setIngresoModal({ loteId: lote.id, loteNumero: lote.numero, ubicacionId: acondicionadoUbicacion.id, ubicacionNombre: 'Acondicionado', cantidadActual: lote.stockAcondicionado, activo: lote.activo, isReactivation: false })} className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-amber-300/40 px-2 py-2 font-body text-[12px] font-semibold text-amber-100 transition hover:bg-amber-300/15"><PackagePlus size={15} aria-hidden="true" />Ingresar stock</button>
                              <button type="button" onClick={() => setAjusteModal({ loteId: lote.id, loteNumero: lote.numero, ubicacionId: acondicionadoUbicacion.id, ubicacionNombre: 'Acondicionado', cantidadActual: lote.stockAcondicionado, activo: lote.activo })} className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-amber-300/25 px-2 py-2 font-body text-[12px] font-semibold text-amber-100 transition hover:bg-amber-300/15"><PencilLine size={15} aria-hidden="true" />Ajustar saldo</button>
                              {lote.stockAcondicionado > 0 ? (
                                <button type="button" onClick={() => setTransferirModal({ loteId: lote.id, loteNumero: lote.numero, origen: 'ACONDICIONADO', cantidadActual: lote.stockAcondicionado })} className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-amber-300/30 px-2 py-2 font-body text-[12px] font-semibold text-amber-100 transition hover:bg-amber-300/15 min-[420px]:col-span-2"><ArrowRight size={15} aria-hidden="true" />{hasPresentationDestinations ? 'Preparar presentación' : 'Enviar a depósito'}</button>
                              ) : (
                                <p role="status" className="font-body text-[11px] text-on-surface-variant min-[420px]:col-span-2">No hay stock en Acondicionado.{lote.stockDeposito > 0 && <span className="block text-sky-100">{lote.stockDeposito} unidades ya están en Depósito.</span>}</p>
                              )}
                            </div>}
                          </div>
                        </div>
                        <div className="mt-3 flex justify-between border-t border-white/5 pt-3"><p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Total</p><p className="text-[16px] font-semibold text-on-surface">{lote.stockTotal}</p></div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )
        ) : (
          exhaustedLotes.length === 0 ? (
            <p className="mt-4 py-6 text-center font-body text-[13px] text-on-surface-variant">No hay lotes agotados para reactivar.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {exhaustedLotes.map((lote) => {
                const isSelected = selectedLoteId === lote.id
                return (
                  <div key={lote.id} className={`rounded-xl border p-4 transition ${isSelected ? 'border-primary/70 bg-surface-container-high ring-1 ring-primary/20' : 'border-white/10 bg-surface-container-high'}`}>
                    <button type="button" aria-label={`${isSelected ? 'Cerrar selección del lote' : 'Seleccionar lote'} ${lote.numero}`} onClick={() => toggleLotSelection(lote.id)} className="flex w-full items-center justify-between gap-3 rounded-lg text-left hover:text-primary">
                      <span><span className="block font-semibold text-[15px] text-on-surface">LOTE {lote.numero}</span><span className="mt-1 block font-body text-[12px] text-on-surface-variant">Vto: {formatOptionalDate(lote.fechaVencimiento)} · Total: 0</span></span>
                      <span className={`shrink-0 rounded-full px-2 py-1 font-body text-[10px] font-medium ${isSelected ? 'bg-primary/20 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>{isSelected ? 'Seleccionado' : 'Seleccionar'}</span>
                    </button>
                    {isSelected && <div className="mt-4 border-t border-white/5 pt-4"><p className="font-body text-[12px] text-on-surface-variant">Este lote no tiene saldo. Elegí dónde ingresar el stock para reactivarlo.</p><button type="button" aria-label={`Reactivar lote ${lote.numero}`} onClick={() => setReactivarModal(lote)} className="mt-3 min-h-10 rounded-full border border-primary/50 px-4 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/10">Reactivar lote</button></div>}
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {ajusteModal && (
        <AjusteModal 
          productoId={producto.id}
          loteId={ajusteModal.loteId}
          loteNumero={ajusteModal.loteNumero}
          ubicacionId={ajusteModal.ubicacionId}
          ubicacionNombre={ajusteModal.ubicacionNombre}
          cantidadActual={ajusteModal.cantidadActual}
          unidadesPorCaja={producto.unidadesPorCaja}
          onClose={() => setAjusteModal(null)}
          onCompleted={onClose}
        />
      )}

      {ingresoModal && (
        <IngresarModal 
          productoId={producto.id}
          loteId={ingresoModal.loteId}
          loteNumero={ingresoModal.loteNumero}
          ubicacionId={ingresoModal.ubicacionId}
          ubicacionNombre={ingresoModal.ubicacionNombre}
          cantidadActual={ingresoModal.cantidadActual}
          unidadesPorCaja={producto.unidadesPorCaja}
          loteActivo={ingresoModal.activo}
          isReactivation={ingresoModal.isReactivation}
          onClose={() => setIngresoModal(null)}
          onCompleted={onClose}
        />
      )}

      {reactivarModal && (
        <ReactivarLoteModal
          lote={reactivarModal}
          ubicaciones={ubicaciones}
          onClose={() => setReactivarModal(null)}
          onContinue={(ubicacion) => {
            setReactivarModal(null)
            setIngresoModal({
              loteId: reactivarModal.id,
              loteNumero: reactivarModal.numero,
              ubicacionId: ubicacion.id,
              ubicacionNombre: ubicacion.nombre,
              cantidadActual: 0,
              activo: reactivarModal.activo,
              isReactivation: true,
            })
          }}
        />
      )}

      {transferirModal && (
        <TransferirModal 
          productoId={producto.id}
          productoNombre={producto.nombre}
          loteId={transferirModal.loteId}
          loteNumero={transferirModal.loteNumero}
          origen={transferirModal.origen}
          cantidadActual={transferirModal.cantidadActual}
          onClose={() => setTransferirModal(null)}
          onCompleted={onClose}
        />
      )}

      {createLoteModal && (
        <CreateLoteModal 
          productoId={producto.id}
          productoNombre={producto.nombre}
          prefijoFijo={stockData.producto?.prefijoLote ?? null}
          unidadesPorCaja={producto.unidadesPorCaja}
          onClose={() => setCreateLoteModal(false)}
        />
      )}
    </div>
  )
}

function ReactivarLoteModal({ lote, ubicaciones, onClose, onContinue }: {
  lote: LoteAdminStock
  ubicaciones: Array<{ id: string; codigo: string; nombre: string }>
  onClose: () => void
  onContinue: (ubicacion: { id: string; nombre: string }) => void
}) {
  const availableLocations = ubicaciones.filter((ubicacion) => ubicacion.codigo === 'DEPOSITO' || ubicacion.codigo === 'ACONDICIONADO')
  const [ubicacionId, setUbicacionId] = useState(availableLocations[0]?.id ?? '')
  const selectedLocation = availableLocations.find((ubicacion) => ubicacion.id === ubicacionId)

  return (
    <div className={operationSheetBackdropClass} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="reactivar-lote-title" className={operationSheetCardClass} onClick={(event) => event.stopPropagation()}>
        <h3 id="reactivar-lote-title" className="text-[18px] font-semibold text-on-surface">Reactivar lote {lote.numero}</h3>
        <p className="mt-1 font-body text-[13px] text-on-surface-variant">Elegí dónde ingresará el nuevo stock. El lote volverá a la solapa operativa al confirmar el ingreso.</p>
        <fieldset className="mt-5 space-y-2">
          <legend className="font-body text-[12px] text-outline">Destino del ingreso</legend>
          {availableLocations.map((ubicacion) => (
            <label key={ubicacion.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-white/10 px-3 text-[14px] text-on-surface has-[:checked]:border-primary has-[:checked]:bg-primary/10">
              <input type="radio" name="ubicacion-reactivacion" value={ubicacion.id} checked={ubicacion.id === ubicacionId} onChange={() => setUbicacionId(ubicacion.id)} />
              {ubicacion.nombre}
            </label>
          ))}
        </fieldset>
        <div className={operationSheetActionsClass}>
          <button type="button" onClick={onClose} className={operationSheetSecondaryButtonClass}>Cancelar</button>
          <button type="button" disabled={!selectedLocation} onClick={() => selectedLocation && onContinue({ id: selectedLocation.id, nombre: selectedLocation.nombre })} className="min-h-11 w-full rounded-full bg-primary px-4 py-2 font-body text-[12px] font-semibold text-on-primary transition hover:bg-primary/90 disabled:opacity-50 sm:w-auto">Continuar</button>
        </div>
      </div>
    </div>
  )
}

function AjusteModal({ productoId, loteId, loteNumero, ubicacionId, ubicacionNombre, cantidadActual, unidadesPorCaja, onClose, onCompleted }: { productoId: string; loteId: string; loteNumero: string; ubicacionId: string; ubicacionNombre: string; cantidadActual: number; unidadesPorCaja: number; onClose: () => void; onCompleted: () => void }) {
  const initialQuantity = splitQuantity(cantidadActual, unidadesPorCaja)
  const [cajas, setCajas] = useState(initialQuantity.cajas)
  const [sueltos, setSueltos] = useState(initialQuantity.sueltos)
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const ajusteMutation = useAjusteAdminStock()
  const cantidadFinal = quantityFromBoxes(cajas, sueltos, unidadesPorCaja)

  async function handleConfirm() {
    setErrorLocal(null)
    if (cantidadFinal === null) {
      setErrorLocal('Ingresá cajas y sueltos válidos')
      setStep('form')
      return
    }
    try {
      await ajusteMutation.mutateAsync({
        productoId,
        loteId,
        ubicacionId,
        cantidadFinal,
        idempotencyKey: crypto.randomUUID()
      })
      toast.success('Stock actualizado correctamente')
      onCompleted()
    } catch (err) {
      setErrorLocal(err instanceof Error ? err.message : 'Error al ajustar stock')
      setStep('form')
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (cantidadFinal === null) {
      setErrorLocal('Ingresá cajas y sueltos válidos')
      return
    }
    setStep('confirm')
  }

  if (step === 'confirm') {
    return (
      <div className={operationSheetBackdropClass} onClick={onClose}>
        <div className={operationSheetCardClass} onClick={(e) => e.stopPropagation()}>
          <h3 className="text-[18px] font-semibold text-on-surface">Confirmar ajuste</h3>
          
          <div className="mt-5 space-y-4 rounded-lg bg-surface-container-highest/20 p-4">
            <div className="flex justify-between items-center">
              <span className="font-body text-[13px] text-on-surface-variant">Lote:</span>
              <span className="text-[14px] font-semibold text-on-surface">{loteNumero}</span>
            </div>
            <div className="flex justify-between items-center border-t border-white/5 pt-2">
              <span className="font-body text-[13px] text-on-surface-variant">Ubicación:</span>
              <span className="text-[14px] font-semibold text-on-surface">{ubicacionNombre}</span>
            </div>
            <div className="flex justify-between items-center border-t border-white/5 pt-2">
              <span className="font-body text-[13px] text-on-surface-variant">Cantidad actual:</span>
              <span className="text-[14px] font-semibold text-on-surface">{cantidadActual}</span>
            </div>
            <div className="flex justify-between items-center border-t border-white/5 pt-2">
              <span className="font-body text-[13px] font-semibold text-primary">Cantidad nueva:</span>
              <span className="text-[16px] font-bold text-primary">{cantidadFinal}</span>
            </div>
          </div>
          <div className={operationSheetActionsClass}>
            <button type="button" disabled={ajusteMutation.isPending} onClick={() => setStep('form')} className={operationSheetSecondaryButtonClass}>Cancelar</button>
            <button type="button" disabled={ajusteMutation.isPending} onClick={handleConfirm} className="min-h-11 w-full rounded-full bg-primary px-4 py-2 font-body text-[12px] font-semibold text-on-primary transition hover:bg-primary/90 disabled:opacity-50 sm:w-auto">
              {ajusteMutation.isPending ? 'Confirmando...' : 'Confirmar ajuste'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={operationSheetBackdropClass} onClick={onClose}>
      <div className={operationSheetCardClass} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 text-primary"><ClipboardPenLine size={20} aria-hidden="true" /><h3 className="text-[18px] font-semibold text-on-surface">Ajustar stock</h3></div>
        <p className="mt-1 font-body text-[13px] text-on-surface-variant">Lote: <span className="font-semibold text-on-surface">{loteNumero}</span> | Ubicación: <span className="font-semibold text-on-surface">{ubicacionNombre}</span></p>
        
        {errorLocal && (
          <div className="mt-4 rounded-lg bg-error/10 p-3">
            <p className="font-body text-[12px] text-error">{errorLocal}</p>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="flex justify-between items-center rounded-lg bg-surface-container-highest/20 p-3">
            <span className="font-body text-[13px] text-on-surface-variant">Cantidad actual:</span>
            <span className="text-[16px] font-semibold text-on-surface">{cantidadActual}</span>
          </div>
          <QuantityByBoxesFields idPrefix="ajuste" cajas={cajas} sueltos={sueltos} unidadesPorCaja={unidadesPorCaja} onCajasChange={setCajas} onSueltosChange={setSueltos} resultLabel="Cantidad final" />
          <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end sm:gap-3">
            <button type="button" onClick={onClose} className={operationSheetSecondaryButtonClass}>Cancelar</button>
            <button type="submit" className={operationSheetPrimaryButtonClass}>
              Confirmar ajuste
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function IngresarModal({ productoId, loteId, loteNumero, ubicacionId, ubicacionNombre, cantidadActual, unidadesPorCaja, loteActivo, isReactivation, onClose, onCompleted }: { productoId: string; loteId: string; loteNumero: string; ubicacionId: string; ubicacionNombre: string; cantidadActual: number; unidadesPorCaja: number; loteActivo: boolean; isReactivation: boolean; onClose: () => void; onCompleted: () => void }) {
  const [cajas, setCajas] = useState<string>('')
  const [sueltos, setSueltos] = useState<string>('')
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const ingresoMutation = useIngresarAdminStock()
  const cantidadIngresar = quantityFromBoxes(cajas, sueltos, unidadesPorCaja)

  async function handleConfirm() {
    setErrorLocal(null)
    if (cantidadIngresar === null || cantidadIngresar <= 0) {
      setErrorLocal('Ingresá al menos una caja o una unidad suelta')
      setStep('form')
      return
    }
    try {
      await ingresoMutation.mutateAsync({
        productoId,
        loteId,
        ubicacionId,
        cantidad: cantidadIngresar,
        idempotencyKey: crypto.randomUUID()
      })
      toast.success(isReactivation || !loteActivo ? 'Lote reactivado y stock ingresado correctamente' : 'Stock ingresado correctamente')
      onCompleted()
    } catch (err) {
      setErrorLocal(err instanceof Error ? err.message : 'Error al ingresar stock')
      setStep('form')
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (cantidadIngresar === null || cantidadIngresar <= 0) {
      setErrorLocal('Ingresá al menos una caja o una unidad suelta')
      return
    }
    setStep('confirm')
  }

  const cantidadNueva = cantidadActual + (cantidadIngresar ?? 0)

  if (step === 'confirm') {
    return (
      <div className={operationSheetBackdropClass} onClick={onClose}>
        <div className={operationSheetCardClass} onClick={(e) => e.stopPropagation()}>
          <h3 className="text-[18px] font-semibold text-on-surface">Confirmar ingreso</h3>
          
          <div className="mt-5 space-y-4 rounded-lg bg-surface-container-highest/20 p-4">
            <div className="flex justify-between items-center">
              <span className="font-body text-[13px] text-on-surface-variant">Lote:</span>
              <span className="text-[14px] font-semibold text-on-surface">{loteNumero}</span>
            </div>
            <div className="flex justify-between items-center border-t border-white/5 pt-2">
              <span className="font-body text-[13px] text-on-surface-variant">Ubicación:</span>
              <span className="text-[14px] font-semibold text-on-surface">{ubicacionNombre}</span>
            </div>
            {(isReactivation || !loteActivo) && (
              <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2">
                <p className="font-body text-[12px] font-medium text-yellow-400">Este lote volverá a la solapa operativa al confirmar el ingreso.</p>
              </div>
            )}
            <div className="flex justify-between items-center border-t border-white/5 pt-2">
              <span className="font-body text-[13px] text-on-surface-variant">Cantidad actual:</span>
              <span className="text-[14px] font-semibold text-on-surface">{cantidadActual}</span>
            </div>
            <div className="flex justify-between items-center border-t border-white/5 pt-2">
              <span className="font-body text-[13px] text-on-surface-variant">A ingresar:</span>
              <span className="text-[14px] font-semibold text-primary">+{cantidadIngresar}</span>
            </div>
            <div className="flex justify-between items-center border-t border-white/5 pt-2">
              <span className="font-body text-[13px] font-semibold text-primary">Resultado:</span>
              <span className="text-[16px] font-bold text-primary">{cantidadNueva}</span>
            </div>
          </div>
          <div className={operationSheetActionsClass}>
            <button type="button" disabled={ingresoMutation.isPending} onClick={() => setStep('form')} className={operationSheetSecondaryButtonClass}>Cancelar</button>
            <button type="button" disabled={ingresoMutation.isPending} onClick={handleConfirm} className={`min-h-11 w-full rounded-full px-4 py-2 font-body text-[12px] font-semibold transition disabled:opacity-50 sm:w-auto ${isReactivation || !loteActivo ? 'bg-yellow-500 text-black hover:bg-yellow-400' : 'bg-primary text-on-primary hover:bg-primary/90'}`}>
              {ingresoMutation.isPending ? 'Confirmando...' : isReactivation || !loteActivo ? 'Reactivar e ingresar' : 'Confirmar ingreso'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={operationSheetBackdropClass} onClick={onClose}>
      <div className={operationSheetCardClass} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 text-primary"><PackagePlus size={20} aria-hidden="true" /><h3 className="text-[18px] font-semibold text-on-surface">{isReactivation ? 'Reactivar lote' : 'Ingresar stock'}</h3></div>
        <p className="mt-1 font-body text-[13px] text-on-surface-variant">Lote: <span className="font-semibold text-on-surface">{loteNumero}</span> | Ubicación: <span className="font-semibold text-on-surface">{ubicacionNombre}</span></p>
        
        {errorLocal && (
          <div className="mt-4 rounded-lg bg-error/10 p-3">
            <p className="font-body text-[12px] text-error">{errorLocal}</p>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="flex justify-between items-center rounded-lg bg-surface-container-highest/20 p-3">
            <span className="font-body text-[13px] text-on-surface-variant">Cantidad actual:</span>
            <span className="text-[16px] font-semibold text-on-surface">{cantidadActual}</span>
          </div>
          <QuantityByBoxesFields idPrefix="ingreso" cajas={cajas} sueltos={sueltos} unidadesPorCaja={unidadesPorCaja} onCajasChange={setCajas} onSueltosChange={setSueltos} resultLabel="Cantidad a ingresar" />
          <p className="-mt-2 font-body text-[11px] text-on-surface-variant">Se sumará a la cantidad actual.</p>
          <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end sm:gap-3">
            <button type="button" onClick={onClose} className={operationSheetSecondaryButtonClass}>Cancelar</button>
            <button type="submit" className={operationSheetPrimaryButtonClass}>
              Confirmar ingreso
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TransferirModal({ productoId, productoNombre, loteId, loteNumero, origen, cantidadActual, onClose, onCompleted }: { productoId: string; productoNombre: string; loteId: string; loteNumero: string; origen: 'DEPOSITO' | 'ACONDICIONADO'; cantidadActual: number; onClose: () => void; onCompleted: () => void }) {
  const destino = origen === 'DEPOSITO' ? 'ACONDICIONADO' : 'DEPOSITO'
  const OriginIcon = origen === 'DEPOSITO' ? Warehouse : PackageCheck
  const DestinationIcon = destino === 'DEPOSITO' ? Warehouse : PackageCheck
  const originTone = origen === 'DEPOSITO' ? 'border-sky-400/30 bg-sky-400/10 text-sky-100' : 'border-amber-400/30 bg-amber-400/10 text-amber-100'
  const destinationTone = destino === 'DEPOSITO' ? 'border-sky-400/30 bg-sky-400/10 text-sky-100' : 'border-amber-400/30 bg-amber-400/10 text-amber-100'
  const [cantidad, setCantidad] = useState<string>('')
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const [transferRuleId, setTransferRuleId] = useState('')
  const transferirMutation = useTransferirStock()
  const transferRulesQuery = useProductTransferRules(productoId, origen === 'ACONDICIONADO')
  const transferRules = transferRulesQuery.data?.rules ?? []
  const requiresDestination = origen === 'ACONDICIONADO' && transferRules.length > 0
  const hasPresentationRules = transferRules.some((rule) => rule.tipo === 'PRESENTATION')
  const selectedRule = transferRules.find((rule) => rule.id === transferRuleId)
  const selectedDestinationProductName = selectedRule?.targetProduct.nombre
  const cantidadNumerica = Number(cantidad) || 0
  const cantidadRestante = Math.max(0, cantidadActual - cantidadNumerica)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorLocal(null)
    const val = Number(cantidad)
    if (!cantidad || isNaN(val) || val <= 0 || val > cantidadActual || transferRulesQuery.isLoading || transferRulesQuery.isError || (requiresDestination && !selectedRule)) return
    
    try {
      await transferirMutation.mutateAsync({
        productoId,
        loteId,
        origen,
        destino,
        cantidad: val,
        ...(selectedRule ? { transferRuleId: selectedRule.id } : {}),
        idempotencyKey: crypto.randomUUID()
      })
      toast.success(selectedRule?.tipo === 'PRESENTATION'
        ? `${val} unidades de ${selectedRule.targetProduct.nombre} enviadas a Depósito`
        : 'Stock actualizado correctamente')
      onCompleted()
    } catch (err) {
      setErrorLocal(err instanceof Error ? err.message : 'Error al transferir')
    }
  }

  return (
    <div className={operationSheetBackdropClass} onClick={onClose}>
      <div className={operationSheetCardClass} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 text-primary"><ArrowRightLeft size={20} aria-hidden="true" /><h3 className="text-[18px] font-semibold text-on-surface">{hasPresentationRules ? 'Transferir a presentación' : 'Transferir stock'}</h3></div>
        <p className="mt-1 font-body text-[13px] text-on-surface-variant">
          {hasPresentationRules ? 'Preparar una presentación desde Acondicionado hacia Depósito.' : <>Lote: <span className="font-semibold text-on-surface">{loteNumero}</span></>}
        </p>
        
        {errorLocal && (
          <div className="mt-4 rounded-lg bg-error/10 p-3">
            <p className="font-body text-[12px] text-error">{errorLocal}</p>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {origen === 'ACONDICIONADO' && (
            <div>
              <label htmlFor="presentacion-transferir" className="font-body text-[12px] text-outline">{hasPresentationRules ? 'Preparar como' : 'Destino configurado'}</label>
              {transferRulesQuery.isLoading ? (
                <p className="mt-1 font-body text-[13px] text-on-surface-variant">Cargando destinos permitidos...</p>
              ) : transferRulesQuery.isError ? (
                <p className="mt-1 font-body text-[13px] text-error">No se pudieron cargar los destinos permitidos.</p>
              ) : requiresDestination ? (
                <select
                  id="presentacion-transferir"
                  required
                  value={transferRuleId}
                  onChange={(event) => setTransferRuleId(event.target.value)}
                  className="input-field mt-1 min-h-11 w-full text-[16px]"
                >
                  <option value="">Seleccionar presentación</option>
                  {transferRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.label}</option>)}
                </select>
              ) : null}
            </div>
          )}
          {cantidadActual === 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="font-body text-[12px] text-amber-200">No hay stock en {origen === 'DEPOSITO' ? 'Depósito' : 'Acondicionado'} disponible para transferir.</p>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="cantidad-transferir" className="font-body text-[12px] text-outline">Cantidad a transferir</label>
              <button
                type="button"
                onClick={() => {
                  setCantidad(String(cantidadActual))
                  setErrorLocal(null)
                }}
                disabled={cantidadActual === 0 || (hasPresentationRules && transferRulesQuery.isLoading)}
                className="font-body text-[12px] font-semibold text-primary transition hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Transferir todo ({cantidadActual})
              </button>
            </div>
            <input 
              id="cantidad-transferir"
              type="number" 
              min={1}
              max={cantidadActual > 0 ? cantidadActual : undefined}
              required
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="input-field mt-1 min-h-11 w-full text-[16px]"
              autoFocus
              disabled={cantidadActual === 0}
            />
            {hasPresentationRules && <p className="mt-1 font-body text-[11px] text-on-surface-variant">Disponible: {cantidadActual} unidades en Acondicionado.</p>}
          </div>
          <div className="space-y-2">
            <div className={`rounded-xl border p-3 ${originTone}`}>
              <p className="flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-wide"><OriginIcon size={15} aria-hidden="true" />Origen · {origen === 'DEPOSITO' ? 'Depósito' : 'Acondicionado'}</p>
              <p className="mt-1 text-[14px] font-semibold text-on-surface">{productoNombre}</p>
              <p className="font-body text-[12px] text-on-surface-variant">Lote {loteNumero} · {origen}</p>
            </div>
            {selectedDestinationProductName ? (
              <div className={`rounded-xl border p-3 ${destinationTone}`}>
                <p className="flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-wide"><DestinationIcon size={15} aria-hidden="true" />Destino · {destino === 'DEPOSITO' ? 'Depósito' : 'Acondicionado'}</p>
                <p className="mt-1 text-[14px] font-semibold text-on-surface">{selectedDestinationProductName}</p>
                <p className="font-body text-[12px] text-on-surface-variant">Lote {loteNumero} · {destino}</p>
              </div>
            ) : !requiresDestination ? (
              <div className={`rounded-xl border p-3 ${destinationTone}`}>
                <p className="flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-wide"><DestinationIcon size={15} aria-hidden="true" />Destino · {destino === 'DEPOSITO' ? 'Depósito' : 'Acondicionado'}</p>
                <p className="mt-1 text-[14px] font-semibold text-on-surface">{productoNombre}</p>
                <p className="font-body text-[12px] text-on-surface-variant">Lote {loteNumero} · {destino}</p>
              </div>
            ) : null}
            <div className="flex justify-between rounded-lg bg-surface-container-highest/20 px-3 py-2">
              <p className="font-body text-[12px] text-on-surface-variant">{hasPresentationRules ? 'Disponibles' : 'Cantidad'}</p>
              <p className="text-[14px] font-semibold text-on-surface">{hasPresentationRules ? cantidadActual : cantidad || 0}</p>
            </div>
            {selectedDestinationProductName && hasPresentationRules && (
              <>
                <p className="border-t border-white/5 pt-3 font-body text-[13px] text-on-surface"><span className="font-semibold">{cantidadNumerica}</span> → {selectedDestinationProductName}</p>
                <p className="font-body text-[12px] text-on-surface-variant">Quedarán {cantidadRestante} en Acondicionado</p>
              </>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end sm:gap-3">
            <button type="button" onClick={onClose} className={operationSheetSecondaryButtonClass}>Cancelar</button>
            <button type="submit" disabled={transferirMutation.isPending || transferRulesQuery.isLoading || transferRulesQuery.isError || (requiresDestination && !selectedRule) || cantidadActual === 0} className={operationSheetPrimaryButtonClass}>
              {transferirMutation.isPending ? 'Transfiriendo...' : 'Confirmar transferencia'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateLoteModal({ productoId, productoNombre, prefijoFijo, unidadesPorCaja, onClose }: { productoId: string; productoNombre: string; prefijoFijo: string | null; unidadesPorCaja: number; onClose: () => void }) {
  const [prefix, setPrefix] = useState(prefijoFijo ?? '')
  const [correlativo, setCorrelativo] = useState('')
  const [cajas, setCajas] = useState('')
  const [sueltos, setSueltos] = useState('')
  const [fechaProduccionStr, setFechaProduccionStr] = useState('')
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const createMutation = useCreateAdminLote()
  const cantidadInicial = quantityFromBoxes(cajas, sueltos, unidadesPorCaja)

  let fechaVencimientoDisplay = ''
  if (fechaProduccionStr) {
    const [year, month] = fechaProduccionStr.split('-').map(Number)
    fechaVencimientoDisplay = `${String(month).padStart(2, '0')}/${year + 2}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorLocal(null)
    if (!prefix || !correlativo.trim() || !fechaProduccionStr || cantidadInicial === null || cantidadInicial <= 0) {
      setErrorLocal('Completá los datos y cargá al menos una caja o una unidad suelta')
      return
    }

    const [y, m] = fechaProduccionStr.split('-').map(Number)
    const fechaProduccion = new Date(Date.UTC(y, m - 1, 1)).toISOString()
    const vencimiento = new Date(Date.UTC(y + 2, m, 0, 23, 59, 59))
    const fechaVencimiento = vencimiento.toISOString()
    const today = new Date()
    const todayDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    const expirationDay = Date.UTC(vencimiento.getUTCFullYear(), vencimiento.getUTCMonth(), vencimiento.getUTCDate())
    if (expirationDay < todayDay) {
      setErrorLocal('La fecha de vencimiento no puede estar en el pasado')
      return
    }

    try {
      await createMutation.mutateAsync({
        productoId,
        numero: `${prefix}${correlativo.trim()}`,
        prefijo: prefix,
        cantidadInicial,
        fechaProduccion,
        fechaVencimiento,
        idempotencyKey: crypto.randomUUID(),
      })
      toast.success('Lote creado exitosamente')
      onClose()
    } catch (err) {
      setErrorLocal(err instanceof Error ? err.message : 'Error al crear lote')
    }
  }

  return (
    <div className={operationSheetBackdropClass} onClick={onClose}>
      <div className={operationSheetCardClass} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[18px] font-semibold text-on-surface">Nuevo lote</h3>
        
        {errorLocal && (
          <div className="mt-4 rounded-lg bg-error/10 p-3">
            <p className="font-body text-[12px] text-error">{errorLocal}</p>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="correlativo-lote" className="font-body text-[12px] text-outline">Número de lote</label>
            <div className="mt-1 flex min-h-11 overflow-hidden rounded border border-outline-variant bg-surface-container">
              <input aria-label="Sigla del lote" required value={prefix} readOnly={Boolean(prefijoFijo)} maxLength={12} onChange={(event) => setPrefix(event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} className="w-20 border-r border-outline-variant bg-primary/10 px-3 font-mono text-[16px] font-bold text-primary outline-none" placeholder="Sigla" />
              <input
                id="correlativo-lote"
                aria-label="Correlativo de lote"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                value={correlativo}
                onChange={(event) => setCorrelativo(event.target.value.replace(/\D/g, ''))}
                className="min-w-0 flex-1 bg-transparent px-3 text-[16px] outline-none"
                placeholder="0302"
                autoFocus
              />
            </div>
            <p className="mt-1 font-body text-[11px] text-on-surface-variant">{prefijoFijo ? `La sigla ${prefix} es fija para ${productoNombre}.` : 'Al crear el lote, esta sigla quedará fija para este producto.'}</p>
          </div>
          <div>
            <label htmlFor="fecha-produccion" className="font-body text-[12px] text-outline">Fecha de producción (MM/AAAA)</label>
            <input 
              id="fecha-produccion"
              type="month" 
              required
              value={fechaProduccionStr}
              onChange={(e) => setFechaProduccionStr(e.target.value)}
              className="input-field mt-1 min-h-11 w-full text-[16px]"
            />
          </div>
          <QuantityByBoxesFields idPrefix="nuevo-lote" cajas={cajas} sueltos={sueltos} unidadesPorCaja={unidadesPorCaja} onCajasChange={setCajas} onSueltosChange={setSueltos} resultLabel="Cantidad inicial" />
          <p className="-mt-2 font-body text-[11px] text-on-surface-variant">El lote se creará en ACONDICIONADO (sin acondicionar).</p>
          <div>
            <label htmlFor="fecha-vencimiento" className="font-body text-[12px] text-outline">Fecha de vencimiento (+24 meses)</label>
            <input 
              id="fecha-vencimiento"
              type="text" 
              disabled
              value={fechaVencimientoDisplay}
              className="input-field mt-1 min-h-11 w-full cursor-not-allowed bg-surface-container-highest/50 text-[16px] text-on-surface-variant"
              placeholder="Autocalculada"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end sm:gap-3">
            <button type="button" onClick={onClose} className={operationSheetSecondaryButtonClass}>Cancelar</button>
            <button type="submit" disabled={createMutation.isPending} className={operationSheetPrimaryButtonClass}>
              {createMutation.isPending ? 'Creando...' : 'Crear lote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
