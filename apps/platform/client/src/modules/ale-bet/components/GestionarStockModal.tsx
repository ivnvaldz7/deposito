import { useState } from 'react'
import { Check, AlertTriangle, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { type Producto, type LoteAdminStock } from '../lib/api'
import { useProductoAdminStock, useAjusteAdminStock, useTransferirStock, useCreateAdminLote } from '../queries'
import { formatOptionalDate } from '../lib/logistics-display'

interface GestionarStockModalProps {
  producto: Producto
  onClose: () => void
}

export function GestionarStockModal({ producto, onClose }: GestionarStockModalProps) {
  const { data: stockData, isLoading, error } = useProductoAdminStock(producto.id)
  
  const [ajusteModal, setAjusteModal] = useState<{ loteId: string; loteNumero: string; ubicacionId: string; ubicacionNombre: string; cantidadActual: number } | null>(null)
  const [transferirModal, setTransferirModal] = useState<{ loteId: string; loteNumero: string; origen: 'DEPOSITO' | 'ACONDICIONADO'; cantidadActual: number } | null>(null)
  const [createLoteModal, setCreateLoteModal] = useState(false)

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-surface-container-low p-6" onClick={(e) => e.stopPropagation()}>
          <p className="font-body text-sm text-on-surface-variant">Cargando información de stock...</p>
        </div>
      </div>
    )
  }

  if (error || !stockData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-surface-container-low p-6" onClick={(e) => e.stopPropagation()}>
          <p className="font-body text-sm text-error">Error al cargar información de stock.</p>
          <button onClick={onClose} className="mt-4 rounded-full border border-white/10 px-4 py-2 text-[12px]">Cerrar</button>
        </div>
      </div>
    )
  }

  const { lotes, ubicaciones } = stockData
  const depositoUbicacion = ubicaciones.find(u => u.codigo === 'DEPOSITO')
  const acondicionadoUbicacion = ubicaciones.find(u => u.codigo === 'ACONDICIONADO')
  const stockTotal = lotes.reduce((acc, lote) => acc + lote.stockTotal, 0)
  const stockDeposito = lotes.reduce((acc, lote) => acc + lote.stockDeposito, 0)
  const stockAcondicionado = lotes.reduce((acc, lote) => acc + lote.stockAcondicionado, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-white/10 bg-surface-container-low p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] font-semibold tracking-tight text-on-surface">{producto.nombre}</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface"><X className="h-5 w-5" /></button>
        </div>
        
        <div className="mt-6 flex justify-between rounded-xl bg-surface-container/50 p-4 text-center border border-white/5">
          <div>
            <p className="font-body text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">Total</p>
            <p className="mt-1 text-[24px] font-semibold text-on-surface">{stockTotal}</p>
          </div>
          <div>
            <p className="font-body text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">Depósito</p>
            <p className="mt-1 text-[24px] font-semibold text-on-surface">{stockDeposito}</p>
          </div>
          <div>
            <p className="font-body text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">Acondicionado</p>
            <p className="mt-1 text-[24px] font-semibold text-on-surface">{stockAcondicionado}</p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-on-surface">Lotes</h3>
          <button 
            onClick={() => setCreateLoteModal(true)} 
            className="rounded-full border border-primary px-3 py-1.5 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20"
          >
            + Nuevo lote
          </button>
        </div>

        {lotes.length === 0 ? (
          <p className="mt-4 py-6 text-center font-body text-[13px] text-on-surface-variant">No hay lotes creados.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {lotes.map(lote => (
              <div key={lote.id} className="rounded-xl border border-white/10 bg-surface-container-high p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[15px] text-primary">LOTE {lote.numero}</span>
                  <span className="font-body text-[12px] text-on-surface-variant">Vto: {formatOptionalDate(lote.fechaVencimiento)}</span>
                </div>
                
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-surface-container/30 p-3">
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Depósito</p>
                      <p className="text-[16px] font-semibold text-on-surface">{lote.stockDeposito}</p>
                    </div>
                    {depositoUbicacion && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setAjusteModal({ loteId: lote.id, loteNumero: lote.numero, ubicacionId: depositoUbicacion.id, ubicacionNombre: 'Depósito', cantidadActual: lote.stockDeposito })}
                          className="flex-1 rounded-full border border-white/10 px-2 py-1 font-body text-[11px] text-on-surface-variant transition hover:bg-surface-variant/50 hover:text-on-surface"
                        >
                          Ajustar
                        </button>
                        <button 
                          onClick={() => setTransferirModal({ loteId: lote.id, loteNumero: lote.numero, origen: 'DEPOSITO', cantidadActual: lote.stockDeposito })}
                          className="flex-1 rounded-full border border-white/10 px-2 py-1 font-body text-[11px] text-on-surface-variant transition hover:bg-surface-variant/50 hover:text-on-surface"
                        >
                          Transferir
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="rounded-lg bg-surface-container/30 p-3">
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Acondicionado</p>
                      <p className="text-[16px] font-semibold text-on-surface">{lote.stockAcondicionado}</p>
                    </div>
                    {acondicionadoUbicacion && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setAjusteModal({ loteId: lote.id, loteNumero: lote.numero, ubicacionId: acondicionadoUbicacion.id, ubicacionNombre: 'Acondicionado', cantidadActual: lote.stockAcondicionado })}
                          className="flex-1 rounded-full border border-white/10 px-2 py-1 font-body text-[11px] text-on-surface-variant transition hover:bg-surface-variant/50 hover:text-on-surface"
                        >
                          Ajustar
                        </button>
                        <button 
                          onClick={() => setTransferirModal({ loteId: lote.id, loteNumero: lote.numero, origen: 'ACONDICIONADO', cantidadActual: lote.stockAcondicionado })}
                          className="flex-1 rounded-full border border-white/10 px-2 py-1 font-body text-[11px] text-on-surface-variant transition hover:bg-surface-variant/50 hover:text-on-surface"
                        >
                          Transferir
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="mt-3 flex justify-between border-t border-white/5 pt-3">
                  <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Total</p>
                  <p className="text-[16px] font-semibold text-on-surface">{lote.stockTotal}</p>
                </div>
              </div>
            ))}
          </div>
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
        />
      )}

      {transferirModal && (
        <TransferirModal 
          productoId={producto.id}
          loteId={transferirModal.loteId}
          loteNumero={transferirModal.loteNumero}
          origen={transferirModal.origen}
          cantidadActual={transferirModal.cantidadActual}
          onClose={() => setTransferirModal(null)}
        />
      )}

      {createLoteModal && (
        <CreateLoteModal 
          productoId={producto.id}
          onClose={() => setCreateLoteModal(false)}
        />
      )}
    </div>
  )
}

