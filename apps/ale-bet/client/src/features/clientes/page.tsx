import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '@/components/modal'
import { Section, StatusChip } from '@/components/ui'
import { apiRequest, type Cliente } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

interface ClienteFormState {
  nombre: string
  contacto: string
  direccion: string
}

const emptyCliente: ClienteFormState = {
  nombre: '',
  contacto: '',
  direccion: '',
}

export function ClientesPage() {
  const user = useAuthStore((state) => state.user)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [form, setForm] = useState<ClienteFormState>(emptyCliente)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadClientes(): Promise<void> {
    try {
      const response = await apiRequest<Cliente[]>('/api/clientes')
      setClientes(response)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los clientes')
    }
  }

  useEffect(() => {
    void loadClientes()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const payload = {
      nombre: form.nombre,
      contacto: form.contacto || undefined,
      direccion: form.direccion || undefined,
    }

    if (editing) {
      await apiRequest<Cliente>(`/api/clientes/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
    } else {
      await apiRequest<Cliente>('/api/clientes', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    }

    setOpen(false)
    setEditing(null)
    setForm(emptyCliente)
    await loadClientes()
  }

  return (
    <div className="space-y-6 bg-[#0d0d0d] text-white">
      <Section
        title="Clientes"
        description="Base comercial y de distribución."
        action={
          <button
            type="button"
            onClick={() => {
              setEditing(null)
              setForm(emptyCliente)
              setOpen(true)
            }}
            className="rounded-[8px] bg-[#22c55e] px-4 py-[9px] text-[13px] font-semibold text-[#0d0d0d]"
            style={{ fontFamily: 'Montserrat, sans-serif' }}
          >
            Nuevo cliente
          </button>
        }
      >
        {error ? <p className="mb-4 text-sm text-rose-300">{error}</p> : null}
        <div className="bg-[#0d0d0d]">
          {clientes.map((cliente) => (
            <div
              key={cliente.id}
              className="flex flex-col gap-3 border-b border-[#161616] px-4 py-[14px] transition-colors hover:bg-[#111111] md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium text-white" style={{ fontFamily: 'Montserrat, sans-serif' }}>{cliente.nombre}</p>
                <p className="text-sm text-[#6b7280]">
                  {cliente.contacto ?? 'Sin contacto'} · {cliente.direccion ?? 'Sin dirección'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusChip
                  label={cliente.activo ? 'Activo' : 'Inactivo'}
                  tone={cliente.activo ? 'green' : 'slate'}
                />
                {user?.rol === 'admin' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(cliente)
                      setForm({
                        nombre: cliente.nombre,
                        contacto: cliente.contacto ?? '',
                        direccion: cliente.direccion ?? '',
                      })
                      setOpen(true)
                    }}
                    className="rounded-[8px] border border-[#1e1e1e] px-3 py-2 text-sm text-white transition hover:border-[#2a2a2a] hover:bg-[#111111]"
                  >
                    Editar
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {clientes.length === 0 ? <p className="px-4 py-8 text-center text-[13px] text-[#6b7280]">No hay clientes para mostrar.</p> : null}
        </div>
      </Section>

      <Modal
        title={editing ? 'Editar cliente' : 'Nuevo cliente'}
        open={open}
        onClose={() => setOpen(false)}
      >
        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <input
            value={form.nombre}
            onChange={(event) => setForm({ ...form, nombre: event.target.value })}
            placeholder="Nombre"
            className="w-full rounded-xl border border-white/8 bg-[var(--surface-lowest)] px-4 py-3"
            required
          />
          <input
            value={form.contacto}
            onChange={(event) => setForm({ ...form, contacto: event.target.value })}
            placeholder="Contacto"
            className="w-full rounded-xl border border-white/8 bg-[var(--surface-lowest)] px-4 py-3"
          />
          <input
            value={form.direccion}
            onChange={(event) => setForm({ ...form, direccion: event.target.value })}
            placeholder="Dirección"
            className="w-full rounded-xl border border-white/8 bg-[var(--surface-lowest)] px-4 py-3"
          />
          <button
            type="submit"
            className="rounded-[8px] bg-[#22c55e] px-4 py-[9px] text-[13px] font-semibold text-[#0d0d0d]"
            style={{ fontFamily: 'Montserrat, sans-serif' }}
          >
            Guardar
          </button>
        </form>
      </Modal>
    </div>
  )
}
