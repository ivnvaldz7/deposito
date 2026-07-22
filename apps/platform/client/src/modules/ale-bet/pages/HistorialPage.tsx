import { useState } from 'react'
import { type HistorialPedido } from '../lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useHistorial } from '../queries'
import { useClientes } from '../queries'

const ESTADOS = [
  { value: '', label: 'Todos los estados' },
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'APROBADO', label: 'Aprobado' },
  { value: 'EN_ARMADO', label: 'En armado' },
  { value: 'COMPLETADO', label: 'Completado' },
  { value: 'CANCELADO', label: 'Cancelado' },
]

function getEstadoBadge(estado: HistorialPedido['estado']) {
  const map: Record<HistorialPedido['estado'], string> = {
    PENDIENTE: 'bg-surface-highest text-on-surface-variant',
    APROBADO: 'bg-warning/20 text-warning',
    EN_ARMADO: 'bg-primary-container/20 text-primary-container',
    COMPLETADO: 'bg-success/20 text-success',
    CANCELADO: 'bg-error/20 text-error',
  }
  return map[estado]
}

export default function HistorialPage() {
  const user = useAuthStore((state) => state.user)
  const rol = user?.apps?.['ale-bet']?.rol ?? null

  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [estado, setEstado] = useState('')
  const [clienteId, setClienteId] = useState('')

  const [exporting, setExporting] = useState(false)

  const vendedorId = rol === 'vendedor' ? (user?.sub ?? '') : ''

  const filters = { desde, hasta, estado, clienteId, vendedorId: vendedorId || undefined }
  const { data: pedidos = [], isLoading, error } = useHistorial(filters)
  const { data: clientes = [] } = useClientes()

  async function handleExport() {
    setExporting(true)
    try {
      const { aleBetApi } = await import('../lib/api')
      const blob = await aleBetApi.historial.exportDownload()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'historial-pedidos.xlsx'
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      alert('Error al exportar')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[28px] font-bold tracking-[-0.03em] text-on-surface">Historial</h1>
          <p className="font-body text-[13px] text-on-surface-variant">Historial de pedidos</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50"
        >
          {exporting ? 'Exportando...' : 'Exportar Excel'}
        </button>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="mb-1 block font-body text-[10px] uppercase tracking-[0.8px] text-outline">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="mb-1 block font-body text-[10px] uppercase tracking-[0.8px] text-outline">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="mb-1 block font-body text-[10px] uppercase tracking-[0.8px] text-outline">Cliente</label>
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="input-field"
          >
            <option value="">Todos los clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block font-body text-[10px] uppercase tracking-[0.8px] text-outline">Estado</label>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="input-field"
          >
            {ESTADOS.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-surface-container-high rounded-xl overflow-hidden">
        {loading ? (
          <p className="px-5 py-8 text-center font-body text-[13px] text-on-surface-variant">Cargando historial...</p>
        ) : error ? (
          <p className="px-5 py-8 text-center font-body text-[13px] text-error">{error}</p>
        ) : pedidos.length === 0 ? (
          <p className="px-5 py-8 text-center font-body text-[13px] text-on-surface-variant">No se encontraron pedidos.</p>
        ) : (
          <table className="w-full text-left font-body text-[12px]">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.8px] text-outline">
                <th className="px-5 py-3 font-medium">Número</th>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Vendedor</th>
                <th className="px-5 py-3 font-medium">Armador</th>
                <th className="px-5 py-3 font-medium text-right">Items</th>
                <th className="px-5 py-3 font-medium">Fecha</th>
                <th className="px-5 py-3 font-medium text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} className="border-b border-white/10 last:border-0">
                  <td className="px-5 py-4 font-semibold text-on-surface">{p.numero}</td>
                  <td className="px-5 py-4 text-on-surface">{p.clienteNombre}</td>
                  <td className="px-5 py-4 text-outline">{p.vendedorNombre}</td>
                  <td className="px-5 py-4 text-outline">{p.armadorNombre ?? '—'}</td>
                  <td className="px-5 py-4 text-right text-outline">{p.items.length}</td>
                  <td className="px-5 py-4 text-outline">
                    {new Date(p.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex items-center justify-center rounded-full font-heading font-semibold text-xs px-2 py-0.5 w-[88px] ${getEstadoBadge(p.estado)}`}>
                      {p.estado.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
