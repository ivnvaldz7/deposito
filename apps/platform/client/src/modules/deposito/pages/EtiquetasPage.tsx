import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { ApiError } from '../lib/api'
import { useEtiquetas, useCreateEtiqueta, useUpdateEtiqueta, useDeleteEtiqueta } from '../queries/use-etiquetas'
import { toast } from '../lib/toast'
import { fetchCatalogoProductos } from '../lib/catalogo-productos'
import { sortByArticulo } from '../lib/sort-utils'
import { InlineNumberEditor } from '../components/inventory-shared/inline-number-editor'
import { MercadoChip } from '../components/inventory-shared/mercado-chip'
import { MercadoFilter } from '../components/inventory-shared/mercado-filter'
import { EmptyState, ErrorState, LoadingState } from '../components/inventory-shared/inventory-states'
import { MERCADOS, type Mercado } from '../components/inventory-shared/mercados'
import { StockChip } from '../components/inventory-shared/stock-chip'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/Table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '../components/ui/Dialog'
import { PageHeader } from '../components/layout/PageHeader'

interface Etiqueta {
  id: string
  productoId?: string | null
  articulo: string
  mercado: Mercado
  cantidad: number
  updatedAt: string
}

function sortEtiquetas(list: Etiqueta[]): Etiqueta[] {
  return [...list].sort((a, b) =>
    a.mercado.localeCompare(b.mercado) || sortByArticulo(a.articulo, b.articulo)
  )
}

