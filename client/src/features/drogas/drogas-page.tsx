import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient, ApiError } from '@/lib/api-client'
import { InlineNumberEditor } from '@/features/inventory/shared/inline-number-editor'
import { EmptyState, ErrorState, LoadingState } from '@/features/inventory/shared/inventory-states'
import { StockChip } from '@/features/inventory/shared/stock-chip'
import { sortByArticulo } from '@/lib/sort-utils'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
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

interface Droga {
  id: string
  nombre: string
  cantidad: number
  updatedAt: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STOCK_BAJO_THRESHOLD = 10

function sortDrogas(list: Droga[]): Droga[] {
  return [...list].sort((a, b) => sortByArticulo(a.nombre, b.nombre))
}

// ─── Agregar droga modal ──────────────────────────────────────────────────────

const agregarSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(100),
  cantidad: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, 'Debe ser un número positivo'),
})

type AgregarFormData = z.infer<typeof agregarSchema>

function AgregarDrogaModal({ onCreated }: { onCreated: (d: Droga) => void }) {
  const token = useAuthStore((s) => s.token)
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AgregarFormData>({ resolver: zodResolver(agregarSchema) })

  async function onSubmit(data: AgregarFormData) {
    setServerError(null)
    try {
      const droga = await apiClient.post<Droga>(
        '/drogas',
        { nombre: data.nombre, cantidad: Number(data.cantidad) },
        token
      )
      onCreated(droga)
      reset()
      setOpen(false)
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al guardar')
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
          Agregar droga
        </button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar droga</DialogTitle>
          <DialogDescription>
            Ingresá el nombre del principio activo y la cantidad inicial en stock.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="agregar-droga-nombre" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Nombre
            </label>
            <input
              id="agregar-droga-nombre"
              {...register('nombre')}
              type="text"
              placeholder="Ej: Vitamina B12"
              className="input-field"
              autoFocus
            />
            {errors.nombre && (
              <p className="font-body text-error text-xs">{errors.nombre.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="agregar-droga-cantidad" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Cantidad inicial
            </label>
            <input
              id="agregar-droga-cantidad"
              {...register('cantidad')}
              type="number"
              min="0"
              placeholder="0"
              className="input-field"
            />
            {errors.cantidad && (
              <p className="font-body text-error text-xs">{errors.cantidad.message}</p>
            )}
          </div>

          {serverError && (
            <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">
              {serverError}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 py-2.5 text-sm">
              {isSubmitting ? 'Guardando...' : 'Guardar'}
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

// ─── Editar droga modal ───────────────────────────────────────────────────────

const editarSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(100),
  cantidad: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, 'Debe ser un número positivo'),
})

type EditarFormData = z.infer<typeof editarSchema>

function EditarDrogaModal({
  droga,
  onUpdated,
  onClose,
}: {
  droga: Droga
  onUpdated: (d: Droga) => void
  onClose: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditarFormData>({
    resolver: zodResolver(editarSchema),
    defaultValues: { nombre: droga.nombre, cantidad: String(droga.cantidad) },
  })

  async function onSubmit(data: EditarFormData) {
    setServerError(null)
    try {
      const updated = await apiClient.put<Droga>(
        `/drogas/${droga.id}`,
        { nombre: data.nombre, cantidad: Number(data.cantidad) },
        token
      )
      onUpdated(updated)
      onClose()
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al guardar')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar droga</DialogTitle>
          <DialogDescription>Modificá el nombre y/o la cantidad en stock.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="editar-droga-nombre" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Nombre
            </label>
            <input id="editar-droga-nombre" {...register('nombre')} type="text" className="input-field" autoFocus />
            {errors.nombre && <p className="font-body text-error text-xs">{errors.nombre.message}</p>}
          </div>

          <div className="space-y-1">
            <label htmlFor="editar-droga-cantidad" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Cantidad
            </label>
            <input id="editar-droga-cantidad" {...register('cantidad')} type="number" min="0" className="input-field" />
            {errors.cantidad && <p className="font-body text-error text-xs">{errors.cantidad.message}</p>}
          </div>

          {serverError && (
            <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">{serverError}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 py-2.5 text-sm">
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-high hover:bg-surface-bright transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Inline cantidad editor ────────────────────────────────────────────────────

function CantidadCell({ droga, onUpdated }: { droga: Droga; onUpdated: (d: Droga) => void }) {
  const token = useAuthStore((s) => s.token)
  return (
    <InlineNumberEditor
      value={droga.cantidad}
      label="cantidad"
      onSave={async (nextValue) => {
        const updated = await apiClient.put<Droga>(
          `/drogas/${droga.id}`,
          { cantidad: nextValue },
          token
        )
        onUpdated(updated)
      }}
    />
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function DrogasPage() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.role === 'encargado'

  const [drogas, setDrogas] = useState<Droga[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingDroga, setEditingDroga] = useState<Droga | null>(null)

  useEffect(() => {
    apiClient
      .get<Droga[]>('/drogas', token)
      .then((list) => setDrogas(sortDrogas(list)))
      .catch(() => setError('No se pudo cargar el inventario'))
      .finally(() => setLoading(false))
  }, [token])

  function handleCreated(droga: Droga) {
    setDrogas((prev) => sortDrogas([...prev, droga]))
  }

  function handleUpdated(updated: Droga) {
    setDrogas((prev) => sortDrogas(prev.map((d) => (d.id === updated.id ? updated : d))))
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await apiClient.del<void>(`/drogas/${id}`, token)
      setDrogas((prev) => prev.filter((d) => d.id !== id))
    } catch {
      // noop
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return <LoadingState />
  }

  if (error) {
    return <ErrorState message={error} />
  }

  const stockBajoCount = drogas.filter((d) => d.cantidad < STOCK_BAJO_THRESHOLD).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-on-surface font-semibold text-xl">Drogas</h1>
          <p className="font-body text-on-surface-variant text-sm mt-0.5">
            {drogas.length} productos
            {stockBajoCount > 0 && (
              <span className="ml-2" style={{ color: '#FF9800' }}>· {stockBajoCount} con stock bajo</span>
            )}
          </p>
        </div>
        {isEncargado && <AgregarDrogaModal onCreated={handleCreated} />}
      </div>

      {editingDroga && (
        <EditarDrogaModal
          droga={editingDroga}
          onUpdated={handleUpdated}
          onClose={() => setEditingDroga(null)}
        />
      )}

      {drogas.length === 0 ? (
        <EmptyState message="No hay drogas cargadas todavía." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-surface-low rounded overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="w-32">Cantidad</TableHead>
                  <TableHead className="w-28">Estado</TableHead>
                  {isEncargado && <TableHead className="w-24 text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {drogas.map((droga) => (
                  <TableRow key={droga.id}>
                    <TableCell className="font-body text-on-surface">{droga.nombre}</TableCell>
                    <TableCell>
                      {isEncargado ? (
                        <CantidadCell droga={droga} onUpdated={handleUpdated} />
                      ) : (
                        <span className="font-body text-on-surface tabular-nums">{droga.cantidad}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StockChip cantidad={droga.cantidad} threshold={STOCK_BAJO_THRESHOLD} />
                    </TableCell>
                    {isEncargado && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingDroga(droga)}
                            className="text-on-surface-variant hover:text-on-surface transition-colors"
                            title="Editar"
                            aria-label={`Editar ${droga.nombre}`}
                          >
                            <Pencil size={14} strokeWidth={1.5} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(droga.id)}
                            disabled={deletingId === droga.id}
                            className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-40"
                            title="Eliminar"
                            aria-label={`Eliminar ${droga.nombre}`}
                          >
                            <Trash2 size={14} strokeWidth={1.5} />
                          </button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {drogas.map((droga) => (
              <div key={droga.id} className="bg-surface-low rounded px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-body text-on-surface text-sm truncate">{droga.nombre}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-body text-on-surface-variant text-xs tabular-nums">{droga.cantidad} uds</span>
                    <StockChip cantidad={droga.cantidad} threshold={STOCK_BAJO_THRESHOLD} />
                  </div>
                </div>
                {isEncargado && (
                  <div className="flex items-center gap-3 shrink-0">
                    <CantidadCell droga={droga} onUpdated={handleUpdated} />
                    <button type="button" onClick={() => setEditingDroga(droga)} className="text-on-surface-variant hover:text-on-surface transition-colors" title="Editar" aria-label={`Editar ${droga.nombre}`}>
                      <Pencil size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(droga.id)}
                      disabled={deletingId === droga.id}
                      className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-40"
                      title="Eliminar"
                      aria-label={`Eliminar ${droga.nombre}`}
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
