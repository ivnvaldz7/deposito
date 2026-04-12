import type { PlatformUser } from '@/lib/api'

interface UserTableProps {
  users: PlatformUser[]
  onEdit: (user: PlatformUser) => void
}

function statusClasses(active: boolean): string {
  return active
    ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
    : 'bg-slate-700/50 text-slate-300 ring-1 ring-slate-600'
}

function appLabel(app: string): string {
  return app === 'deposito' ? 'Depósito' : 'Ale-Bet'
}

export function UserTable({ users, onEdit }: UserTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-2xl shadow-slate-950/40">
      <table className="min-w-full divide-y divide-slate-800">
        <thead className="bg-slate-900/90">
          <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
            <th className="px-5 py-4 font-medium">Nombre</th>
            <th className="px-5 py-4 font-medium">Email</th>
            <th className="px-5 py-4 font-medium">Estado</th>
            <th className="px-5 py-4 font-medium">Apps</th>
            <th className="px-5 py-4 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 text-sm text-slate-100">
          {users.map((user) => (
            <tr key={user.id} className="bg-slate-950/20">
              <td className="px-5 py-4 font-medium">{user.nombre}</td>
              <td className="px-5 py-4 text-slate-300">{user.email}</td>
              <td className="px-5 py-4">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusClasses(user.activo)}`}>
                  {user.activo ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td className="px-5 py-4">
                <div className="flex flex-wrap gap-2">
                  {user.appAccess.length === 0 ? (
                    <span className="text-slate-500">Sin accesos</span>
                  ) : (
                    user.appAccess.map((access) => (
                      <span
                        key={access.id}
                        className="inline-flex rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200 ring-1 ring-slate-700"
                      >
                        {appLabel(access.app)} · {access.rol}
                      </span>
                    ))
                  )}
                </div>
              </td>
              <td className="px-5 py-4">
                <button
                  type="button"
                  onClick={() => onEdit(user)}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 transition hover:border-sky-500 hover:text-sky-300"
                >
                  Editar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
