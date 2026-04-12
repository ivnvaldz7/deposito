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
    <div className="space-y-6">
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
            className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[#07120b]"
          >
            Nuevo cliente
          </button>
        }
      >
        {error ? <p className="mb-4 text-sm text-rose-300">{error}</p> : null}
        <div className="space-y-3">
          {clientes.map((cliente) => (
            <div
              key={cliente.id}
              className="flex flex-col gap-3 rounded-2xl border border-white/6 bg-[var(--surface-lowest)] p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium">{cliente.nombre}</p>
                <p className="text-sm text-[var(--on-surface-variant)]">
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
                    className="rounded-xl border border-white/8 px-3 py-2 text-sm"
                  >
                    Editar
                  </button>
                ) : null}
              </div>
            </div>
          ))}
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
            className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[#07120b]"
          >
            Guardar
          </button>
        </form>
      </Modal>
    </div>
  )
}
