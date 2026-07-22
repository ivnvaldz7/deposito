import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { ApiError } from '../lib/api'
import { useFrascos, useCreateFrasco, useUpdateFrasco, useDeleteFrasco } from '../queries/use-frascos'
import { toast } from '../lib/toast'
import { fetchCatalogoProductos } from '../lib/catalogo-productos'
import { InlineNumberEditor } from '../components/inventory-shared/inline-number-editor'
import { EmptyState, ErrorState, LoadingState } from '../components/inventory-shared/inventory-states'
import { sortByArticulo } from '../lib/sort-utils'
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

interface Frasco {
  id: string
  productoId?: string | null
  articulo: string
  unidadesPorCaja: number
  cantidadCajas: number
  total: number
  updatedAt: string
}

function sortFrascos(list: Frasco[]): Frasco[] {
  return [...list].sort((a, b) => sortByArticulo(a.articulo, b.articulo))
}

function normalizeProducto(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

const STOCK_BAJO_THRESHOLD = 5

const agregarSchema = z.object({
  articulo: z.string().min(2, 'Mínimo 2 caracteres').max(150),
  unidadesPorCaja: z.string().min(1, 'Requerido').refine((v) => Number.isInteger(Number(v)) && Number(v) > 0, 'Debe ser entero positivo'),
  cantidadCajas: z.string().min(1, 'Requerido').refine((v) => Number.isInteger(Number(v)) && Number(v) >= 0, 'Debe ser entero positivo o cero'),
})

type AgregarFormData = z.infer<typeof agregarSchema>

function AgregarFrascoModal({ open, onOpenChange }: { open: boolean; onOpenChange: (next: boolean) => void }) {
  const [serverError, setServerError] = useState<string | null>(null)
  const createMutation = useCreateFrasco()
  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<AgregarFormData>({
    resolver: zodResolver(agregarSchema),
    defaultValues: { articulo: '', unidadesPorCaja: '', cantidadCajas: '' },
  })
  const unidades = Number(useWatch({ control, name: 'unidadesPorCaja' })) || 0
  const cajas = Number(useWatch({ control, name: 'cantidadCajas' })) || 0
  const totalPreview = unidades * cajas

  async function onSubmit(data: AgregarFormData) {
    setServerError(null)
    try {
      const frasco = await createMutation.mutateAsync({ articulo: data.articulo, unidadesPorCaja: Number(data.unidadesPorCaja), cantidadCajas: Number(data.cantidadCajas) })
      if (frasco.cantidadCajas < STOCK_BAJO_THRESHOLD) toast.warning(`"${frasco.articulo}" quedó con stock bajo (${frasco.cantidadCajas} cajas).`)
      else toast.success(`Frasco "${frasco.articulo}" agregado.`)
      reset(); onOpenChange(false)
    } catch (err) { setServerError(err instanceof ApiError ? err.message : 'Error al guardar') }
  }
  function handleOpenChange(next: boolean) { if (!next) { reset(); setServerError(null) }; onOpenChange(next) }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Agregar frasco</DialogTitle><DialogDescription>Ingresá el artículo, unidades por caja y cantidad de cajas.</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="agregar-frasco-articulo" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Artículo</label>
            <input id="agregar-frasco-articulo" {...register('articulo')} type="text" placeholder="Ej: DORADO 250 ML" className="input-field" autoFocus />
            {errors.articulo && <p className="font-body text-error text-xs">{errors.articulo.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="agregar-frasco-unidades" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Unidades / Caja</label>
              <input id="agregar-frasco-unidades" {...register('unidadesPorCaja')} type="number" min="1" placeholder="0" className="input-field" />
              {errors.unidadesPorCaja && <p className="font-body text-error text-xs">{errors.unidadesPorCaja.message}</p>}
            </div>
            <div className="space-y-1">
              <label htmlFor="agregar-frasco-cajas" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Cajas</label>
              <input id="agregar-frasco-cajas" {...register('cantidadCajas')} type="number" min="0" placeholder="0" className="input-field" />
              {errors.cantidadCajas && <p className="font-body text-error text-xs">{errors.cantidadCajas.message}</p>}
            </div>
          </div>
          {totalPreview > 0 && <p className="font-body text-on-surface-variant text-xs">Total: <span className="text-on-surface font-medium tabular-nums">{totalPreview.toLocaleString()} unidades</span></p>}
          {serverError && <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">{serverError}</div>}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1 py-2.5 text-sm">{createMutation.isPending ? 'Guardando...' : 'Guardar'}</button>
            <DialogClose asChild><button type="button" className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-container-high hover:bg-surface-bright transition-colors">Cancelar</button></DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const editarSchema = z.object({
  articulo: z.string().min(2, 'Mínimo 2 caracteres').max(150),
  unidadesPorCaja: z.string().min(1, 'Requerido').refine((v) => Number.isInteger(Number(v)) && Number(v) > 0, 'Entero positivo'),
  cantidadCajas: z.string().min(1, 'Requerido').refine((v) => Number.isInteger(Number(v)) && Number(v) >= 0, 'Entero positivo o cero'),
})

type EditarFormData = z.infer<typeof editarSchema>

function EditarFrascoModal({ frasco, onClose }: { frasco: Frasco; onClose: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null)
  const updateMutation = useUpdateFrasco()
  const { register, handleSubmit, control, formState: { errors } } = useForm<EditarFormData>({
    resolver: zodResolver(editarSchema),
    defaultValues: { articulo: frasco.articulo, unidadesPorCaja: String(frasco.unidadesPorCaja), cantidadCajas: String(frasco.cantidadCajas) },
  })
  const unidades = Number(useWatch({ control, name: 'unidadesPorCaja' })) || 0
  const cajas = Number(useWatch({ control, name: 'cantidadCajas' })) || 0
  const totalPreview = unidades * cajas

  async function onSubmit(data: EditarFormData) {
    setServerError(null)
    try {
      const updated = await updateMutation.mutateAsync({ id: frasco.id, articulo: data.articulo, unidadesPorCaja: Number(data.unidadesPorCaja), cantidadCajas: Number(data.cantidadCajas) })
      if (updated.cantidadCajas < STOCK_BAJO_THRESHOLD) toast.warning(`"${updated.articulo}" quedó con stock bajo (${updated.cantidadCajas} cajas).`)
      else toast.info(`Frasco "${updated.articulo}" actualizado.`)
      onClose()
    } catch (err) { setServerError(err instanceof ApiError ? err.message : 'Error al guardar') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar frasco</DialogTitle><DialogDescription>Modificá el artículo, unidades por caja y/o cantidad de cajas.</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-1"><label htmlFor="editar-frasco-articulo" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Artículo</label><input id="editar-frasco-articulo" {...register('articulo')} type="text" className="input-field" autoFocus />{errors.articulo && <p className="font-body text-error text-xs">{errors.articulo.message}</p>}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><label htmlFor="editar-frasco-unidades" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Unidades / Caja</label><input id="editar-frasco-unidades" {...register('unidadesPorCaja')} type="number" min="1" className="input-field" />{errors.unidadesPorCaja && <p className="font-body text-error text-xs">{errors.unidadesPorCaja.message}</p>}</div>
            <div className="space-y-1"><label htmlFor="editar-frasco-cajas" className="font-body text-on-surface-variant text-xs uppercase tracking-widest font-medium">Cajas</label><input id="editar-frasco-cajas" {...register('cantidadCajas')} type="number" min="0" className="input-field" />{errors.cantidadCajas && <p className="font-body text-error text-xs">{errors.cantidadCajas.message}</p>}</div>
          </div>
          {totalPreview > 0 && <p className="font-body text-on-surface-variant text-xs">Total: <span className="text-on-surface font-medium tabular-nums">{totalPreview.toLocaleString()} unidades</span></p>}
          {serverError && <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">{serverError}</div>}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={updateMutation.isPending} className="btn-primary flex-1 py-2.5 text-sm">{updateMutation.isPending ? 'Guardando...' : 'Guardar'}</button>
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-container-high hover:bg-surface-bright transition-colors">Cancelar</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CajasCell({ frasco }: { frasco: Frasco }) {
  const updateMutation = useUpdateFrasco()
  return (
    <InlineNumberEditor value={frasco.cantidadCajas} label="Cajas" onSave={async (nextValue) => {
      const updated = await updateMutation.mutateAsync({ id: frasco.id, cantidadCajas: nextValue })
      if (updated.cantidadCajas < STOCK_BAJO_THRESHOLD) toast.warning(`"${updated.articulo}" quedó con stock bajo (${updated.cantidadCajas} cajas).`)
      else toast.info(`Stock de cajas para "${updated.articulo}" actualizado.`)
    }} />
  )
}

export default function FrascosPage() {
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.apps?.['deposito']?.rol === 'encargado'
  const [searchParams] = useSearchParams()
  const { data: frascos = [], isLoading, error } = useFrascos()
  const deleteMutation = useDeleteFrasco()
  const [editingFrasco, setEditingFrasco] = useState<Frasco | null>(null)
  const [catalogMap, setCatalogMap] = useState<Record<string, string>>({})
  const [agregarOpen, setAgregarOpen] = useState(false)

  useEffect(() => {
    fetchCatalogoProductos('frasco').then((productos) => { setCatalogMap(Object.fromEntries(productos.map((p) => [p.id, p.nombreCompleto]))) }).catch(() => {})
  }, [])

  const getDisplayName = useCallback((frasco: Frasco): string => frasco.productoId ? (catalogMap[frasco.productoId] ?? frasco.articulo) : frasco.articulo, [catalogMap])

  const productoFiltro = searchParams.get('producto') ?? ''
  const sortedFrascos = useMemo(() => sortFrascos(frascos), [frascos])
  const filteredFrascos = useMemo(() => {
    if (!productoFiltro) return sortedFrascos
    const target = normalizeProducto(productoFiltro)
    return sortedFrascos.filter((f) => normalizeProducto(getDisplayName(f)) === target)
  }, [sortedFrascos, productoFiltro, getDisplayName])

  async function handleDelete(id: string) {
    try {
      await deleteMutation.mutateAsync(id)
      const frasco = frascos.find((f) => f.id === id)
      toast.success(frasco ? `Frasco "${frasco.articulo}" eliminado.` : 'Frasco eliminado.')
    } catch { toast.error('No se pudo eliminar el frasco.') }
  }

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message={error instanceof ApiError ? error.message : 'No se pudo cargar los frascos'} />

  const totalCajas = frascos.reduce((s, f) => s + f.cantidadCajas, 0)
  const stockBajoCount = frascos.filter((f) => f.cantidadCajas < STOCK_BAJO_THRESHOLD).length

  return (
    <div className="space-y-5">
      <PageHeader title="FRASCOS" stats={[
        { label: 'artículos', value: frascos.length },
        { label: 'cajas', value: totalCajas.toLocaleString() },
        { label: 'stock bajo', value: stockBajoCount, warning: stockBajoCount > 0 },
      ]} primaryAction={isEncargado ? { label: 'Agregar frasco', onClick: () => setAgregarOpen(true), icon: <Plus size={14} strokeWidth={2} /> } : undefined} />

      {isEncargado && <AgregarFrascoModal open={agregarOpen} onOpenChange={setAgregarOpen} />}
      {editingFrasco && <EditarFrascoModal frasco={editingFrasco} onClose={() => setEditingFrasco(null)} />}

      {filteredFrascos.length === 0 ? <EmptyState message={productoFiltro ? 'No se encontró ese frasco en inventario.' : 'No hay frascos cargados.'} />
      : (
        <>
          <div className="hidden md:block bg-surface-container-low rounded overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>Artículo</TableHead><TableHead className="w-32 text-right">Unid/Caja</TableHead><TableHead className="w-32 text-right">Cajas</TableHead><TableHead className="w-36 text-right">Total uds</TableHead>{isEncargado && <TableHead className="w-24 text-right">Acciones</TableHead>}</TableRow></TableHeader>
              <TableBody>
                {filteredFrascos.map((frasco) => (
                  <TableRow key={frasco.id} className={productoFiltro ? 'bg-primary/5' : undefined}>
                    <TableCell className="font-body text-on-surface">{getDisplayName(frasco)}</TableCell>
                    <TableCell className="text-right"><span className="font-body text-on-surface-variant tabular-nums text-sm">{frasco.unidadesPorCaja}</span></TableCell>
                    <TableCell className="text-right">{isEncargado ? <div className="flex justify-end"><CajasCell frasco={frasco} /></div> : <span className="font-body text-on-surface tabular-nums">{frasco.cantidadCajas}</span>}</TableCell>
                    <TableCell className="text-right"><span className="font-body text-on-surface font-medium tabular-nums">{frasco.total.toLocaleString()}</span></TableCell>
                    {isEncargado && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => setEditingFrasco(frasco)} className="text-on-surface-variant hover:text-on-surface transition-colors" title="Editar"><Pencil size={14} strokeWidth={1.5} /></button>
                          <button type="button" onClick={() => handleDelete(frasco.id)} disabled={deleteMutation.isPending} className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-40" title="Eliminar"><Trash2 size={14} strokeWidth={1.5} /></button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden space-y-2">
            {filteredFrascos.map((frasco) => (
              <div key={frasco.id} className={`bg-surface-container-low rounded px-4 py-3 flex items-center justify-between gap-3 ${productoFiltro ? 'ring-1 ring-primary/30' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-on-surface text-sm truncate">{getDisplayName(frasco)}</p>
                  <p className="font-body text-on-surface-variant text-xs mt-0.5 tabular-nums">{frasco.unidadesPorCaja} uds/caja · {frasco.cantidadCajas} cajas · <span className="text-on-surface font-medium">{frasco.total.toLocaleString()} total</span></p>
                </div>
                {isEncargado && (
                  <div className="flex items-center gap-3 shrink-0">
<CajasCell frasco={frasco} />
                    <button type="button" onClick={() => setEditingFrasco(frasco)} className="text-on-surface-variant hover:text-on-surface transition-colors"><Pencil size={14} strokeWidth={1.5} /></button>
                    <button type="button" onClick={() => handleDelete(frasco.id)} disabled={deleteMutation.isPending} className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-40"><Trash2 size={14} strokeWidth={1.5} /></button>
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
