import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { type Producto, type LoteAdminStock } from '../lib/api'
import { useProductoAdminStock, useAjusteAdminStock, useIngresarAdminStock, useTransferirStock, useCreateAdminLote, useProductTransferRules, useUpdateLote } from '../queries'
import { formatOptionalDate } from '../lib/logistics-display'
import { suggestedLotPrefix } from '../lib/lot-prefix'

interface GestionarStockModalProps {
  producto: Producto
  onClose: () => void
}

type LotesTab = 'operables' | 'agotados'

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
        
        <div className="mt-5 grid grid-cols-3 rounded-xl border border-white/5 bg-surface-container/50 p-2 text-center sm:mt-6 sm:p-4">
          <div>
            <p className="font-body text-[10px] font-medium uppercase tracking-wide text-on-surface-variant sm:text-[12px]">Total</p>
            <p className="mt-1 text-[20px] font-semibold text-on-surface sm:text-[24px]">{stockTotal}</p>
          </div>
          <div>
            <p className="font-body text-[10px] font-medium uppercase tracking-wide text-on-surface-variant sm:text-[12px]">Depósito</p>
            <p className="mt-1 text-[20px] font-semibold text-on-surface sm:text-[24px]">{stockDeposito}</p>
          </div>
          <div>
            <p className="font-body text-[10px] font-medium uppercase tracking-wide text-on-surface-variant sm:text-[12px]" title="Acondicionado"><span className="sm:hidden">Acond.</span><span className="hidden sm:inline">Acondicionado</span></p>
            <p className="mt-1 text-[20px] font-semibold text-on-surface sm:text-[24px]">{stockAcondicionado}</p>
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
                          <div className="rounded-lg bg-surface-container/30 p-3">
                            <div className="mb-3 flex items-center justify-between gap-2"><p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Depósito</p><p className="text-[16px] font-semibold text-on-surface">{lote.stockDeposito}</p></div>
                            {depositoUbicacion && <div className="grid grid-cols-2 gap-2">
                              <button type="button" onClick={() => setAjusteModal({ loteId: lote.id, loteNumero: lote.numero, ubicacionId: depositoUbicacion.id, ubicacionNombre: 'Depósito', cantidadActual: lote.stockDeposito, activo: lote.activo })} className="min-h-10 rounded-full border border-white/10 px-2 py-1 font-body text-[11px] text-on-surface-variant transition hover:bg-surface-variant/50 hover:text-on-surface">Ajustar</button>
                              <button type="button" onClick={() => setTransferirModal({ loteId: lote.id, loteNumero: lote.numero, origen: 'DEPOSITO', cantidadActual: lote.stockDeposito })} className="min-h-10 rounded-full border border-white/10 px-2 py-1 font-body text-[11px] text-on-surface-variant transition hover:bg-surface-variant/50 hover:text-on-surface">Transferir</button>
                            </div>}
                          </div>
                          <div className="rounded-lg bg-surface-container/30 p-3">
                            <div className="mb-3 flex items-center justify-between gap-2"><p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Acondicionado</p><p className="text-[16px] font-semibold text-on-surface">{lote.stockAcondicionado}</p></div>
                            {acondicionadoUbicacion && <div className="grid grid-cols-2 gap-2">
                              <button type="button" onClick={() => setIngresoModal({ loteId: lote.id, loteNumero: lote.numero, ubicacionId: acondicionadoUbicacion.id, ubicacionNombre: 'Acondicionado', cantidadActual: lote.stockAcondicionado, activo: lote.activo, isReactivation: false })} className="min-h-10 rounded-full border border-primary/50 px-2 py-1 font-body text-[11px] font-medium text-primary transition hover:bg-primary/10">Ingresar</button>
                              <button type="button" onClick={() => setAjusteModal({ loteId: lote.id, loteNumero: lote.numero, ubicacionId: acondicionadoUbicacion.id, ubicacionNombre: 'Acondicionado', cantidadActual: lote.stockAcondicionado, activo: lote.activo })} className="min-h-10 rounded-full border border-white/10 px-2 py-1 font-body text-[11px] text-on-surface-variant transition hover:bg-surface-variant/50 hover:text-on-surface">Ajustar</button>
                              <button type="button" onClick={() => setTransferirModal({ loteId: lote.id, loteNumero: lote.numero, origen: 'ACONDICIONADO', cantidadActual: lote.stockAcondicionado })} className="col-span-2 min-h-10 rounded-full border border-white/10 px-2 py-1 font-body text-[11px] text-on-surface-variant transition hover:bg-surface-variant/50 hover:text-on-surface">{hasPresentationDestinations ? 'Transferir a presentación' : 'Transferir'}</button>
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="reactivar-lote-title" className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
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
        <div className="flex justify-end gap-3 pt-6">
          <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-4 py-2 font-body text-[12px] text-outline transition hover:text-on-surface">Cancelar</button>
          <button type="button" disabled={!selectedLocation} onClick={() => selectedLocation && onContinue({ id: selectedLocation.id, nombre: selectedLocation.nombre })} className="rounded-full bg-primary px-4 py-2 font-body text-[12px] font-semibold text-on-primary transition hover:bg-primary/90 disabled:opacity-50">Continuar</button>
        </div>
      </div>
    </div>
  )
}

