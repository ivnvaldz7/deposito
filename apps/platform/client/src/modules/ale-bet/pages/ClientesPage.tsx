import { useEffect, useState } from 'react'
import { aleBetApi, type Cliente } from '../lib/api'

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [form, setForm] = useState({ nombre: '', contacto: '', direccion: '' })

  async function loadClientes() {
    setLoading(true)
    setError(null)
    try {
      const data = await aleBetApi.clientes.list()
      setClientes(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar clientes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadClientes() }, [])

  function openCreate() {
    setEditing(null)
    setForm({ nombre: '', contacto: '', direccion: '' })
    setShowModal(true)
  }

  function openEdit(c: Cliente) {
    setEditing(c)
    setForm({ nombre: c.nombre, contacto: c.contacto ?? '', direccion: c.direccion ?? '' })
    setShowModal(true)
  }

  async function handleSave() {
    try {
      if (editing) {
        await aleBetApi.clientes.update(editing.id, form)
      } else {
        await aleBetApi.clientes.create(form)
      }
      setShowModal(false)
      void loadClientes()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  if (loading) return <p className="text-sm text-[var(--color-text-2)]">Cargando clientes...</p>
  if (error) return <p className="text-sm text-[var(--color-danger)]">{error}</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.03em] text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>Clientes</h1>
          <p className="text-[13px] text-[var(--color-text-2)]">Gestión de clientes</p>
        </div>
        <button onClick={openCreate} className="rounded-full border border-[var(--color-accent)] px-4 py-2 text-[12px] font-semibold text-[#7ff6a1] transition hover:bg-[rgba(26,107,53,0.16)]">
          + Nuevo cliente
        </button>
      </div>

      <div className="app-panel overflow-hidden rounded-[12px]">
        {clientes.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-[var(--color-text-2)]">No hay clientes.</p>
        ) : (
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">
                <th className="px-5 py-3 font-medium">Nombre</th>
                <th className="px-5 py-3 font-medium">Contacto</th>
                <th className="px-5 py-3 font-medium">Dirección</th>
                <th className="px-5 py-3 font-medium text-center">Estado</th>
                <th className="px-5 py-3 font-medium text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-5 py-4 font-semibold text-[var(--color-text)]">{c.nombre}</td>
                  <td className="px-5 py-4 text-[var(--color-text-3)]">{c.contacto ?? '—'}</td>
                  <td className="px-5 py-4 text-[var(--color-text-3)]">{c.direccion ?? '—'}</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${c.activo ? 'bg-[rgba(26,107,53,0.16)] text-[#7ff6a1]' : 'bg-[rgba(239,68,68,0.08)] text-[#d6a8a8]'}`}>
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <button onClick={() => openEdit(c)} className="text-[11px] text-[var(--color-text-3)] transition hover:text-[var(--color-text)]">
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-[18px] font-bold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              {editing ? 'Editar cliente' : 'Nuevo cliente'}
            </h2>
            <div className="space-y-4">
              <input
                placeholder="Nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
              />
              <input
                placeholder="Contacto (opcional)"
                value={form.contacto}
                onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                className="w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
              />
              <input
                placeholder="Dirección (opcional)"
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                className="w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
              />
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-[12px] text-[var(--color-text-3)] transition hover:text-[var(--color-text)]">
                  Cancelar
                </button>
                <button onClick={handleSave} className="rounded-full border border-[var(--color-accent)] px-4 py-2 text-[12px] font-semibold text-[#7ff6a1] transition hover:bg-[rgba(26,107,53,0.16)]">
                  {editing ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
