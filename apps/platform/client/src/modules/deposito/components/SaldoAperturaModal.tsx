import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/Dialog'
import { apiClient } from '@/lib/api-client'
import { ApiError } from '../lib/api'

import { MERCADOS } from './inventory-shared/mercados'

export interface SaldoAperturaItem { id: string; productoId?: string | null; label: string; lote?: string | null; vencimiento?: string | null; unidadesPorCaja?: number; mercado?: string }

export function SaldoAperturaModal({ open, onOpenChange, categoria, items, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; categoria: 'estuche' | 'etiqueta' | 'frasco' | 'droga'; items: SaldoAperturaItem[]; onSaved?: () => void }) {
  const [mercado, setMercado] = useState('')
  const [itemId, setItemId] = useState('')
  const [lote, setLote] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [fechaEfectiva, setFechaEfectiva] = useState(new Date().toISOString().slice(0, 10))
  const [vencimiento, setVencimiento] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const selected = items.find((item) => item.id === itemId)
  const queryClient = useQueryClient()

  // Determine if this category uses mercado (e.g. Estuches, Etiquetas) by checking if any item has it
  const usesMercado = items.some((item) => item.mercado)

  // Use canonical mercados for the dropdown to ensure all active markets (e.g. Argentina) are always selectable
  const uniqueMercados = MERCADOS.filter(m => m.value !== 'no_exportable')

  const filteredItems = usesMercado && mercado ? items.filter((item) => item.mercado === mercado) : items

  function handleMercadoChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setMercado(e.target.value)
    setItemId('') // Clear selected product when market changes
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null)
    const value = Number(cantidad)
    if (!itemId || !Number.isFinite(value) || value < 0 || (!Number.isInteger(value) && categoria !== 'droga')) { setError('Seleccioná un inventario y una cantidad válida.'); return }
    if (categoria === 'droga' && !lote.trim()) { setError('El lote es obligatorio para drogas.'); return }
    setSaving(true)
    try {
      await apiClient.post('/deposito/apertura', { categoria, productoId: selected?.productoId ?? itemId, cantidad: value, fechaEfectiva, ...(selected?.mercado ? { mercado: selected.mercado } : {}), ...(categoria === 'droga' ? { lote: lote.trim() } : {}), ...(categoria === 'droga' && vencimiento ? { vencimiento } : {}) }, undefined, { headers: { 'Idempotency-Key': crypto.randomUUID() } })

      // Invalidate both deposito (for the specific item lists) and ale-bet (for the stock overview)
      await queryClient.invalidateQueries({ queryKey: ['deposito'] })
      await queryClient.invalidateQueries({ queryKey: ['ale-bet', 'stock'] })

      onSaved?.(); onOpenChange(false); setCantidad(''); setItemId(''); setMercado(''); setLote('')
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'No se pudo registrar la carga inicial') }
    finally { setSaving(false) }
  }

  function formatMercadoLabel(val: string) {
    if (val.toUpperCase() === 'VENEZUELA') return 'Venezuela'
    return val.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Carga inicial</DialogTitle><DialogDescription>Registrá el stock físico existente al iniciar el sistema.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4">
    {usesMercado && (
      <label className="block text-sm">Mercado
        <select className="input-field mt-1" value={mercado} onChange={handleMercadoChange}>
          <option value="">Seleccionar mercado…</option>
          {uniqueMercados.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </label>
    )}

    <label className="block text-sm">Producto
      <select className="input-field mt-1" value={itemId} onChange={(e) => setItemId(e.target.value)} disabled={usesMercado && !mercado}>
        <option value="">Seleccionar…</option>
        {filteredItems.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
            {item.mercado ? ` [${formatMercadoLabel(item.mercado)}]` : ''}
            {item.lote ? ` · Lote ${item.lote}` : ''}
          </option>
        ))}
      </select>
    </label>
    {categoria === 'droga' && (
      <label className="block text-sm">Lote
        <input className="input-field mt-1" type="text" value={lote} onChange={(e) => setLote(e.target.value)} placeholder="Ej: L-12345" />
      </label>
    )}
    <label className="block text-sm">{categoria === 'frasco' ? 'Cantidad de cajas' : 'Cantidad'}<input className="input-field mt-1" type="number" min="0" step={categoria === 'droga' ? 'any' : '1'} value={cantidad} onChange={(e) => setCantidad(e.target.value)} disabled={usesMercado && !mercado} /></label>
    {categoria === 'droga' && <label className="block text-sm">Vencimiento (si corresponde)<input className="input-field mt-1" type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} /></label>}
    <label className="block text-sm">Fecha efectiva<input className="input-field mt-1" type="date" value={fechaEfectiva} onChange={(e) => setFechaEfectiva(e.target.value)} disabled={usesMercado && !mercado} /></label>
    {error && <p className="text-sm text-error">{error}</p>}<div className="flex gap-2"><button className="btn-primary flex-1" disabled={saving || (usesMercado && !mercado)}>{saving ? 'Guardando…' : 'Guardar saldo de apertura'}</button><button type="button" className="btn-secondary flex-1" onClick={() => onOpenChange(false)}>Cancelar</button></div>
  </form></DialogContent></Dialog>
}
