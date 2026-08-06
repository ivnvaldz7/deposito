import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ChevronDown, Check, X, FileText, FlaskConical, TriangleAlert, Package, Printer, LogOut, ArrowLeft } from 'lucide-react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api-client'
import { toast } from '@/lib/toast'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import {
  ESTADO_META,
  canAccionesBarraArmador,
  canAprobar,
  canCancelarDirecto,
  canConfirmarCancelacion,
  canDespachar,
  canEditarPedido,
  canEmitirRemito,
  canPreparar,
  canSolicitarCancelacion,
  canTomar,
  cantidadLinea,
  calcularCajasSueltos,
  esArmadorAsignado,
  pedidoClientePendiente,
} from '../lib/estados'
import type { Cliente, PedidoItemInput } from '../lib/api'
import {
  descargarRemitoPdf,
  pedidosKeys,
  useAnularRemito,
  useAprobarPedido,
  useCancelarPedido,
  useClientes,
  useCompletarItemPedido,
  useConfirmarCancelacionPedido,
  useCreateCliente,
  useDespacharPedido,
  useEmitirRemito,
  usePedidoDetalle,
  usePedidos,
  usePrepararPedido,
  useProductos,
  useProductosSearch,
  useTomarPedido,
  useTransportistas,
  useUpdatePedido,
} from '../queries'
import { BottomSheet } from '../components/BottomSheet'
import { ArmadorActionBar } from '../components/ArmadorActionBar'
import { ProductCard, type ProductoCardDatos } from '../components/ProductCard'
import { QuantityStepper } from '../components/QuantityStepper'


interface CartLine {
  cajas: number
  sueltos: number
}

type Carrito = Record<string, CartLine>

type ConfirmAccion = 'aprobar' | 'tomar' | 'cancelar' | 'guardar-aprobado' | 'preparar' | 'despachar'

const ESTADOS_CON_REMITO = ['APROBADO', 'EN_ARMADO', 'PREPARADO']

