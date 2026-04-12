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
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/layout/page-header'

interface Estuche {
  id: string
  productoId?: string | null
  articulo: string
  mercado: Mercado
  cantidad: number
  updatedAt: string
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

function sortEstuches(list: Estuche[]): Estuche[] {
  return [...list].sort((a, b) =>
    a.mercado.localeCompare(b.mercado) || sortByArticulo(a.articulo, b.articulo)
  )
}

function normalizeProducto(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STOCK_BAJO_THRESHOLD = 50

// ─── Agregar estuche modal ────────────────────────────────────────────────────

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

function AgregarEstucheModal({
  onCreated,
  open,
  onOpenChange,
}: {
  onCreated: (e: Estuche) => void
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const token = useAuthStore((s) => s.token)
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
      const estuche = await apiClient.post<Estuche>(
        '/estuches',
        { articulo: data.articulo, mercado: data.mercado, cantidad: Number(data.cantidad) },
        token
      )
      onCreated(estuche)
      if (estuche.cantidad < STOCK_BAJO_THRESHOLD) {
        toast.warning(`"${estuche.articulo}" quedó con stock bajo (${estuche.cantidad}).`)
      } else {
        toast.success(`Estuche "${estuche.articulo}" agregado.`)
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
          <DialogTitle>Agregar estuche</DialogTitle>
          <DialogDescription>
            Ingresá el artículo, mercado de destino y cantidad inicial.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="agregar-estuche-articulo" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Artículo
            </label>
            <input
              id="agregar-estuche-articulo"
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
            <label htmlFor="agregar-estuche-cantidad" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">
              Cantidad inicial
            </label>
            <input
              id="agregar-estuche-cantidad"
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

// ─── Editar estuche modal ─────────────────────────────────────────────────────

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

function EditarEstucheModal({
  estuche,
  onUpdated,
  onClose,
}: {
  estuche: Estuche
  onUpdated: (e: Estuche) => void
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
    defaultValues: { articulo: estuche.articulo, mercado: estuche.mercado, cantidad: String(estuche.cantidad) },
  })

  const mercadoVal = useWatch({ control, name: 'mercado' })

  async function onSubmit(data: EditarFormData) {
    setServerError(null)
    try {
      const updated = await apiClient.put<Estuche>(
        `/estuches/${estuche.id}`,
        { articulo: data.articulo, mercado: data.mercado, cantidad: Number(data.cantidad) },
        token
      )
      onUpdated(updated)
      if (updated.cantidad < STOCK_BAJO_THRESHOLD) {
        toast.warning(`"${updated.articulo}" quedó con stock bajo (${updated.cantidad}).`)
      } else {
        toast.info(`Estuche "${updated.articulo}" actualizado.`)
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
          <DialogTitle>Editar estuche</DialogTitle>
          <DialogDescription>Modificá el artículo, mercado y/o cantidad.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="editar-estuche-articulo" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Artículo</label>
            <input id="editar-estuche-articulo" {...register('articulo')} type="text" className="input-field" autoFocus />
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
            <label htmlFor="editar-estuche-cantidad" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Cantidad</label>
            <input id="editar-estuche-cantidad" {...register('cantidad')} type="number" min="0" className="input-field" />
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
  estuche,
  onUpdated,
}: {
  estuche: Estuche
  onUpdated: (e: Estuche) => void
}) {
  const token = useAuthStore((s) => s.token)
  return (
    <InlineNumberEditor
      value={estuche.cantidad}
      label="cantidad"
      onSave={async (nextValue) => {
        const updated = await apiClient.put<Estuche>(
          `/estuches/${estuche.id}`,
          { cantidad: nextValue },
          token
        )
        onUpdated(updated)
        if (updated.cantidad < STOCK_BAJO_THRESHOLD) {
          toast.warning(`"${updated.articulo}" quedó con stock bajo (${updated.cantidad}).`)
        } else {
          toast.info(`Stock de "${updated.articulo}" actualizado.`)
        }
      }}
    />
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function EstuchesPage() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.role === 'encargado'
  const [searchParams] = useSearchParams()

  const [allEstuches, setAllEstuches] = useState<Estuche[]>([])
  const [mercadoFiltro, setMercadoFiltro] = useState<Mercado | 'todos'>(
    (searchParams.get('mercado') as Mercado | 'todos') ?? 'todos'
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingEstuche, setEditingEstuche] = useState<Estuche | null>(null)
  const [catalogMap, setCatalogMap] = useState<Record<string, string>>({})
  const [agregarOpen, setAgregarOpen] = useState(false)

  useEffect(() => {
    apiClient
      .get<Estuche[]>('/estuches', token)
      .then((list) => setAllEstuches(sortEstuches(list)))
      .catch(() => setError('No se pudo cargar los estuches'))
      .finally(() => setLoading(false))

    fetchCatalogoProductos('estuche', token)
      .then((productos) => {
        setCatalogMap(
          Object.fromEntries(productos.map((producto) => [producto.id, producto.nombreCompleto]))
        )
      })
      .catch(() => {})
  }, [token])

  const getDisplayName = useCallback((estuche: Estuche): string => {
    return estuche.productoId ? (catalogMap[estuche.productoId] ?? estuche.articulo) : estuche.articulo
  }, [catalogMap])

  useEffect(() => {
    const nextMercado = (searchParams.get('mercado') as Mercado | 'todos') ?? 'todos'
    setMercadoFiltro(nextMercado)
  }, [searchParams])

  const productoFiltro = searchParams.get('producto') ?? ''

  const estuches = useMemo(() => {
    const byMercado =
      mercadoFiltro === 'todos'
        ? allEstuches
        : allEstuches.filter((e) => e.mercado === mercadoFiltro)

    if (!productoFiltro) return byMercado
    const target = normalizeProducto(productoFiltro)
    return byMercado.filter((estuche) => normalizeProducto(getDisplayName(estuche)) === target)
  }, [allEstuches, mercadoFiltro, productoFiltro, getDisplayName])

  function handleCreated(e: Estuche) {
    setAllEstuches((prev) => sortEstuches([...prev, e]))
  }

  function handleUpdated(updated: Estuche) {
    setAllEstuches((prev) => sortEstuches(prev.map((e) => (e.id === updated.id ? updated : e))))
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await apiClient.del<void>(`/estuches/${id}`, token)
      const estuche = allEstuches.find((e) => e.id === id)
      setAllEstuches((prev) => prev.filter((e) => e.id !== id))
      toast.success(estuche ? `Estuche "${estuche.articulo}" eliminado.` : 'Estuche eliminado.')
    } catch {
      toast.error('No se pudo eliminar el estuche.')
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

  const stockBajoCount = estuches.filter((e) => e.cantidad < STOCK_BAJO_THRESHOLD).length
  const countsByMercado = MERCADOS.reduce<Record<Mercado, number>>((acc, mercado) => {
    acc[mercado.value] = allEstuches.filter((e) => e.mercado === mercado.value).length
    return acc
  }, {} as Record<Mercado, number>)

  return (
    <div className="space-y-5">
      <PageHeader
        title="ESTUCHES"
        stats={[
          { label: 'artículos', value: estuches.length },
          { label: 'mercados', value: MERCADOS.filter((mercado) => countsByMercado[mercado.value] > 0).length },
          { label: 'stock bajo', value: stockBajoCount, warning: stockBajoCount > 0 },
        ]}
        primaryAction={
          isEncargado
            ? {
                label: 'Agregar estuche',
                onClick: () => setAgregarOpen(true),
                icon: <Plus size={14} strokeWidth={2} />,
              }
            : undefined
        }
      >
        <MercadoFilter
          mercadoActivo={mercadoFiltro}
          onChangeMercado={setMercadoFiltro}
          totalCount={allEstuches.length}
          countsByMercado={countsByMercado}
        />
      </PageHeader>

      {isEncargado ? (
        <AgregarEstucheModal
          onCreated={handleCreated}
          open={agregarOpen}
          onOpenChange={setAgregarOpen}
        />
      ) : null}

      {editingEstuche && (
        <EditarEstucheModal
          estuche={editingEstuche}
          onUpdated={handleUpdated}
          onClose={() => setEditingEstuche(null)}
        />
      )}

      {estuches.length === 0 ? (
        <EmptyState message={productoFiltro ? 'No se encontró ese estuche con los filtros aplicados.' : 'No hay estuches para este mercado.'} />
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
                {estuches.map((estuche) => (
                  <TableRow key={estuche.id} className={productoFiltro ? 'bg-primary/5' : undefined}>
                    <TableCell className="font-body text-on-surface">{getDisplayName(estuche)}</TableCell>
                    <TableCell>
                      <MercadoChip mercado={estuche.mercado} />
                    </TableCell>
                    <TableCell>
                      {isEncargado ? (
                        <CantidadCell estuche={estuche} onUpdated={handleUpdated} />
                      ) : (
                        <span className="font-body text-on-surface tabular-nums">{estuche.cantidad}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StockChip cantidad={estuche.cantidad} threshold={STOCK_BAJO_THRESHOLD} />
                    </TableCell>
                    {isEncargado && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => setEditingEstuche(estuche)} className="text-on-surface-variant hover:text-on-surface transition-colors" title="Editar" aria-label={`Editar ${estuche.articulo}`}>
                            <Pencil size={14} strokeWidth={1.5} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(estuche.id)}
                            disabled={deletingId === estuche.id}
                            className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-40"
                            title="Eliminar"
                            aria-label={`Eliminar ${estuche.articulo}`}
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
            {estuches.map((estuche) => (
              <div
                key={estuche.id}
                className={`bg-surface-low rounded px-4 py-3 flex items-center justify-between gap-3 ${productoFiltro ? 'ring-1 ring-primary/30' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-body text-on-surface text-sm truncate">{getDisplayName(estuche)}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <MercadoChip mercado={estuche.mercado} />
                    <span className="font-body text-on-surface-variant text-xs tabular-nums">
                      {estuche.cantidad} uds
                    </span>
                    <StockChip cantidad={estuche.cantidad} threshold={STOCK_BAJO_THRESHOLD} />
                  </div>
                </div>
                {isEncargado && (
                  <div className="flex items-center gap-3 shrink-0">
                    <CantidadCell estuche={estuche} onUpdated={handleUpdated} />
                    <button type="button" onClick={() => setEditingEstuche(estuche)} className="text-on-surface-variant hover:text-on-surface transition-colors" title="Editar" aria-label={`Editar ${estuche.articulo}`}>
                      <Pencil size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(estuche.id)}
                      disabled={deletingId === estuche.id}
                      className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-40"
                      title="Eliminar"
                      aria-label={`Eliminar ${estuche.articulo}`}
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
