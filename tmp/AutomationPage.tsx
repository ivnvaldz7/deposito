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

function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function AutomationPage() {
  const navigate = useNavigate()
  
  const [originalText, setOriginalText] = useState('')
  const [draftId, setDraftId] = useState<string | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [showAliases, setShowAliases] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isInterpreting, setIsInterpreting] = useState(false)
  
  const idempotencyKeyRef = useRef<{ version: number; key: string } | null>(null)

  const createDraft = useCreateDraft()
  const updateDraft = useUpdateDraft()
  const confirmDraft = useConfirmDraft()
  const { data: learnedAliases } = useAutomationAliases()
  const deleteAlias = useDeleteAutomationAlias()
  
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

  const handleDeleteAlias = async (type: 'product' | 'client', id: string, alias: string) => {
    if (!globalThis.confirm(`¿Eliminar la equivalencia "${alias}"? Esta acción no elimina el producto ni el cliente.`)) return
    try {
      await deleteAlias.mutateAsync({ type, id })
      toast.success('Equivalencia eliminada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar la equivalencia')
    }
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
            Stock reservado correctamente.
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
      try {
        await updateDraft.mutateAsync({
          id: draft.id,
          data: {
            expectedVersion: draft.version,
            clienteId: c.id,
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
      const line = effectiveSnapshot.lines[index]
      if (!line?.lineId) {
        toast.error('No se pudo identificar la línea. Actualizá el borrador e intentá nuevamente.')
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
              cajas,
              unidades: sueltos,
              mode: line.quantity.mode
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
            toast.error('El stock cambió desde la última revisión.')
            refetchDraft()
          } else if (e.message.includes('versión')) {
            toast.error('El pedido fue actualizado. Revisamos los datos nuevamente.')
            refetchDraft()
          } else if (e.message.includes('READY antes de confirmar')) {
            toast.error('Este pedido ya fue confirmado o procesado.')
            refetchDraft()
          } else if (e.message.includes('idempotencia')) {
            toast.error('Hubo un conflicto procesando la solicitud, por favor revisá si ya se procesó.')
            refetchDraft()
          } else {
            toast.error(e.message)
          }
        } else {
          toast.error('Error al confirmar')
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
                  <div key={line.lineId} className={cn("rounded-xl border bg-surface-container p-4", isWarning ? "border-[#D5B4B5]" : "border-white/10")}>
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
                                const el = document.getElementById(`prod-search-${line.lineId}`)
                                if (el) {
                                  el.innerHTML = term ? productos.filter(p => p.nombre.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)).slice(0, 5).map(p => 
                                    `<div class="cursor-pointer p-2 hover:bg-surface-variant rounded-md text-sm" data-id="${p.id}">${p.nombre}</div>`
                                  ).join('') : ''
                                }
                              }}
                              className="w-full rounded-lg border border-white/10 bg-surface-container-high p-2 text-sm"
                            />
                            <div id={`prod-search-${line.lineId}`} className="max-h-40 overflow-y-auto space-y-1" onClick={(e) => {
                              const target = e.target as HTMLElement
                              if (target.dataset.id) {
                                const p = productos.find(prod => prod.id === target.dataset.id)
                                if (p) {
                                  const rem = (document.getElementById(`rem-alias-${line.lineId}`) as HTMLInputElement)?.checked
                                  setIsProcessing(true)
                                  updateDraft.mutateAsync({
                                    id: draft.id,
                                    data: {
                                      expectedVersion: draft.version,
                                      line: {
                                        lineId: line.lineId,
                                        productId: p.id,
                                        cajas: line.quantity.explicitBoxes ?? 0,
                                        unidades: line.quantity.explicitUnits ?? (line.quantity.totalUnits ?? 1),
                                        mode: line.quantity.mode,
                                        rememberAlias: rem
                                      }
                                    }
                                  }).catch(() => { toast.error('Error'); refetchDraft() }).finally(() => setIsProcessing(false))
                                }
                              }
                            }}></div>
                            <label className="flex items-center gap-2 text-sm mt-2 text-on-surface-variant cursor-pointer">
                              <input type="checkbox" id={`rem-alias-${line.lineId}`} defaultChecked={true} />
                              Recordar "{line.originalText}"
                            </label>
                          </div>
                        ) : (
                          <div>{product.nombre}</div>
                        )}
                      </div>
                      {isWarning && <Badge variant="error">⚠ Revisar producto</Badge>}
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
                          <div className={cn("mt-3 text-[13px] font-medium", avail.status === 'INSUFICIENTE' ? "font-bold text-error" : "text-on-surface-variant")}>
                            Disponible: {avail.availableUnits} unidades {avail.status === 'INSUFICIENTE' && ' - Stock insuficiente'}
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
                onClick={handleConfirm} 
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

      <section className="rounded-xl border border-white/10 bg-surface-container-high p-4">
        <button
          type="button"
          onClick={() => setShowAliases((visible) => !visible)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-sm font-semibold uppercase tracking-wider text-outline">Equivalencias aprendidas</span>
          <span className="text-sm text-on-surface-variant">{showAliases ? 'Ocultar' : 'Ver y eliminar'}</span>
        </button>
        {showAliases && (
          <div className="mt-4 space-y-4">
            {learnedAliases && learnedAliases.productAliases.length === 0 && learnedAliases.clientAliases.length === 0 && (
              <p className="text-sm text-on-surface-variant">No hay equivalencias aprendidas.</p>
            )}
            {learnedAliases && [
              ...learnedAliases.productAliases.map((alias) => ({ ...alias, type: 'product' as const, target: alias.producto?.nombre ?? 'Producto eliminado' })),
              ...learnedAliases.clientAliases.map((alias) => ({ ...alias, type: 'client' as const, target: alias.cliente?.nombre ?? 'Cliente eliminado' })),
            ].map((alias) => (
              <div key={`${alias.type}-${alias.id}`} className="flex items-center justify-between gap-3 rounded-lg bg-surface p-3 text-sm">
                <div>
                  <div className="font-medium">{alias.alias}</div>
                  <div className="text-on-surface-variant">{alias.type === 'product' ? 'Producto' : 'Cliente'} → {alias.target}</div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => handleDeleteAlias(alias.type, alias.id, alias.alias)}
                  disabled={deleteAlias.isPending}
                >
                  Eliminar
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
