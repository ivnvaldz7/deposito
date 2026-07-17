import { useEffect, useState } from 'react'
import { aleBetApi, type HistorialPedido, type Cliente } from '../lib/api'
import { useAuthStore } from '@/stores/auth-store'

const ESTADOS = [
  { value: '', label: 'Todos los estados' },
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'APROBADO', label: 'Aprobado' },
  { value: 'EN_ARMADO', label: 'En armado' },
  { value: 'COMPLETADO', label: 'Completado' },
  { value: 'CANCELADO', label: 'Cancelado' },
]

function getEstadoBadgeStyle(estado: HistorialPedido['estado']) {
  switch (estado) {
    case 'PENDIENTE':
      return { background: 'rgba(116, 121, 111, 0.14)', color: '#bccbb8', border: '1px solid rgba(116, 121, 111, 0.28)' }
    case 'APROBADO':
      return { background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.28)' }
    case 'EN_ARMADO':
      return { background: 'rgba(96, 165, 250, 0.12)', color: '#93c5fd', border: '1px solid rgba(96, 165, 250, 0.28)' }
    case 'COMPLETADO':
      return { background: 'rgba(26, 107, 53, 0.1)', color: '#bccbb8', border: '1px solid rgba(26, 107, 53, 0.22)' }
    case 'CANCELADO':
      return { background: 'rgba(239, 68, 68, 0.08)', color: '#d6a8a8', border: '1px solid rgba(239, 68, 68, 0.2)' }
  }
}

export default function HistorialPage() {
  const user = useAuthStore((state) => state.user)
  const rol = user?.apps?.['ale-bet']?.rol ?? null

  const [pedidos, setPedidos] = useState<HistorialPedido[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [estado, setEstado] = useState('')
  const [clienteId, setClienteId] = useState('')

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [exporting, setExporting] = useState(false)

  const vendedorId = rol === 'vendedor' ? (user?.sub ?? '') : ''

  useEffect(() => {
    async function loadClientes() {
      try {
        setClientes(await aleBetApi.clientes.list())
      } catch {
        // Non-critical
      }
    }
    void loadClientes()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const params: Parameters<typeof aleBetApi.historial.list>[0] = {}
      if (desde) params.desde = desde
      if (hasta) params.hasta = hasta
      if (estado) params.estado = estado
      if (clienteId) params.clienteId = clienteId
      if (vendedorId) params.vendedorId = vendedorId
      setPedidos(await aleBetApi.historial.list(params))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar historial')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [desde, hasta, estado, clienteId, vendedorId])

  async function handleExport() {
    setExporting(true)
    try {
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
          <h1 className="text-[28px] font-bold tracking-[-0.03em] text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>Historial</h1>
          <p className="text-[13px] text-[var(--color-text-2)]">Historial de pedidos</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-full border border-[var(--color-accent)] px-4 py-2 text-[12px] font-semibold text-[#7ff6a1] transition hover:bg-[rgba(26,107,53,0.16)] disabled:opacity-50"
        >
          {exporting ? 'Exportando...' : 'Exportar Excel'}
        </button>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">Cliente</label>
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
          >
            <option value="">Todos los clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">Estado</label>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
          >
            {ESTADOS.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="app-panel overflow-hidden rounded-[12px]">
        {loading ? (
          <p className="px-5 py-8 text-center text-[13px] text-[var(--color-text-2)]">Cargando historial...</p>
        ) : error ? (
          <p className="px-5 py-8 text-center text-[13px] text-[var(--color-danger)]">{error}</p>
        ) : pedidos.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-[var(--color-text-2)]">No se encontraron pedidos.</p>
        ) : (
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">
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
                <tr key={p.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-5 py-4 font-semibold text-[var(--color-text)]">{p.numero}</td>
                  <td className="px-5 py-4 text-[var(--color-text)]">{p.clienteNombre}</td>
                  <td className="px-5 py-4 text-[var(--color-text-3)]">{p.vendedorNombre}</td>
                  <td className="px-5 py-4 text-[var(--color-text-3)]">{p.armadorNombre ?? '—'}</td>
                  <td className="px-5 py-4 text-right text-[var(--color-text-3)]">{p.items.length}</td>
                  <td className="px-5 py-4 text-[var(--color-text-3)]">
                    {new Date(p.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span
                      style={{ ...getEstadoBadgeStyle(p.estado), fontSize: '10px', fontWeight: 600, padding: '3px 0', borderRadius: '999px', width: '88px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    >
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
