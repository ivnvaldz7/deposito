import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import Fuse from 'fuse.js'
import { Command } from 'cmdk'
import { Search, Clock, Eye, FilePlus, History, FlaskConical, Package, Tag, Box, BarChart2, FileDown, ExternalLink } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useCommandPaletteStore } from '../../stores/command-palette-store'
import { api } from '../../lib/api'

const BASE_URL = import.meta.env.VITE_API_URL || ''

// ─── Types ────────────────────────────────────────────────────────────────────

interface Droga {
  id: string
  nombreCompleto: string
  categoria: 'droga'
}

interface Estuche {
  id: string
  nombreCompleto: string
  categoria: 'estuche'
}

interface Etiqueta {
  id: string
  nombreCompleto: string
  categoria: 'etiqueta'
}

interface Frasco {
  id: string
  nombreCompleto: string
  categoria: 'frasco'
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
  const [products, setProducts] = useState<(Droga | Estuche | Etiqueta | Frasco)[]>([])
  const [metricResult, setMetricResult] = useState<MetricQueryResult | null>(null)
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false)

  const fuseRef = useRef<Fuse<any>>(
    new Fuse<any>([], { keys: ['nombreCompleto'], threshold: 0.4 })
  )

  useEffect(() => {
    if (!token) return
    Promise.all([
      api.get<Droga[]>('/productos?categoria=droga'),
      api.get<Estuche[]>('/productos?categoria=estuche'),
      api.get<Etiqueta[]>('/productos?categoria=etiqueta'),
      api.get<Frasco[]>('/productos?categoria=frasco'),
    ])
      .then(([drogas, estuches, etiquetas, frascos]) => {
        const all = [...drogas, ...estuches, ...etiquetas, ...frascos]
        setProducts(all)
        fuseRef.current = new Fuse(all, { keys: ['nombreCompleto'], threshold: 0.4 })
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
    const fused = fuseRef.current.search(query).slice(0, 8)
    return fused.map((r) => {
      const p = r.item
      let icon = <FlaskConical size={14} strokeWidth={1.5} />
      if (p.categoria === 'estuche') icon = <Package size={14} strokeWidth={1.5} />
      else if (p.categoria === 'etiqueta') icon = <Tag size={14} strokeWidth={1.5} />
      else if (p.categoria === 'frasco') icon = <Box size={14} strokeWidth={1.5} />

      const routes: Record<string, string> = {
        droga: '/drogas',
        estuche: '/estuches',
        etiqueta: '/etiquetas',
        frasco: '/frascos',
      }

      return {
        id: `producto-${p.id}`,
        label: p.nombreCompleto,
        description: `Ver en ${routes[p.categoria] ?? 'inventario'}`,
        icon,
        onSelect: () => {
          const base = routes[p.categoria] ?? ''
          closePalette()
          navigate(`${base}?producto=${encodeURIComponent(p.nombreCompleto)}`)
        },
      }
    })
  }, [query, closePalette, navigate])

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
        navigate(`/metricas?${qs.toString()}`)
      },
    }
  }, [metricResult, closePalette, navigate])

  const baseActions: Action[] = [
    { id: 'ver-ingresos', label: 'Ver ingresos', description: 'Ir a ingresos', icon: <FilePlus size={14} strokeWidth={1.5} />, onSelect: () => { closePalette(); navigate('/ingresos') } },
    { id: 'ver-actas', label: 'Ver actas', description: 'Ir a actas', icon: <Eye size={14} strokeWidth={1.5} />, onSelect: () => { closePalette(); navigate('/actas') } },
    { id: 'ver-movimientos', label: 'Ver movimientos', description: 'Ir a movimientos', icon: <History size={14} strokeWidth={1.5} />, onSelect: () => { closePalette(); navigate('/movimientos') } },
    { id: 'ver-ordenes', label: 'Ver órdenes', description: 'Ir a órdenes', icon: <FileDown size={14} strokeWidth={1.5} />, onSelect: () => { closePalette(); navigate('/ordenes') } },
    { id: 'ver-dashboard', label: 'Dashboard', description: 'Ir al dashboard', icon: <Clock size={14} strokeWidth={1.5} />, onSelect: () => { closePalette(); navigate('/dashboard') } },
  ]

  const allActions = [...(metricAction ? [metricAction] : []), ...productActions, ...baseActions]

  return createPortal(
    <Command.Dialog
      open={isOpen}
      onOpenChange={(open) => { if (!open) closePalette() }}
      label="Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
    >
      <div
        className="w-full max-w-xl rounded shadow-lg overflow-hidden"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <div className="flex items-center gap-3 px-4 border-b border-outline-variant/15">
          <Search size={16} strokeWidth={1.5} style={{ color: 'var(--color-on-surface-variant)' }} />
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder="Buscá productos, navegá secciones, consultá métricas…"
            className="w-full bg-transparent border-none outline-none py-3.5 font-body text-sm text-on-surface placeholder:text-on-surface-variant/60"
          />
        </div>

        <Command.List className="max-h-72 overflow-y-auto px-2 py-2 space-y-0.5">
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
            <Command.Group heading="Métricas">
              <Command.Item
                value={metricAction.id}
                onSelect={metricAction.onSelect}
                className="flex items-center gap-3 px-3 py-2.5 rounded cursor-pointer text-sm"
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
            <Command.Group heading="Productos">
              {productActions.map((action) => (
                <Command.Item
                  key={action.id}
                  value={action.id}
                  onSelect={action.onSelect}
                  className="flex items-center gap-3 px-3 py-2.5 rounded cursor-pointer text-sm"
                >
                  {action.icon}
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-on-surface">{action.label}</p>
                    <p className="font-body text-xs text-on-surface-variant truncate">{action.description}</p>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Navegación">
            {baseActions.map((action) => (
              <Command.Item
                key={action.id}
                value={action.id}
                onSelect={action.onSelect}
                className="flex items-center gap-3 px-3 py-2.5 rounded cursor-pointer text-sm"
              >
                {action.icon}
                <div className="flex-1 min-w-0">
                  <p className="font-body text-on-surface">{action.label}</p>
                  <p className="font-body text-xs text-on-surface-variant truncate">{action.description}</p>
                </div>
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Empty>
            <div className="px-3 py-6 text-center">
              <p className="font-body text-sm text-on-surface-variant">
                Sin resultados para <strong className="text-on-surface">{query}</strong>
              </p>
            </div>
          </Command.Empty>
        </Command.List>
      </div>
    </Command.Dialog>,
    document.body
  )
}
