import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient, ApiError } from '@/lib/api-client'
import { toast } from '@/lib/toast'
import { fetchCatalogoProductos } from '@/lib/catalogo-productos'
import { InlineNumberEditor } from '@/features/inventory/shared/inline-number-editor'
import { EmptyState, ErrorState, LoadingState } from '@/features/inventory/shared/inventory-states'
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
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/layout/page-header'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Frasco {
  id: string
  productoId?: string | null
  articulo: string
  unidadesPorCaja: number
  cantidadCajas: number
  total: number
  updatedAt: string
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

function sortFrascos(list: Frasco[]): Frasco[] {
  return [...list].sort((a, b) => sortByArticulo(a.articulo, b.articulo))
}

function normalizeProducto(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

const STOCK_BAJO_THRESHOLD = 5

// ─── Agregar frasco modal ─────────────────────────────────────────────────────

const agregarSchema = z.object({
  articulo: z.string().min(2, 'Mínimo 2 caracteres').max(150),
  unidadesPorCaja: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => Number.isInteger(Number(v)) && Number(v) > 0, 'Debe ser entero positivo'),
  cantidadCajas: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => Number.isInteger(Number(v)) && Number(v) >= 0, 'Debe ser entero positivo o cero'),
})

type AgregarFormData = z.infer<typeof agregarSchema>

