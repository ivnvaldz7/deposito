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
    <main className="min-h-screen bg-transparent px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/75 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-sky-400">
              Platform
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-50">
              Plataforma Admin
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Gestioná usuarios, accesos y permisos de las apps de la plataforma.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
            >
              Nuevo usuario
            </button>
          </div>
        </header>

        {error ? (
          <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-8 text-sm text-slate-400">
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
    </main>
  )
}
