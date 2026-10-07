import { useAuthStore } from '@/stores/auth-store'
import { ApiError } from '../lib/api'
import { useUsuarios, type DepositoUser } from '../queries/use-usuarios'
import { PageHeader } from '../components/layout/PageHeader'

const ROLE_LABELS: Record<string, string> = {
  encargado: 'Encargado',
  observador: 'Observador',
  solicitante: 'Solicitante',
}

function RoleChip({ role }: { role: string }) {
  const roleClasses: Record<string, string> = {
    encargado: 'text-success bg-success/10',
    observador: 'text-on-surface-variant bg-surface-variant',
    solicitante: 'text-warning bg-warning/10',
  }
  return (
    <span
      className={`inline-block font-body text-xs font-medium px-2 py-0.5 rounded shrink-0 ${roleClasses[role] ?? roleClasses.observador}`}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

export default function UsuariosPage() {
  const currentUser = useAuthStore((s) => s.user)
  const { data: usuarios = [], isLoading, error } = useUsuarios()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="font-body text-on-surface-variant text-sm">Cargando...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="font-body text-error text-sm">{error instanceof ApiError ? error.message : 'No se pudo cargar la lista de usuarios'}</p>
      </div>
    )
  }

  const encargadosCount = usuarios.filter((u) => u.role === 'encargado').length
  const solicitantesCount = usuarios.filter((u) => u.role === 'solicitante').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="USUARIOS"
        stats={[
          { label: 'usuarios', value: usuarios.length },
          { label: 'encargados', value: encargadosCount },
          { label: 'solicitantes', value: solicitantesCount },
        ]}
      />

      <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-6">
        <p className="font-body text-sm text-primary">
          Los usuarios y accesos se administran desde Platform Admin.
          Esta es una vista de solo lectura por compatibilidad.
        </p>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-surface-container-low rounded overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-outline-variant/15">
              <th className="px-4 py-3 text-left font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Nombre</th>
              <th className="px-4 py-3 text-left font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Email</th>
              <th className="px-4 py-3 text-left font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Rol</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-outline-variant/10 hover:bg-surface-bright/30 transition-colors">
                <td className="px-4 py-3">
                  <span className="font-body text-on-surface text-sm">{u.name}</span>
                  {u.id === currentUser?.id && (
                    <span className="ml-2 font-body text-on-surface-variant text-xs">(vos)</span>
                  )}
                </td>
                <td className="px-4 py-3 font-body text-on-surface-variant text-sm">{u.email}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <RoleChip role={u.role} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile list */}
      <div className="md:hidden flex flex-col gap-3">
        {usuarios.map((u) => (
          <div key={u.id} className="bg-surface-container-low border border-outline-variant/10 rounded-lg p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-body text-on-surface font-medium text-sm">
                  {u.name}
                  {u.id === currentUser?.id && (
                    <span className="ml-2 text-on-surface-variant text-xs font-normal">(vos)</span>
                  )}
                </p>
                <p className="font-body text-on-surface-variant text-sm">{u.email}</p>
              </div>
            </div>
            <div className="pt-2 border-t border-outline-variant/10">
              <RoleChip role={u.role} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
