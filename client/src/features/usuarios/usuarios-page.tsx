import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient, ApiError } from '@/lib/api-client'
import { toast } from '@/lib/toast'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'encargado' | 'observador' | 'solicitante'

interface Usuario {
  id: string
  email: string
  name: string
  role: Role
  createdAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<Role, string> = {
  encargado: 'Encargado',
  observador: 'Observador',
  solicitante: 'Solicitante',
}

// ─── Role chip ────────────────────────────────────────────────────────────────

function RoleChip({ role }: { role: Role }) {
  const styles: Record<Role, React.CSSProperties> = {
    encargado: { color: '#00AE42', backgroundColor: 'rgba(0,174,66,0.10)' },
    observador: { color: '#bccbb8', backgroundColor: 'rgba(188,203,184,0.10)' },
    solicitante: { color: '#FF9800', backgroundColor: 'rgba(255,152,0,0.10)' },
  }
  return (
    <span
      className="inline-block font-body text-xs font-medium px-2 py-0.5 rounded shrink-0"
      style={styles[role]}
    >
      {ROLE_LABELS[role]}
    </span>
  )
}

// ─── Role selector inline ─────────────────────────────────────────────────────

function RoleSelector({
  userId,
  currentRole,
  currentUserId,
  onUpdated,
}: {
  userId: string
  currentRole: Role
  currentUserId: string
  onUpdated: (u: Usuario) => void
}) {
  const token = useAuthStore((s) => s.token)
  const [saving, setSaving] = useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const role = e.target.value as Role
    if (role === currentRole) return
    setSaving(true)
    try {
      const updated = await apiClient.put<Usuario>(`/users/${userId}`, { role }, token)
      onUpdated(updated)
      toast.info(`Rol actualizado para "${updated.name}".`)
    } catch {
      toast.error('No se pudo actualizar el rol.')
    } finally {
      setSaving(false)
    }
  }

  // encargado no puede cambiar su propio rol
  const isSelf = userId === currentUserId

  return (
    <select
      value={currentRole}
      onChange={handleChange}
      disabled={saving || isSelf}
      className="bg-surface-high text-on-surface font-body text-sm rounded px-2 py-1 border-0 outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label="Cambiar rol"
    >
      <option value="encargado">Encargado</option>
      <option value="observador">Observador</option>
      <option value="solicitante">Solicitante</option>
    </select>
  )
}

// ─── Crear usuario modal ──────────────────────────────────────────────────────

const crearSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  role: z.enum(['encargado', 'observador', 'solicitante']),
})

type CrearFormData = z.infer<typeof crearSchema>