function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function formatFecha(dateString: string): string {
  return new Date(dateString).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatFechaHora(dateString: string): string {
  return new Date(dateString).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const porActualizadoDesc = (a: { updatedAt: string }, b: { updatedAt: string }) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container-low p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[16px] font-bold text-on-surface">{titulo}</h2>
        <div className="mt-2 font-body text-[13px] leading-relaxed text-on-surface-variant">{mensaje}</div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Volver
          </Button>
          <Button onClick={onConfirm} loading={loading}>
            {accion}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ClienteOption({ cliente, onSelect }: { cliente: Cliente; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-surface-container-high p-4 text-left transition enabled:active:scale-[0.99]"
    >
      <div className="min-w-0">
        <p className="truncate text-[16px] font-semibold text-on-surface">{cliente.nombre}</p>
        <p className="mt-1 truncate font-body text-[13px] font-medium text-on-surface-variant">
          {cliente.contacto ?? cliente.referencia ?? '—'}
        </p>
      </div>
      {cliente.estado === 'PENDIENTE_CLIENTE' && <Badge variant="warning">Pendiente de validación</Badge>}
    </button>
  )
}

interface CambiarClienteSheetProps {
  open: boolean
  onClose: () => void
  clientes: Cliente[]
  recientes: Cliente[]
  onSelect: (cliente: Cliente) => void
}

function CambiarClienteSheet({ open, onClose, clientes, recientes, onSelect }: CambiarClienteSheetProps) {
  const [busqueda, setBusqueda] = useState('')
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [nombre, setNombre] = useState('')
  const [contacto, setContacto] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const createCliente = useCreateCliente()

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter((c) => `${c.nombre} ${c.contacto ?? ''} ${c.referencia ?? ''}`.toLowerCase().includes(q))
  }, [clientes, busqueda])

  const lista = useMemo(() => {
    if (busqueda.trim() !== '') return filtrados
    const recientesIds = new Set(recientes.map((c) => c.id))
    return filtrados.filter((c) => !recientesIds.has(c.id))
  }, [busqueda, filtrados, recientes])

  function reset() {
    setBusqueda('')
    setMostrarNuevo(false)
    setNombre('')
    setContacto('')
    setError(null)
  }

  async function crearCliente() {
    const name = nombre.trim()
    if (!name) {
      setError('El nombre es obligatorio')
      inputRef.current?.focus()
      return
    }
    const cont = contacto.trim()
    if (!cont) {
      setError('Debe informar un contacto o referencia')
      return
    }
    setError(null)
    try {
      const creado = await createCliente.mutateAsync({
        nombre: name,
        contacto: cont,
      })
      reset()
      onSelect(creado)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el cliente')
    }
  }

  return (
    <BottomSheet open={open} onClose={() => { reset(); onClose() }} title={mostrarNuevo ? "NUEVO CLIENTE" : "Cambiar cliente"} desktop="modal">
      {mostrarNuevo ? (
        <div className="space-y-5">
          <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 font-body text-[12px] leading-relaxed text-primary">
            Cargá lo mínimo. Facturación completará los datos fiscales.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="nuevo-cliente-nombre" className="font-body text-[12px] font-semibold text-on-surface">
              Nombre del cliente *
            </label>
            <input
              id="nuevo-cliente-nombre"
              ref={inputRef}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Veterinaria Central"
              className="w-full rounded-xl border border-white/10 bg-surface-container-high px-4 py-3 font-body text-[16px] text-on-surface focus:border-primary focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="nuevo-cliente-contacto" className="font-body text-[12px] font-semibold text-on-surface">
              Contacto o referencia *
            </label>
            <input
              id="nuevo-cliente-contacto"
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              placeholder="Teléfono, mail o detalle…"
              className="w-full rounded-xl border border-white/10 bg-surface-container-high px-4 py-3 font-body text-[16px] text-on-surface focus:border-primary focus:outline-none"
            />
          </div>
          {error && (
            <p role="alert" className="font-body text-[13px] font-medium text-error">
              {error}
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setMostrarNuevo(false)}
              disabled={createCliente.isPending}
              className="flex-1 rounded-full border border-white/10 px-4 py-3 font-body text-[14px] font-medium text-outline transition hover:bg-surface-variant hover:text-on-surface disabled:opacity-50"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={() => void crearCliente()}
              disabled={createCliente.isPending}
              className="flex-[2] rounded-full bg-primary px-4 py-3 font-body text-[14px] font-bold text-on-primary transition hover:bg-primary/90 disabled:opacity-50"
            >
              {createCliente.isPending ? 'Creando...' : 'Crear cliente'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <input
            autoFocus
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar cliente"
            placeholder="Buscar por nombre, contacto o referencia"
            className="input-field text-base"
          />
          {busqueda.trim() === '' && recientes.length > 0 && (
            <section aria-label="Clientes recientes" className="space-y-2">
              <h2 className="font-body text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">Recientes</h2>
              {recientes.map((c) => (
                <ClienteOption key={c.id} cliente={c} onSelect={() => onSelect(c)} />
              ))}
            </section>
          )}
          <section aria-label="Lista de clientes" className="space-y-2">
            <h2 className="font-body text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">
              {busqueda.trim() === '' ? 'Todos los clientes' : 'Resultados'}
            </h2>
            {lista.length === 0 ? (
              <p className="py-6 text-center font-body text-[13px] text-on-surface-variant">
                Sin resultados para “{busqueda}”
              </p>
            ) : (
              lista.map((c) => <ClienteOption key={c.id} cliente={c} onSelect={() => onSelect(c)} />)
            )}
          </section>
          <button
            type="button"
            onClick={() => setMostrarNuevo(true)}
            className="w-full rounded-xl border border-dashed border-primary/50 p-4 font-body text-[13px] font-semibold text-primary transition hover:bg-primary/10"
          >
            + Cliente nuevo
          </button>
        </div>
      )}
    </BottomSheet>
  )
}

interface LineaDetalleProps {
  productoId: string
  nombre: string
  sku: string
  cajas: number
  sueltos: number
  unidades: number
  unidadesPorCaja: number
  disponible?: number
  reservado?: number
  completado: boolean
  editable: boolean
  completable: boolean
  isFacturacion?: boolean
  isArmador?: boolean
  esperaProduccion?: boolean // BACKEND PENDIENTE
  onChange?: (cajas: number, sueltos: number) => void
  onEliminar?: () => void
  onToggleCompletar?: () => void
  onToggleEspera?: () => void // BACKEND PENDIENTE
}

function LineaDetalle({
  productoId,
  nombre,
  sku,
  cajas,
  sueltos,
  unidades,
  unidadesPorCaja,
  disponible,
  reservado,
  completado,
  editable,
  completable,
  isFacturacion,
  isArmador,
  esperaProduccion,
  onChange,
  onEliminar,
  onToggleCompletar,
  onToggleEspera,
}: LineaDetalleProps) {
  const ceroUnidades = unidades === 0
  const mostrarStock = !isFacturacion && !isArmador && (disponible !== undefined || reservado !== undefined)

  if (isArmador) {
    const isEspera = esperaProduccion
    const isListo = completado

    return (
      <div
        data-testid={`linea-${productoId}`}
        className={cn(
          'flex flex-col gap-4 py-5 px-4 lg:px-8 border-b border-white/5 last:border-0 transition-all duration-250',
          isListo ? 'bg-success/5 border-success/20' : isEspera ? 'bg-[#F5ECEC] border-[#D5B4B5]' : 'hover:bg-white/[0.02]',
        )}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className={cn('text-[16px] font-bold transition-colors', isEspera ? 'text-[#8E5A5B]' : isListo ? 'text-success/90' : 'text-on-surface')}>
              {nombre}
            </p>
            {isListo && <Badge variant="success" className="h-5 px-1.5 text-[10px] animate-in zoom-in-50 duration-200">✓ PREPARADO</Badge>}
            {isEspera && <Badge className="bg-[#A06869] text-white h-5 px-1.5 text-[10px] uppercase animate-in zoom-in-50 duration-200">ESPERA PRODUCCIÓN</Badge>}
            {!isListo && !isEspera && completable && <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-primary border-primary/50">PREPARAR</Badge>}
          </div>
          <p className={cn('font-body text-[13px]', isEspera ? 'text-[#8E5A5B]/70' : 'text-on-surface-variant')}>{sku}</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-baseline gap-2">
            <span className={cn('text-[28px] md:text-[32px] font-bold leading-none', isEspera ? 'text-[#8E5A5B]' : 'text-on-surface')}>{cajas}</span>
            <span className={cn('text-[14px] font-semibold tracking-wider uppercase', isEspera ? 'text-[#8E5A5B]/80' : 'text-on-surface-variant')}>CAJAS</span>
          </div>
          <div className={cn('w-px h-8', isEspera ? 'bg-[#D5B4B5]' : 'bg-white/10')} />
          <div className="flex items-baseline gap-2">
            <span className={cn('text-[28px] md:text-[32px] font-bold leading-none', isEspera ? 'text-[#8E5A5B]' : 'text-on-surface')}>{sueltos}</span>
            <span className={cn('text-[14px] font-semibold tracking-wider uppercase', isEspera ? 'text-[#8E5A5B]/80' : 'text-on-surface-variant')}>SUELTOS</span>
          </div>
        </div>

        {completable && (
          <div className="flex flex-wrap gap-2 mt-2">
            {onToggleCompletar && (
              <button
                type="button"
                onClick={onToggleCompletar}
                className={cn(
                  'flex-1 min-w-[140px] flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 font-body text-[14px] font-bold transition-all h-12',
                  isListo
                    ? 'border-white/20 text-on-surface-variant hover:border-error/50 hover:text-error hover:bg-error/10'
                    : isEspera 
                      ? 'border-[#A06869]/20 text-[#A06869] hover:bg-[#A06869]/10'
                      : 'border-primary text-primary hover:bg-primary/10'
                )}
              >
                {isListo ? (
                  <>
                    <X className="w-4 h-4" />
                    Desmarcar
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    MARCAR PREPARADO
                  </>
                )}
              </button>
            )}
            
            {onToggleEspera && !isListo && (
              <button
                type="button"
                onClick={onToggleEspera}
                className={cn(
                  'flex-1 min-w-[140px] flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 font-body text-[14px] font-bold transition-all h-12',
                  isEspera
                    ? 'border-[#A06869] bg-[#A06869] text-white hover:bg-[#8E5A5B]'
                    : 'border-white/10 text-on-surface-variant hover:border-[#D5B4B5] hover:text-[#A06869] hover:bg-[#F5ECEC]'
                )}
              >
                {isEspera ? 'Disponible para preparar' : '⏳ ESPERA PRODUCCIÓN'}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      data-testid={`linea-${productoId}`}
      className={cn(
        'group flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-4 px-4 lg:px-8 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors',
        ceroUnidades && 'opacity-50 bg-error/5',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-[14px] font-semibold text-on-surface">{nombre}</p>
          {completado && <Badge variant="success" className="h-5 px-1.5 text-[10px]">Listo</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-[12px] text-on-surface-variant">
          <span className="font-medium text-on-surface/80">{sku}</span>

          {mostrarStock && (
            <div className="flex items-center gap-2 border-l border-white/10 pl-3">
              {disponible !== undefined && (
                <span className={cn(disponible <= 0 && 'text-warning font-medium')}>
                  Disp: {disponible}
                </span>
              )}
              {reservado !== undefined && reservado > 0 && (
                <span className="text-on-surface/60">
                  Res: {reservado}
                </span>
              )}
            </div>
          )}
        </div>
        {ceroUnidades && (
          <p className="mt-1 font-body text-[11px] font-medium text-warning">0 unidades — se eliminará al guardar</p>
        )}
      </div>

      <div className="flex flex-wrap lg:flex-nowrap items-center gap-4 lg:gap-6 shrink-0 lg:w-auto">
        <div className="flex-1 lg:flex-none">
          {editable && onChange ? (
            <QuantityStepper cajas={cajas} sueltos={sueltos} unidadesPorCaja={unidadesPorCaja} onChange={onChange} />
          ) : (
            <div className="font-body text-[13px] text-on-surface-variant flex items-center gap-3">
              <span className="text-on-surface">{cajas} caja{cajas !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span className="text-on-surface">{sueltos} unidad{sueltos !== 1 ? 'es' : ''}</span>
            </div>
          )}
        </div>

        <div className="w-20 text-right font-body text-[15px] font-bold text-on-surface">
          {unidades} un
        </div>

        <div className="w-24 flex justify-end gap-2 shrink-0">
          {completable && onToggleCompletar && (
            <button
              type="button"
              onClick={onToggleCompletar}
              className={cn(
                'rounded border px-3 py-1 font-body text-[11px] font-bold transition h-8',
                completado
                  ? 'border-success/30 text-success bg-success/10 hover:bg-success/20'
                  : 'border-primary/40 text-primary hover:bg-primary/10',
              )}
            >
              {completado ? 'Desmarcar' : 'Preparar'}
            </button>
          )}
          {editable && onEliminar && (
            <button
              type="button"
              onClick={onEliminar}
              aria-label={`Eliminar ${nombre}`}
              className="flex h-8 w-8 items-center justify-center rounded-full text-outline hover:text-error hover:bg-error/10 transition lg:opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
interface TransportSelectorProps {
  transportistas: { id: string; nombre: string; direccion?: string | null }[]
  transporteId: string
  setTransporteId: (id: string) => void
  usarOcasional: boolean
  setUsarOcasional: (v: boolean) => void
}

function TransportSelector({ transportistas, transporteId, setTransporteId, usarOcasional, setUsarOcasional }: TransportSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const selectedT = transportistas.find(t => t.id === transporteId)

  useEffect(() => {
    if (!open) {
      if (usarOcasional) {
        setSearch("OTRO / TRANSPORTE OCASIONAL")
      } else if (selectedT) {
        setSearch(selectedT.nombre)
      } else {
        setSearch("")
      }
    }
  }, [open, usarOcasional, selectedT])

  const filtered = useMemo(() => {
    if (!search || (selectedT && search === selectedT.nombre) || (usarOcasional && search === "OTRO / TRANSPORTE OCASIONAL")) return transportistas
    const s = search.toLowerCase()
    return transportistas.filter(t => t.nombre.toLowerCase().includes(s) || (t.direccion && t.direccion.toLowerCase().includes(s)))
  }, [transportistas, search, selectedT, usarOcasional])

  return (
    <div className="relative w-full md:w-[320px]" ref={ref}>
      <div className="relative">
        <input
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          type="text"
          className="w-full h-11 px-4 pr-10 text-left text-[14px] font-body bg-surface-container-high border border-white/10 transition-all shadow-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 rounded-lg text-on-surface placeholder:text-on-surface-variant/70"
          placeholder="Buscar transportista..."
          value={search}
          onChange={e => {
            setSearch(e.target.value)
            setOpen(true)
            if (transporteId) setTransporteId("")
            if (usarOcasional) setUsarOcasional(false)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
        />
        {(search || transporteId || usarOcasional) ? (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
            onClick={() => {
              setSearch("")
              setTransporteId("")
              setUsarOcasional(false)
              setOpen(true)
            }}
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-2 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-surface-container-high shadow-float shadow-xl p-1 animate-in fade-in zoom-in-95">
          {filtered.length > 0 ? (
            filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setUsarOcasional(false); setTransporteId(t.id); setOpen(false) }}
                className={cn(
                  "flex flex-col w-full px-3 py-2 text-left rounded-lg transition-colors hover:bg-surface-high focus:bg-surface-high focus:outline-none",
                  !usarOcasional && transporteId === t.id ? "bg-primary/10" : ""
                )}
              >
                <span className={cn("text-[14px] font-body", !usarOcasional && transporteId === t.id ? "text-primary font-semibold" : "text-on-surface")}>{t.nombre}</span>
                {t.direccion && <span className="text-[11px] font-body text-on-surface-variant truncate">{t.direccion}</span>}
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-[12px] font-body text-on-surface-variant">No se encontraron resultados</div>
          )}
          <div className="my-1 h-[1px] w-full bg-white/10" />
          <button
            type="button"
            onClick={() => { setUsarOcasional(true); setTransporteId(''); setOpen(false) }}
            className={cn(
              "flex w-full items-center px-3 py-2.5 text-left text-[14px] font-body rounded-lg transition-colors hover:bg-surface-high focus:bg-surface-high focus:outline-none",
              usarOcasional ? "bg-primary/10 text-primary font-semibold" : "font-semibold text-primary/80"
            )}
          >
            OTRO / TRANSPORTE OCASIONAL
          </button>
        </div>
      )}
    </div>
  )
}

export default function PedidoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const rol = user?.apps?.['ale-bet']?.rol ?? ''
  const userId = user?.sub ?? ''
  const esRemitos = rol === 'admin' || rol === 'facturacion'

  const { data: pedido, isLoading, error, refetch: refetchPedido } = usePedidoDetalle(id)
  const { data: productos = [], refetch: refetchProductos } = useProductos()
  const { data: clientes = [] } = useClientes()
  const { data: transportistas = [] } = useTransportistas({ enabled: esRemitos })
  const { data: pedidosList = [] } = usePedidos()

  const [carrito, setCarrito] = useState<Carrito>({})
  const [clienteIdLocal, setClienteIdLocal] = useState<string | null>(null)

  const [sheetProductos, setSheetProductos] = useState(false)
  const [sheetCliente, setSheetCliente] = useState(false)
  const [solicitarOpen, setSolicitarOpen] = useState(false)
  const [confirmarOpen, setConfirmarOpen] = useState(false)
  const [anularOpen, setAnularOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmAccion | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [esperas, setEsperas] = useState<Record<string, boolean>>({})
  const [finalizandoArmado, setFinalizandoArmado] = useState(false)

  const isExecutingRef = useRef(false)

  const [motivoSolicitud, setMotivoSolicitud] = useState('')
  const [motivoSolicitudError, setMotivoSolicitudError] = useState<string | null>(null)
  const [motivoConfirmar, setMotivoConfirmar] = useState('')
  const [motivoConfirmarError, setMotivoConfirmarError] = useState<string | null>(null)
  const [motivoAnular, setMotivoAnular] = useState('')
  const [motivoAnularError, setMotivoAnularError] = useState<string | null>(null)

  const [transporteId, setTransporteId] = useState('')
  const [usarOcasional, setUsarOcasional] = useState(false)
  const [ocasionalNombre, setOcasionalNombre] = useState('')
  const [ocasionalDireccion, setOcasionalDireccion] = useState('')
  const [remitoError, setRemitoError] = useState<string | null>(null)
  const ocasionalNombreRef = useRef<HTMLInputElement>(null)
  const ocasionalDireccionRef = useRef<HTMLInputElement>(null)

  const [busquedaProducto, setBusquedaProducto] = useState('')
  const qProductoDebounced = useDebouncedValue(busquedaProducto.trim(), 250)
  const { data: resultadosBusqueda = [] } = useProductosSearch(qProductoDebounced)

  const updatePedido = useUpdatePedido()
  const aprobarMutation = useAprobarPedido()
  const tomarMutation = useTomarPedido()
  const completarMutation = useCompletarItemPedido()
  const prepararMutation = usePrepararPedido()
  const cancelarMutation = useCancelarPedido()
  const confirmarCancelacionMutation = useConfirmarCancelacionPedido()
  const despacharMutation = useDespacharPedido()
  const emitirRemitoMutation = useEmitirRemito()
  const anularRemitoMutation = useAnularRemito()

  useEffect(() => {
    if (!pedido) return
    const next: Carrito = {}
    for (const item of pedido.items) {
      const { cajas, sueltos } = calcularCajasSueltos(item.cantidad, item.producto.unidadesPorCaja)
      next[item.productoId] = { cajas, sueltos }
    }
    setCarrito(next)
    setClienteIdLocal(pedido.clienteId)
  }, [pedido])

  const productoPorId = useMemo(() => {
    const map = new Map<string, ProductoCardDatos>()
    for (const p of productos) map.set(p.id, p)
    for (const r of resultadosBusqueda) if (!map.has(r.id)) map.set(r.id, r)
    return map
  }, [productos, resultadosBusqueda])

  const lineas = useMemo(() => {
    if (!pedido) return []
    return pedido.items.map((item) => {
      const linea = carrito[item.productoId]
      const base = calcularCajasSueltos(item.cantidad, item.producto.unidadesPorCaja)
      const cajas = linea?.cajas ?? base.cajas
      const sueltos = linea?.sueltos ?? base.sueltos
      return {
        item,
        cajas,
        sueltos,
        unidades: cantidadLinea(cajas, sueltos, item.producto.unidadesPorCaja),
        producto: productoPorId.get(item.productoId),
      }
    })
  }, [pedido, carrito, productoPorId])

  const carritoIgual = useMemo(() => {
    if (!pedido) return true
    const actual = new Map(pedido.items.map((i) => [i.productoId, i.cantidad]))
    const aEditar = Object.entries(carrito).filter(([, l]) => l.cajas > 0 || l.sueltos > 0)
    if (aEditar.length !== actual.size) return false
    for (const [productoId, l] of aEditar) {
      const ubc = productoPorId.get(productoId)?.unidadesPorCaja ?? 1
      if (actual.get(productoId) !== cantidadLinea(l.cajas, l.sueltos, ubc)) return false
    }
    return true
  }, [pedido, carrito, productoPorId])

  const canEditar = pedido ? canEditarPedido(pedido, rol, userId) : false
  const clientePendiente = pedido ? pedidoClientePendiente(pedido) : false
  const remitoVigente = pedido?.remitos?.find((r) => r.estado === 'VIGENTE') ?? null
  const remitosInvalidados = pedido?.remitos?.filter((r) => r.estado === 'INVALIDADO') ?? []

  const clienteCambio = Boolean(pedido) && clienteIdLocal !== pedido?.clienteId
  const hayCambios = Boolean(pedido) && (clienteCambio || !carritoIgual)
  const clienteActual = clientes.find((c) => c.id === clienteIdLocal) ?? pedido?.cliente ?? null

  const pedidosActivos = useMemo(
    () => pedidosList.filter((p) => p.estado !== 'CANCELADO').sort(porActualizadoDesc),
    [pedidosList],
  )

  const clientesRecientes = useMemo(() => {
    const vistos = new Set<string>()
    const out: Cliente[] = []
    for (const p of pedidosActivos) {
      if (vistos.has(p.clienteId)) continue
      vistos.add(p.clienteId)
      out.push(p.cliente)
      if (out.length >= 5) break
    }
    return out
  }, [pedidosActivos])

  const frecuentesIds = useMemo(() => {
    if (!clienteIdLocal) return []
    const counts = new Map<string, number>()
    for (const p of pedidosActivos) {
      if (p.clienteId !== clienteIdLocal) continue
      for (const item of p.items) counts.set(item.productoId, (counts.get(item.productoId) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([entryId]) => entryId)
  }, [pedidosActivos, clienteIdLocal])

  const recientesIds = useMemo(() => {
    const vistos = new Set(frecuentesIds)
    const out: string[] = []
    for (const p of pedidosActivos) {
      for (const item of p.items) {
        if (!vistos.has(item.productoId)) {
          vistos.add(item.productoId)
          out.push(item.productoId)
          if (out.length >= 5) return out
        }
      }
    }
    return out
  }, [pedidosActivos, frecuentesIds])

  const frecuentes = useMemo(
    () => frecuentesIds.map((productoId) => productoPorId.get(productoId)).filter((p): p is ProductoCardDatos => Boolean(p)),
    [frecuentesIds, productoPorId],
  )

  const recientes = useMemo(
    () => recientesIds.map((productoId) => productoPorId.get(productoId)).filter((p): p is ProductoCardDatos => Boolean(p)),
    [recientesIds, productoPorId],
  )

  const puedeProgreso = pedido
    ? pedido.estado === 'EN_ARMADO' && (rol === 'admin' || (rol === 'armador' && esArmadorAsignado(pedido, userId)))
    : false
  const prepararListo = pedido ? canPreparar(pedido, rol, userId) : false
  const itemsCompletados = pedido?.items.filter((i) => i.completado).length ?? 0
  const itemsPendientes = pedido ? pedido.items.length - itemsCompletados : 0

  const [modalCarrito, setModalCarrito] = useState<Carrito | null>(null)

  function cambiarCantidad(productoId: string, cajas: number, sueltos: number) {
    setCarrito((prev) => ({ ...prev, [productoId]: { cajas, sueltos } }))
  }

  function eliminarLinea(productoId: string) {
    setCarrito((prev) => {
      const next = { ...prev }
      delete next[productoId]
      return next
    })
  }

  function abrirModalProductos() {
    setBusquedaProducto('')
    setModalCarrito({ ...carrito })
    setSheetProductos(true)
  }

  function cerrarModalProductos() {
    setModalCarrito(null)
    setSheetProductos(false)
  }

  function confirmarModalProductos() {
    if (modalCarrito) setCarrito(modalCarrito)
    cerrarModalProductos()
  }

  function cambiarCantidadModal(productoId: string, cajas: number, sueltos: number) {
    setModalCarrito((prev) => prev ? { ...prev, [productoId]: { cajas, sueltos } } : null)
  }

  function agregarAlCarritoModal(producto: ProductoCardDatos) {
    setModalCarrito((prev) => {
      if (!prev) return null
      const actual = prev[producto.id]
      return { ...prev, [producto.id]: { cajas: (actual?.cajas ?? 0) + 1, sueltos: actual?.sueltos ?? 0 } }
    })
  }

  const modalHayCambios = useMemo(() => {
    if (!modalCarrito) return false
    return JSON.stringify(modalCarrito) !== JSON.stringify(carrito)
  }, [modalCarrito, carrito])

  const modalResumen = useMemo(() => {
    if (!modalCarrito) return null
    let productos = 0
    let cajas = 0
    let sueltos = 0
    for (const v of Object.values(modalCarrito)) {
      if (v.cajas > 0 || v.sueltos > 0) {
        productos++
        cajas += v.cajas
        sueltos += v.sueltos
      }
    }
    if (productos === 0) return 'Sin productos'
    return `${productos} producto${productos === 1 ? '' : 's'} · ${cajas} caja${cajas === 1 ? '' : 's'} · ${sueltos} suelto${sueltos === 1 ? '' : 's'}`
  }, [modalCarrito])

  function buildItems(): PedidoItemInput[] {
    return Object.entries(carrito)
      .filter(([, l]) => l.cajas > 0 || l.sueltos > 0)
      .map(([productoId, l]) => {
        const ubc = productoPorId.get(productoId)?.unidadesPorCaja ?? 1
        return { productoId, cantidad: cantidadLinea(l.cajas, l.sueltos, ubc) }
      })
  }

  function invalidarTodo() {
    void qc.invalidateQueries({ queryKey: pedidosKeys.all })
    void refetchProductos()
  }

  async function ejecutarGuardar() {
    if (!pedido || !clienteIdLocal) return
    const items = buildItems()
    if (items.length === 0) {
      toast.warning('Agregá al menos un producto al pedido')
      return
    }
    setGuardando(true)
    try {
      const actualizado = await updatePedido.mutateAsync({
        id: pedido.id,
        clienteId: clienteIdLocal,
        items,
        expectedVersion: pedido.version,
      })
      toast.success(`Pedido ${actualizado.numero} actualizado`)
      invalidarTodo()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.message.includes('versión')) {
        toast.error('La versión del pedido cambió; se recargó. Reintentá.')
        void refetchPedido()
      } else if (e instanceof ApiError && e.status === 409) {
        toast.error(e.message)
        void refetchProductos()
      } else {
        toast.error(e instanceof Error ? e.message : 'Error al guardar los cambios')
      }
    } finally {
      setGuardando(false)
    }
  }

  function handleGuardar() {
    if (pedido?.estado === 'APROBADO') {
      setConfirm('guardar-aprobado')
      return
    }
    void ejecutarGuardar()
  }

  async function ejecutarConfirm() {
    if (!pedido || !confirm || isExecutingRef.current) return
    isExecutingRef.current = true
    try {
      if (confirm === 'aprobar') {
        const aprobado = await aprobarMutation.mutateAsync({
          id: pedido.id,
          expectedVersion: pedido.version,
          idempotencyKey: newIdempotencyKey(),
        })
        toast.success(`Pedido ${aprobado.numero} aprobado`)
        invalidarTodo()
      } else if (confirm === 'tomar') {
        await tomarMutation.mutateAsync({
          id: pedido.id,
          expectedVersion: pedido.version,
          idempotencyKey: newIdempotencyKey(),
        })
        toast.success(`Pedido ${pedido.numero} tomado`)
        invalidarTodo()
      } else if (confirm === 'cancelar') {
        const res = await cancelarMutation.mutateAsync({
          id: pedido.id,
          expectedVersion: pedido.version,
          idempotencyKey: newIdempotencyKey(),
        })
        if (res.requested) {
          toast.success('Solicitud enviada')
        } else if (res.discarded) {
          toast.success('Borrador descartado')
          invalidarTodo()
          navigate('/ale-bet/pedidos')
          return
        } else {
          toast.success(pedido.estado === 'APROBADO' ? 'Pedido cancelado y reserva liberada' : 'Pedido cancelado')
        }
        invalidarTodo()
      } else if (confirm === 'preparar') {
        setFinalizandoArmado(true)
        await prepararMutation.mutateAsync({
          id: pedido.id,
          expectedVersion: pedido.version,
          idempotencyKey: newIdempotencyKey(),
        })
        
        // Mantener el feedback visual por un breve tiempo para que el usuario entienda que terminó
        await new Promise(resolve => setTimeout(resolve, 700))
        
        toast.success('Pedido preparado')
        setFinalizandoArmado(false)
        invalidarTodo()
      } else if (confirm === 'despachar') {
        await despacharMutation.mutateAsync({
          id: pedido.id,
          expectedVersion: pedido.version,
          idempotencyKey: newIdempotencyKey(),
        })
        toast.success('Pedido despachado')
        invalidarTodo()
      } else if (confirm === 'guardar-aprobado') {
        await ejecutarGuardar()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al ejecutar la acción')
    } finally {
      isExecutingRef.current = false
      setConfirm(null)
    }
  }

  async function toggleCompletar(itemId: string) {
    if (!pedido) return
    try {
      await completarMutation.mutateAsync({
        pedidoId: pedido.id,
        itemId,
        expectedVersion: pedido.version,
        idempotencyKey: newIdempotencyKey(),
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar el item')
      void refetchPedido()
    }
  }

  function abrirSolicitarCancelacion() {
    setMotivoSolicitud('')
    setMotivoSolicitudError(null)
    setSolicitarOpen(true)
  }

  async function enviarSolicitud() {
    const motivo = motivoSolicitud.trim()
    if (motivo.length < 3) {
      setMotivoSolicitudError(motivo.length === 0 ? 'El motivo es obligatorio' : 'El motivo debe tener al menos 3 caracteres')
      return
    }
    setMotivoSolicitudError(null)
    if (!pedido) return
    try {
      const res = await cancelarMutation.mutateAsync({
        id: pedido.id,
        expectedVersion: pedido.version,
        motivo,
        idempotencyKey: newIdempotencyKey(),
      })
      toast.success(res.requested ? 'Solicitud enviada' : 'Pedido cancelado')
      setSolicitarOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al solicitar la cancelación')
    }
  }

  function abrirConfirmarCancelacion() {
    setMotivoConfirmar(pedido?.motivoCancelacion ?? '')
    setMotivoConfirmarError(null)
    setConfirmarOpen(true)
  }

  async function confirmarCancelacion() {
    const motivo = motivoConfirmar.trim()
    if (!motivo) {
      setMotivoConfirmarError('El motivo es obligatorio')
      return
    }
    setMotivoConfirmarError(null)
    if (!pedido) return
    try {
      await confirmarCancelacionMutation.mutateAsync({
        id: pedido.id,
        expectedVersion: pedido.version,
        motivo,
        idempotencyKey: newIdempotencyKey(),
      })
      toast.success('Pedido cancelado')
      setConfirmarOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al confirmar la cancelación')
    }
  }

  function abrirAnular() {
    setMotivoAnular('')
    setMotivoAnularError(null)
    setAnularOpen(true)
  }

  async function anularRemito() {
    const motivo = motivoAnular.trim()
    if (motivo.length < 3) {
      setMotivoAnularError(motivo.length === 0 ? 'El motivo es obligatorio' : 'El motivo debe tener al menos 3 caracteres')
      return
    }
    setMotivoAnularError(null)
    if (!pedido || !remitoVigente) return
    try {
      await anularRemitoMutation.mutateAsync({
        pedidoId: pedido.id,
        remitoId: remitoVigente.id,
        motivo,
        idempotencyKey: newIdempotencyKey(),
      })
      toast.success('Remito anulado')
      setAnularOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al anular el remito')
    }
  }

  async function emitirRemito() {
    if (usarOcasional) {
      const nombreValido = ocasionalNombre.trim().length >= 2
      const direccionValida = ocasionalDireccion.trim().length >= 2
      if (!nombreValido || !direccionValida) {
        setRemitoError('El transporte ocasional requiere nombre y dirección de al menos 2 caracteres')
        toast.error('Completá nombre y dirección del transporte ocasional')
        if (!nombreValido) {
          ocasionalNombreRef.current?.focus()
          ocasionalNombreRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
        } else {
          ocasionalDireccionRef.current?.focus()
          ocasionalDireccionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
        }
        return
      }
    } else if (!transporteId) {
      setRemitoError('Seleccioná un transporte habitual o indicá un transporte ocasional')
      return
    }
    setRemitoError(null)
    if (!pedido) return
    try {
      await emitirRemitoMutation.mutateAsync({
        pedidoId: pedido.id,
        expectedVersion: pedido.version,
        ...(usarOcasional
          ? { transporteOcasional: { nombre: ocasionalNombre.trim(), direccion: ocasionalDireccion.trim() } }
          : { transportistaId: transporteId }),
        idempotencyKey: newIdempotencyKey(),
      })
      toast.success('Remito emitido')
      setTransporteId('')
      setUsarOcasional(false)
      setOcasionalNombre('')
      setOcasionalDireccion('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al emitir el remito')
    }
  }

  async function descargarRemito() {
    if (!pedido) return
    try {
      await descargarRemitoPdf(pedido.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al descargar el remito')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton variant="card" className="h-28" />
        <div className="lg:grid lg:grid-cols-2 lg:gap-6">
          <div className="space-y-5">
            <Skeleton variant="card" className="h-40" />
            <Skeleton variant="card" className="h-56" />
          </div>
          <div className="mt-5 space-y-5 lg:mt-0">
            <Skeleton variant="card" className="h-40" />
            <Skeleton variant="card" className="h-40" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !pedido) {
    return (
      <div className="space-y-4">
        <h1 className="text-[22px] font-bold tracking-tight text-on-surface">Detalle de pedido</h1>
        <p className="font-body text-[13px] text-error">{error instanceof Error ? error.message : 'Pedido no encontrado'}</p>
      </div>
    )
  }

  const meta = ESTADO_META[pedido.estado]
  const puedeVerPanelRemito = esRemitos && ESTADOS_CON_REMITO.includes(pedido.estado)
  const clienteActualNombre = clienteActual?.nombre ?? pedido.cliente.nombre
  const barraArmadorVisible = canAccionesBarraArmador(pedido, rol, userId)

  return (
    <div className={cn('mx-auto w-full max-w-[1000px] flex flex-col', barraArmadorVisible && 'pb-[calc(env(safe-area-inset-bottom)+7rem)] lg:pb-0')}>
      <div className="mb-4">
        <button
          type="button"
          onClick={() => {
            if (location.key !== 'default' && window.history.length > 1) {
              navigate(-1)
            } else {
              navigate('/ale-bet/pedidos')
            }
          }}
          className="inline-flex items-center gap-1.5 font-body text-[13px] font-medium text-outline transition hover:text-on-surface focus:outline-none focus:text-on-surface"
        >
          <ArrowLeft size={16} strokeWidth={2} />
          Pedidos
        </button>
      </div>

      <section className="bg-surface-container-high overflow-hidden shadow-sm lg:rounded-2xl">
        {/* Header Compacto */}
        <div className="px-4 py-5 lg:px-8 lg:py-7 border-b border-white/10 bg-surface-container-low">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge variant={meta.variant}>{meta.label}</Badge>
                {clientePendiente && <Badge variant="warning">Pendiente de validación</Badge>}
              </div>
              <h1 className="text-[22px] md:text-[26px] font-bold tracking-tight text-on-surface leading-tight">
                {clienteActualNombre}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-[13px] text-on-surface-variant">
                <span data-testid="pedido-numero" className="font-semibold text-on-surface">Pedido {pedido.numero}</span>
                <span className="hidden md:inline text-outline/40">•</span>
                <span>Creado {formatFechaHora(pedido.createdAt)}</span>
                {pedido.vendedorNombre && (
                  <>
                    <span className="hidden md:inline text-outline/40">•</span>
                    <span>Vendedor: {pedido.vendedorNombre}</span>
                  </>
                )}
                {pedido.armadorNombre && (
                  <>
                    <span className="hidden md:inline text-outline/40">•</span>
                    <span>Armador: {pedido.armadorNombre}</span>
                  </>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-[13px] text-on-surface-variant">
                {clienteActual?.cuit && <span>CUIT {clienteActual.cuit}</span>}
                {clienteActual?.direccion && (
                  <>
                    {clienteActual?.cuit && <span className="hidden md:inline text-outline/40">•</span>}
                    <span>{clienteActual.direccion}{clienteActual?.localidad ? `, ${clienteActual.localidad}` : ''}</span>
                  </>
                )}
                {clienteActual?.contacto && (
                  <>
                    {(clienteActual?.cuit || clienteActual?.direccion) && <span className="hidden md:inline text-outline/40">•</span>}
                    <span>Contacto: {clienteActual.contacto}</span>
                  </>
                )}
              </div>
              {clientePendiente && <p className="mt-2 font-body text-[12px] font-medium text-warning">Facturación debe completar los datos</p>}
              {clienteCambio && <p className="mt-2 font-body text-[12px] font-medium text-warning">Cambio de cliente sin guardar</p>}
            </div>

            <div className="flex flex-wrap md:flex-col md:items-end justify-start gap-2 shrink-0 md:w-56">
              {canAprobar(pedido, rol, userId) && (
                <div className="w-full md:w-auto">
                  <Button onClick={() => setConfirm('aprobar')} disabled={clientePendiente} className="h-9 w-full md:w-auto px-4 text-[13px]">Aprobar</Button>
                  {clientePendiente && <p className="font-body text-[11px] font-medium text-warning text-center md:text-right mt-1">Requiere validación</p>}
                </div>
              )}
              {canTomar(pedido, rol, userId) && (
                <div data-testid="accion-tomar-desktop" className="hidden lg:block w-full md:w-auto">
                  <Button variant="outline" onClick={() => setConfirm('tomar')} className="h-9 w-full md:w-auto px-4 text-[13px]">Tomar</Button>
                </div>
              )}
              {canSolicitarCancelacion(pedido, rol, userId) && (
                <Button variant="outline" onClick={abrirSolicitarCancelacion} className="h-9 w-full md:w-auto px-4 text-[13px]">Solicitar cancelación</Button>
              )}
              {pedido.estado === 'PREPARADO' && !remitoVigente && (
                <p className="rounded-lg border border-primary-container/30 bg-primary-container/10 p-2 font-body text-[11px] font-medium text-primary-container text-center w-full">
                  Esperando remito
                </p>
              )}
              {canDespachar(pedido, rol, userId) && (
                <div data-testid="accion-despachar-desktop" className="hidden lg:block w-full md:w-auto">
                  <button type="button" onClick={() => setConfirm('despachar')} disabled={despacharMutation.isPending} className="h-9 w-full md:w-auto px-4 rounded-full border border-error/40 font-body text-[13px] font-semibold text-error transition hover:bg-error/10 disabled:opacity-50">Confirmar despacho</button>
                </div>
              )}

              {canEditar && (
                <div className="flex flex-wrap items-center gap-2 mt-2 w-full md:w-auto md:justify-end">
                  <button type="button" onClick={() => setSheetCliente(true)} className="flex h-8 items-center justify-center rounded-full border border-outline/20 bg-surface px-4 font-body text-[12px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-variant/30 active:scale-95">
                    Cambiar cliente
                  </button>
                  {canCancelarDirecto(pedido, rol, userId) && (
                    <button type="button" onClick={() => setConfirm('cancelar')} className="flex h-8 items-center justify-center rounded-full border border-error/20 bg-surface px-4 font-body text-[12px] font-semibold text-error transition-colors hover:bg-error/10 active:scale-95">
                      Cancelar
                    </button>
                  )}
                </div>
              )}

              {pedido.estado === 'DESPACHADO' && (
                <div className="text-left md:text-right w-full">
                  <p className="font-semibold text-[14px] text-success">Pedido despachado</p>
                  {pedido.despachadoAt && <p className="mt-0.5 font-body text-[12px] text-on-surface-variant">El {formatFechaHora(pedido.despachadoAt)}</p>}
                </div>
              )}
              {pedido.estado === 'CANCELADO' && (
                <div className="text-left md:text-right w-full">
                  <p className="font-semibold text-[14px] text-error">Pedido cancelado</p>
                  {pedido.motivoCancelacion && <p className="mt-0.5 font-body text-[12px] text-on-surface-variant">Motivo: {pedido.motivoCancelacion}</p>}
                </div>
              )}
            </div>
          </div>
        </div>

        {pedido.cancelacionSolicitadaAt && pedido.estado === 'EN_ARMADO' && (
          <div role="status" data-testid="banner-cancelacion" className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/40 bg-warning/10 p-4 lg:px-8">
            <div className="min-w-0">
              <p className="font-semibold text-[14px] text-warning">Cancelación solicitada</p>
              {pedido.motivoCancelacion && <p className="mt-0.5 font-body text-[12px] text-on-surface-variant">Motivo: {pedido.motivoCancelacion}</p>}
            </div>
            {canConfirmarCancelacion(pedido, rol, userId) ? (
              <div className="hidden lg:block" data-testid="accion-cancelacion-desktop">
                <button type="button" onClick={abrirConfirmarCancelacion} className="rounded-full border border-warning/50 px-4 py-2 font-body text-[12px] font-semibold text-warning transition hover:bg-warning/20">Confirmar cancelación</button>
              </div>
            ) : (
              <p className="font-body text-[11px] text-on-surface-variant">Esperando confirmación del armador</p>
            )}
          </div>
        )}

        <div className="p-4 lg:p-8 space-y-6">
          {puedeProgreso && (
            <section aria-label="Progreso de armado" className="hidden lg:block rounded-xl border border-white/10 bg-surface-container p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <h2 className="font-body text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">Armado</h2>
                  {finalizandoArmado ? (
                    <p className="mt-1 font-body text-[13px] font-semibold text-success animate-in slide-in-from-bottom-1 fade-in zoom-in-95 duration-200">
                      ✓ ARMADO FINALIZADO
                    </p>
                  ) : Object.keys(esperas).filter(k => esperas[k]).length > 0 ? (
                    <p className="mt-1 font-body text-[13px] font-semibold text-on-surface">
                      {itemsCompletados} preparados · {Object.keys(esperas).filter(k => esperas[k]).length} esperando producción · {pedido.items.length - itemsCompletados - Object.keys(esperas).filter(k => esperas[k]).length} pendiente
                    </p>
                  ) : (
                    <p className="mt-1 font-body text-[13px] font-semibold text-on-surface">
                      {itemsCompletados} de {pedido.items.length} productos preparados
                    </p>
                  )}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-highest">
                    <div className="h-full rounded-full bg-success transition-all duration-500 ease-out" style={{ width: `${finalizandoArmado ? 100 : (pedido.items.length === 0 ? 0 : (itemsCompletados / pedido.items.length) * 100)}%` }} />
                  </div>
                </div>
                <div className="shrink-0 w-48 text-center">
                  <Button onClick={() => setConfirm('preparar')} disabled={finalizandoArmado || !prepararListo || Object.keys(esperas).some(k => esperas[k])} loading={prepararMutation.isPending} className="h-10 w-full transition-all">FINALIZAR ARMADO</Button>
                  {!finalizandoArmado && itemsPendientes > 0 && <p className="mt-2 text-center font-body text-[11px] font-medium text-warning">Faltan items o hay esperas</p>}
                </div>
              </div>
            </section>
          )}

          <div>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-[20px] font-bold tracking-tight text-on-surface">Productos</h2>
              {canEditar && (
                <button type="button" onClick={abrirModalProductos} className="rounded-full border border-primary/40 px-3 py-1 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/10">+ Agregar producto</button>
              )}
            </div>

            {pedido.estado === 'APROBADO' && canEditar && (
              <p className="mb-4 rounded-md bg-surface-variant/30 px-3 py-2 font-body text-[12px] font-medium text-on-surface-variant inline-block">
                ℹ️ Editar puede cambiar la disponibilidad y liberar la reserva actual
              </p>
            )}

            <div className="flex flex-col border-t border-white/10">
              {lineas.map(({ item, cajas, sueltos, unidades, producto }) => (
                <LineaDetalle
                  key={item.productoId}
                  productoId={item.productoId}
                  nombre={item.producto.nombre}
                  sku={item.producto.sku}
                  cajas={cajas}
                  sueltos={sueltos}
                  unidades={unidades}
                  unidadesPorCaja={item.producto.unidadesPorCaja}
                  disponible={producto?.disponible}
                  reservado={producto?.reservado}
                  completado={item.completado}
                  editable={canEditar}
                  completable={puedeProgreso}
                  isFacturacion={rol === 'facturacion'}
                  isArmador={rol === 'armador'}
                  esperaProduccion={esperas[item.productoId]}
                  onChange={(nCajas, nSueltos) => cambiarCantidad(item.productoId, nCajas, nSueltos)}
                  onEliminar={canEditar ? () => eliminarLinea(item.productoId) : undefined}
                  onToggleCompletar={puedeProgreso ? () => void toggleCompletar(item.id) : undefined}
                  onToggleEspera={puedeProgreso ? () => {
                    setEsperas(prev => ({ ...prev, [item.productoId]: !prev[item.productoId] }))
                    if (!esperas[item.productoId]) toast.info('Backend pendiente: soporte para ESPERA_PRODUCCION')
                  } : undefined}
                />
              ))}
            </div>

            {canEditar && (
              <div className="mt-6 flex flex-col md:flex-row md:items-center justify-end gap-4 border-t border-white/10 pt-6">
                <Button onClick={handleGuardar} loading={guardando} disabled={!hayCambios} className="h-10 w-full md:w-auto px-6 font-semibold">Guardar cambios</Button>
              </div>
            )}
          </div>
        </div>

        {puedeVerPanelRemito && (
          <div className="border-t border-white/10 bg-surface-container/30 p-4 lg:p-8">
            {remitoVigente ? (
              <div className="md:flex md:items-center md:justify-between md:gap-6">
                <div className="flex-1">
                  <h2 className="font-body text-[13px] font-bold text-on-surface">Remito Vigente</h2>
                  <div className="mt-2 rounded-lg border border-white/10 bg-surface-container-low p-3 flex flex-wrap gap-4 items-center">
                    <div>
                      <p className="font-semibold text-[14px] text-on-surface">Remito {remitoVigente.numero}</p>
                      <p className="font-body text-[12px] text-on-surface-variant">{formatFecha(remitoVigente.fecha)}</p>
                    </div>
                    <div className="hidden md:block w-[1px] h-8 bg-white/10"></div>
                    <div>
                      <p className="font-body text-[12px] font-medium text-on-surface">Transporte</p>
                      <p className="font-body text-[12px] text-on-surface-variant">{remitoVigente.transporteNombre}{remitoVigente.transporteDireccion ? ` · ${remitoVigente.transporteDireccion}` : ''}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 md:mt-0 shrink-0 flex flex-row md:flex-col gap-2 md:w-40">
                  <Button variant="outline" onClick={() => void descargarRemito()} className="h-9 w-full flex-1 text-[13px]">Descargar</Button>
                  <Button variant="outline" onClick={abrirAnular} className="h-9 w-full flex-1 text-[13px] text-error hover:bg-error/10 border-error/20">Anular</Button>
                </div>
              </div>
            ) : canEmitirRemito(pedido, rol) ? (
              <div>
                <h2 className="font-body text-[13px] font-bold tracking-wide text-on-surface-variant uppercase mb-3">Transporte</h2>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col md:flex-row md:items-start gap-3">
                    <TransportSelector
                      transportistas={transportistas}
                      transporteId={transporteId}
                      setTransporteId={setTransporteId}
                      usarOcasional={usarOcasional}
                      setUsarOcasional={setUsarOcasional}
                    />
                    <Button onClick={() => void emitirRemito()} loading={emitirRemitoMutation.isPending} disabled={!transporteId && !usarOcasional} className="h-11 w-full md:w-auto px-6 font-semibold">
                      Emitir remito
                    </Button>
                  </div>
                  {usarOcasional && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full md:max-w-md pt-1 mt-1 border-t border-white/5">
                      <input ref={ocasionalNombreRef} value={ocasionalNombre} onChange={(e) => setOcasionalNombre(e.target.value)} aria-label="Nombre del transporte ocasional" placeholder="Nombre del transporte" className="input-field text-[14px] h-11 px-3" />
                      <input ref={ocasionalDireccionRef} value={ocasionalDireccion} onChange={(e) => setOcasionalDireccion(e.target.value)} aria-label="Dirección del transporte ocasional" placeholder="Dirección" className="input-field text-[14px] h-11 px-3" />
                    </div>
                  )}
                  {remitoError && <p role="alert" className="font-body text-[12px] font-medium text-error mt-2">{remitoError}</p>}
                </div>
              </div>
            ) : null}
            {remitosInvalidados.length > 0 && (
              <div className="mt-6 space-y-3 border-t border-white/5 pt-4">
                <h3 className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Remitos anteriores</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {remitosInvalidados.map((r) => (
                    <div key={r.id} className="rounded-lg border border-white/5 bg-surface-container-low p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-body text-[13px] font-semibold text-on-surface">Remito {r.numero}</p>
                        <Badge variant="error" className="h-5 px-1.5 text-[10px]">Anulado</Badge>
                      </div>
                      <p className="mt-1 font-body text-[11px] text-outline">{formatFecha(r.fecha)}</p>
                      {r.motivoInvalidacion && <p className="mt-1 font-body text-[11px] text-on-surface-variant">Motivo: {r.motivoInvalidacion}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <CambiarClienteSheet
        open={sheetCliente}
        onClose={() => setSheetCliente(false)}
        clientes={clientes}
        recientes={clientesRecientes}
        onSelect={(cliente) => {
          setClienteIdLocal(cliente.id)
          setSheetCliente(false)
        }}
      />

      <BottomSheet open={sheetProductos} onClose={cerrarModalProductos} title="Agregar producto" desktop="modal">
        <div className="flex flex-col h-full max-h-[85vh] lg:w-[750px] lg:max-w-full">
          <div className="px-4 py-4 lg:px-6 space-y-4 flex-1 overflow-y-auto">
            <input
              autoFocus
              type="search"
              value={busquedaProducto}
              onChange={(e) => setBusquedaProducto(e.target.value)}
              aria-label="Buscar producto"
              placeholder="Buscar producto por nombre o SKU"
              className="input-field text-base"
            />
            {busquedaProducto.trim() !== '' ? (
              <section aria-label="Resultados de búsqueda" className="space-y-2 pb-6">
                <h2 className="font-body text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">
                  Resultados para “{busquedaProducto.trim()}”
                </h2>
                {resultadosBusqueda.length === 0 ? (
                  <p className="py-6 text-center font-body text-[13px] text-on-surface-variant">
                    Sin resultados para “{busquedaProducto.trim()}”
                  </p>
                ) : (
                  resultadosBusqueda.map((r) => (
                    <ProductCard
                      key={r.id}
                      producto={r}
                      agregadoCajas={modalCarrito?.[r.id]?.cajas}
                      agregadoSueltos={modalCarrito?.[r.id]?.sueltos}
                      onChangeSueltos={(sueltos) => cambiarCantidadModal(r.id, modalCarrito?.[r.id]?.cajas ?? 0, sueltos)}
                      onTap={() => agregarAlCarritoModal(r)}
                    />
                  ))
                )}
              </section>
            ) : (
              <div className="pb-6">
                {frecuentes.length > 0 && (
                  <section aria-label="Frecuentes" className="space-y-2">
                    <h2 className="font-body text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">
                      Frecuentes del cliente
                    </h2>
                    {frecuentes.map((p) => (
                      <ProductCard
                        key={p.id}
                        producto={p}
                        agregadoCajas={modalCarrito?.[p.id]?.cajas}
                        agregadoSueltos={modalCarrito?.[p.id]?.sueltos}
                        onChangeSueltos={(sueltos) => cambiarCantidadModal(p.id, modalCarrito?.[p.id]?.cajas ?? 0, sueltos)}
                        onTap={() => agregarAlCarritoModal(p)}
                      />
                    ))}
                  </section>
                )}
                {recientes.length > 0 && (
                  <section aria-label="Recientes" className="mt-6 space-y-2">
                    <h2 className="font-body text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">
                      Recientes
                    </h2>
                    {recientes.map((p) => (
                      <ProductCard
                        key={p.id}
                        producto={p}
                        agregadoCajas={modalCarrito?.[p.id]?.cajas}
                        agregadoSueltos={modalCarrito?.[p.id]?.sueltos}
                        onChangeSueltos={(sueltos) => cambiarCantidadModal(p.id, modalCarrito?.[p.id]?.cajas ?? 0, sueltos)}
                        onTap={() => agregarAlCarritoModal(p)}
                      />
                    ))}
                  </section>
                )}
                {frecuentes.length === 0 && recientes.length === 0 && (
                  <p className="py-6 text-center font-body text-[13px] text-on-surface-variant">
                    Sin pedidos previos: buscá un producto para agregar
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="border-t border-white/10 bg-surface-container-low p-4 lg:px-6 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
            <p className="font-body text-[13px] font-medium text-on-surface-variant w-full text-center md:text-left md:w-auto">
              {modalResumen}
            </p>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Button variant="outline" onClick={cerrarModalProductos} className="h-10 flex-1 md:flex-none md:w-32">
                Cancelar
              </Button>
              <Button onClick={confirmarModalProductos} disabled={!modalHayCambios} className="h-10 flex-1 md:flex-none md:w-40">
                Confirmar cambios
              </Button>
            </div>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={solicitarOpen} onClose={() => setSolicitarOpen(false)} title="Solicitar cancelación" desktop="sheet">
        <div className="space-y-4">
          <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 font-body text-[12px] leading-relaxed text-primary">
            El armador deberá confirmar. La reserva no se libera hasta entonces.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="motivo-solicitud" className="font-body text-[12px] font-medium text-on-surface-variant">
              Motivo *
            </label>
            <textarea
              id="motivo-solicitud"
              value={motivoSolicitud}
              onChange={(e) => setMotivoSolicitud(e.target.value)}
              rows={3}
              placeholder="¿Por qué querés cancelar el pedido?"
              className="input-field text-base"
            />
          </div>
          {motivoSolicitudError && (
            <p role="alert" className="font-body text-[12px] font-medium text-error">
              {motivoSolicitudError}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setSolicitarOpen(false)} disabled={cancelarMutation.isPending} className="min-h-11 flex-1">
              Volver
            </Button>
            <Button onClick={() => void enviarSolicitud()} loading={cancelarMutation.isPending} className="min-h-11 flex-1">
              Enviar solicitud
            </Button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={confirmarOpen} onClose={() => setConfirmarOpen(false)} title="Confirmar cancelación" desktop="sheet">
        <div className="space-y-4">
          <p className="font-body text-[12px] leading-relaxed text-on-surface-variant">
            Confirmá la cancelación solicitada. Se liberará la reserva de stock.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="motivo-confirmar" className="font-body text-[12px] font-medium text-on-surface-variant">
              Motivo
            </label>
            <textarea
              id="motivo-confirmar"
              value={motivoConfirmar}
              onChange={(e) => setMotivoConfirmar(e.target.value)}
              rows={3}
              className="input-field text-base"
            />
          </div>
          {motivoConfirmarError && (
            <p role="alert" className="font-body text-[12px] font-medium text-error">
              {motivoConfirmarError}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setConfirmarOpen(false)} disabled={confirmarCancelacionMutation.isPending} className="min-h-11 flex-1">
              Volver
            </Button>
            <Button
              onClick={() => void confirmarCancelacion()}
              loading={confirmarCancelacionMutation.isPending}
              className="min-h-11 flex-1"
            >
              Confirmar cancelación
            </Button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        open={anularOpen}
        onClose={() => setAnularOpen(false)}
        title="Anular remito"
        desktop="modal"
        footer={
          <div className="flex flex-wrap md:justify-end gap-3 w-full">
            <Button variant="outline" onClick={() => setAnularOpen(false)} disabled={anularRemitoMutation.isPending} className="flex-1 md:flex-none h-10 px-6">
              Volver
            </Button>
            <button
              onClick={() => void anularRemito()}
              disabled={anularRemitoMutation.isPending}
              className="flex-1 md:flex-none inline-flex h-10 items-center justify-center gap-2 rounded border px-6 py-2 text-[13px] font-semibold transition-colors text-[#A06869] border-[#D5B4B5] bg-[#F5ECEC] hover:bg-[#F5ECEC]/80 disabled:opacity-50"
            >
              Anular remito
            </button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          <p className="font-body text-[13px] leading-relaxed text-on-surface-variant">
            El remito dejará de estar vigente y podrá emitirse uno nuevo.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="motivo-anular" className="font-body text-[13px] font-medium text-on-surface">
              Motivo <span className="text-error">*</span>
            </label>
            <textarea
              id="motivo-anular"
              value={motivoAnular}
              onChange={(e) => setMotivoAnular(e.target.value)}
              rows={3}
              placeholder="Indicá el motivo de la anulación"
              className="input-field w-full text-[13px] min-h-[80px] py-2.5 resize-none"
            />
          </div>
          {motivoAnularError && (
            <p role="alert" className="font-body text-[12px] font-medium text-[#A06869] bg-[#F5ECEC] border border-[#D5B4B5] p-2 rounded">
              {motivoAnularError}
            </p>
          )}
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirm === 'aprobar'}
        titulo="Aprobar pedido"
        mensaje={`¿Aprobar ${pedido.numero}? Se reservará el stock.`}
        accion="Aprobar"
        loading={aprobarMutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void ejecutarConfirm()}
      />
      <ConfirmDialog
        open={confirm === 'tomar'}
        titulo="TOMAR PEDIDO"
        mensaje={
          <div className="flex flex-col gap-2">
            <span className="text-[16px] font-bold text-on-surface">{pedido?.cliente.nombre}</span>
            <span className="text-on-surface-variant">Quedará asignado a vos para el armado.</span>
            <span className="text-[12px] opacity-70">Pedido {pedido?.numero}</span>
          </div>
        }
        accion="Tomar pedido"
        loading={tomarMutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={ejecutarConfirm}
      />
      <ConfirmDialog
        open={confirm === 'cancelar'}
        titulo={pedido.estado === 'BORRADOR' ? 'Descartar borrador' : 'Cancelar pedido'}
        mensaje={pedido.estado === 'BORRADOR' ? 'Este borrador se eliminará.' : pedido.estado === 'APROBADO' ? 'Se liberará la reserva de stock' : 'Se descartará el pedido'}
        accion={pedido.estado === 'BORRADOR' ? 'Descartar borrador' : 'Cancelar'}
        loading={cancelarMutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void ejecutarConfirm()}
      />
      <ConfirmDialog
        open={confirm === 'guardar-aprobado'}
        titulo="Guardar cambios"
        mensaje="Esto puede cambiar la disponibilidad y liberará la reserva actual. ¿Continuar?"
        accion="Continuar"
        loading={guardando}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void ejecutarConfirm()}
      />
      <ConfirmDialog
        open={confirm === 'preparar'}
        titulo="FINALIZAR ARMADO"
        mensaje={`¿Marcar ${pedido.numero} como completamente armado y listo para despacho/remito?`}
        accion="FINALIZAR ARMADO"
        loading={prepararMutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void ejecutarConfirm()}
      />
      <ConfirmDialog
        open={confirm === 'despachar'}
        titulo="Confirmar despacho"
        mensaje="Esta acción descontará definitivamente el stock."
        accion="Despachar"
        loading={despacharMutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void ejecutarConfirm()}
      />

      <ArmadorActionBar
        pedido={pedido}
        rol={rol}
        userId={userId}
        despachando={despacharMutation.isPending}
        hayEsperas={Object.keys(esperas).some(k => esperas[k])}
        finalizandoArmado={finalizandoArmado}
        onTomar={() => setConfirm('tomar')}
        onPreparar={() => setConfirm('preparar')}
        onDespachar={() => setConfirm('despachar')}
        onConfirmarCancelacion={abrirConfirmarCancelacion}
      />
    </div>
  )
}
