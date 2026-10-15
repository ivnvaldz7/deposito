import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import { Search, Clock, Eye, FilePlus, History, FlaskConical, Package, Tag, Box, BarChart2, FileDown, ExternalLink, CornerDownLeft, X } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useCommandPaletteStore } from '../../stores/command-palette-store'
import { api } from '../../lib/api'
import { compareProductsByNaturalPresentation, sortProductsByNaturalPresentation } from '@/lib/natural-product-order'
import { formatMercadoLabel, type Mercado } from '../inventory-shared/mercados'

const BASE_URL = import.meta.env.VITE_API_URL || ''

// ─── Types ────────────────────────────────────────────────────────────────────

interface CatalogProduct {
  id: string
  nombreCompleto: string
  categoria: 'droga' | 'estuche' | 'etiqueta' | 'frasco'
  mercadosHabilitados?: Mercado[]
}

const PRODUCT_CATEGORY_CONFIG: Record<CatalogProduct['categoria'], { label: string; className: string }> = {
  droga: { label: 'Droga', className: 'border-amber-400/25 bg-amber-500/15 text-amber-100' },
  estuche: { label: 'Estuche', className: 'border-primary/30 bg-primary-container/30 text-primary' },
  etiqueta: { label: 'Etiqueta', className: 'border-violet-400/25 bg-violet-500/15 text-violet-200' },
  frasco: { label: 'Frasco', className: 'border-sky-400/25 bg-sky-500/15 text-sky-200' },
}

function formatProductName(productName: string): string {
  return productName.replace(/\bcm3\b/gi, 'cm³').replace(/cm³/gi, 'cm³')
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim()
}

function productMatchesQuery(product: CatalogProduct, query: string): boolean {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return false
  const searchableText = normalizeSearchText([
    product.nombreCompleto,
    product.categoria,
    PRODUCT_CATEGORY_CONFIG[product.categoria].label,
    ...(product.mercadosHabilitados ?? []).map(formatMercadoLabel),
  ].join(' '))
  return terms.every((term) => searchableText.includes(term))
}

function ProductIcon({ categoria }: { categoria: CatalogProduct['categoria'] }) {
  const props = { size: 16, strokeWidth: 1.8, 'aria-hidden': true }
  if (categoria === 'estuche') return <Package {...props} />
  if (categoria === 'etiqueta') return <Tag {...props} />
  if (categoria === 'frasco') return <Box {...props} />
  return <FlaskConical {...props} />
}

