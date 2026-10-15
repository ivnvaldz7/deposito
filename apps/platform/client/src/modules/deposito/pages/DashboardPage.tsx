import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Package, Plus, X, type LucideIcon } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { useAuthStore } from '@/stores/auth-store'
import { can } from '@/lib/permissions'
import { useDashboard, type TipoMovimiento } from '../queries'
import { formatCantidad } from '../lib/format-units'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/Dialog'
import { Topbar } from '../components/layout/Topbar'
import { LoadingState } from '../components/inventory-shared/inventory-states'

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatMercado(mercado: string): string {
  return mercado
    .split('_')
    .map((word) => word.charAt(0).toLocaleUpperCase('es-AR') + word.slice(1).toLocaleLowerCase('es-AR'))
    .join(' ')
}

export function formatProductName(productName: string): string {
  return productName.replace(/\bcm3\b/gi, 'cm³').replace(/cm³/gi, 'cm³')
}

type TipoConfig = {
  label: string
  icon: LucideIcon
  colorClass: string
}

const TIPO_CONFIG: Record<string, TipoConfig> = {
  ingreso_acta: { label: 'Ingreso', icon: ArrowDownToLine, colorClass: 'text-emerald-300' },
  egreso_orden: { label: 'Egreso', icon: ArrowUpFromLine, colorClass: 'text-rose-300' },
  ajuste_manual: { label: 'Ajuste', icon: ArrowLeftRight, colorClass: 'text-violet-300' },
  stock_inicial: { label: 'Stock inicial', icon: ArrowDownToLine, colorClass: 'text-emerald-300' },
}

export function resolveTipoConfig(tipo: TipoMovimiento): TipoConfig {
  const configured = TIPO_CONFIG[tipo]
  if (configured) return configured

  const readable = tipo.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toLocaleLowerCase('es-AR')
  return {
    label: readable ? readable.charAt(0).toLocaleUpperCase('es-AR') + readable.slice(1) : 'Tipo desconocido',
    icon: ArrowLeftRight,
    colorClass: 'text-on-surface-variant',
  }
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon: Icon,
  variant = 'default',
  onClick,
}: {
  label: string
  value: number | string
  icon: React.ComponentType<{ size?: number; className?: string }>
  variant?: 'default' | 'warning' | 'error'
  onClick?: () => void
}) {
  const content = <>
    <div className="flex justify-between items-start mb-md">
      <span className="font-body text-sm text-on-surface-variant">{label}</span>
      <Icon size={24} className="opacity-50" />
    </div>
    <div className="text-3xl font-bold text-on-surface tabular-nums">
      {value}
    </div>
  </>

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onClick()
          }
        }}
        className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`Ver productos con ${label.toLocaleLowerCase('es-AR')}`}
      >
        <GlassCard variant={variant} className="flex flex-col justify-between">
          {content}
        </GlassCard>
      </div>
    )
  }

  return (
    <GlassCard variant={variant} className="flex flex-col justify-between">
      {content}
    </GlassCard>
  )
}

function TipoIcon({ tipo }: { tipo: TipoMovimiento }) {
  const c = resolveTipoConfig(tipo)
  const Icon = c.icon
  return (
    <span
      data-testid={`movement-type-${tipo}`}
      className={`inline-flex items-center justify-center ${c.colorClass}`}
      aria-label={c.label}
      title={c.label}
    >
      <Icon aria-hidden="true" size={17} strokeWidth={2.5} />
    </span>
  )
}

type StockBajoRow = { id: string; productName: string; detail: string; quantity: string }

// ─── Stock Bajo Alert Card ──────────────────────────────────────────────────────

