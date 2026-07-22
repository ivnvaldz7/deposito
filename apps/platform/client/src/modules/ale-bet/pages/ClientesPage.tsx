import { useState } from 'react'
import { type Cliente } from '../lib/api'
import { Badge } from '@/components/ui/Badge'
import { useClientes, useCreateCliente, useUpdateCliente } from '../queries'

export default function ClientesPage() {
  const { data: clientes = [], isLoading, error } = useClientes()
  const createMutation = useCreateCliente()
  const updateMutation = useUpdateCliente()
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [form, setForm] = useState({ nombre: '', contacto: '', direccion: '' })

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
        await updateMutation.mutateAsync({ id: editing.id, ...form })
      } else {
        await createMutation.mutateAsync(form)
      }
      setShowModal(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  if (isLoading) return <p className="font-body text-sm text-on-surface-variant">Cargando clientes...</p>
  if (error) return <p className="font-body text-sm text-error">{error instanceof Error ? error.message : 'Error al cargar clientes'}</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[28px] font-bold tracking-[-0.03em] text-on-surface">Clientes</h1>
          <p className="font-body text-[13px] text-on-surface-variant">Gestión de clientes</p>
        </div>
        <button onClick={openCreate} className="rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20">
          + Nuevo cliente
        </button>
      </div>

      <div className="bg-surface-container-high rounded-xl overflow-hidden">
        {clientes.length === 0 ? (
          <p className="px-5 py-8 text-center font-body text-[13px] text-on-surface-variant">No hay clientes.</p>
        ) : (
          <table className="w-full text-left font-body text-[12px]">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.8px] text-outline">
                <th className="px-5 py-3 font-medium">Nombre</th>
                <th className="px-5 py-3 font-medium">Contacto</th>
                <th className="px-5 py-3 font-medium">Dirección</th>
                <th className="px-5 py-3 font-medium text-center">Estado</th>
                <th className="px-5 py-3 font-medium text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-b border-white/10 last:border-0">
                  <td className="px-5 py-4 font-semibold text-on-surface">{c.nombre}</td>
                  <td className="px-5 py-4 text-outline">{c.contacto ?? '—'}</td>
                  <td className="px-5 py-4 text-outline">{c.direccion ?? '—'}</td>
                  <td className="px-5 py-4 text-center">
                    <Badge variant={c.activo ? 'success' : 'error'}>{c.activo ? 'Activo' : 'Inactivo'}</Badge>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <button onClick={() => openEdit(c)} className="font-body text-[11px] text-outline transition hover:text-on-surface">
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
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-surface-container-low p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 font-heading text-[18px] font-bold text-on-surface">
              {editing ? 'Editar cliente' : 'Nuevo cliente'}
            </h2>
            <div className="space-y-4">
              <input
                placeholder="Nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="input-field"
              />
              <input
                placeholder="Contacto (opcional)"
                value={form.contacto}
                onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                className="input-field"
              />
              <input
                placeholder="Dirección (opcional)"
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                className="input-field"
              />
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="rounded-full border border-white/10 px-4 py-2 font-body text-[12px] text-outline transition hover:text-on-surface">
                  Cancelar
                </button>
                <button onClick={handleSave} className="rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20">
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
