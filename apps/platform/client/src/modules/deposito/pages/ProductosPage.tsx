import { useState, useRef, useMemo } from 'react'
import { Search, Plus, Upload, Trash2, Edit, Play, RotateCcw, Square, AlertTriangle, Check, FileSpreadsheet, X, Download } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '@/stores/auth-store'
import { ApiError } from '../lib/api'
import {
  useProductos,
  useCreateProducto,
  useUpdateProducto,
  useDeleteProducto,
  useActivarProducto,
  useReactivarProducto,
  useDesactivarProducto,
  useImportDryRun,
  useImportConfirmar,
  type Producto,
  type EstadoProducto,
  type CategoriaProducto,
  type ProductoFormData,
  type ImportRow,
} from '../queries/use-productos'
import { toast } from '../lib/toast'
import { EmptyState, ErrorState, LoadingState } from '../components/inventory-shared/inventory-states'
import { EstadoProductoChip } from '../components/EstadoProductoChip'
import { MercadoChip } from '../components/inventory-shared/mercado-chip'
import { MERCADOS, type Mercado } from '../components/inventory-shared/mercados'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/Dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table'

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIA_LABELS: Record<CategoriaProducto, string> = {
  droga:   'MP',
  estuche: 'Estuche',
  etiqueta: 'Etiqueta',
  frasco:  'Frasco',
}

const ACCEPTED_EXTENSIONS = '.xls,.xlsx,.csv'
const ACCEPTED_EXTENSIONS_LIST = ['xls', 'xlsx', 'csv']
const mercadoSchema = z.enum(['argentina', 'colombia', 'mexico', 'ecuador', 'bolivia', 'paraguay', 'VENEZUELA', 'no_exportable'])

// ─── Schemas ──────────────────────────────────────────────────────────────────

const formSchema = z.object({
  nombreBase: z.string().min(1, 'El nombre es requerido').max(200),
  codigo: z.string().max(50).optional().or(z.literal('')),
  categoria: z.enum(['droga', 'estuche', 'etiqueta', 'frasco']),
  presentacion: z.string().optional().or(z.literal('')),
  mercadosHabilitados: z.array(mercadoSchema).optional(),
})

type FormValues = z.infer<typeof formSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeFormData(values: FormValues): ProductoFormData {
  const requiresPresentacion = values.categoria !== 'droga'
  const requiresMercados = values.categoria === 'etiqueta' || values.categoria === 'estuche'

  const data: ProductoFormData = {
    nombreBase: values.nombreBase.toUpperCase().trim(),
    nombreCompleto: values.nombreBase.trim().toUpperCase(),
    categoria: values.categoria,
    codigo: values.codigo?.trim().toUpperCase() || undefined,
  }

  if (requiresPresentacion) {
    data.presentacion = values.presentacion ? Number(values.presentacion) : null
  }

  if (requiresMercados) {
    data.mercadosHabilitados = values.mercadosHabilitados ?? []
  }

  return data
}

const CODE_REQUIRED_CATEGORIES = ['etiqueta', 'estuche']
const CODE_PREFIX: Record<string, string> = { etiqueta: 'IGET', estuche: 'IGES' }

function isCodigoRequired(categoria: string): boolean {
  return CODE_REQUIRED_CATEGORIES.includes(categoria)
}

function validateForm(values: FormValues): string | null {
  const codeRequired = isCodigoRequired(values.categoria)
  const codigo = values.codigo?.trim()

  if (codeRequired && !codigo) return 'El código es obligatorio para etiquetas y estuches'

  if (codeRequired && codigo) {
    const prefix = CODE_PREFIX[values.categoria]
    const normalized = codigo.toUpperCase()
    if (!normalized.startsWith(prefix)) {
      return `El código de ${values.categoria === 'etiqueta' ? 'etiqueta' : 'estuche'} debe comenzar con ${prefix}`
    }
  }

  if (values.categoria === 'etiqueta' || values.categoria === 'estuche') {
    if (!values.mercadosHabilitados || values.mercadosHabilitados.length === 0) {
      return 'Debe seleccionar al menos un mercado'
    }
  }
  return null
}

// ─── Create Dialog ────────────────────────────────────────────────────────────

function CreateProductoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [serverError, setServerError] = useState<string | null>(null)
  const createMutation = useCreateProducto()

  const { register, handleSubmit, control, setValue, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { nombreBase: '', codigo: '', categoria: 'droga', presentacion: '', mercadosHabilitados: [] },
  })

  const categoria = useWatch({ control, name: 'categoria' })
  const selectedMercados = useWatch({ control, name: 'mercadosHabilitados' }) ?? []
  const requiresMercados = categoria === 'etiqueta' || categoria === 'estuche'
  const requiresPresentacion = categoria !== 'droga'

  async function onSubmit(values: FormValues) {
    setServerError(null)
    const validationError = validateForm(values)
    if (validationError) { setServerError(validationError); return }

    try {
      await createMutation.mutateAsync(normalizeFormData(values))
      toast.success('Producto creado correctamente.')
      reset()
      onOpenChange(false)
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al crear el producto')
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) { reset(); setServerError(null) }
    onOpenChange(next)
  }

  function toggleMercado(mercado: Mercado) {
    const current = selectedMercados.includes(mercado)
      ? selectedMercados.filter((m) => m !== mercado)
      : [...selectedMercados, mercado]
    setValue('mercadosHabilitados', current)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo producto</DialogTitle>
          <DialogDescription>Completá los datos del producto en catálogo.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {/* A. Categoría */}
          <div className="space-y-1">
            <label className="label-field">¿Qué es el producto?</label>
            <div className="flex flex-wrap gap-2">
              {(['droga', 'estuche', 'etiqueta', 'frasco'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setValue('categoria', cat)
                    if (cat !== 'estuche' && cat !== 'etiqueta') setValue('mercadosHabilitados', [])
                  }}
                  className={`px-3 py-1.5 rounded font-body text-xs transition-colors ${
                    categoria === cat
                      ? 'bg-primary-container/20 text-primary'
                      : 'bg-surface-container-high text-on-surface-variant'
                  }`}
                >
                  {CATEGORIA_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          {/* B. Nombre base */}
          <div className="space-y-1">
            <label htmlFor="create-nombre" className="label-field">Nombre</label>
            <input id="create-nombre" {...register('nombreBase')} type="text" placeholder="Ej: AMANTINA" className="input-field" autoFocus />
            {errors.nombreBase && <p className="field-error">{errors.nombreBase.message}</p>}
          </div>

          {/* C. Presentación (conditional) */}
          {requiresPresentacion && (
            <div className="space-y-1">
              <label htmlFor="create-presentacion" className="label-field">
                Presentación {categoria === 'frasco' ? '(ml)' : ''}
              </label>
              <input id="create-presentacion" {...register('presentacion')} type="number" min="1" placeholder="Ej: 250" className="input-field" />
            </div>
          )}

          {/* D. Mercados (conditional: etiqueta/estuche) */}
          {requiresMercados && (
            <div className="space-y-2">
              <label className="label-field">País / mercados habilitados</label>
              <div className="flex flex-wrap gap-2">
                {MERCADOS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleMercado(value)}
                    className={`px-3 py-1.5 rounded font-body text-xs transition-colors ${
                      selectedMercados.includes(value)
                        ? 'bg-primary-container/20 text-primary'
                        : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {errors.mercadosHabilitados && (
                <p className="field-error">{errors.mercadosHabilitados.message}</p>
              )}
            </div>
          )}

          {/* E. Código */}
          <div className="space-y-1">
            <label htmlFor="create-codigo" className="label-field">
              Código
              {requiresMercados ? (
                <span className="text-error/80 text-xs ml-1">(requiere prefijo {CODE_PREFIX[categoria]})</span>
              ) : (
                <span className="text-on-surface-variant/60 text-xs ml-1">(opcional)</span>
              )}
            </label>
            <input
              id="create-codigo"
              {...register('codigo')}
              type="text"
              placeholder={requiresMercados ? `Ej: ${CODE_PREFIX[categoria]}001` : 'Ej: AMT-001'}
              className="input-field"
            />
          </div>

          {serverError && <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">{serverError}</div>}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1 py-2.5 text-sm">
              {createMutation.isPending ? 'Creando...' : 'Crear producto'}
            </button>
            <button type="button" onClick={() => handleOpenChange(false)} className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-container-high hover:bg-surface-bright transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit Dialog ──────────────────────────────────────────────────────────────

function EditProductoDialog({ producto, onClose }: { producto: Producto; onClose: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null)
  const updateMutation = useUpdateProducto()
  const isPending = producto.estado === 'PENDIENTE_REVISION'
  const canEditCodigo = isPending || (producto.estado === 'INACTIVO' && !producto.codigo)
  const canEditCategoria = isPending
  const canEditMercados = isPending

  const { register, handleSubmit, control, setValue, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombreBase: producto.nombreBase,
      codigo: producto.codigo ?? '',
      categoria: producto.categoria,
      presentacion: producto.presentacion?.toString() ?? '',
      mercadosHabilitados: producto.mercadosHabilitados ?? [],
    },
  })

  const categoria = useWatch({ control, name: 'categoria' })
  const selectedMercados = useWatch({ control, name: 'mercadosHabilitados' }) ?? []
  const requiresMercados = (categoria === 'etiqueta' || categoria === 'estuche') && canEditMercados
  const requiresPresentacion = categoria !== 'droga'

  async function onSubmit(values: FormValues) {
    setServerError(null)
    if (requiresMercados && (!values.mercadosHabilitados || values.mercadosHabilitados.length === 0)) {
      setServerError('Debe seleccionar al menos un mercado')
      return
    }
    if (canEditCodigo && isCodigoRequired(categoria)) {
      const codigoTrimmed = values.codigo?.trim()
      if (!codigoTrimmed) {
        setServerError('El código es obligatorio para etiquetas y estuches')
        return
      }
      const prefix = CODE_PREFIX[categoria]
      if (!codigoTrimmed.toUpperCase().startsWith(prefix)) {
        setServerError(`El código de ${categoria === 'etiqueta' ? 'etiqueta' : 'estuche'} debe comenzar con ${prefix}`)
        return
      }
    }

    try {
      const payload: Partial<ProductoFormData> = {
        nombreBase: values.nombreBase.toUpperCase().trim(),
        nombreCompleto: values.nombreBase.trim().toUpperCase(),
      }
      if (canEditCodigo) payload.codigo = values.codigo?.trim().toUpperCase() || undefined
      if (canEditCategoria) payload.categoria = values.categoria
      if (requiresPresentacion) payload.presentacion = values.presentacion ? Number(values.presentacion) : null
      if (canEditMercados && requiresMercados) payload.mercadosHabilitados = values.mercadosHabilitados ?? []

      await updateMutation.mutateAsync({ id: producto.id, ...payload })
      toast.success('Producto actualizado.')
      onClose()
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error al actualizar')
    }
  }

  function toggleMercado(mercado: Mercado) {
    const current = selectedMercados.includes(mercado)
      ? selectedMercados.filter((m) => m !== mercado)
      : [...selectedMercados, mercado]
    setValue('mercadosHabilitados', current)
  }

  return (
    <Dialog open={true} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar producto</DialogTitle>
          <DialogDescription>Actualizá los datos del producto.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {/* A. Categoría */}
          <div className="space-y-1">
            <label className="label-field">¿Qué es el producto?</label>
            {canEditCategoria ? (
              <select {...register('categoria')} className="input-field">
                {Object.entries(CATEGORIA_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            ) : (
              <p className="font-body text-sm text-on-surface">{CATEGORIA_LABELS[producto.categoria]}</p>
            )}
          </div>

          {/* B. Nombre base */}
          <div className="space-y-1">
            <label htmlFor="edit-nombre" className="label-field">Nombre</label>
            <input id="edit-nombre" {...register('nombreBase')} type="text" className="input-field" />
            {errors.nombreBase && <p className="field-error">{errors.nombreBase.message}</p>}
          </div>

          {/* C. Presentación */}
          {requiresPresentacion && (
            <div className="space-y-1">
              <label htmlFor="edit-presentacion" className="label-field">Presentación</label>
              <input id="edit-presentacion" {...register('presentacion')} type="number" min="1" className="input-field" />
            </div>
          )}

          {/* D. Mercados (conditional) */}
          {requiresMercados && (
            <div className="space-y-2">
              <label className="label-field">País / mercados habilitados</label>
              <div className="flex flex-wrap gap-2">
                {MERCADOS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => canEditMercados && toggleMercado(value)}
                    className={`px-3 py-1.5 rounded font-body text-xs transition-colors ${
                      !canEditMercados ? 'opacity-50 cursor-not-allowed' :
                      selectedMercados.includes(value)
                        ? 'bg-primary-container/20 text-primary'
                        : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* E. Código */}
          <div className="space-y-1">
            <label htmlFor="edit-codigo" className="label-field">
              Código
              {canEditCodigo && (
                isCodigoRequired(categoria)
                  ? <span className="text-error/80 text-xs ml-1">(requiere prefijo {CODE_PREFIX[categoria]})</span>
                  : <span className="text-on-surface-variant/60 text-xs ml-1">(opcional)</span>
              )}
            </label>
            <input
              id="edit-codigo"
              {...register('codigo')}
              type="text"
              className="input-field"
              disabled={!canEditCodigo}
              style={!canEditCodigo ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            />
            {!canEditCodigo && <p className="text-on-surface-variant/60 text-xs">No se puede modificar en estado {producto.estado === 'ACTIVO' ? 'Activo' : 'Inactivo'}.</p>}
          </div>

          {serverError && <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">{serverError}</div>}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={updateMutation.isPending} className="btn-primary flex-1 py-2.5 text-sm">
              {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-container-high hover:bg-surface-bright transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Confirm Action Dialog ────────────────────────────────────────────────────

function ConfirmActionDialog({
  open, onOpenChange, title, description, confirmLabel, loading, onConfirm, danger,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description: string
  confirmLabel: string; loading: boolean; onConfirm: () => void; danger?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {danger && <AlertTriangle size={18} className="text-error" />}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 text-sm font-heading font-semibold rounded transition-colors ${
              danger
                ? 'bg-error text-white hover:opacity-90'
                : 'btn-primary flex-1 py-2.5 text-sm'
            }`}
          >
            {loading ? 'Procesando...' : confirmLabel}
          </button>
          <button type="button" onClick={() => onOpenChange(false)} className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-container-high hover:bg-surface-bright transition-colors">
            Cancelar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Import Dialog (2-step) ────────────────────────────────────────────────────

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<{ filas: ImportRow[]; validas: number; invalidas: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [rowFilter, setRowFilter] = useState<'todas' | 'validas' | 'invalidas'>('todas')
  const dryRunMutation = useImportDryRun()
  const confirmMutation = useImportConfirmar()

  function resetState() {
    setFile(null)
    setImportResult(null)
    setError(null)
    setDragOver(false)
    setRowFilter('todas')
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleOpenChange(next: boolean) {
    if (!next) { resetState(); onOpenChange(false) }
  }

  // Single entry point for the file selector AND the drop zone: both run the
  // same extension gate and the same dry-run flow.
  function handleFile(f: File | undefined | null) {
    if (!f) return

    const ext = f.name.split('.').pop()?.toLowerCase()
    if (!ACCEPTED_EXTENSIONS_LIST.includes(ext ?? '')) {
      setError('Formato no soportado. Use archivos .xls, .xlsx o .csv.')
      setFile(null)
      return
    }

    if (f.size === 0) {
      setError('El archivo está vacío')
      setFile(null)
      return
    }

    setFile(f)
    setError(null)
    setImportResult(null)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFile(e.target.files?.[0])
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  function handleRemoveFile() {
    setFile(null)
    setImportResult(null)
    setError(null)
    setRowFilter('todas')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDryRun() {
    if (!file) return
    setError(null)
    try {
      const result = await dryRunMutation.mutateAsync(file)
      setImportResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar el archivo')
    }
  }

  async function handleConfirm() {
    if (!file) return
    setError(null)
    try {
      const result = await confirmMutation.mutateAsync(file)
      toast.success(`Importación completada: ${result.importadas} productos creados${result.omitidas > 0 ? `, ${result.omitidas} filas omitidas` : ''}.`)
      resetState()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar la importación')
    }
  }

  const canPreview = file && !dryRunMutation.isPending && !importResult

  const filteredRows = useMemo(() => {
    if (!importResult) return []
    if (rowFilter === 'validas') return importResult.filas.filter((r) => r.valido)
    if (rowFilter === 'invalidas') return importResult.filas.filter((r) => !r.valido)
    return importResult.filas
  }, [importResult, rowFilter])

  const invalidReason = (row: ImportRow) => Object.values(row.errores ?? {}).flat().join(', ')

  const hasMixedRows = !!importResult && importResult.validas > 0 && importResult.invalidas > 0
  const hasOnlyInvalidRows = !!importResult && importResult.validas === 0 && importResult.invalidas > 0
  const totalRows = importResult ? importResult.validas + importResult.invalidas : 0

  return (
    <Dialog large open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex flex-col h-full flex-1 min-h-0">
        {!importResult ? (
          <div className="flex flex-col h-full">
            <div className="shrink-0 mb-4">
              <DialogHeader>
                <DialogTitle>
                  <FileSpreadsheet size={18} />
                  Importar productos
                </DialogTitle>
                <DialogDescription>Subí un archivo .xls, .xlsx o .csv para importar productos al catálogo.</DialogDescription>
              </DialogHeader>
            </div>

            <div className="space-y-2 shrink-0">
              <label htmlFor="import-file" className="label-field">Archivo</label>
              <div className="flex items-center gap-3">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() }
                  }}
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`flex-1 rounded-lg border-2 border-dashed px-4 py-3 text-center cursor-pointer transition-colors ${
                    dragOver
                      ? 'border-primary bg-primary-container/10 text-primary'
                      : 'border-outline-variant text-on-surface-variant hover:border-primary/50'
                  }`}
                >
                  {file ? (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <FileSpreadsheet size={16} />
                      <span className="font-mono text-sm text-on-surface">{file.name}</span>
                      <span className="text-xs text-on-surface-variant">({file.name.split('.').pop()?.toUpperCase()})</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleRemoveFile() }}
                        className="ml-2 inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-error bg-error/10 hover:bg-error/20 transition-colors"
                      >
                        <X size={12} />
                        Quitar
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5">
                      <Upload size={20} />
                      <p className="font-body text-sm">Arrastrá un archivo aquí o hacé clic para seleccionar</p>
                    </div>
                  )}
                  <input
                    id="import-file"
                    ref={fileRef}
                    type="file"
                    accept={ACCEPTED_EXTENSIONS}
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </div>
                {canPreview && (
                  <button type="button" onClick={handleDryRun} disabled={dryRunMutation.isPending} className="btn-primary shrink-0 py-2 px-4 text-sm">
                    {dryRunMutation.isPending ? 'Analizando...' : 'Previsualizar'}
                  </button>
                )}
              </div>
              <p className="text-on-surface-variant/60 text-xs">Formatos aceptados: .xls, .xlsx, .csv</p>
            </div>

            {error && (
              <div className="shrink-0 mt-4 bg-error/10 text-error font-body text-sm px-4 py-3 rounded flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {dryRunMutation.isPending && (
              <div className="shrink-0 mt-4 flex items-center gap-2 text-on-surface-variant text-sm">
                <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                Analizando archivo...
              </div>
            )}

            <div className="flex-1" />

            {!canPreview && !dryRunMutation.isPending && (
              <div className="shrink-0 flex gap-3 pt-4">
                <button type="button" onClick={() => handleOpenChange(false)} className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-container-high hover:bg-surface-bright transition-colors">
                  Cerrar
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col h-full flex-1 min-h-0">
            {/* COMPACT HEADER */}
            <div className="shrink-0 flex items-center justify-between pb-3 border-b border-outline-variant/20 mb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} />
                <h2 className="font-heading font-semibold text-lg text-on-surface">Importar productos</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-on-surface-variant">{file?.name}</span>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-error bg-error/10 hover:bg-error/20 transition-colors"
                >
                  <X size={12} />
                  Quitar
                </button>
              </div>
            </div>

            {/* ERROR GENERAL DE RED */}
            {error && (
              <div className="shrink-0 mb-3 bg-error/10 text-error font-body text-sm px-4 py-3 rounded flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* COMPACT SUMMARY & FILTERS */}
            <div className="shrink-0 flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                <span className="font-medium text-success">{importResult.validas} válidas</span>
                <span>·</span>
                <span className="font-medium text-error">{importResult.invalidas} inválidas</span>
                <span>·</span>
                <span className="font-medium">{totalRows} total</span>
              </div>

              <div role="group" aria-label="Filtrar filas" className="inline-flex rounded-lg border border-outline-variant/40 overflow-hidden">
                {(['todas', 'validas', 'invalidas'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setRowFilter(f)}
                    aria-pressed={rowFilter === f}
                    className={`px-3 py-1.5 font-heading text-xs font-semibold transition-colors ${
                      rowFilter === f
                        ? 'bg-primary-container/20 text-primary'
                        : 'bg-transparent text-on-surface-variant hover:bg-surface-variant/40'
                    }`}
                  >
                    {f === 'todas' ? 'Todas' : f === 'validas' ? 'Válidas' : 'Inválidas'}
                  </button>
                ))}
              </div>
            </div>

            {/* AVISOS CONTEXTUALES COMPACTOS */}
            {importResult.validas === 0 ? (
              <div className="shrink-0 mb-3 bg-error/10 text-error font-body text-sm px-3 py-2 rounded flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                <span>No hay filas válidas para importar. Corregí el archivo y volvé a intentarlo.</span>
              </div>
            ) : importResult.invalidas > 0 ? (
              <div className="shrink-0 mb-3 bg-warning/10 text-warning font-body text-sm px-3 py-2 rounded flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{importResult.invalidas} filas serán omitidas.</span>
              </div>
            ) : null}

            {/* TABLE */}
            <div className="flex-1 min-h-0 border border-outline-variant/20 rounded overflow-hidden flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <table className="w-full text-sm relative">
                  <thead className="bg-surface-container-low sticky top-0 z-10 shadow-sm">
                    <tr className="border-b border-outline-variant/10">
                      <th className="px-3 py-2 text-left font-body text-xs font-medium text-on-surface-variant uppercase whitespace-nowrap w-12">#</th>
                      <th className="px-3 py-2 text-left font-body text-xs font-medium text-on-surface-variant uppercase whitespace-nowrap min-w-[8rem]">Código</th>
                      <th className="px-3 py-2 text-left font-body text-xs font-medium text-on-surface-variant uppercase min-w-[16rem] w-[35%]">Nombre</th>
                      <th className="px-3 py-2 text-left font-body text-xs font-medium text-on-surface-variant uppercase whitespace-nowrap min-w-[6rem]">Categoría</th>
                      <th className="px-3 py-2 text-left font-body text-xs font-medium text-on-surface-variant uppercase whitespace-nowrap min-w-[6rem]">Estado</th>
                      <th className="px-3 py-2 text-left font-body text-xs font-medium text-on-surface-variant uppercase min-w-[16rem] w-[35%]">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.fila} className="border-b border-outline-variant/5 hover:bg-surface-variant/20 align-top">
                        <td className="px-3 py-2 font-mono text-xs text-on-surface-variant whitespace-nowrap">{row.fila}</td>
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                          {row.producto?.codigo ?? <span className="italic text-on-surface-variant">—</span>}
                        </td>
                        <td className="px-3 py-2 font-body text-sm break-words">
                          {row.producto?.nombreBase ?? <span className="italic text-on-surface-variant">—</span>}
                        </td>
                        <td className="px-3 py-2 font-body text-xs whitespace-nowrap">
                          {row.producto?.categoria
                            ? CATEGORIA_LABELS[row.producto.categoria] ?? row.producto.categoria
                            : <span className="italic text-on-surface-variant">—</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {row.valido ? (
                            <span className="inline-flex items-center gap-1 text-success"><Check size={12} /> Válida</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-error"><X size={12} /> Inválida</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-body text-sm break-words">
                          {row.valido ? (
                            <span className="text-on-surface-variant/60">—</span>
                          ) : (
                            <span className="text-error font-medium">{invalidReason(row) || 'Inválida'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredRows.length === 0 && (
                  <p className="px-4 py-6 text-center font-body text-sm text-on-surface-variant">
                    No hay filas para mostrar con el filtro actual.
                  </p>
                )}
              </div>
            </div>

            {/* FOOTER */}
            <div className="shrink-0 pt-4">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={confirmMutation.isPending || importResult.validas === 0}
                  className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {confirmMutation.isPending ? 'Importando...' : `Confirmar importación (${importResult.validas} productos)`}
                </button>
                <button type="button" onClick={() => handleOpenChange(false)} className="flex-1 py-2.5 text-sm font-heading font-semibold rounded text-on-surface-variant bg-surface-container-high hover:bg-surface-bright transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ProductosPage() {
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.apps?.['deposito']?.rol === 'encargado'

  const [searchQuery, setSearchQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingProducto, setEditingProducto] = useState<Producto | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ type: string; producto: Producto } | null>(null)
  const [categoriaFiltro, setCategoriaFiltro] = useState<CategoriaProducto | 'todos'>('todos')
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoProducto | 'todos'>('todos')

  const searchFilters = useMemo(() => {
    const filters: { buscar?: string; categoria?: CategoriaProducto; estado?: EstadoProducto } = {}
    if (searchQuery) filters.buscar = searchQuery
    if (categoriaFiltro !== 'todos') filters.categoria = categoriaFiltro
    if (estadoFiltro !== 'todos') filters.estado = estadoFiltro
    return Object.keys(filters).length > 0 ? filters : undefined
  }, [searchQuery, categoriaFiltro, estadoFiltro])
  const { data: productos = [], isLoading, isFetching, error } = useProductos(searchFilters)

  const deleteMutation = useDeleteProducto()
  const activarMutation = useActivarProducto()
  const reactivarMutation = useReactivarProducto()
  const desactivarMutation = useDesactivarProducto()

  // ─── Action handlers ──────────────────────────────────────────────────────

  async function handleActivar(p: Producto) {
    try {
      await activarMutation.mutateAsync(p.id)
      toast.success(`"${p.nombreBase}" activado.`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al activar')
    }
    setConfirmAction(null)
  }

  async function handleReactivar(p: Producto) {
    try {
      await reactivarMutation.mutateAsync(p.id)
      toast.success(`"${p.nombreBase}" reactivado.`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al reactivar')
    }
    setConfirmAction(null)
  }

  async function handleDesactivar(p: Producto) {
    try {
      await desactivarMutation.mutateAsync(p.id)
      toast.success(`"${p.nombreBase}" desactivado.`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al desactivar')
    }
    setConfirmAction(null)
  }

  async function handleEliminar(p: Producto) {
    try {
      await deleteMutation.mutateAsync(p.id)
      toast.success(`"${p.nombreBase}" eliminado.`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error('No se puede eliminar un producto activo')
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Error al eliminar')
      }
    }
    setConfirmAction(null)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading && !productos.length) return <LoadingState />
  if (error && !productos.length) return <ErrorState message={error instanceof ApiError ? error.message : 'No se pudo cargar el catálogo'} />

  const confirmDialog = confirmAction && (
    <ConfirmActionDialog
      open={true}
      onOpenChange={() => setConfirmAction(null)}
      title={
        confirmAction.type === 'activar' ? 'Activar producto' :
        confirmAction.type === 'reactivar' ? 'Reactivar producto' :
        confirmAction.type === 'desactivar' ? 'Desactivar producto' :
        'Eliminar producto'
      }
      description={
        confirmAction.type === 'eliminar'
          ? `¿Eliminar "${confirmAction.producto.nombreBase}"? Esta acción no se puede deshacer.`
          : confirmAction.type === 'desactivar'
          ? `¿Desactivar "${confirmAction.producto.nombreBase}"? El producto quedará inactivo.`
          : `¿${confirmAction.type === 'activar' ? 'Activar' : 'Reactivar'} "${confirmAction.producto.nombreBase}"?`
      }
      confirmLabel={
        confirmAction.type === 'activar' ? 'Activar' :
        confirmAction.type === 'reactivar' ? 'Reactivar' :
        confirmAction.type === 'desactivar' ? 'Desactivar' :
        'Eliminar'
      }
      loading={
        (confirmAction.type === 'activar' && activarMutation.isPending) ||
        (confirmAction.type === 'reactivar' && reactivarMutation.isPending) ||
        (confirmAction.type === 'desactivar' && desactivarMutation.isPending) ||
        (confirmAction.type === 'eliminar' && deleteMutation.isPending)
      }
      danger={confirmAction.type === 'eliminar'}
      onConfirm={() => {
        if (confirmAction.type === 'activar') handleActivar(confirmAction.producto)
        else if (confirmAction.type === 'reactivar') handleReactivar(confirmAction.producto)
        else if (confirmAction.type === 'desactivar') handleDesactivar(confirmAction.producto)
        else if (confirmAction.type === 'eliminar') handleEliminar(confirmAction.producto)
      }}
    />
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-lg">
        <div className="flex items-center gap-md">
          <h1 className="font-heading text-xl font-semibold text-on-surface tracking-tight">
            Productos
          </h1>
          <span className="bg-surface-variant text-on-surface-variant font-mono text-xs px-2 py-1 rounded-md border border-white/5">
            {productos.length} en catálogo
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative group">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por código o nombre..."
              className="w-56 bg-surface-container-high border border-outline-variant rounded-lg pl-10 pr-4 py-2 font-body text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
            />
          </div>

          <select
            aria-label="Filtrar por categoría"
            value={categoriaFiltro}
            onChange={(event) => setCategoriaFiltro(event.target.value as CategoriaProducto | 'todos')}
            className="bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 font-body text-sm text-on-surface"
          >
            <option value="todos">Todas las categorías</option>
            {Object.entries(CATEGORIA_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>

          <select
            aria-label="Filtrar por estado"
            value={estadoFiltro}
            onChange={(event) => setEstadoFiltro(event.target.value as EstadoProducto | 'todos')}
            className="bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 font-body text-sm text-on-surface"
          >
            <option value="todos">Todos los estados</option>
            <option value="PENDIENTE_REVISION">Pendiente</option>
            <option value="ACTIVO">Activo</option>
            <option value="INACTIVO">Inactivo</option>
          </select>

          {isEncargado && (
            <>
              <button type="button" onClick={() => setShowImport(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-heading font-semibold text-on-surface-variant bg-surface-container-high hover:bg-surface-bright transition-colors">
                <Upload size={14} />
                Importar
              </button>
              <button type="button" onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-sm">
                <Plus size={14} />
                Nuevo
              </button>
            </>
          )}
        </div>
      </header>

      {/* Content */}
      {productos.length === 0 ? (
        searchQuery ? (
          <div className="animate-fade-up flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 rounded-full bg-surface-variant flex items-center justify-center">
              <Search size={24} className="text-on-surface-variant" />
            </div>
            <p className="font-body text-base text-on-surface-variant">No se encontraron <strong className="text-on-surface">{searchQuery}</strong></p>
            <p className="font-body text-sm text-on-surface-variant/60">Probá con otro código o nombre</p>
          </div>
        ) : (
          <EmptyState message="No hay productos en el catálogo." />
        )
      ) : (
        <div className="bg-surface-container rounded-xl border border-outline-variant shadow-float overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Presentación</TableHead>
                  <TableHead>Mercados</TableHead>
                  {isEncargado && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {productos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell><EstadoProductoChip estado={p.estado} /></TableCell>
                    <TableCell>
                      <span className="font-body text-sm font-medium">{p.nombreBase}</span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {p.codigo ?? <span className="italic text-on-surface-variant">Código pendiente</span>}
                    </TableCell>
                    <TableCell>
                      <span className="font-body text-sm">{CATEGORIA_LABELS[p.categoria]}</span>
                    </TableCell>
                    <TableCell>
                      {p.presentacion != null
                        ? <span className="font-mono text-sm">{p.presentacion}</span>
                        : <span className="italic text-on-surface-variant">—</span>
                      }
                    </TableCell>
                    <TableCell>
                      {p.mercadosHabilitados.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {p.mercadosHabilitados.map((m) => (
                            <MercadoChip key={m} mercado={m as Mercado} />
                          ))}
                        </div>
                      ) : (
                        <span className="italic text-on-surface-variant">—</span>
                      )}
                    </TableCell>
                    {isEncargado && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {/* State actions */}
                          {p.estado === 'PENDIENTE_REVISION' && (
                            <button
                              type="button"
                              onClick={() => setConfirmAction({ type: 'activar', producto: p })}
                              title="Activar"
                              className="p-1.5 rounded text-primary hover:bg-primary-container/20 transition-colors"
                            >
                              <Play size={14} />
                            </button>
                          )}
                          {p.estado === 'INACTIVO' && (
                            <button
                              type="button"
                              onClick={() => setConfirmAction({ type: 'reactivar', producto: p })}
                              title="Reactivar"
                              className="p-1.5 rounded text-primary hover:bg-primary-container/20 transition-colors"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                          {p.estado === 'ACTIVO' && (
                            <button
                              type="button"
                              onClick={() => setConfirmAction({ type: 'desactivar', producto: p })}
                              title="Desactivar"
                              className="p-1.5 rounded text-warning hover:bg-warning-container/20 transition-colors"
                            >
                              <Square size={14} />
                            </button>
                          )}

                          {/* Edit */}
                          <button
                            type="button"
                            onClick={() => setEditingProducto(p)}
                            title="Editar"
                            className="p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-primary-container/20 transition-colors"
                          >
                            <Edit size={14} />
                          </button>

                          {/* Delete (only PENDIENTE_REVISION) */}
                          {p.estado === 'PENDIENTE_REVISION' && (
                            <button
                              type="button"
                              onClick={() => setConfirmAction({ type: 'eliminar', producto: p })}
                              title="Eliminar"
                              className="p-1.5 rounded text-on-surface-variant hover:text-error hover:bg-error-container/10 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <CreateProductoDialog open={showCreate} onOpenChange={setShowCreate} />
      {editingProducto && <EditProductoDialog producto={editingProducto} onClose={() => setEditingProducto(null)} />}
      <ImportDialog open={showImport} onOpenChange={setShowImport} />
      {confirmDialog}
    </div>
  )
}