function StockAlertCard({
  productName,
  category,
  currentStock,
  unit,
  stockTone = 'tertiary',
}: {
  productName: string
  category: string
  currentStock: number
  unit: string
  stockTone?: 'tertiary' | 'error'
}) {
  return (
    <div className="bg-surface-container-high rounded-lg px-4 py-3 border border-white/10 hover:border-primary transition-colors duration-300 group">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-on-surface truncate">{formatProductName(productName)}</h3>
          <p className="font-body text-sm text-on-surface-variant mt-0.5">{category}</p>
        </div>
        <div className="text-right shrink-0">
          <span className={`text-2xl font-bold tabular-nums leading-none ${stockTone === 'error' ? 'text-error' : 'text-tertiary'}`}>
            {currentStock}
          </span>
          <span className="font-body text-xs text-on-surface-variant ml-1">{unit}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { data: stats, isLoading, error } = useDashboard()
  const [stockBajoOpen, setStockBajoOpen] = useState(false)

  if (isLoading) {
    return <LoadingState />
  }

  if (error) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="font-body text-sm text-error">No se pudo cargar el dashboard</p>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="font-body text-sm text-on-surface-variant">No hay datos disponibles.</p>
      </div>
    )
  }

  const hayStockBajo =
    stats.stockBajo.length > 0 ||
    stats.stockBajoEstuches.length > 0 ||
    stats.stockBajoEtiquetas.length > 0 ||
    stats.stockBajoFrascos.length > 0

  const totalItems =
    stats.totalDrogas + stats.totalEstuches + stats.totalEtiquetas + stats.totalFrascos

  const stockBajoRows: StockBajoRow[] = [
    ...stats.stockBajo.map((item) => ({ id: `droga-${item.id}`, productName: item.nombre, detail: 'Droga', quantity: formatCantidad(item.cantidad, 'droga') })),
    ...stats.stockBajoEstuches.map((item) => ({ id: `estuche-${item.id}`, productName: item.articulo, detail: `Estuche · ${formatMercado(item.mercado)}`, quantity: formatCantidad(item.cantidad, 'estuche') })),
    ...stats.stockBajoEtiquetas.map((item) => ({ id: `etiqueta-${item.id}`, productName: item.articulo, detail: `Etiqueta · ${formatMercado(item.mercado)}`, quantity: formatCantidad(item.cantidad, 'etiqueta') })),
    ...stats.stockBajoFrascos.map((item) => ({ id: `frasco-${item.id}`, productName: item.articulo, detail: 'Frasco', quantity: `${item.cantidadCajas} cajas` })),
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tighter sm:text-3xl">Depósito</h1>
          <p className="font-body text-sm text-on-surface-variant mt-1 sm:text-base">
            Resumen del inventario y alertas críticas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <Topbar />
          {can(user, 'deposito', 'ingresos.create') && (
            <button
              onClick={() => navigate('/deposito/ingresos')}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-lg py-sm font-body text-sm font-semibold text-on-primary shadow-float transition-transform duration-200 hover:brightness-110 sm:w-auto"
            >
              <Plus size={18} />
              <span>Nuevo ingreso</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-lg lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
            <MetricCard label="Total productos" value={totalItems.toLocaleString()} icon={Package} variant="default" />
            <MetricCard label="Stock bajo" value={stockBajoRows.length} icon={AlertTriangle} variant="warning" onClick={() => setStockBajoOpen(true)} />
          </div>

          <section>
            <div className="mb-md flex items-center justify-between">
              <h2 className="text-lg font-semibold text-on-surface">Alertas de stock bajo</h2>
              {hayStockBajo && <button type="button" onClick={() => setStockBajoOpen(true)} className="font-body text-xs text-primary hover:underline">Ver todo</button>}
            </div>
            {!hayStockBajo ? (
              <div className="flex h-32 items-center justify-center rounded-xl border border-white/10 bg-surface-container-high"><p className="font-body text-sm text-on-surface-variant">No hay alertas de stock bajo.</p></div>
            ) : (
              <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
                {stats.stockBajo.slice(0, 4).map((droga) => <StockAlertCard key={droga.id} productName={droga.nombre} category="Droga" currentStock={droga.cantidad} unit="kg" stockTone="error" />)}
                {stats.stockBajoEstuches.slice(0, 2).map((estuche) => <StockAlertCard key={estuche.id} productName={estuche.articulo} category={`Estuche · ${formatMercado(estuche.mercado)}`} currentStock={estuche.cantidad} unit="uds" />)}
                {stats.stockBajoEtiquetas.slice(0, 2).map((etiqueta) => <StockAlertCard key={etiqueta.id} productName={etiqueta.articulo} category={`Etiqueta · ${formatMercado(etiqueta.mercado)}`} currentStock={etiqueta.cantidad} unit="uds" />)}
                {stats.stockBajoFrascos.slice(0, 2).map((frasco) => <StockAlertCard key={frasco.id} productName={frasco.articulo} category={`Frasco · ${frasco.unidadesPorCaja} uds/caja`} currentStock={frasco.cantidadCajas} unit="cajas" />)}
              </div>
            )}
          </section>
        </div>

        <section className="min-w-0 lg:col-span-1">
          <h2 className="mb-md text-lg font-semibold text-on-surface">Últimos movimientos</h2>
          <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-container-high">
            <div className="divide-y divide-white/5 md:hidden">
              {stats.ultimosMovimientos.length === 0 ? <p className="p-6 text-center text-xs text-on-surface-variant">Sin movimientos registrados.</p> : stats.ultimosMovimientos.map((mov) => (
                <article key={mov.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="flex min-w-0 items-center gap-2"><TipoIcon tipo={mov.tipo} /><div className="min-w-0"><p className="truncate text-sm font-medium text-on-surface">{formatProductName(mov.productoNombre)}</p><p className="mt-0.5 font-body text-xs text-on-surface-variant">{formatFecha(mov.createdAt)}</p></div></div>
                  <p className="shrink-0 text-right text-sm font-bold tabular-nums" style={{ color: mov.cantidad >= 0 ? 'var(--color-primary)' : 'var(--color-error)' }}>{mov.cantidad >= 0 ? '+' : ''}{mov.cantidad} {mov.categoria === 'droga' ? 'kg' : 'uds'}</p>
                </article>
              ))}
            </div>
            <table className="hidden w-full table-fixed border-collapse text-left md:table">
              <colgroup><col className="w-[78px]" /><col /><col className="w-12" /><col className="w-[86px]" /></colgroup>
              <thead><tr className="border-b border-white/5 bg-surface-container-low font-body text-xs font-semibold uppercase tracking-wider text-on-surface-variant"><th className="p-3 font-normal">Fecha</th><th className="p-3 font-normal">Item</th><th className="p-3 text-center font-normal">Tipo</th><th className="whitespace-nowrap p-3 text-right font-normal">Qty</th></tr></thead>
              <tbody className="text-xs">
                {stats.ultimosMovimientos.length === 0 ? <tr><td colSpan={4} className="p-6 text-center font-body text-xs text-on-surface-variant">Sin movimientos registrados.</td></tr> : stats.ultimosMovimientos.map((mov) => (
                  <tr key={mov.id} className="group cursor-default border-b border-white/5 transition-colors duration-150 hover:bg-surface-container-highest">
                    <td className="whitespace-nowrap p-3 font-body text-on-surface-variant">{formatFecha(mov.createdAt)}</td>
                    <td className="max-w-[180px] truncate p-3 text-on-surface" title={formatProductName(mov.productoNombre)}>{formatProductName(mov.productoNombre)}</td>
                    <td className="p-3 text-center"><TipoIcon tipo={mov.tipo} /></td>
                    <td className="whitespace-nowrap p-3 text-right font-bold transition-transform group-hover:-translate-y-[1px]" style={{ color: mov.cantidad >= 0 ? 'var(--color-primary)' : 'var(--color-error)' }}>{mov.cantidad >= 0 ? '+' : ''}{mov.cantidad} {mov.categoria === 'droga' ? 'kg' : 'uds'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.ultimosMovimientos.length > 0 && can(user, 'deposito', 'movimientos.read') && <div className="border-t border-white/5 p-3 text-center"><button onClick={() => navigate('/deposito/movimientos')} className="font-body text-xs text-primary hover:underline">Ver historial</button></div>}
          </div>
        </section>
      </div>

      <Dialog open={stockBajoOpen} onOpenChange={setStockBajoOpen}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-start justify-between gap-4"><DialogHeader><DialogTitle>Stock bajo</DialogTitle></DialogHeader><button type="button" onClick={() => setStockBajoOpen(false)} aria-label="Cerrar" className="rounded p-1 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"><X size={18} /></button></div>
          <div className="overflow-hidden rounded-lg border border-outline-variant/20">
            <table className="w-full text-left text-sm"><thead className="bg-surface-container-low font-body text-xs uppercase tracking-wider text-on-surface-variant"><tr><th className="p-3 font-medium">Producto</th><th className="p-3 text-right font-medium">Cantidad</th></tr></thead><tbody>{stockBajoRows.map((item) => <tr key={item.id} className="border-t border-outline-variant/10"><td className="p-3"><p className="font-medium text-on-surface">{formatProductName(item.productName)}</p><p className="mt-0.5 font-body text-xs text-on-surface-variant">{item.detail}</p></td><td className="whitespace-nowrap p-3 text-right font-bold tabular-nums text-error">{item.quantity}</td></tr>)}</tbody></table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
