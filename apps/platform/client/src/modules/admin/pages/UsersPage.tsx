import { useEffect, useState } from 'react'
import { adminApi, type AppId, type PlatformUser } from '../lib/api'
import { AppAccessPanel } from '../components/AppAccessPanel'
import { UserModal } from '../components/UserModal'
import { UserTable } from '../components/UserTable'

export default function UsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null)

  async function loadUsers() {
    setLoading(true)
    setError(null)

    try {
      const response = await adminApi.list()
      setUsers(response)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudieron cargar los usuarios',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  async function handleCreate(payload: {
    nombre: string
    email: string
    password: string
    appAccess: Array<{ app: AppId; rol: string }>
  }) {
    await adminApi.create(payload)
    await loadUsers()
  }

  async function handleSaveAccess(
    userId: string,
    payload: { app: AppId; rol: string; activo: boolean },
  ) {
    await adminApi.updateAccess(userId, payload)
    await loadUsers()
  }

  async function handleToggleStatus(userId: string, activo: boolean) {
    await adminApi.updateStatus(userId, { activo })
    await loadUsers()
  }

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 rounded-xl border border-white/10 bg-surface-container-low p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-body text-xs uppercase tracking-[0.2em] text-primary">
              Platform
            </p>
            <h1 className="mt-2 text-3xl font-bold font-heading text-on-surface">
              Plataforma Admin
            </h1>
            <p className="mt-2 font-body text-sm text-on-surface-variant">
              Gestioná usuarios, accesos y permisos de las apps de la plataforma.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary font-heading transition hover:bg-primary-dim scale-hover"
            >
              Nuevo usuario
            </button>
          </div>
        </header>

        {error ? (
          <div className="mb-6 rounded-xl border border-error/30 bg-error/10 px-4 py-3 font-body text-sm text-error">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-white/10 bg-surface-container px-5 py-8 font-body text-sm text-on-surface-variant">
            Cargando usuarios...
          </div>
        ) : (
          <UserTable users={users} onEdit={setSelectedUser} />
        )}
      </div>

      <UserModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={handleCreate}
      />

      <AppAccessPanel
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onSaveAccess={handleSaveAccess}
        onToggleStatus={handleToggleStatus}
      />
    </div>
  )
}
