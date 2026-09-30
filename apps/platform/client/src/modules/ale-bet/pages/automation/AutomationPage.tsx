import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '@/lib/toast'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useAutomationAliases, useConfirmDraft, useCreateDraft, useDeleteAutomationAlias, useDraft, useUpdateDraft } from '../../queries/use-automation'
import { useClientes, useCreateCliente, useProductos } from '../../queries'
import { AutomationQuantityEditor } from '../../components/AutomationQuantityEditor'
import type { Cliente } from '../../lib/api'
import { clearAutomationWork, persistAutomationWork, readAutomationWork } from './automation-work-storage'


interface ConfirmDialogProps {
  open: boolean
  titulo: string
  mensaje: React.ReactNode
  accion: string
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}

function ConfirmDialog({ open, titulo, mensaje, accion, loading, onCancel, onConfirm }: ConfirmDialogProps) {
  if (!open) return null
  return (
    <div
      data-testid="confirm-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-backdrop-in bg-black/50"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container-low p-5 animate-dialog-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[16px] font-bold text-on-surface">{titulo}</h2>
        <div className="mt-2 font-body text-[13px] leading-relaxed text-on-surface-variant">{mensaje}</div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} loading={loading}>
            {accion}
          </Button>
        </div>
      </div>
    </div>
  )
}
function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isDiscardedLine(line: any): boolean {
  return line.lineState === 'DISCARDED'
}

function isValidIncludedLine(line: any): boolean {
  return !isDiscardedLine(line) && (line.lineState === 'VALID' || (
    !line.lineState && Boolean(line.productCandidate) && !line.requiresReview && line.warnings.length === 0 && Boolean(line.quantity?.totalUnits)
  ))
}

function isNeedsReviewLine(line: any): boolean {
  return !isDiscardedLine(line) && !isValidIncludedLine(line)
}

function reviewWarningText(warning: string): string {
  if (warning === 'PRESENTATION_REQUIRED') return 'Elegí la presentación antes de confirmar el pedido.'
  return warning
}

function InlineCreateClientModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (cliente: Cliente) => Promise<boolean>
}) {
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Cliente | null>(null)
  const createCliente = useCreateCliente()

  if (!open) return null

  const resetAndClose = () => {
    setNombre('')
    setError(null)
    setCreated(null)
    onClose()
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedName = nombre.trim()
    if (!created && trimmedName.length < 2) {
      setError('El nombre debe tener al menos 2 caracteres')
      return
    }

    setError(null)
    try {
      const cliente = created ?? await createCliente.mutateAsync({ nombre: trimmedName })
      const selected = await onCreated(cliente)
      if (!selected) {
        setCreated(cliente)
        setError('El cliente fue creado, pero no se pudo seleccionar. Reintentá.')
        return
      }
      resetAndClose()
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : 'Error al crear el cliente')
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={resetAndClose}>
      <div role="dialog" aria-label="Crear cliente" className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <h3 className="text-[18px] font-semibold text-on-surface">Crear cliente</h3>
        <p className="mt-1 font-body text-[12px] text-on-surface-variant">Cargá solo el dato necesario para continuar el pedido.</p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="automation-client-name" className="font-body text-[12px] text-outline">Nombre / Razón social</label>
            <input
              id="automation-client-name"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              disabled={Boolean(created)}
              required
              minLength={2}
              maxLength={120}
              autoFocus
              className="input-field mt-1 w-full"
            />
          </div>
          {error && <p role="alert" className="font-body text-[12px] text-error">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={resetAndClose} disabled={createCliente.isPending}>Cancelar</Button>
            <Button type="submit" disabled={createCliente.isPending}>
              {createCliente.isPending ? 'Creando...' : created ? 'Seleccionar cliente' : 'Crear cliente'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AutomationPage() {
  const navigate = useNavigate()
  const [initialWork] = useState(readAutomationWork)
  const [originalText, setOriginalText] = useState(initialWork.originalText)
  const [draftId, setDraftId] = useState<string | null>(initialWork.draftId)
  const [showOriginal, setShowOriginal] = useState(false)
  const [editingMessage, setEditingMessage] = useState(false)
  const [editedMessageText, setEditedMessageText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isInterpreting, setIsInterpreting] = useState(false)
  const [deleteAliasPrompt, setDeleteAliasPrompt] = useState<{type: 'product' | 'client', id: string, alias: string} | null>(null)
  const [confirmOrderPrompt, setConfirmOrderPrompt] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  
  const idempotencyKeyRef = useRef<{ version: number; key: string } | null>(null)

  const [showAliases, setShowAliases] = useState(false)
  const { data: aliases } = useAutomationAliases()
  const createDraft = useCreateDraft()
  const updateDraft = useUpdateDraft()
  const deleteAlias = useDeleteAutomationAlias()
  const confirmDraft = useConfirmDraft()
  
  const { data: draftData, refetch: refetchDraft } = useDraft(draftId)
  const { data: clientes = [] } = useClientes()
  const { data: productos = [] } = useProductos()

  const [clienteSearch, setClienteSearch] = useState('')
  const [editingCliente, setEditingCliente] = useState(false)
  const [creatingCliente, setCreatingCliente] = useState(false)
  const [rememberClientAlias, setRememberClientAlias] = useState(true)

  useEffect(() => {
    persistAutomationWork({ originalText, draftId })
  }, [draftId, originalText])

  useEffect(() => {
    if (draftData?.draft.estado === 'CONFIRMED' || draftData?.draft.estado === 'CANCELLED') {
      clearAutomationWork()
    }
  }, [draftData?.draft.estado])

  const interpretText = async (text: string) => {
    if (!text.trim()) return
    setIsInterpreting(true)
    try {
      const draft = await createDraft.mutateAsync(text)
      setDraftId(draft.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al interpretar')
    } finally {
      setIsInterpreting(false)
    }
  }

  const handleInterpret = async () => interpretText(originalText)

  const handleEditMessage = () => {
    setEditedMessageText(originalText)
    setEditingMessage(true)
    setShowOriginal(true)
  }

  const handleReinterpretEditedMessage = async () => {
    const nextText = editedMessageText.trim()
    if (!nextText) return
    setOriginalText(nextText)
    setEditingMessage(false)
    await interpretText(nextText)
  }

  const handleDeleteAlias = async () => {
    if (!deleteAliasPrompt) return
    const { type, id } = deleteAliasPrompt
    try {
      await deleteAlias.mutateAsync({ type, id })
      toast.success('Equivalencia eliminada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar la equivalencia')
    } finally {
      setDeleteAliasPrompt(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'Enter') {
      handleInterpret()
    }
  }

  const handleProcessAnother = () => {
    clearAutomationWork()
    setDraftId(null)
    setOriginalText('')
    setShowOriginal(false)
  }

  if (isInterpreting) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-4">
        <p className="font-body text-sm text-on-surface-variant">Interpretando pedido…</p>
      </div>
    )
  }

  if (draftData && draftData.draft.estado === 'CONFIRMED') {
    const confirmedLines = (draftData.effectiveSnapshot?.lines ?? []).filter((line: any) => !isDiscardedLine(line))
    return (
      <div className="mx-auto max-w-2xl space-y-6 pt-8">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white">
            ✓
          </div>
          <h2 className="mb-2 text-2xl font-bold text-on-surface">Pedido confirmado</h2>
          <p className="font-body text-sm text-on-surface-variant">Cliente: {draftData.effectiveSnapshot?.customerCandidate?.nombre ?? draftData.effectiveSnapshot?.customerCandidateText ?? 'Cliente'}</p>
          <p className="font-body text-sm text-on-surface-variant">{confirmedLines.length} productos · {confirmedLines.reduce((total: number, line: any) => total + (line.quantity?.totalUnits ?? 0), 0)} unidades</p>
          <p className="font-body text-on-surface-variant mb-6">
            Stock actualizado correctamente.
          </p>
          {draftData.syncStatus === 'PENDING' && (
            <p className="font-body text-xs text-on-surface-variant mb-4">Actualización externa: Pendiente</p>
          )}
          <div className="flex justify-center gap-4">
            <Button variant="outline" onClick={handleProcessAnother}>
              Procesar otro pedido
            </Button>
            <Button onClick={() => navigate(`/ale-bet/pedidos/${draftData.draft.pedidoId}`)}>
              Ver pedido
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (draftId && draftData) {
    const { draft, effectiveSnapshot, availability } = draftData
    const includedLines = effectiveSnapshot.lines.filter((line: any) => !isDiscardedLine(line))
    const discardedLines = effectiveSnapshot.lines.filter((line: any) => isDiscardedLine(line))
    const validLines = includedLines.filter((line: any) => isValidIncludedLine(line))
    const needsReviewLines = includedLines.filter((line: any) => isNeedsReviewLine(line))
    const customer = effectiveSnapshot.customerCandidate
    const resolvedCustomer = customer ? clientes.find(c => c.id === customer.customerId) : null
    const presentationOptions = draftData.presentationOptions ?? []

    const handleEditCustomer = async (c: Cliente, rememberAlias: boolean): Promise<boolean> => {
      setIsProcessing(true)
      setConfirmError(null)
      try {
        await updateDraft.mutateAsync({
          id: draft.id,
          data: {
            expectedVersion: draft.version,
            clienteId: c.id,
            rememberClientAlias: rememberAlias,
          }
        })
        setEditingCliente(false)
        return true
      } catch (e) {
        if (e instanceof Error && e.message.includes('versión')) {
          toast.error('El pedido cambió. Refrescando...')
          refetchDraft()
        } else {
          toast.error(e instanceof Error ? e.message : 'Error al actualizar')
        }
        return false
      } finally {
        setIsProcessing(false)
      }
    }

    const handleChangeQuantity = async (index: number, cajas: number, sueltos: number) => {
      setIsProcessing(true)
      const line = effectiveSnapshot.lines[index]
      if (!line?.lineId || !line.productCandidate?.productId) {
        setIsProcessing(false)
        return
      }

      try {
        await updateDraft.mutateAsync({
          id: draft.id,
          data: {
            expectedVersion: draft.version,
            line: {
              lineId: line.lineId,
              productId: line.productCandidate.productId,
              cajas,
              unidades: sueltos,
              mode: line.quantity.mode === 'AMBIGUOUS' ? (cajas > 0 && sueltos > 0 ? 'MIXED' : cajas > 0 ? 'BOXES' : 'UNITS') : line.quantity.mode,
            }
          }
        })
      } catch (e) {
        if (e instanceof Error && e.message.includes('versión')) {
          toast.error('El pedido cambió. Refrescando...')
          refetchDraft()
        } else {
          toast.error(e instanceof Error ? e.message : 'Error al actualizar')
        }
      } finally {
        setIsProcessing(false)
      }
    }

    const handleLineDecision = async (line: any, action: 'DISCARD' | 'RESTORE') => {
      setIsProcessing(true)
      setConfirmError(null)
      try {
        await updateDraft.mutateAsync({
          id: draft.id,
          data: { expectedVersion: draft.version, line: { lineId: line.lineId, action } },
        })
        if (action === 'DISCARD') toast.success('Línea desestimada')
      } catch (error) {
        if (error instanceof Error && error.message.includes('versión')) refetchDraft()
        toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la línea')
      } finally {
        setIsProcessing(false)
      }
    }

    const handleChoosePresentation = async (line: any, presentationProductId: string) => {
      setIsProcessing(true)
      setConfirmError(null)
      try {
        await updateDraft.mutateAsync({
          id: draft.id,
          data: {
            expectedVersion: draft.version,
            line: { lineId: line.lineId, presentationProductId },
          },
        })
      } catch (error) {
        if (error instanceof Error && error.message.includes('versión')) refetchDraft()
        toast.error(error instanceof Error ? error.message : 'No se pudo elegir la presentación')
      } finally {
        setIsProcessing(false)
      }
    }

    


    const handleConfirm = async () => {
      setIsProcessing(true)
      try {
        if (!idempotencyKeyRef.current || idempotencyKeyRef.current.version !== draft.version) {
          idempotencyKeyRef.current = { version: draft.version, key: newIdempotencyKey() }
        }
        await confirmDraft.mutateAsync({
          id: draft.id,
          expectedVersion: draft.version,
          idempotencyKey: idempotencyKeyRef.current.key
        })
        clearAutomationWork()
        setConfirmOrderPrompt(false)
      } catch (e) {
        if (e instanceof Error) {
          if (e.message.includes('Stock insuficiente')) {
            setConfirmError('El stock cambió desde la última revisión.')
            refetchDraft()
          } else if (e.message.includes('versión')) {
            setConfirmError('El pedido fue actualizado. Revisamos los datos nuevamente.')
            refetchDraft()
          } else if (e.message.includes('READY antes de confirmar')) {
            setConfirmError('Este pedido ya fue confirmado o procesado.')
            refetchDraft()
          } else if (e.message.includes('idempotencia')) {
            setConfirmError('Hubo un conflicto procesando la solicitud, por favor revisá si ya se procesó.')
            refetchDraft()
          } else {
            setConfirmError(e.message)
          }
        } else {
          setConfirmError('Error al confirmar')
        }
      } finally {
        setIsProcessing(false)
      }
    }

    const canConfirm = draft.estado === 'READY' && Boolean(effectiveSnapshot.customerCandidate) && needsReviewLines.length === 0 && validLines.length > 0 && availability.every((a: any) => a.status !== 'INSUFICIENTE')
    const confirmTotalUnits = includedLines.reduce((acc: number, line: any) => acc + (line.quantity?.totalUnits ?? 0), 0)

    return (
      <div className={cn("mx-auto max-w-4xl space-y-6 pb-20", isProcessing && "pointer-events-none opacity-50")}>
        <header>
          <h1 className="text-[24px] font-bold tracking-tight text-on-surface">Procesar pedido</h1>
          <p className="font-body text-[13px] text-on-surface-variant">Revisá la interpretación y confirmá.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6">
          <div className="space-y-6">
            {/* Cliente */}
            <section className="rounded-xl border border-white/10 bg-surface-container-high p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-outline">Cliente</h2>
              {!editingCliente ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{resolvedCustomer?.nombre || effectiveSnapshot.customerCandidate?.nombre || (effectiveSnapshot.customerCandidateText ? `Desconocido: ${effectiveSnapshot.customerCandidateText}` : 'Desconocido')}</span>
                    {!effectiveSnapshot.customerCandidate && <Badge variant="error">⚠ Revisar cliente</Badge>}
                    {effectiveSnapshot.warnings.includes('CUSTOMER_UNRESOLVED') && effectiveSnapshot.customerCandidate && <Badge variant="error">⚠ Revisar cliente</Badge>}
                  </div>
                  <Button variant="outline" onClick={() => setEditingCliente(true)}>Cambiar</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="search"
                    placeholder="Buscar cliente..."
                    value={clienteSearch}
                    onChange={(e) => setClienteSearch(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-surface-container p-2 text-sm"
                  />
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {clientes.filter(c => c.nombre.toLowerCase().includes(clienteSearch.toLowerCase())).slice(0, 5).map(c => (
                      <div key={c.id} className="cursor-pointer p-2 hover:bg-surface-variant rounded-md text-sm" onClick={() => void handleEditCustomer(c, rememberClientAlias)}>
                        {c.nombre}
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" onClick={() => setCreatingCliente(true)}>+ Crear cliente</Button>
                  {effectiveSnapshot.customerCandidateText && (
                    <label className="flex items-center gap-2 text-sm mt-2 text-on-surface-variant cursor-pointer">
                      <input type="checkbox" id="rem-client-alias" checked={rememberClientAlias} onChange={(event) => setRememberClientAlias(event.target.checked)} />
                      Recordar "{effectiveSnapshot.customerCandidateText}"
                    </label>
                  )}
                  <Button variant="outline" onClick={() => setEditingCliente(false)}>Cancelar</Button>
                </div>
              )}
              {creatingCliente && (
                <InlineCreateClientModal
                  open
                  onClose={() => setCreatingCliente(false)}
                  onCreated={(cliente) => handleEditCustomer(cliente, rememberClientAlias)}
                />
              )}
            </section>

            {/* Productos */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-outline">Productos</h2>
              {includedLines.map((line: any, index: number) => {
                const isWarning = line.requiresReview || line.warnings.length > 0 || !line.productCandidate
                const product = line.productCandidate ? productos.find(p => p.id === line.productCandidate.productId) : null
                const avail = line.productCandidate ? availability.find((a: any) => a.productId === line.productCandidate.productId) : null
                const linePresentationOptions = line.productCandidate
                  ? presentationOptions.filter((option: any) => option.sourceProductId === line.productCandidate.productId)
                  : []
                const needsPresentation = line.warnings.includes('PRESENTATION_REQUIRED') && linePresentationOptions.length > 0

                return (
                  <div key={index} className={cn("rounded-xl border bg-surface-container p-4", isWarning ? "border-[#D5B4B5]" : "border-white/10")}>
                    <div className="mb-2 flex items-start justify-between">
                      <div className="font-semibold w-full">
                        {!product ? (
                          <div className="space-y-2 mb-3 w-full">
                            <span className="italic text-outline block mb-2">Desconocido · {line.originalText}</span>
                            <input
                              type="search"
                              placeholder="Buscar producto para asignar..."
                              onChange={(e) => {
                                const term = e.target.value.toLowerCase()
                                const el = document.getElementById(`prod-search-${index}`)
                                if (el) {
                                  el.innerHTML = term ? productos.filter(p => p.nombre.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)).slice(0, 5).map(p => 
                                    `<div class="cursor-pointer p-2 hover:bg-surface-variant rounded-md text-sm" data-id="${p.id}">${p.nombre}</div>`
                                  ).join('') : ''
                                }
                              }}
                              className="w-full rounded-lg border border-white/10 bg-surface-container-high p-2 text-sm"
                            />
                            <div id={`prod-search-${index}`} className="max-h-40 overflow-y-auto space-y-1" onClick={(e) => {
                              const target = e.target as HTMLElement
                              if (target.dataset.id) {
                                const p = productos.find(prod => prod.id === target.dataset.id)
                                if (p) {
                                  const rem = (document.getElementById(`rem-alias-${index}`) as HTMLInputElement)?.checked
                                  const payload = {
                                    expectedVersion: draft.version,
                                    line: {
                                      lineId: line.lineId,
                                      productId: p.id,
                                      cajas: line.quantity.explicitBoxes ?? 0,
                                      unidades: line.quantity.explicitUnits ?? (line.quantity.totalUnits ?? 1),
                                      mode: line.quantity.mode === 'AMBIGUOUS' ? 'UNITS' : line.quantity.mode,
                                      rememberAlias: rem,
                                    },
                                  }
                                  setIsProcessing(true)
                                  updateDraft.mutateAsync({
                                    id: draft.id,
                                    data: payload
                                  }).catch(() => {
                                    toast.error('Error')
                                    refetchDraft()
                                  }).finally(() => setIsProcessing(false))
                                }
                              }
                            }}></div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void handleLineDecision(line, 'DISCARD')}
                            >
                              No es un producto
                            </Button>
                            <label className="flex items-center gap-2 text-sm mt-2 text-on-surface-variant cursor-pointer">
                              <input type="checkbox" id={`rem-alias-${index}`} defaultChecked={true} />
                              Recordar "{line.originalText}" como alias al asignar un producto
                            </label>
                          </div>
                        ) : (
                          <div>{product.nombre}</div>
                        )}
                      </div>
                      {isWarning && <span className="text-[13px] text-[#A06869] flex items-center gap-1">⚠ Revisar producto</span>}
                    </div>

                    {line.warnings && line.warnings.length > 0 && (
                      <ul className="mb-3 list-disc pl-4 text-xs" style={{ color: '#A06869' }}>
                        {line.warnings.map((w: string, idx: number) => <li key={idx}>{reviewWarningText(w)}</li>)}
                      </ul>
                    )}
                    {product && (
                      <div className="mt-4 border-t border-white/5 pt-4">
                        {needsPresentation ? (
                          <div className="space-y-3" aria-label={`Presentación de ${product.nombre}`}>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-outline">Preparar como</p>
                              <p className="mt-1 text-sm text-on-surface-variant">Elegí la presentación que se entregará. La cantidad pedida se conserva.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {linePresentationOptions.map((option: any) => (
                                <Button
                                  key={option.targetProductId}
                                  type="button"
                                  variant="outline"
                                  onClick={() => void handleChoosePresentation(line, option.targetProductId)}
                                >
                                  {option.label}
                                </Button>
                              ))}
                            </div>
                            <p className="text-xs text-outline">Después se verificará el stock de la presentación elegida.</p>
                          </div>
                        ) : (
                          <>
                            <AutomationQuantityEditor
                              cajas={line.quantity.normalizedBoxes ?? 0}
                              sueltos={line.quantity.normalizedLooseUnits ?? (line.quantity.totalUnits ?? 0)}
                              unidadesPorCaja={product.unidadesPorCaja}
                              totalUnits={line.quantity.totalUnits ?? 0}
                              originalExpression={line.quantity.originalExpression}
                              onChange={(c, s) => handleChangeQuantity(index, c, s)}
                            />
                            {avail && (
                          
                              <div className={cn("mt-3 text-[13px]", avail.status === 'INSUFICIENTE' ? "text-error" : "text-[#5A7A5A]")}>
                                {avail.status === 'INSUFICIENTE' ? (
                                  <span>⚠ Sin stock ({avail.availableUnits} disponibles)</span>
                                ) : (
                                  <span>✓ Disponible: {avail.availableUnits} unidades</span>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {product && (
                      <div className="mt-4 border-t border-white/5 pt-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleLineDecision(line, 'DISCARD')}
                        >
                          Desestimar línea
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
              {discardedLines.length > 0 && (
                <div className="space-y-2" aria-label="Líneas descartadas">
                  {discardedLines.map((line: any) => (
                    <div key={line.lineId} className="flex items-center justify-between rounded-lg border border-white/10 bg-surface-container-high px-3 py-2 text-sm text-on-surface-variant">
                      <span>Línea desestimada · {line.originalText}</span>
                      <Button type="button" variant="outline" onClick={() => void handleLineDecision(line, 'RESTORE')}>Deshacer</Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-surface-container-high p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-outline">Acciones</h2>
              {includedLines.length === 0 && <p className="mb-3 text-sm text-on-surface-variant">No quedan productos para confirmar.</p>}
              <Button 
                onClick={() => setConfirmOrderPrompt(true)} 
                disabled={!canConfirm}
                className="w-full mb-3"
              >
                Confirmar pedido
              </Button>
              <Button variant="outline" onClick={handleProcessAnother} className="w-full">
                Cancelar / Volver
              </Button>
            </div>
            
            <div className="rounded-xl border border-white/10 bg-surface-container p-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => setShowOriginal(!showOriginal)}
                  className="text-left text-sm font-semibold text-outline hover:text-on-surface"
                >
                  {showOriginal ? '▼ Ocultar mensaje original' : '▶ Ver mensaje original'}
                </button>
                <Button type="button" variant="outline" onClick={handleEditMessage}>Editar mensaje</Button>
              </div>
              {showOriginal && (
                <div className="mt-3 whitespace-pre-wrap rounded bg-surface p-3 font-mono text-xs text-on-surface-variant">
                  {originalText}
                </div>
              )}
              {editingMessage && (
                <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                  <label htmlFor="automation-edit-message" className="font-body text-xs font-semibold uppercase tracking-wider text-outline">Mensaje a reinterpretar</label>
                  <textarea
                    id="automation-edit-message"
                    value={editedMessageText}
                    onChange={(event) => setEditedMessageText(event.target.value)}
                    className="h-36 w-full resize-y rounded-lg border border-white/10 bg-surface p-3 font-body text-sm text-on-surface focus:border-primary focus:outline-none"
                  />
                  <div className="flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setEditingMessage(false)}>Cancelar</Button>
                    <Button type="button" onClick={() => void handleReinterpretEditedMessage()} disabled={!editedMessageText.trim()}>Reinterpretar cambios</Button>
                  </div>
                </div>
              )}
            </div>
          
      <ConfirmDialog
        open={confirmOrderPrompt}
        titulo={confirmError ? "No se pudo confirmar el pedido" : "Confirmar pedido"}
        mensaje={
          confirmError ? (
            confirmError
          ) : (
            
            isProcessing ? (
              <div className="flex items-center gap-3"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>Procesando pedido...</div>
            ) : (
              <div className="space-y-3">
                <p>¿Confirmar pedido y descontar stock físico?</p>
                <div className="bg-surface-container p-3 rounded border border-white/5 text-sm">
                  <p className="font-semibold mb-1">{effectiveSnapshot.customerCandidate?.nombre ?? effectiveSnapshot.customerCandidateText ?? 'Cliente pendiente'}</p>
                  <p>{includedLines.length} productos</p>
                  <p>{confirmTotalUnits} unidades</p>
                </div>
              </div>
            )
          )
        }
        accion={confirmError ? "Reintentar" : "Confirmar"}
        loading={isProcessing}
        onCancel={() => {
          setConfirmOrderPrompt(false)
          setConfirmError(null)
        }}
        onConfirm={handleConfirm}
      />
      
      <ConfirmDialog
        open={!!deleteAliasPrompt}
        titulo="Eliminar equivalencia"
        mensaje={deleteAliasPrompt ? `¿Eliminar "${deleteAliasPrompt.alias}"? Esta acción no elimina el producto ni el cliente.` : ''}
        accion="Eliminar"
        loading={deleteAlias.isPending}
        onCancel={() => setDeleteAliasPrompt(null)}
        onConfirm={handleDeleteAlias}
      />

</div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-[28px] font-bold tracking-tight text-on-surface">Procesar pedido</h1>
        <p className="font-body text-[13px] text-on-surface-variant">Pegá uno o varios mensajes copiados desde WhatsApp.</p>
      </header>

      {aliases && (aliases.productAliases?.length > 0 || aliases.clientAliases?.length > 0) && (
        <div className="mb-8 space-y-4">
          <Button variant="outline" onClick={() => setShowAliases(!showAliases)}>
            {showAliases ? 'Ocultar equivalencias aprendidas' : 'Mostrar equivalencias aprendidas'}
          </Button>
          {showAliases && (
            <div className="space-y-4">
              {aliases.productAliases?.map((alias: any) => (
                <div key={alias.id} className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-surface-container-high">
                  <div className="text-sm">
                    <span className="font-bold text-on-surface">{alias.alias}</span> <span className="text-outline">→</span> {alias.producto?.nombre}
                  </div>
                  <Button variant="outline" onClick={() => setDeleteAliasPrompt({ type: 'product', id: alias.id, alias: alias.alias })}>
                    Eliminar
                  </Button>
                </div>
              ))}
              {aliases.clientAliases?.map((alias: any) => (
                <div key={alias.id} className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-surface-container-high">
                  <div className="text-sm">
                    <span className="font-bold text-on-surface">{alias.alias}</span> <span className="text-outline">→</span> {alias.cliente?.razonSocial}
                  </div>
                  <Button variant="outline" onClick={() => setDeleteAliasPrompt({ type: 'client', id: alias.id, alias: alias.alias })}>
                    Eliminar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        <textarea
          value={originalText}
          onChange={e => setOriginalText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Veterinaria Centro&#10;3 cajas Olivitasan 500&#10;20 Amantina&#10;Enviar por Expreso Central"
          className="h-64 w-full resize-y rounded-xl border border-white/10 bg-surface-container p-4 font-body text-sm text-on-surface focus:border-primary focus:outline-none"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-outline">Atajo: Ctrl + Enter para interpretar</p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => {
              clearAutomationWork()
              setOriginalText('')
              setDraftId(null)
            }} disabled={!originalText}>
              Limpiar
            </Button>
            <Button onClick={handleInterpret} disabled={!originalText.trim()}>
              Interpretar pedido
            </Button>
          </div>
        </div>
      </div>
      
      <ConfirmDialog
        open={!!deleteAliasPrompt}
        titulo="Eliminar equivalencia"
        mensaje={deleteAliasPrompt ? `¿Eliminar "${deleteAliasPrompt.alias}"? Esta acción no elimina el producto ni el cliente.` : ''}
        accion="Eliminar"
        loading={deleteAlias.isPending}
        onCancel={() => setDeleteAliasPrompt(null)}
        onConfirm={handleDeleteAlias}
      />
    </div>
  )
}