function CrearUsuarioModal({ onCreated }: { onCreated: (u: Usuario) => void }) {
  const token = useAuthStore((s) => s.token)
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CrearFormData>({
    resolver: zodResolver(crearSchema),
    defaultValues: { role: 'observador' },
  })

  async function onSubmit(data: CrearFormData) {
    setServerError(null)
    try {
      const result = await apiClient.post<{ token: string; user: Usuario }>(
        '/auth/register',
        data,
        token
      )
      onCreated(result.user)
      toast.success(`Usuario "${result.user.name}" creado.`)
      reset()
      setOpen(false)
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al crear usuario')
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) { reset(); setServerError(null) }
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className="btn-primary flex items-center gap-2 w-auto px-4 py-2 text-sm">
          <Plus size={14} strokeWidth={2} />
          Crear usuario
        </button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear usuario</DialogTitle>
          <DialogDescription>
            El usuario podrá iniciar sesión con el email y contraseña que establezcas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="crear-usuario-nombre" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Nombre
            </label>
            <input
              id="crear-usuario-nombre"
              {...register('name')}
              type="text"
              placeholder="Ej: María López"
              className="input-field"
              autoFocus
            />
            {errors.name && <p className="font-body text-error text-xs">{errors.name.message}</p>}
          </div>

          <div className="space-y-1">
            <label htmlFor="crear-usuario-email" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Email
            </label>
            <input
              id="crear-usuario-email"
              {...register('email')}
              type="email"
              placeholder="usuario@laboratorio.com"
              className="input-field"
            />
            {errors.email && <p className="font-body text-error text-xs">{errors.email.message}</p>}
          </div>

          <div className="space-y-1">
            <label htmlFor="crear-usuario-password" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Contraseña
            </label>
            <input
              id="crear-usuario-password"
              {...register('password')}
              type="password"
              placeholder="Mínimo 8 caracteres"
              className="input-field"
            />
            {errors.password && <p className="font-body text-error text-xs">{errors.password.message}</p>}
          </div>

          <div className="space-y-1">
            <label htmlFor="crear-usuario-rol" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Rol
            </label>
            <select
              id="crear-usuario-rol"
              {...register('role')}
              className="input-field"
            >
              <option value="observador">Observador — solo lectura</option>
              <option value="solicitante">Solicitante — lectura + órdenes</option>
              <option value="encargado">Encargado — acceso total</option>
            </select>
            {errors.role && <p className="font-body text-error text-xs">{errors.role.message}</p>}
          </div>

          {serverError && (
            <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">
              {serverError}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 py-2.5 text-sm">
              {isSubmitting ? 'Creando...' : 'Crear usuario'}
            </button>
            <DialogClose asChild>
              <button type="button" className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-high hover:bg-surface-bright transition-colors">
                Cancelar
              </button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete confirmation ───────────────────────────────────────────────────────

function DeleteButton({
  usuario,
  onDeleted,
}: {
  usuario: Usuario
  onDeleted: (id: string) => void
}) {
  const token = useAuthStore((s) => s.token)
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await apiClient.del<void>(`/users/${usuario.id}`, token)
      onDeleted(usuario.id)
      toast.success(`Usuario "${usuario.name}" eliminado.`)
      setOpen(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al eliminar')
      toast.error(err instanceof ApiError ? err.message : 'Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-on-surface-variant hover:text-error transition-colors"
          title="Eliminar usuario"
          aria-label={`Eliminar ${usuario.name}`}
        >
          <Trash2 size={14} strokeWidth={1.5} />
        </button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar usuario</DialogTitle>
          <DialogDescription>
            ¿Seguro que querés eliminar a <strong className="text-on-surface">{usuario.name}</strong>?
            Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">{error}</div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 py-2.5 text-sm font-heading font-semibold rounded bg-error text-white hover:bg-error/90 transition-colors disabled:opacity-50"
          >
            {deleting ? 'Eliminando...' : 'Eliminar'}
          </button>
          <DialogClose asChild>
            <button type="button" className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-high hover:bg-surface-bright transition-colors">
              Cancelar
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function UsuariosPage() {
  const token = useAuthStore((s) => s.token)
  const currentUser = useAuthStore((s) => s.user)

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiClient
      .get<Usuario[]>('/users', token)
      .then((list) => setUsuarios(list))
      .catch(() => setError('No se pudo cargar la lista de usuarios'))
      .finally(() => setLoading(false))
  }, [token])

  function handleCreated(u: Usuario) {
    setUsuarios((prev) => [...prev, u])
  }

  function handleUpdated(u: Usuario) {
    setUsuarios((prev) => prev.map((x) => (x.id === u.id ? u : x)))
  }

  function handleDeleted(id: string) {
    setUsuarios((prev) => prev.filter((x) => x.id !== id))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="font-body text-on-surface-variant text-sm">Cargando...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="font-body text-error text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-on-surface font-semibold text-xl">Usuarios</h1>
          <p className="font-body text-on-surface-variant text-sm mt-0.5">
            {usuarios.length} {usuarios.length === 1 ? 'usuario' : 'usuarios'}
          </p>
        </div>
        <CrearUsuarioModal onCreated={handleCreated} />
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-surface-low rounded overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-outline-variant/15">
              <th className="px-4 py-3 text-left font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Nombre</th>
              <th className="px-4 py-3 text-left font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Email</th>
              <th className="px-4 py-3 text-left font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Rol</th>
              <th className="px-4 py-3 text-right font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Acciones</th>
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
                    <RoleSelector
                      userId={u.id}
                      currentRole={u.role}
                      currentUserId={currentUser?.id ?? ''}
                      onUpdated={handleUpdated}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  {u.id !== currentUser?.id && (
                    <DeleteButton usuario={u} onDeleted={handleDeleted} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {usuarios.map((u) => (
          <div key={u.id} className="bg-surface-low rounded px-4 py-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-body text-on-surface text-sm font-medium">
                  {u.name}
                  {u.id === currentUser?.id && (
                    <span className="ml-1 font-body text-on-surface-variant text-xs font-normal">(vos)</span>
                  )}
                </p>
                <p className="font-body text-on-surface-variant text-xs mt-0.5 truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <RoleChip role={u.role} />
                {u.id !== currentUser?.id && (
                  <DeleteButton usuario={u} onDeleted={handleDeleted} />
                )}
              </div>
            </div>
            <RoleSelector
              userId={u.id}
              currentRole={u.role}
              currentUserId={currentUser?.id ?? ''}
              onUpdated={handleUpdated}
            />
          </div>
        ))}
      </div>

      {usuarios.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <p className="font-body text-on-surface-variant text-sm">No hay usuarios registrados.</p>
        </div>
      )}
    </div>
  )
}