function AjusteModal({ productoId, loteId, loteNumero, ubicacionId, ubicacionNombre, cantidadActual, onClose }: any) {
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
      onClose()
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

function TransferirModal({ productoId, loteId, loteNumero, origen, cantidadActual, onClose }: any) {
  const destino = origen === 'DEPOSITO' ? 'ACONDICIONADO' : 'DEPOSITO'
  const [cantidad, setCantidad] = useState<string>('')
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const transferirMutation = useTransferirStock()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorLocal(null)
    const val = Number(cantidad)
    if (!cantidad || isNaN(val) || val <= 0 || val > cantidadActual) return
    
    try {
      await transferirMutation.mutateAsync({
        productoId,
        loteId,
        origen,
        destino,
        cantidad: val,
        idempotencyKey: crypto.randomUUID()
      } as any) // Cast as any because useTransferirStock expects exactly DEPOSITO | ACONDICIONADO, TS should infer it but just in case
      toast.success('Stock actualizado correctamente')
      onClose()
    } catch (err) {
      setErrorLocal(err instanceof Error ? err.message : 'Error al transferir')
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[18px] font-semibold text-on-surface">Transferir stock</h3>
        <p className="mt-1 font-body text-[13px] text-on-surface-variant">Lote: <span className="font-semibold text-on-surface">{loteNumero}</span></p>
        
        {errorLocal && (
          <div className="mt-4 rounded-lg bg-error/10 p-3">
            <p className="font-body text-[12px] text-error">{errorLocal}</p>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="rounded-lg bg-surface-container-highest/20 p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-body text-[13px] text-on-surface-variant">Origen:</span>
              <span className="text-[14px] font-semibold text-on-surface">{origen}</span>
            </div>
            <div className="flex justify-between items-center border-t border-white/5 pt-2">
              <span className="font-body text-[13px] text-on-surface-variant">Disponible:</span>
              <span className="text-[14px] font-semibold text-on-surface">{cantidadActual}</span>
            </div>
            <div className="flex justify-between items-center border-t border-white/5 pt-2">
              <span className="font-body text-[13px] text-on-surface-variant">Destino:</span>
              <span className="text-[14px] font-semibold text-on-surface">{destino}</span>
            </div>
          </div>
          <div>
            <label htmlFor="cantidad-transferir" className="font-body text-[12px] text-outline">Cantidad a transferir</label>
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
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-4 py-2 font-body text-[12px] text-outline transition hover:text-on-surface">Cancelar</button>
            <button type="submit" disabled={transferirMutation.isPending} className="rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50">
              {transferirMutation.isPending ? 'Transfiriendo...' : 'Transferir'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateLoteModal({ productoId, onClose }: any) {
  const [numero, setNumero] = useState('')
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
    if (!numero.trim() || !fechaProduccionStr) return

    const [y, m] = fechaProduccionStr.split('-').map(Number)
    const fechaProduccion = new Date(Date.UTC(y, m - 1, 1)).toISOString()
    const fechaVencimiento = new Date(Date.UTC(y + 2, m, 0, 23, 59, 59)).toISOString()

    try {
      await createMutation.mutateAsync({
        productoId,
        numero: numero.trim(),
        fechaProduccion,
        fechaVencimiento,
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
