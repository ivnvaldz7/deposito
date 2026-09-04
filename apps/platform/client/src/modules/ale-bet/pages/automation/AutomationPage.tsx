import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '@/lib/toast'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useAutomationAliases, useConfirmDraft, useCreateDraft, useDeleteAutomationAlias, useDraft, useUpdateDraft } from '../../queries/use-automation'
import { useClientes, useProductosSearch, useProductos } from '../../queries'
import { AutomationQuantityEditor } from '../../components/AutomationQuantityEditor'
import type { Cliente } from '../../lib/api'


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

export default function AutomationPage() {
  const navigate = useNavigate()
  
  const [originalText, setOriginalText] = useState('')
  const [draftId, setDraftId] = useState<string | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
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

  const handleInterpret = async () => {
    if (!originalText.trim()) return
    setIsInterpreting(true)
    try {
      const draft = await createDraft.mutateAsync(originalText)
      setDraftId(draft.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al interpretar')
    } finally {
      setIsInterpreting(false)
    }
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
    return (
      <div className="mx-auto max-w-2xl space-y-6 pt-8">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white">
            ✓
          </div>
          <h2 className="mb-2 text-2xl font-bold text-on-surface">Pedido confirmado</h2>
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
    const hasWarnings = effectiveSnapshot.warnings.length > 0 || effectiveSnapshot.lines.some((l: any) => l.warnings.length > 0 || l.requiresReview) || effectiveSnapshot.requiresReview
    const customer = effectiveSnapshot.customerCandidate
    const resolvedCustomer = customer ? clientes.find(c => c.id === customer.customerId) : null

    const handleEditCustomer = async (c: Cliente) => {
      setEditingCliente(false)
      setIsProcessing(true)
      setConfirmError(null)
      try {
        await updateDraft.mutateAsync({
          id: draft.id,
          data: {
            expectedVersion: draft.version,
            clienteId: c.id,
            lines: effectiveSnapshot.lines.map((l: any) => ({
              productId: l.productCandidate?.productId,
              cajas: l.quantity.explicitBoxes ?? 0,
              unidades: l.quantity.explicitUnits ?? 0,
              mode: l.quantity.mode
            })).filter((l: any) => l.productId)
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

    const handleChangeQuantity = async (index: number, cajas: number, sueltos: number) => {
      setIsProcessing(true)
      const lines = effectiveSnapshot.lines.map((l: any, i: number) => {
        if (i === index) {
          return {
            productId: l.productCandidate?.productId,
            cajas,
            unidades: sueltos,
            mode: l.quantity.mode
          }
        }
        return {
          productId: l.productCandidate?.productId,
          cajas: l.quantity.explicitBoxes ?? 0,
          unidades: l.quantity.explicitUnits ?? 0,
          mode: l.quantity.mode
        }
      }).filter((l: any) => l.productId)

      try {
        await updateDraft.mutateAsync({
          id: draft.id,
          data: {
            expectedVersion: draft.version,
            clienteId: effectiveSnapshot.customerCandidate?.customerId,
            lines
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

    const canConfirm = draft.estado === 'READY' && effectiveSnapshot.customerCandidate && !effectiveSnapshot.requiresReview && availability.every((a: any) => a.status !== 'INSUFICIENTE')

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
                    {effectiveSnapshot.requiresReview && effectiveSnapshot.customerCandidate && <Badge variant="error">⚠ Revisar cliente</Badge>}
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
                      <div key={c.id} className="cursor-pointer p-2 hover:bg-surface-variant rounded-md text-sm" onClick={() => {
                        const rem = (document.getElementById('rem-client-alias') as HTMLInputElement)?.checked
                        setEditingCliente(false)
                        setIsProcessing(true)
                        updateDraft.mutateAsync({
                          id: draft.id,
                          data: {
                            expectedVersion: draft.version,
                            clienteId: c.id,
                            rememberClientAlias: rem,
                            lines: effectiveSnapshot.lines.map((l: any) => ({
                              productId: l.productCandidate?.productId,
                              cajas: l.quantity.explicitBoxes ?? 0,
                              unidades: l.quantity.explicitUnits ?? 0,
                              mode: l.quantity.mode
                            })).filter((l: any) => l.productId)
                          }
                        }).catch((e) => {
                          if (e instanceof Error && e.message.includes('versión')) {
                            toast.error('El pedido cambió. Refrescando...')
                            refetchDraft()
                          } else {
                            toast.error(e instanceof Error ? e.message : 'Error al actualizar')
                          }
                        }).finally(() => setIsProcessing(false))
                      }}>
                        {c.nombre}
                      </div>
                    ))}
                  </div>
                  {effectiveSnapshot.customerCandidateText && (
                    <label className="flex items-center gap-2 text-sm mt-2 text-on-surface-variant cursor-pointer">
                      <input type="checkbox" id="rem-client-alias" defaultChecked={true} />
                      Recordar "{effectiveSnapshot.customerCandidateText}"
                    </label>
                  )}
                  <Button variant="outline" onClick={() => setEditingCliente(false)}>Cancelar</Button>
                </div>
              )}
            </section>

            {/* Productos */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-outline">Productos</h2>
              {effectiveSnapshot.lines.map((line: any, index: number) => {
                const isWarning = line.requiresReview || line.warnings.length > 0 || !line.productCandidate
                const product = line.productCandidate ? productos.find(p => p.id === line.productCandidate.productId) : null
                const avail = line.productCandidate ? availability.find((a: any) => a.productId === line.productCandidate.productId) : null

                return (
                  <div key={index} className={cn("rounded-xl border bg-surface-container p-4", isWarning ? "border-[#D5B4B5]" : "border-white/10")}>
                    <div className="mb-2 flex items-start justify-between">
                      <div className="font-semibold w-full">
                        {!product ? (
                          <div className="space-y-2 mb-3 w-full">
                            <span className="italic text-outline block mb-2">Desconocido: {line.originalText}</span>
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
                                  const newLines = [...effectiveSnapshot.lines]
                                  newLines[index] = {
                                    productId: p.id,
                                    cajas: line.quantity.explicitBoxes ?? 0,
                                    unidades: line.quantity.explicitUnits ?? (line.quantity.totalUnits ?? 1),
                                    mode: line.quantity.mode,
                                    rememberAlias: rem
                                  }
                                  setIsProcessing(true)
                                  updateDraft.mutateAsync({
                                    id: draft.id,
                                    data: {
                                      expectedVersion: draft.version,
                                      clienteId: effectiveSnapshot.customerCandidate?.customerId,
                                      lines: newLines.map((l: any, i: number) => i === index ? newLines[i] : {
                                        productId: l.productCandidate?.productId ?? l.productId,
                                        cajas: l.quantity?.explicitBoxes ?? l.cajas ?? 0,
                                        unidades: l.quantity?.explicitUnits ?? l.unidades ?? 0,
                                        mode: l.quantity?.mode ?? l.mode
                                      }).filter((l: any) => l.productId)
                                    }
                                  }).catch(() => { toast.error('Error'); refetchDraft() }).finally(() => setIsProcessing(false))
                                }
                              }
                            }}></div>
                            <label className="flex items-center gap-2 text-sm mt-2 text-on-surface-variant cursor-pointer">
                              <input type="checkbox" id={`rem-alias-${index}`} defaultChecked={true} />
                              Recordar "{line.originalText}"
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
                        {line.warnings.map((w: string, idx: number) => <li key={idx}>{w}</li>)}
                      </ul>
                    )}
                    {product && (
                      <div className="mt-4 border-t border-white/5 pt-4">
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
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-surface-container-high p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-outline">Acciones</h2>
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
              <button 
                onClick={() => setShowOriginal(!showOriginal)}
                className="w-full text-left text-sm font-semibold text-outline hover:text-on-surface"
              >
                {showOriginal ? '▼ Ocultar mensaje original' : '▶ Ver mensaje original'}
              </button>
              {showOriginal && (
                <div className="mt-3 whitespace-pre-wrap rounded bg-surface p-3 font-mono text-xs text-on-surface-variant">
                  {originalText}
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
                  <p className="font-semibold mb-1">{draftData?.snapshot?.customerCandidate?.cliente?.razonSocial}</p>
                  <p>{draftData?.snapshot?.lines?.length ?? 0} productos</p>
                  <p>{draftData?.snapshot?.lines?.reduce((acc: number, l: any) => acc + (l.quantity?.totalUnits ?? 0), 0) ?? 0} unidades</p>
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
            <Button variant="outline" onClick={() => setOriginalText('')} disabled={!originalText}>
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