function AjusteModal({ productoId, loteId, loteNumero, ubicacionId, ubicacionNombre, cantidadActual, onClose, onCompleted }: { productoId: string; loteId: string; loteNumero: string; ubicacionId: string; ubicacionNombre: string; cantidadActual: number; onClose: () => void; onCompleted: () => void }) {
  const [cantidadFinal, setCantidadFinal] = useState<string>('')
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const ajusteMutation = useAjusteAdminStock()

  async function handleConfirm() {
    setErrorLocal(null)
    try {
      await ajusteMutation.mutateAsync({
        productoId,
        loteId,
        ubicacionId,
        cantidadFinal: Number(cantidadFinal),
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
    if (!cantidadFinal || isNaN(Number(cantidadFinal)) || Number(cantidadFinal) < 0) return
    setStep('confirm')
  }

  if (step === 'confirm') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
        <div className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
          <div className="flex justify-end gap-3 pt-6">
            <button type="button" disabled={ajusteMutation.isPending} onClick={() => setStep('form')} className="rounded-full border border-white/10 px-4 py-2 font-body text-[12px] text-outline transition hover:text-on-surface disabled:opacity-50">Cancelar</button>
            <button type="button" disabled={ajusteMutation.isPending} onClick={handleConfirm} className="rounded-full bg-primary px-4 py-2 font-body text-[12px] font-semibold text-on-primary transition hover:bg-primary/90 disabled:opacity-50">
              {ajusteMutation.isPending ? 'Confirmando...' : 'Confirmar ajuste'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[18px] font-semibold text-on-surface">Ajustar stock</h3>
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
          <div>
            <label htmlFor="cantidad-final" className="font-body text-[12px] text-outline">Cantidad final</label>
            <input 
              id="cantidad-final"
              type="number" 
              min={0}
              required
              value={cantidadFinal}
              onChange={(e) => setCantidadFinal(e.target.value)}
              className="input-field mt-1 w-full"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-4 py-2 font-body text-[12px] text-outline transition hover:text-on-surface">Cancelar</button>
            <button type="submit" className="rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20">
              Confirmar ajuste
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function IngresarModal({ productoId, loteId, loteNumero, ubicacionId, ubicacionNombre, cantidadActual, loteActivo, isReactivation, onClose, onCompleted }: { productoId: string; loteId: string; loteNumero: string; ubicacionId: string; ubicacionNombre: string; cantidadActual: number; loteActivo: boolean; isReactivation: boolean; onClose: () => void; onCompleted: () => void }) {
  const [cantidad, setCantidad] = useState<string>('')
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const ingresoMutation = useIngresarAdminStock()

  async function handleConfirm() {
    setErrorLocal(null)
    try {
      await ingresoMutation.mutateAsync({
        productoId,
        loteId,
        ubicacionId,
        cantidad: Number(cantidad),
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
    if (!cantidad || isNaN(Number(cantidad)) || Number(cantidad) <= 0) return
    setStep('confirm')
  }

  const cantidadNueva = cantidadActual + Number(cantidad)

  if (step === 'confirm') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
        <div className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
              <span className="text-[14px] font-semibold text-primary">+{cantidad}</span>
            </div>
            <div className="flex justify-between items-center border-t border-white/5 pt-2">
              <span className="font-body text-[13px] font-semibold text-primary">Resultado:</span>
              <span className="text-[16px] font-bold text-primary">{cantidadNueva}</span>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-6">
            <button type="button" disabled={ingresoMutation.isPending} onClick={() => setStep('form')} className="rounded-full border border-white/10 px-4 py-2 font-body text-[12px] text-outline transition hover:text-on-surface disabled:opacity-50">Cancelar</button>
            <button type="button" disabled={ingresoMutation.isPending} onClick={handleConfirm} className={`rounded-full px-4 py-2 font-body text-[12px] font-semibold transition disabled:opacity-50 ${isReactivation || !loteActivo ? 'bg-yellow-500 text-black hover:bg-yellow-400' : 'bg-primary text-on-primary hover:bg-primary/90'}`}>
              {ingresoMutation.isPending ? 'Confirmando...' : isReactivation || !loteActivo ? 'Reactivar e ingresar' : 'Confirmar ingreso'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[18px] font-semibold text-on-surface">{isReactivation ? 'Reactivar lote' : 'Ingresar stock'}</h3>
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
          <div>
            <label htmlFor="cantidad-ingresar" className="font-body text-[12px] text-outline">Cantidad a ingresar</label>
            <input 
              id="cantidad-ingresar"
              type="number" 
              min={1}
              required
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="input-field mt-1 w-full"
              autoFocus
            />
            <p className="mt-1 font-body text-[11px] text-on-surface-variant">Se sumará a la cantidad actual.</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-4 py-2 font-body text-[12px] text-outline transition hover:text-on-surface">Cancelar</button>
            <button type="submit" className="rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20">
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
      toast.success('Stock actualizado correctamente')
      onCompleted()
    } catch (err) {
      setErrorLocal(err instanceof Error ? err.message : 'Error al transferir')
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[18px] font-semibold text-on-surface">{hasPresentationRules ? 'Transferir a presentación' : 'Transferir stock'}</h3>
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
                  className="input-field mt-1 w-full"
                >
                  <option value="">Seleccionar presentación</option>
                  {transferRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.label}</option>)}
                </select>
              ) : null}
            </div>
          )}
          {hasPresentationRules && cantidadActual === 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="font-body text-[12px] text-amber-200">No hay stock en Acondicionado disponible para preparar esta presentación.</p>
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
              max={cantidadActual}
              required
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="input-field mt-1 w-full"
              autoFocus
              disabled={hasPresentationRules && cantidadActual === 0}
            />
            {hasPresentationRules && <p className="mt-1 font-body text-[11px] text-on-surface-variant">Disponible: {cantidadActual} unidades en Acondicionado.</p>}
          </div>
          <div className="rounded-lg bg-surface-container-highest/20 p-3 space-y-3">
            <div>
              <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Origen</p>
              <p className="mt-1 text-[14px] font-semibold text-on-surface">{productoNombre}</p>
              <p className="font-body text-[12px] text-on-surface-variant">Lote {loteNumero} · {origen}</p>
            </div>
            {selectedDestinationProductName ? (
              <div className="border-t border-white/5 pt-3">
                <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Destino</p>
                <p className="mt-1 text-[14px] font-semibold text-on-surface">{selectedDestinationProductName}</p>
                <p className="font-body text-[12px] text-on-surface-variant">Lote {loteNumero} · {destino}</p>
              </div>
            ) : !requiresDestination ? (
              <div className="border-t border-white/5 pt-3">
                <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Destino</p>
                <p className="mt-1 text-[14px] font-semibold text-on-surface">{productoNombre}</p>
                <p className="font-body text-[12px] text-on-surface-variant">Lote {loteNumero} · {destino}</p>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-white/5 pt-3">
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
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-4 py-2 font-body text-[12px] text-outline transition hover:text-on-surface">Cancelar</button>
            <button type="submit" disabled={transferirMutation.isPending || transferRulesQuery.isLoading || transferRulesQuery.isError || (requiresDestination && !selectedRule) || (hasPresentationRules && cantidadActual === 0)} className="rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50">
              {transferirMutation.isPending ? 'Transfiriendo...' : 'Confirmar transferencia'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateLoteModal({ productoId, productoNombre, onClose }: { productoId: string; productoNombre: string; onClose: () => void }) {
  const [numero, setNumero] = useState(() => suggestedLotPrefix(productoNombre))
  const [cantidadInicial, setCantidadInicial] = useState('')
  const [fechaProduccionStr, setFechaProduccionStr] = useState('')
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const createMutation = useCreateAdminLote()

  let fechaVencimientoDisplay = ''
  if (fechaProduccionStr) {
    const [year, month] = fechaProduccionStr.split('-').map(Number)
    fechaVencimientoDisplay = `${String(month).padStart(2, '0')}/${year + 2}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorLocal(null)
    const cantidad = Number(cantidadInicial)
    if (!numero.trim() || !fechaProduccionStr || !Number.isInteger(cantidad) || cantidad <= 0) return

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
        numero: numero.trim(),
        cantidadInicial: cantidad,
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[18px] font-semibold text-on-surface">Nuevo lote</h3>
        
        {errorLocal && (
          <div className="mt-4 rounded-lg bg-error/10 p-3">
            <p className="font-body text-[12px] text-error">{errorLocal}</p>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="numero-lote" className="font-body text-[12px] text-outline">Número de lote</label>
            <input 
              id="numero-lote"
              type="text" 
              required
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              className="input-field mt-1 w-full"
              autoFocus
            />
            <p className="mt-1 font-body text-[11px] text-on-surface-variant">Prefijo sugerido para {productoNombre}; podés modificarlo.</p>
          </div>
          <div>
            <label htmlFor="fecha-produccion" className="font-body text-[12px] text-outline">Fecha de producción (MM/AAAA)</label>
            <input 
              id="fecha-produccion"
              type="month" 
              required
              value={fechaProduccionStr}
              onChange={(e) => setFechaProduccionStr(e.target.value)}
              className="input-field mt-1 w-full"
            />
          </div>
          <div>
            <label htmlFor="cantidad-inicial" className="font-body text-[12px] text-outline">Cantidad inicial</label>
            <input
              id="cantidad-inicial"
              type="number"
              min={1}
              step={1}
              required
              value={cantidadInicial}
              onChange={(event) => setCantidadInicial(event.target.value)}
              className="input-field mt-1 w-full"
            />
            <p className="mt-1 font-body text-[11px] text-on-surface-variant">Unidades en ACONDICIONADO (Sin acondicionar).</p>
          </div>
          <div>
            <label htmlFor="fecha-vencimiento" className="font-body text-[12px] text-outline">Fecha de vencimiento (+24 meses)</label>
            <input 
              id="fecha-vencimiento"
              type="text" 
              disabled
              value={fechaVencimientoDisplay}
              className="input-field mt-1 w-full bg-surface-container-highest/50 text-on-surface-variant cursor-not-allowed"
              placeholder="Autocalculada"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-4 py-2 font-body text-[12px] text-outline transition hover:text-on-surface">Cancelar</button>
            <button type="submit" disabled={createMutation.isPending} className="rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50">
              {createMutation.isPending ? 'Creando...' : 'Crear lote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