function normalizeProducto(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

const STOCK_BAJO_THRESHOLD = 50

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

function AgregarEtiquetaModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const createMutation = useCreateEtiqueta()

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm<AgregarFormData>({
    resolver: zodResolver(agregarSchema),
    defaultValues: { articulo: '', mercado: 'argentina', cantidad: '' },
  })

  const mercadoVal = useWatch({ control, name: 'mercado' })

  async function onSubmit(data: AgregarFormData) {
    setServerError(null)
    try {
      const etiqueta = await createMutation.mutateAsync({
        articulo: data.articulo, mercado: data.mercado, cantidad: Number(data.cantidad),
      })
      if (etiqueta.cantidad < STOCK_BAJO_THRESHOLD) {
        toast.warning(`"${etiqueta.articulo}" quedó con stock bajo (${etiqueta.cantidad}).`)
      } else {
        toast.success(`Etiqueta "${etiqueta.articulo}" agregada.`)
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
            <input id="agregar-etiqueta-articulo" {...register('articulo')} type="text" placeholder="Ej: AMANTINA PREMIUM 250 ML" className="input-field" autoFocus />
            {errors.articulo && <p className="font-body text-error text-xs">{errors.articulo.message}</p>}
          </div>

          <div className="space-y-2">
            <label className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Mercado</label>
            <div className="flex flex-wrap gap-2">
              {MERCADOS.map(({ value, label }) => (
                <button key={value} type="button" onClick={() => setValue('mercado', value)}
                  className="px-3 py-1.5 rounded font-body text-xs transition-colors"
                  className={`px-3 py-1.5 rounded font-body text-xs transition-colors ${mercadoVal === value ? 'bg-primary-container/20 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="agregar-etiqueta-cantidad" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Cantidad inicial</label>
            <input id="agregar-etiqueta-cantidad" {...register('cantidad')} type="number" min="0" placeholder="0" className="input-field" />
            {errors.cantidad && <p className="font-body text-error text-xs">{errors.cantidad.message}</p>}
          </div>

          {serverError && <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">{serverError}</div>}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1 py-2.5 text-sm">{createMutation.isPending ? 'Guardando...' : 'Guardar'}</button>
            <DialogClose asChild>
              <button type="button" className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-container-high hover:bg-surface-bright transition-colors">Cancelar</button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const editarSchema = z.object({
  articulo: z.string().min(2, 'Mínimo 2 caracteres').max(150),
  mercado: z.enum(['argentina', 'colombia', 'mexico', 'ecuador', 'bolivia', 'paraguay', 'no_exportable'] as const),
  cantidad: z.string().min(1, 'Requerido').refine((v) => !isNaN(Number(v)) && Number(v) >= 0, 'Debe ser número positivo'),
})

type EditarFormData = z.infer<typeof editarSchema>

function EditarEtiquetaModal({ etiqueta, onClose }: { etiqueta: Etiqueta; onClose: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null)
  const updateMutation = useUpdateEtiqueta()
  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<EditarFormData>({
    resolver: zodResolver(editarSchema),
    defaultValues: { articulo: etiqueta.articulo, mercado: etiqueta.mercado, cantidad: String(etiqueta.cantidad) },
  })
  const mercadoVal = useWatch({ control, name: 'mercado' })

  async function onSubmit(data: EditarFormData) {
    setServerError(null)
    try {
      const updated = await updateMutation.mutateAsync({ id: etiqueta.id, articulo: data.articulo, mercado: data.mercado, cantidad: Number(data.cantidad) })
      if (updated.cantidad < STOCK_BAJO_THRESHOLD) toast.warning(`"${updated.articulo}" quedó con stock bajo (${updated.cantidad}).`)
      else toast.info(`Etiqueta "${updated.articulo}" actualizada.`)
      onClose()
    } catch (err) { setServerError(err instanceof ApiError ? err.message : 'Error al guardar') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar etiqueta</DialogTitle><DialogDescription>Modificá el artículo, mercado y/o cantidad.</DialogDescription></DialogHeader>
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
                <button key={value} type="button" onClick={() => setValue('mercado', value)}
                  className="px-3 py-1.5 rounded font-body text-xs transition-colors"
                  className={`px-3 py-1.5 rounded font-body text-xs transition-colors ${mercadoVal === value ? 'bg-primary-container/20 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
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
<<<<<<< Updated upstream
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 py-2.5 text-sm">{isSubmitting ? 'Guardando...' : 'Guardar'}</button>
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-container-high hover:bg-surface-bright transition-colors">Cancelar</button>
=======
            <button type="submit" disabled={updateMutation.isPending} className="btn-primary flex-1 py-2.5 text-sm">{updateMutation.isPending ? 'Guardando...' : 'Guardar'}</button>
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-high hover:bg-surface-bright transition-colors">Cancelar</button>
>>>>>>> Stashed changes
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CantidadCell({ etiqueta }: { etiqueta: Etiqueta }) {
  const updateMutation = useUpdateEtiqueta()
  return (
    <InlineNumberEditor
      value={etiqueta.cantidad} label="cantidad"
      onSave={async (nextValue) => {
        const updated = await updateMutation.mutateAsync({ id: etiqueta.id, cantidad: nextValue })
        if (updated.cantidad < STOCK_BAJO_THRESHOLD) toast.warning(`"${updated.articulo}" quedó con stock bajo (${updated.cantidad}).`)
        else toast.info(`Stock de "${updated.articulo}" actualizado.`)
      }}
    />
  )
}

export default function EtiquetasPage() {
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.apps?.['deposito']?.rol === 'encargado'
  const [searchParams] = useSearchParams()
  const { data: allEtiquetas = [], isLoading, error } = useEtiquetas()
  const deleteMutation = useDeleteEtiqueta()
  const [mercadoFiltro, setMercadoFiltro] = useState<Mercado | 'todos'>((searchParams.get('mercado') as Mercado | 'todos') ?? 'todos')
  const [editingEtiqueta, setEditingEtiqueta] = useState<Etiqueta | null>(null)
  const [catalogMap, setCatalogMap] = useState<Record<string, string>>({})
  const [agregarOpen, setAgregarOpen] = useState(false)

  useEffect(() => {
    fetchCatalogoProductos('etiqueta').then((productos) => { setCatalogMap(Object.fromEntries(productos.map((p) => [p.id, p.nombreCompleto]))) }).catch(() => {})
  }, [])

  const getDisplayName = useCallback((etiqueta: Etiqueta): string => etiqueta.productoId ? (catalogMap[etiqueta.productoId] ?? etiqueta.articulo) : etiqueta.articulo, [catalogMap])

  useEffect(() => { setMercadoFiltro((searchParams.get('mercado') as Mercado | 'todos') ?? 'todos') }, [searchParams])

  const productoFiltro = searchParams.get('producto') ?? ''
  const sortedEtiquetas = useMemo(() => sortEtiquetas(allEtiquetas), [allEtiquetas])
  const etiquetas = useMemo(() => {
    const byMercado = mercadoFiltro === 'todos' ? sortedEtiquetas : sortedEtiquetas.filter((e) => e.mercado === mercadoFiltro)
    if (!productoFiltro) return byMercado
    const target = normalizeProducto(productoFiltro)
    return byMercado.filter((e) => normalizeProducto(getDisplayName(e)) === target)
  }, [sortedEtiquetas, mercadoFiltro, productoFiltro, getDisplayName])

  async function handleDelete(id: string) {
    try {
      await deleteMutation.mutateAsync(id)
      const etiqueta = allEtiquetas.find((e) => e.id === id)
      toast.success(etiqueta ? `Etiqueta "${etiqueta.articulo}" eliminada.` : 'Etiqueta eliminada.')
    } catch { toast.error('No se pudo eliminar la etiqueta.') }
  }

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message={error instanceof ApiError ? error.message : 'No se pudo cargar las etiquetas'} />

  const stockBajoCount = etiquetas.filter((e) => e.cantidad < STOCK_BAJO_THRESHOLD).length
  const countsByMercado = MERCADOS.reduce<Record<Mercado, number>>((acc, m) => { acc[m.value] = allEtiquetas.filter((e) => e.mercado === m.value).length; return acc }, {} as Record<Mercado, number>)

  return (
    <div className="space-y-5">
      <PageHeader title="ETIQUETAS" stats={[
        { label: 'artículos', value: etiquetas.length },
        { label: 'mercados', value: MERCADOS.filter((m) => countsByMercado[m.value] > 0).length },
        { label: 'stock bajo', value: stockBajoCount, warning: stockBajoCount > 0 },
      ]} primaryAction={isEncargado ? { label: 'Agregar etiqueta', onClick: () => setAgregarOpen(true), icon: <Plus size={14} strokeWidth={2} /> } : undefined}>
        <MercadoFilter mercadoActivo={mercadoFiltro} onChangeMercado={setMercadoFiltro} totalCount={allEtiquetas.length} countsByMercado={countsByMercado} />
      </PageHeader>
      {isEncargado && <AgregarEtiquetaModal open={agregarOpen} onOpenChange={setAgregarOpen} />}
      {editingEtiqueta && <EditarEtiquetaModal etiqueta={editingEtiqueta} onClose={() => setEditingEtiqueta(null)} />}
      {etiquetas.length === 0 ? <EmptyState message={productoFiltro ? 'No se encontró esa etiqueta con los filtros aplicados.' : 'No hay etiquetas para este mercado.'} />
      : (
        <>
          <div className="hidden md:block bg-surface-container-low rounded overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>Artículo</TableHead><TableHead className="w-36">Mercado</TableHead><TableHead className="w-32">Cantidad</TableHead><TableHead className="w-28">Estado</TableHead>{isEncargado && <TableHead className="w-24 text-right">Acciones</TableHead>}</TableRow></TableHeader>
              <TableBody>
                {etiquetas.map((e) => (
                  <TableRow key={e.id} className={productoFiltro ? 'bg-primary/5' : undefined}>
                    <TableCell className="font-body text-on-surface">{getDisplayName(e)}</TableCell>
                    <TableCell><MercadoChip mercado={e.mercado} /></TableCell>
                    <TableCell>{isEncargado ? <CantidadCell etiqueta={e} /> : <span className="font-body text-on-surface tabular-nums">{e.cantidad}</span>}</TableCell>
                    <TableCell><StockChip cantidad={e.cantidad} threshold={STOCK_BAJO_THRESHOLD} /></TableCell>
                    {isEncargado && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => setEditingEtiqueta(e)} className="text-on-surface-variant hover:text-on-surface transition-colors" title="Editar"><Pencil size={14} strokeWidth={1.5} /></button>
                          <button type="button" onClick={() => handleDelete(e.id)} disabled={deleteMutation.isPending} className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-40" title="Eliminar"><Trash2 size={14} strokeWidth={1.5} /></button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden space-y-2">
            {etiquetas.map((e) => (
              <div key={e.id} className={`bg-surface-container-low rounded px-4 py-3 flex items-center justify-between gap-3 ${productoFiltro ? 'ring-1 ring-primary/30' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-on-surface text-sm truncate">{getDisplayName(e)}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <MercadoChip mercado={e.mercado} /><span className="font-body text-on-surface-variant text-xs tabular-nums">{e.cantidad} uds</span>
                    <StockChip cantidad={e.cantidad} threshold={STOCK_BAJO_THRESHOLD} />
                  </div>
                </div>
                {isEncargado && (
                  <div className="flex items-center gap-3 shrink-0">
                    <CantidadCell etiqueta={e} />
                    <button type="button" onClick={() => setEditingEtiqueta(e)} className="text-on-surface-variant hover:text-on-surface transition-colors"><Pencil size={14} strokeWidth={1.5} /></button>
                    <button type="button" onClick={() => handleDelete(e.id)} disabled={deleteMutation.isPending} className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-40"><Trash2 size={14} strokeWidth={1.5} /></button>
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