function AgregarFrascoModal({
  onCreated,
  open,
  onOpenChange,
}: {
  onCreated: (f: Frasco) => void
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const token = useAuthStore((s) => s.token)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AgregarFormData>({
    resolver: zodResolver(agregarSchema),
    defaultValues: { articulo: '', unidadesPorCaja: '', cantidadCajas: '' },
  })

  const unidades = Number(useWatch({ control, name: 'unidadesPorCaja' })) || 0
  const cajas = Number(useWatch({ control, name: 'cantidadCajas' })) || 0
  const totalPreview = unidades * cajas

  async function onSubmit(data: AgregarFormData) {
    setServerError(null)
    try {
      const frasco = await apiClient.post<Frasco>(
        '/frascos',
        {
          articulo: data.articulo,
          unidadesPorCaja: Number(data.unidadesPorCaja),
          cantidadCajas: Number(data.cantidadCajas),
        },
        token
      )
      onCreated(frasco)
      if (frasco.cantidadCajas < STOCK_BAJO_THRESHOLD) {
        toast.warning(`"${frasco.articulo}" quedó con stock bajo (${frasco.cantidadCajas} cajas).`)
      } else {
        toast.success(`Frasco "${frasco.articulo}" agregado.`)
      }
      reset()
      onOpenChange(false)
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al guardar')
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
          <DialogTitle>Agregar frasco</DialogTitle>
          <DialogDescription>
            Ingresá el artículo, unidades por caja y cantidad de cajas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="agregar-frasco-articulo" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Artículo
            </label>
            <input
              id="agregar-frasco-articulo"
              {...register('articulo')}
              type="text"
              placeholder="Ej: DORADO 250 ML"
              className="input-field"
              autoFocus
            />
            {errors.articulo && (
              <p className="font-body text-error text-xs">{errors.articulo.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="agregar-frasco-unidades" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                Unidades / Caja
              </label>
              <input
                id="agregar-frasco-unidades"
                {...register('unidadesPorCaja')}
                type="number"
                min="1"
                placeholder="0"
                className="input-field"
              />
              {errors.unidadesPorCaja && (
                <p className="font-body text-error text-xs">{errors.unidadesPorCaja.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="agregar-frasco-cajas" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                Cajas
              </label>
              <input
                id="agregar-frasco-cajas"
                {...register('cantidadCajas')}
                type="number"
                min="0"
                placeholder="0"
                className="input-field"
              />
              {errors.cantidadCajas && (
                <p className="font-body text-error text-xs">{errors.cantidadCajas.message}</p>
              )}
            </div>
          </div>

          {totalPreview > 0 && (
            <p className="font-body text-on-surface-variant text-xs">
              Total:{' '}
              <span className="text-on-surface font-medium tabular-nums">
                {totalPreview.toLocaleString()} unidades
              </span>
            </p>
          )}

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

// ─── Editar frasco modal ──────────────────────────────────────────────────────

const editarSchema = z.object({
  articulo: z.string().min(2, 'Mínimo 2 caracteres').max(150),
  unidadesPorCaja: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => Number.isInteger(Number(v)) && Number(v) > 0, 'Entero positivo'),
  cantidadCajas: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => Number.isInteger(Number(v)) && Number(v) >= 0, 'Entero positivo o cero'),
})

type EditarFormData = z.infer<typeof editarSchema>

function EditarFrascoModal({
  frasco,
  onUpdated,
  onClose,
}: {
  frasco: Frasco
  onUpdated: (f: Frasco) => void
  onClose: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EditarFormData>({
    resolver: zodResolver(editarSchema),
    defaultValues: {
      articulo: frasco.articulo,
      unidadesPorCaja: String(frasco.unidadesPorCaja),
      cantidadCajas: String(frasco.cantidadCajas),
    },
  })

  const unidades = Number(useWatch({ control, name: 'unidadesPorCaja' })) || 0
  const cajas = Number(useWatch({ control, name: 'cantidadCajas' })) || 0
  const totalPreview = unidades * cajas

  async function onSubmit(data: EditarFormData) {
    setServerError(null)
    try {
      const updated = await apiClient.put<Frasco>(
        `/frascos/${frasco.id}`,
        {
          articulo: data.articulo,
          unidadesPorCaja: Number(data.unidadesPorCaja),
          cantidadCajas: Number(data.cantidadCajas),
        },
        token
      )
      onUpdated(updated)
      if (updated.cantidadCajas < STOCK_BAJO_THRESHOLD) {
        toast.warning(`"${updated.articulo}" quedó con stock bajo (${updated.cantidadCajas} cajas).`)
      } else {
        toast.info(`Frasco "${updated.articulo}" actualizado.`)
      }
      onClose()
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al guardar')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar frasco</DialogTitle>
          <DialogDescription>Modificá el artículo, unidades por caja y/o cantidad de cajas.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="editar-frasco-articulo" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Artículo</label>
            <input id="editar-frasco-articulo" {...register('articulo')} type="text" className="input-field" autoFocus />
            {errors.articulo && <p className="font-body text-error text-xs">{errors.articulo.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="editar-frasco-unidades" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Unidades / Caja</label>
              <input id="editar-frasco-unidades" {...register('unidadesPorCaja')} type="number" min="1" className="input-field" />
              {errors.unidadesPorCaja && <p className="font-body text-error text-xs">{errors.unidadesPorCaja.message}</p>}
            </div>
            <div className="space-y-1">
              <label htmlFor="editar-frasco-cajas" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Cajas</label>
              <input id="editar-frasco-cajas" {...register('cantidadCajas')} type="number" min="0" className="input-field" />
              {errors.cantidadCajas && <p className="font-body text-error text-xs">{errors.cantidadCajas.message}</p>}
            </div>
          </div>

          {totalPreview > 0 && (
            <p className="font-body text-on-surface-variant text-xs">
              Total: <span className="text-on-surface font-medium tabular-nums">{totalPreview.toLocaleString()} unidades</span>
            </p>
          )}

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

// ─── Inline cajas editor ──────────────────────────────────────────────────────

function CajasCell({
  frasco,
  onUpdated,
}: {
  frasco: Frasco
  onUpdated: (f: Frasco) => void
}) {
  const token = useAuthStore((s) => s.token)
  return (
    <InlineNumberEditor
      value={frasco.cantidadCajas}
      label="Cajas"
      onSave={async (nextValue) => {
        const updated = await apiClient.put<Frasco>(
          `/frascos/${frasco.id}`,
          { cantidadCajas: nextValue },
          token
        )
        onUpdated(updated)
        if (updated.cantidadCajas < STOCK_BAJO_THRESHOLD) {
          toast.warning(`"${updated.articulo}" quedó con stock bajo (${updated.cantidadCajas} cajas).`)
        } else {
          toast.info(`Stock de cajas para "${updated.articulo}" actualizado.`)
        }
      }}
    />
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function FrascosPage() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.role === 'encargado'
  const [searchParams] = useSearchParams()

  const [frascos, setFrascos] = useState<Frasco[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingFrasco, setEditingFrasco] = useState<Frasco | null>(null)
  const [catalogMap, setCatalogMap] = useState<Record<string, string>>({})
  const [agregarOpen, setAgregarOpen] = useState(false)

  useEffect(() => {
    apiClient
      .get<Frasco[]>('/frascos', token)
      .then((list) => setFrascos(sortFrascos(list)))
      .catch(() => setError('No se pudo cargar los frascos'))
      .finally(() => setLoading(false))

    fetchCatalogoProductos('frasco', token)
      .then((productos) => {
        setCatalogMap(
          Object.fromEntries(productos.map((producto) => [producto.id, producto.nombreCompleto]))
        )
      })
      .catch(() => {})
  }, [token])

  const getDisplayName = useCallback((frasco: Frasco): string => {
    return frasco.productoId ? (catalogMap[frasco.productoId] ?? frasco.articulo) : frasco.articulo
  }, [catalogMap])

  const productoFiltro = searchParams.get('producto') ?? ''
  const filteredFrascos = useMemo(() => {
    if (!productoFiltro) return frascos
    const target = normalizeProducto(productoFiltro)
    return frascos.filter((frasco) => normalizeProducto(getDisplayName(frasco)) === target)
  }, [frascos, productoFiltro, getDisplayName])

  function handleCreated(f: Frasco) {
    setFrascos((prev) => sortFrascos([...prev, f]))
  }

  function handleUpdated(updated: Frasco) {
    setFrascos((prev) => sortFrascos(prev.map((f) => (f.id === updated.id ? updated : f))))
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await apiClient.del<void>(`/frascos/${id}`, token)
      const frasco = frascos.find((f) => f.id === id)
      setFrascos((prev) => prev.filter((f) => f.id !== id))
      toast.success(frasco ? `Frasco "${frasco.articulo}" eliminado.` : 'Frasco eliminado.')
    } catch {
      toast.error('No se pudo eliminar el frasco.')
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

  const totalCajas = frascos.reduce((s, f) => s + f.cantidadCajas, 0)
  const stockBajoCount = frascos.filter((frasco) => frasco.cantidadCajas < STOCK_BAJO_THRESHOLD).length

  return (
    <div className="space-y-5">
      <PageHeader
        title="FRASCOS"
        stats={[
          { label: 'artículos', value: frascos.length },
          { label: 'cajas', value: totalCajas.toLocaleString() },
          { label: 'stock bajo', value: stockBajoCount, warning: stockBajoCount > 0 },
        ]}
        primaryAction={
          isEncargado
            ? {
                label: 'Agregar frasco',
                onClick: () => setAgregarOpen(true),
                icon: <Plus size={14} strokeWidth={2} />,
              }
            : undefined
        }
      />

      {isEncargado ? (
        <AgregarFrascoModal
          onCreated={handleCreated}
          open={agregarOpen}
          onOpenChange={setAgregarOpen}
        />
      ) : null}

      {editingFrasco && (
        <EditarFrascoModal
          frasco={editingFrasco}
          onUpdated={handleUpdated}
          onClose={() => setEditingFrasco(null)}
        />
      )}

      {filteredFrascos.length === 0 ? (
        <EmptyState message={productoFiltro ? 'No se encontró ese frasco en inventario.' : 'No hay frascos cargados.'} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-surface-low rounded overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artículo</TableHead>
                  <TableHead className="w-32 text-right">Unid/Caja</TableHead>
                  <TableHead className="w-32 text-right">Cajas</TableHead>
                  <TableHead className="w-36 text-right">Total uds</TableHead>
                  {isEncargado && <TableHead className="w-24 text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFrascos.map((frasco) => (
                  <TableRow key={frasco.id} className={productoFiltro ? 'bg-primary/5' : undefined}>
                    <TableCell className="font-body text-on-surface">{getDisplayName(frasco)}</TableCell>
                    <TableCell className="text-right">
                      <span className="font-body text-on-surface-variant tabular-nums text-sm">
                        {frasco.unidadesPorCaja}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {isEncargado ? (
                        <div className="flex justify-end">
                          <CajasCell frasco={frasco} onUpdated={handleUpdated} />
                        </div>
                      ) : (
                        <span className="font-body text-on-surface tabular-nums">{frasco.cantidadCajas}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-body text-on-surface font-medium tabular-nums">
                        {frasco.total.toLocaleString()}
                      </span>
                    </TableCell>
                    {isEncargado && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => setEditingFrasco(frasco)} className="text-on-surface-variant hover:text-on-surface transition-colors" title="Editar" aria-label={`Editar ${frasco.articulo}`}>
                            <Pencil size={14} strokeWidth={1.5} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(frasco.id)}
                            disabled={deletingId === frasco.id}
                            className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-40"
                            title="Eliminar"
                            aria-label={`Eliminar ${frasco.articulo}`}
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
            {filteredFrascos.map((frasco) => (
              <div
                key={frasco.id}
                className={`bg-surface-low rounded px-4 py-3 flex items-center justify-between gap-3 ${productoFiltro ? 'ring-1 ring-primary/30' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-body text-on-surface text-sm truncate">{getDisplayName(frasco)}</p>
                  <p className="font-body text-on-surface-variant text-xs mt-0.5 tabular-nums">
                    {frasco.unidadesPorCaja} uds/caja ·{' '}
                    {frasco.cantidadCajas} cajas ·{' '}
                    <span className="text-on-surface font-medium">{frasco.total.toLocaleString()} total</span>
                  </p>
                </div>
                {isEncargado && (
                  <div className="flex items-center gap-3 shrink-0">
                    <CajasCell frasco={frasco} onUpdated={handleUpdated} />
                    <button type="button" onClick={() => setEditingFrasco(frasco)} className="text-on-surface-variant hover:text-on-surface transition-colors" title="Editar" aria-label={`Editar ${frasco.articulo}`}>
                      <Pencil size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(frasco.id)}
                      disabled={deletingId === frasco.id}
                      className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-40"
                      title="Eliminar"
                      aria-label={`Eliminar ${frasco.articulo}`}
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
