import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { useUsuarios, useCreateUsuario, useUpdateUsuarioRole, useDeleteUsuario } from '../queries/use-usuarios'
import type { DepositoUser } from '../queries/use-usuarios'
import { PageHeader } from '../components/layout/PageHeader'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '../components/ui/Dialog'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  encargado: 'Encargado',
  observador: 'Observador',
  solicitante: 'Solicitante',
}

// ─── Role chip ────────────────────────────────────────────────────────────────

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

// ─── Role selector inline ─────────────────────────────────────────────────────

function RoleSelector({
  userId,
  currentRole,
  currentUserId,
  onUpdated,
}: {
  userId: string
  currentRole: string
  currentUserId: string
  onUpdated: (u: DepositoUser) => void
}) {
  const updateRole = useUpdateUsuarioRole()

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const role = e.target.value
    if (role === currentRole) return
    try {
      const updated = await updateRole.mutateAsync({ id: userId, role })
      onUpdated(updated)
      toast.info(`Rol actualizado para "${updated.name}".`)
    } catch {
      toast.error('No se pudo actualizar el rol.')
    }
  }

  const isSelf = userId === currentUserId

  return (
    <select
      value={currentRole}
      onChange={handleChange}
      disabled={updateRole.isPending || isSelf}
      className="bg-surface-container-high text-on-surface font-body text-sm rounded px-2 py-1 border-0 outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
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

function CrearUsuarioModal({
  onCreated,
  open,
  onOpenChange,
}: {
  onCreated: (u: DepositoUser) => void
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const createUsuario = useCreateUsuario()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearFormData>({
    resolver: zodResolver(crearSchema),
    defaultValues: { role: 'observador' },
  })

  async function onSubmit(data: CrearFormData) {
    setServerError(null)
    try {
      const result = await createUsuario.mutateAsync(data)
      onCreated(result.user)
      toast.success(`Usuario "${result.user.name}" creado.`)
      reset()
      onOpenChange(false)
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al crear usuario')
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) { reset(); setServerError(null) }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            <button type="submit" disabled={createUsuario.isPending} className="btn-primary flex-1 py-2.5 text-sm">
              {createUsuario.isPending ? 'Creando...' : 'Crear usuario'}
            </button>
            <DialogClose asChild>
              <button type="button" className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-container-high hover:bg-surface-bright transition-colors">
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
  usuario: DepositoUser
  onDeleted: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deleteUsuario = useDeleteUsuario()

  async function handleDelete() {
    setError(null)
    try {
      await deleteUsuario.mutateAsync(usuario.id)
      onDeleted(usuario.id)
      toast.success(`Usuario "${usuario.name}" eliminado.`)
      setOpen(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al eliminar')
      toast.error(err instanceof ApiError ? err.message : 'Error al eliminar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div
        onClick={() => setOpen(true)}
        className="text-on-surface-variant hover:text-error transition-colors cursor-pointer"
        title="Eliminar usuario"
        aria-label={`Eliminar ${usuario.name}`}
      >
        <Trash2 size={14} strokeWidth={1.5} />
      </div>

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
            disabled={deleteUsuario.isPending}
            className="flex-1 py-2.5 text-sm font-heading font-semibold rounded bg-error text-white hover:bg-error/90 transition-colors disabled:opacity-50"
          >
            {deleteUsuario.isPending ? 'Eliminando...' : 'Eliminar'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-container-high hover:bg-surface-bright transition-colors"
          >
            Cancelar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function UsuariosPage() {
  const currentUser = useAuthStore((s) => s.user)

  const { data: usuarios = [], isLoading, error } = useUsuarios()
  const [crearOpen, setCrearOpen] = useState(false)

  function handleCreated(_u: DepositoUser) {
    // Query invalidated by mutation's onSuccess — refetch handles update
  }

  function handleUpdated(_u: DepositoUser) {
    // Query invalidated by mutation's onSuccess — refetch handles update
  }

  function handleDeleted(_id: string) {
    // Query invalidated by mutation's onSuccess — refetch handles update
  }

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
        primaryAction={{
          label: 'Crear usuario',
          onClick: () => setCrearOpen(true),
          icon: <Plus size={14} strokeWidth={2} />,
        }}
      />

      <CrearUsuarioModal
        onCreated={handleCreated}
        open={crearOpen}
        onOpenChange={setCrearOpen}
      />

      {/* Desktop table */}
      <div className="hidden md:block bg-surface-container-low rounded overflow-hidden">
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
          <div key={u.id} className="bg-surface-container-low rounded px-4 py-3 space-y-2">
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
