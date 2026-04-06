import { useState, useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient, ApiError } from '@/lib/api-client'
import { sortByArticulo } from '@/lib/sort-utils'
import { InlineNumberEditor } from '@/features/inventory/shared/inline-number-editor'
import { MercadoChip } from '@/features/inventory/shared/mercado-chip'
import { MercadoFilter } from '@/features/inventory/shared/mercado-filter'
import { EmptyState, ErrorState, LoadingState } from '@/features/inventory/shared/inventory-states'
import { MERCADOS, type Mercado } from '@/features/inventory/shared/mercados'
import { StockChip } from '@/features/inventory/shared/stock-chip'
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

interface Etiqueta {
  id: string
  articulo: string
  mercado: Mercado
  cantidad: number
  updatedAt: string
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

function sortEtiquetas(list: Etiqueta[]): Etiqueta[] {
  return [...list].sort((a, b) =>
    a.mercado.localeCompare(b.mercado) || sortByArticulo(a.articulo, b.articulo)
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STOCK_BAJO_THRESHOLD = 50

// ─── Agregar etiqueta modal ───────────────────────────────────────────────────

const agregarSchema = z.object({
  articulo: z.string().min(2, 'Mínimo 2 caracteres').max(150),
  mercado: z.enum([
    'argentina', 'colombia', 'mexico', 'ecuador',
    'bolivia', 'paraguay', 'no_exportable',
  ] as const),
  cantidad: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, 'Debe ser un número positivo'),
})

type AgregarFormData = z.infer<typeof agregarSchema>

function AgregarEtiquetaModal({ onCreated }: { onCreated: (e: Etiqueta) => void }) {
  const token = useAuthStore((s) => s.token)
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AgregarFormData>({
    resolver: zodResolver(agregarSchema),
    defaultValues: { articulo: '', mercado: 'argentina', cantidad: '' },
  })

  const mercadoVal = useWatch({ control, name: 'mercado' })

  async function onSubmit(data: AgregarFormData) {
    setServerError(null)
    try {
      const etiqueta = await apiClient.post<Etiqueta>(
        '/etiquetas',
        { articulo: data.articulo, mercado: data.mercado, cantidad: Number(data.cantidad) },
        token
      )
      onCreated(etiqueta)
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
          Agregar etiqueta
        </button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar etiqueta</DialogTitle>
          <DialogDescription>
            Ingresá el artículo, mercado de destino y cantidad inicial.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="agregar-etiqueta-articulo" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Artículo
            </label>
            <input
              id="agregar-etiqueta-articulo"
              {...register('articulo')}
              type="text"
              placeholder="Ej: AMANTINA PREMIUM 250 ML"
              className="input-field"
              autoFocus
            />
            {errors.articulo && (
              <p className="font-body text-error text-xs">{errors.articulo.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Mercado
            </label>
            <div className="flex flex-wrap gap-2">
              {MERCADOS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValue('mercado', value)}
                  className="px-3 py-1.5 rounded font-body text-xs transition-colors"
                  style={
                    mercadoVal === value
                      ? { background: 'rgba(84,225,109,0.15)', color: '#54e16d' }
                      : { background: 'var(--color-surface-high)', color: '#bccbb8' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="agregar-etiqueta-cantidad" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Cantidad inicial
            </label>
            <input
              id="agregar-etiqueta-cantidad"
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
              <button
                type="button"
                className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-high hover:bg-surface-bright transition-colors"
              >
                Cancelar
              </button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Editar etiqueta modal ────────────────────────────────────────────────────

const editarSchema = z.object({
  articulo: z.string().min(2, 'Mínimo 2 caracteres').max(150),
  mercado: z.enum([
    'argentina', 'colombia', 'mexico', 'ecuador',
    'bolivia', 'paraguay', 'no_exportable',
  ] as const),
  cantidad: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, 'Debe ser número positivo'),
})

type EditarFormData = z.infer<typeof editarSchema>

function EditarEtiquetaModal({
  etiqueta,
  onUpdated,
  onClose,
}: {
  etiqueta: Etiqueta
  onUpdated: (e: Etiqueta) => void
  onClose: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EditarFormData>({
    resolver: zodResolver(editarSchema),
    defaultValues: { articulo: etiqueta.articulo, mercado: etiqueta.mercado, cantidad: String(etiqueta.cantidad) },
  })

  const mercadoVal = useWatch({ control, name: 'mercado' })

  async function onSubmit(data: EditarFormData) {
    setServerError(null)
    try {
      const updated = await apiClient.put<Etiqueta>(
        `/etiquetas/${etiqueta.id}`,
        { articulo: data.articulo, mercado: data.mercado, cantidad: Number(data.cantidad) },
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
          <DialogTitle>Editar etiqueta</DialogTitle>
          <DialogDescription>Modificá el artículo, mercado y/o cantidad.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="editar-etiqueta-articulo" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Artículo</label>
            <input id="editar-etiqueta-articulo" {...register('articulo')} type="text" className="input-field" autoFocus />
            {errors.articulo && <p className="font-body text-error text-xs">{errors.articulo.message}</p>}
          </div>

          <div className="space-y-2">
            <label className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Mercado</label>
            <div className="flex flex-wrap gap-2">
              {MERCADOS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValue('mercado', value)}
                  className="px-3 py-1.5 rounded font-body text-xs transition-colors"
                  style={
                    mercadoVal === value
                      ? { background: 'rgba(84,225,109,0.15)', color: '#54e16d' }
                      : { background: 'var(--color-surface-high)', color: '#bccbb8' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="editar-etiqueta-cantidad" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Cantidad</label>
            <input id="editar-etiqueta-cantidad" {...register('cantidad')} type="number" min="0" className="input-field" />
            {errors.cantidad && <p className="font-body text-error text-xs">{errors.cantidad.message}</p>}
          </div>

          {serverError && <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">{serverError}</div>}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 py-2.5 text-sm">
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-high hover:bg-surface-bright transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Inline cantidad editor ───────────────────────────────────────────────────

function CantidadCell({
  etiqueta,
  onUpdated,
}: {
  etiqueta: Etiqueta
  onUpdated: (e: Etiqueta) => void
}) {
  const token = useAuthStore((s) => s.token)
  return (
    <InlineNumberEditor
      value={etiqueta.cantidad}
      label="cantidad"
      onSave={async (nextValue) => {
        const updated = await apiClient.put<Etiqueta>(
          `/etiquetas/${etiqueta.id}`,
          { cantidad: nextValue },
          token
        )
        onUpdated(updated)
      }}
    />
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function EtiquetasPage() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.role === 'encargado'

  const [allEtiquetas, setAllEtiquetas] = useState<Etiqueta[]>([])
  const [mercadoFiltro, setMercadoFiltro] = useState<Mercado | 'todos'>('todos')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingEtiqueta, setEditingEtiqueta] = useState<Etiqueta | null>(null)

  useEffect(() => {
    apiClient
      .get<Etiqueta[]>('/etiquetas', token)
      .then((list) => setAllEtiquetas(sortEtiquetas(list)))
      .catch(() => setError('No se pudo cargar las etiquetas'))
      .finally(() => setLoading(false))
  }, [token])

  const etiquetas =
    mercadoFiltro === 'todos'
      ? allEtiquetas
      : allEtiquetas.filter((e) => e.mercado === mercadoFiltro)

  function handleCreated(e: Etiqueta) {
    setAllEtiquetas((prev) => sortEtiquetas([...prev, e]))
  }

  function handleUpdated(updated: Etiqueta) {
    setAllEtiquetas((prev) => sortEtiquetas(prev.map((e) => (e.id === updated.id ? updated : e))))
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await apiClient.del<void>(`/etiquetas/${id}`, token)
      setAllEtiquetas((prev) => prev.filter((e) => e.id !== id))
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

  const stockBajoCount = etiquetas.filter((e) => e.cantidad < STOCK_BAJO_THRESHOLD).length
  const countsByMercado = MERCADOS.reduce<Record<Mercado, number>>((acc, mercado) => {
    acc[mercado.value] = allEtiquetas.filter((e) => e.mercado === mercado.value).length
    return acc
  }, {} as Record<Mercado, number>)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-on-surface font-semibold text-xl">Etiquetas</h1>
          <p className="font-body text-on-surface-variant text-sm mt-0.5">
            {etiquetas.length} artículos
            {stockBajoCount > 0 && (
              <span className="ml-2" style={{ color: '#FF9800' }}>
                · {stockBajoCount} con stock bajo
              </span>
            )}
          </p>
        </div>
        {isEncargado && <AgregarEtiquetaModal onCreated={handleCreated} />}
      </div>

      {editingEtiqueta && (
        <EditarEtiquetaModal
          etiqueta={editingEtiqueta}
          onUpdated={handleUpdated}
          onClose={() => setEditingEtiqueta(null)}
        />
      )}

      {/* Filtro por mercado */}
      <MercadoFilter
        mercadoActivo={mercadoFiltro}
        onChangeMercado={setMercadoFiltro}
        totalCount={allEtiquetas.length}
        countsByMercado={countsByMercado}
      />

      {etiquetas.length === 0 ? (
        <EmptyState message="No hay etiquetas para este mercado." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-surface-low rounded overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artículo</TableHead>
                  <TableHead className="w-36">Mercado</TableHead>
                  <TableHead className="w-32">Cantidad</TableHead>
                  <TableHead className="w-28">Estado</TableHead>
                  {isEncargado && <TableHead className="w-24 text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {etiquetas.map((etiqueta) => (
                  <TableRow key={etiqueta.id}>
                    <TableCell className="font-body text-on-surface">{etiqueta.articulo}</TableCell>
                    <TableCell>
                      <MercadoChip mercado={etiqueta.mercado} />
                    </TableCell>
                    <TableCell>
                      {isEncargado ? (
                        <CantidadCell etiqueta={etiqueta} onUpdated={handleUpdated} />
                      ) : (
                        <span className="font-body text-on-surface tabular-nums">{etiqueta.cantidad}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StockChip cantidad={etiqueta.cantidad} threshold={STOCK_BAJO_THRESHOLD} />
                    </TableCell>
                    {isEncargado && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => setEditingEtiqueta(etiqueta)} className="text-on-surface-variant hover:text-on-surface transition-colors" title="Editar" aria-label={`Editar ${etiqueta.articulo}`}>
                            <Pencil size={14} strokeWidth={1.5} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(etiqueta.id)}
                            disabled={deletingId === etiqueta.id}
                            className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-40"
                            title="Eliminar"
                            aria-label={`Eliminar ${etiqueta.articulo}`}
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
            {etiquetas.map((etiqueta) => (
              <div
                key={etiqueta.id}
                className="bg-surface-low rounded px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-body text-on-surface text-sm truncate">{etiqueta.articulo}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <MercadoChip mercado={etiqueta.mercado} />
                    <span className="font-body text-on-surface-variant text-xs tabular-nums">
                      {etiqueta.cantidad} uds
                    </span>
                    <StockChip cantidad={etiqueta.cantidad} threshold={STOCK_BAJO_THRESHOLD} />
                  </div>
                </div>
                {isEncargado && (
                  <div className="flex items-center gap-3 shrink-0">
                    <CantidadCell etiqueta={etiqueta} onUpdated={handleUpdated} />
                    <button type="button" onClick={() => setEditingEtiqueta(etiqueta)} className="text-on-surface-variant hover:text-on-surface transition-colors" title="Editar" aria-label={`Editar ${etiqueta.articulo}`}>
                      <Pencil size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(etiqueta.id)}
                      disabled={deletingId === etiqueta.id}
                      className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-40"
                      title="Eliminar"
                      aria-label={`Eliminar ${etiqueta.articulo}`}
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
