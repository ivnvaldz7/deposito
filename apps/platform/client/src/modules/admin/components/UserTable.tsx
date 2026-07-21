import type { PlatformUser } from '../lib/api'

interface UserTableProps {
  users: PlatformUser[]
  onEdit: (user: PlatformUser) => void
}

function statusClasses(active: boolean): string {
  return active
    ? 'bg-success/15 text-success ring-1 ring-success/30'
    : 'bg-surface-container-high text-on-surface-variant ring-1 ring-white/5'
}

function appLabel(app: string): string {
  return app === 'deposito' ? 'Depósito' : 'Ale-Bet'
}

export function UserTable({ users, onEdit }: UserTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-container-low shadow-float">
      <table className="min-w-full divide-y divide-white/5">
        <thead className="bg-surface-container">
          <tr className="text-left font-body text-xs uppercase tracking-[0.18em] text-on-surface-variant">
            <th className="px-5 py-4 font-medium">Nombre</th>
            <th className="px-5 py-4 font-medium">Email</th>
            <th className="px-5 py-4 font-medium">Estado</th>
            <th className="px-5 py-4 font-medium">Apps</th>
            <th className="px-5 py-4 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 font-body text-sm text-on-surface">
          {users.map((user) => (
            <tr key={user.id} className="bg-surface-dim/20">
              <td className="px-5 py-4 font-medium">{user.nombre}</td>
              <td className="px-5 py-4 text-on-surface-variant">{user.email}</td>
              <td className="px-5 py-4">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusClasses(user.activo)}`}
                >
                  {user.activo ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td className="px-5 py-4">
                <div className="flex flex-wrap gap-2">
                  {user.appAccess.length === 0 ? (
                    <span className="text-on-surface-variant/60">Sin accesos</span>
                  ) : (
                    user.appAccess.map((access) => (
                      <span
                        key={access.id}
                        className="inline-flex rounded-full bg-surface-container-high px-3 py-1 font-body text-xs text-on-surface ring-1 ring-white/5"
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
                  className="rounded-lg border border-white/10 px-3 py-2 font-body text-sm text-on-surface transition hover:border-primary hover:text-primary"
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