function ProductMetadata({ product }: { product: CatalogProduct }) {
  const category = PRODUCT_CATEGORY_CONFIG[product.categoria]
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex rounded-md border px-1.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wide ${category.className}`}>
        {category.label}
      </span>
      {(product.mercadosHabilitados ?? []).map((mercado) => (
        <span
          key={mercado}
          aria-label={formatMercadoLabel(mercado)}
          title={formatMercadoLabel(mercado)}
          className="inline-flex rounded-md border border-outline-variant/50 bg-surface-container-high px-1.5 py-0.5 font-body text-[10px] font-medium text-on-surface-variant"
        >
          {formatMercadoLabel(mercado)}
        </span>
      ))}
    </div>
  )
}

// ─── Metrics query parser ─────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
}

const CATEGORIA_MAP: Record<string, string> = {
  droga: 'droga', drogas: 'droga',
  estuche: 'estuche', estuches: 'estuche',
  etiqueta: 'etiqueta', etiquetas: 'etiqueta',
  frasco: 'frasco', frascos: 'frasco',
}

interface MetricQueryParams {
  tipo: 'ingresos' | 'egresos' | 'movimientos'
  desde: string
  hasta: string
  categoria?: string
  label: string
}

interface MetricQueryResult {
  params: MetricQueryParams
  totalIngresos: number
  totalEgresos: number
  balance: number
  movimientosPeriodo: number
}

function parseMetricQuery(q: string): MetricQueryParams | null {
  const lower = q.toLowerCase().trim()
  const words = lower.split(/\s+/)

  const tipoMap: Record<string, MetricQueryParams['tipo']> = {
    ingresos: 'ingresos',
    ingreso: 'ingresos',
    egresos: 'egresos',
    egreso: 'egresos',
    movimientos: 'movimientos',
    movimiento: 'movimientos',
  }
  const tipo = tipoMap[words[0] ?? '']
  if (!tipo) return null

  const now = new Date()
  const currentYear = now.getFullYear()
  let desde = ''
  let hasta = ''
  let periodLabel = 'este período'
  let categoria: string | undefined

  for (const word of words.slice(1)) {
    if (word in MONTH_MAP) {
      const month = MONTH_MAP[word]!
      const year = month > now.getMonth() ? currentYear - 1 : currentYear
      const firstDay = new Date(year, month, 1)
      const lastDay  = new Date(year, month + 1, 0)
      desde = firstDay.toISOString().slice(0, 10)
      hasta = lastDay.toISOString().slice(0, 10)
      const monthName = Object.entries(MONTH_MAP).find(([, v]) => v === month)?.[0] ?? ''
      periodLabel = `${monthName} ${year}`
    }
    if (word in CATEGORIA_MAP) {
      categoria = CATEGORIA_MAP[word]!
    }
  }

  if (!desde) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    desde = start.toISOString().slice(0, 10)
    hasta = now.toISOString().slice(0, 10)
  }

  return { tipo, desde, hasta, categoria, label: `${tipo} ${periodLabel}${categoria ? ` (${categoria})` : ''}` }
}

async function fetchMetrics(params: MetricQueryParams): Promise<MetricQueryResult> {
  const qs = new URLSearchParams({ desde: params.desde, hasta: params.hasta })
  if (params.categoria) qs.set('categoria', params.categoria)
  const data = await api.get<MetricQueryResult>(`/metricas/resumen?${qs.toString()}`)
  return { ...data, params }
}

// ─── Actions ───────────────────────────────────────────────────────────────────

interface Action {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  product?: CatalogProduct
  onSelect: () => void
}

// ─── Command Palette ───────────────────────────────────────────────────────────

export function CommandPalette() {
  const { isOpen, closePalette } = useCommandPaletteStore()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [metricResult, setMetricResult] = useState<MetricQueryResult | null>(null)
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false)

  useEffect(() => {
    if (!token) return
    Promise.all([
      api.get<CatalogProduct[]>('/productos?categoria=droga'),
      api.get<CatalogProduct[]>('/productos?categoria=estuche'),
      api.get<CatalogProduct[]>('/productos?categoria=etiqueta'),
      api.get<CatalogProduct[]>('/productos?categoria=frasco'),
    ])
      .then(([drogas, estuches, etiquetas, frascos]) => {
        const all = sortProductsByNaturalPresentation(
          [...drogas, ...estuches, ...etiquetas, ...frascos],
          (producto) => producto.nombreCompleto,
        )
        setProducts(all)
      })
      .catch(() => {/* silencioso */})
  }, [token])

  // Metric query debounce
  useEffect(() => {
    setMetricResult(null)
    if (!query.trim()) return

    const parsed = parseMetricQuery(query)
    if (!parsed) return

    setIsLoadingMetrics(true)
    const timer = setTimeout(() => {
      fetchMetrics(parsed)
        .then(setMetricResult)
        .catch(() => setMetricResult(null))
        .finally(() => setIsLoadingMetrics(false))
    }, 400)

    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const productActions = useMemo((): Action[] => {
    if (!query.trim()) return []
    const matchingProducts = products
      .filter((product) => productMatchesQuery(product, query))
      .sort((a, b) => compareProductsByNaturalPresentation(a.nombreCompleto, b.nombreCompleto))
      .slice(0, 8)
    return matchingProducts.map((p) => {

      const routes: Record<string, string> = {
        droga: '/deposito/drogas',
        estuche: '/deposito/estuches',
        etiqueta: '/deposito/etiquetas',
        frasco: '/deposito/frascos',
      }

      return {
        id: `producto-${p.id}`,
        label: formatProductName(p.nombreCompleto),
        description: `Abrir en ${routes[p.categoria] ?? 'inventario'}`,
        icon: <ProductIcon categoria={p.categoria} />,
        product: p,
        onSelect: () => {
          const base = routes[p.categoria] ?? ''
          closePalette()
          const qs = new URLSearchParams({ productoId: p.id, producto: p.nombreCompleto, focus: String(Date.now()) })
          navigate(`${base}?${qs.toString()}`)
        },
      }
    })
  }, [products, query, closePalette, navigate])

  const metricAction = useMemo((): Action | null => {
    if (!metricResult) return null
    return {
      id: 'metric-result',
      label: metricResult.params.label,
      description: `Ingresos: ${metricResult.totalIngresos} · Egresos: ${metricResult.totalEgresos} · Balance: ${metricResult.balance >= 0 ? '+' : ''}${metricResult.balance} · Mov: ${metricResult.movimientosPeriodo}`,
      icon: <BarChart2 size={14} strokeWidth={1.5} />,
      onSelect: () => {
        const qs = new URLSearchParams({
          desde: metricResult.params.desde,
          hasta: metricResult.params.hasta,
        })
        if (metricResult.params.categoria) qs.set('categoria', metricResult.params.categoria)
        closePalette()
        navigate(`/deposito/metricas?${qs.toString()}`)
      },
    }
  }, [metricResult, closePalette, navigate])

  const baseActions: Action[] = [
    { id: 'ver-ingresos', label: 'Ver ingresos', description: 'Ir a ingresos', icon: <FilePlus size={14} strokeWidth={1.5} />, onSelect: () => { closePalette(); navigate('/deposito/ingresos') } },
    { id: 'ver-actas', label: 'Ver actas', description: 'Ir a actas', icon: <Eye size={14} strokeWidth={1.5} />, onSelect: () => { closePalette(); navigate('/deposito/actas') } },
    { id: 'ver-movimientos', label: 'Ver movimientos', description: 'Ir a movimientos', icon: <History size={14} strokeWidth={1.5} />, onSelect: () => { closePalette(); navigate('/deposito/movimientos') } },
    { id: 'ver-ordenes', label: 'Ver órdenes', description: 'Ir a órdenes', icon: <FileDown size={14} strokeWidth={1.5} />, onSelect: () => { closePalette(); navigate('/deposito/ordenes') } },
    { id: 'ver-dashboard', label: 'Dashboard', description: 'Ir al dashboard', icon: <Clock size={14} strokeWidth={1.5} />, onSelect: () => { closePalette(); navigate('/deposito/dashboard') } },
  ]

  const normalizedQuery = query.trim().toLocaleLowerCase('es')
  const visibleBaseActions = normalizedQuery
    ? baseActions.filter((action) =>
        `${action.label} ${action.description}`.toLocaleLowerCase('es').includes(normalizedQuery)
      )
    : baseActions

  const allActions = [...(metricAction ? [metricAction] : []), ...productActions, ...visibleBaseActions]

  return createPortal(
    <Command.Dialog
      open={isOpen}
      onOpenChange={(open) => { if (!open) closePalette() }}
      label="Buscador rápido"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 px-3 pt-[8vh] backdrop-blur-sm animate-backdrop-in sm:px-6 sm:pt-[12vh]"
    >
      <div className="relative w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <Command shouldFilter={false} className="flex max-h-[78vh] flex-col overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-low shadow-float animate-dialog-in">
          <div className="border-b border-outline-variant/35 bg-surface-container px-4 py-3 sm:px-5">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary-container/25 text-primary">
                <Search size={17} strokeWidth={2} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 font-body text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Acceso rápido</p>
                <Command.Input
                  ref={inputRef}
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Buscá productos, países o categorías…"
                  className="w-full bg-transparent border-none outline-none font-body text-sm text-on-surface placeholder:text-on-surface-variant/70"
                />
              </div>
              {query ? (
                <button type="button" onClick={() => setQuery('')} className="rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface" aria-label="Limpiar búsqueda">
                  <X size={16} aria-hidden="true" />
                </button>
              ) : (
                <kbd className="hidden rounded-md border border-outline-variant/50 bg-surface-container-low px-2 py-1 font-mono text-[10px] text-on-surface-variant sm:inline">Shift K</kbd>
              )}
            </div>
            <p className="mt-2 pl-12 font-body text-xs text-on-surface-variant">Escribí todas las palabras que buscás para acotar variantes y presentaciones.</p>
          </div>

          <Command.List className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
            {allActions.length === 0 && query.trim() && !isLoadingMetrics && (
              <div className="px-3 py-6 text-center">
                <p className="font-body text-sm text-on-surface-variant">
                  Sin resultados para <strong className="text-on-surface">{query}</strong>
                </p>
              </div>
            )}

            {isLoadingMetrics && query.trim() && (
              <div className="px-3 py-4">
                <p className="font-body text-sm text-on-surface-variant">Consultando métricas…</p>
              </div>
            )}

            {metricAction && (
              <Command.Group heading="Métricas" className="mb-3">
                <Command.Item
                  value={metricAction.id}
                  onSelect={metricAction.onSelect}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-sm transition-all duration-200 hover:bg-surface-container-high data-[selected=true]:border-primary/35 data-[selected=true]:bg-primary-container/20"
                >
                  {metricAction.icon}
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-on-surface">{metricAction.label}</p>
                    <p className="font-body text-xs text-on-surface-variant truncate">{metricAction.description}</p>
                  </div>
                  <ExternalLink size={12} strokeWidth={1.5} style={{ color: 'var(--color-on-surface-variant)' }} />
                </Command.Item>
              </Command.Group>
            )}

            {productActions.length > 0 && (
              <Command.Group heading={`Productos · ${productActions.length}`} className="mb-3">
                {productActions.map((action) => (
                  <Command.Item
                    key={action.id}
                    value={action.id}
                    onSelect={action.onSelect}
                    className="group flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-sm transition-all duration-200 hover:bg-surface-container-high data-[selected=true]:translate-x-0.5 data-[selected=true]:border-primary/35 data-[selected=true]:bg-primary-container/20"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-outline-variant/45 bg-surface-container-high text-primary transition-transform duration-200 group-data-[selected=true]:scale-105">
                      {action.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-body font-semibold text-on-surface">{action.label}</p>
                      {action.product && <ProductMetadata product={action.product} />}
                    </div>
                    <kbd className="hidden shrink-0 items-center gap-1 rounded-md border border-outline-variant/50 bg-surface-container-low px-1.5 py-1 font-mono text-[10px] text-on-surface-variant transition-colors group-data-[selected=true]:border-primary/40 group-data-[selected=true]:text-primary sm:inline-flex"><CornerDownLeft size={11} aria-hidden="true" /> Abrir</kbd>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {visibleBaseActions.length > 0 && <Command.Group heading="Navegación">
              {visibleBaseActions.map((action) => (
                <Command.Item
                  key={action.id}
                  value={action.id}
                  onSelect={action.onSelect}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-sm transition-all duration-200 hover:bg-surface-container-high data-[selected=true]:border-primary/35 data-[selected=true]:bg-primary-container/20"
                >
                  {action.icon}
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-on-surface">{action.label}</p>
                    <p className="font-body text-xs text-on-surface-variant truncate">{action.description}</p>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>}

          </Command.List>
          <footer aria-label="Atajos del buscador" className="flex items-center justify-between gap-3 border-t border-outline-variant/30 bg-surface-container-low px-4 py-2.5 font-body text-[11px] text-on-surface-variant sm:px-5">
            <span className="truncate">{query ? `${productActions.length} ${productActions.length === 1 ? 'producto encontrado' : 'productos encontrados'}` : 'Productos, secciones y métricas'}</span>
            <span className="hidden shrink-0 items-center gap-2 sm:flex"><kbd className="rounded border border-outline-variant/45 px-1 py-0.5 font-mono">↑↓</kbd> navegar <kbd className="rounded border border-outline-variant/45 px-1 py-0.5 font-mono">Enter</kbd> abrir <kbd className="rounded border border-outline-variant/45 px-1 py-0.5 font-mono">Esc</kbd> cerrar</span>
          </footer>
        </Command>
      </div>
    </Command.Dialog>,
    document.body
  )
}
