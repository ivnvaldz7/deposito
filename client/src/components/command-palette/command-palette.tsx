import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import Fuse from 'fuse.js'
import { Command } from 'cmdk'
import { Search, Clock, Eye, FilePlus, History, FlaskConical, Package, Tag, Box, BarChart2, FileDown, ExternalLink } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useCommandPaletteStore } from '@/stores/command-palette-store'
import { apiClient } from '@/lib/api-client'

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

  // Must start with a metric keyword
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
    // Month detection
    if (word in MONTH_MAP) {
      const month = MONTH_MAP[word]!
      const year = month > now.getMonth() ? currentYear - 1 : currentYear
      const firstDay = new Date(year, month, 1)
      const lastDay  = new Date(year, month + 1, 0)
      desde = firstDay.toISOString().slice(0, 10)
      hasta = lastDay.toISOString().slice(0, 10)
      periodLabel = `${word} ${year}`
      continue
    }
    // Relative periods
    if (word === 'semana') {
      const d = new Date(now)
      d.setDate(now.getDate() - 6)
      desde = d.toISOString().slice(0, 10)
      hasta = now.toISOString().slice(0, 10)
      periodLabel = 'última semana'
      continue
    }
    if (word === 'mes') {
      const d = new Date(now.getFullYear(), now.getMonth(), 1)
      desde = d.toISOString().slice(0, 10)
      hasta = now.toISOString().slice(0, 10)
      periodLabel = 'este mes'
      continue
    }
    if (word === 'año' || word === 'anio') {
      desde = `${currentYear}-01-01`
      hasta = now.toISOString().slice(0, 10)
      periodLabel = `año ${currentYear}`
      continue
    }
    // Category detection
    if (word in CATEGORIA_MAP) {
      categoria = CATEGORIA_MAP[word]
    }
  }

  const label = `${tipo} ${periodLabel}${categoria ? ` · ${categoria}` : ''}`
  return { tipo, desde, hasta, categoria, label }
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const HISTORY_KEY = 'deposito-cmd-history'
const FREQ_KEY = 'deposito-cmd-freq'

function getHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function saveToHistory(query: string): void {
  const trimmed = query.trim()
  if (!trimmed) return
  const h = getHistory().filter((q) => q !== trimmed)
  h.unshift(trimmed)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 10)))
}

function getFrequency(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FREQ_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

function incrementFreq(nombre: string): void {
  const freq = getFrequency()
  freq[nombre] = (freq[nombre] ?? 0) + 1
  localStorage.setItem(FREQ_KEY, JSON.stringify(freq))
}

function buildInventoryPath(
  path: string,
  producto: string,
  mercado?: string
): string {
  const params = new URLSearchParams({ producto })
  if (mercado) params.set('mercado', mercado)
  return `${path}?${params.toString()}`
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType
  label: string
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onClick(e)
      }}
      className="flex items-center gap-1 px-2 py-1 rounded font-body text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors"
    >
      <Icon size={12} strokeWidth={1.5} />
      <span className="hidden sm:block">{label}</span>
    </button>
  )
}

// ─── Command Palette ──────────────────────────────────────────────────────────

export function CommandPalette() {
  const { isOpen, openPalette, closePalette, togglePalette } = useCommandPaletteStore()
  const token = useAuthStore((s) => s.token)
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [drogas, setDrogas] = useState<Droga[]>([])
  const [estuches, setEstuches] = useState<Estuche[]>([])
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([])
  const [frascos, setFrascos] = useState<Frasco[]>([])
  const [metricResult, setMetricResult] = useState<MetricQueryResult | null>(null)
  const [metricLoading, setMetricLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Derivado: se recalcula desde localStorage cada vez que la paleta abre
  const history = useMemo(() => (isOpen ? getHistory() : []), [isOpen])

  const fuseDrogas = useMemo(
    () => drogas.length ? new Fuse(drogas, { keys: ['nombreCompleto'], threshold: 0.45, includeScore: true }) : null,
    [drogas]
  )
  const fuseEstuches = useMemo(
    () => estuches.length ? new Fuse(estuches, { keys: ['nombreCompleto'], threshold: 0.45, includeScore: true }) : null,
    [estuches]
  )
  const fuseEtiquetas = useMemo(
    () => etiquetas.length ? new Fuse(etiquetas, { keys: ['nombreCompleto'], threshold: 0.45, includeScore: true }) : null,
    [etiquetas]
  )
  const fuseFrascos = useMemo(
    () => frascos.length ? new Fuse(frascos, { keys: ['nombreCompleto'], threshold: 0.45, includeScore: true }) : null,
    [frascos]
  )

  // ── Keyboard shortcut ───────────────────────────────────────────────────────
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)

    function handler(e: KeyboardEvent) {
      const key = e.key.toLowerCase()
      const code = e.code
      const isK = key === 'k' || code === 'KeyK'

      // Mac: ⌘K  |  Windows/Linux: Ctrl+Shift+K
      const triggered = isMac
        ? e.metaKey && !e.ctrlKey && !e.altKey && isK
        : e.ctrlKey && e.shiftKey && !e.altKey && isK

      if (triggered) {
        e.preventDefault()
        e.stopPropagation()
        togglePalette()
      }
      if (e.key === 'Escape' && isOpen) {
        closePalette()
      }
    }
    document.addEventListener('keydown', handler, { capture: true })
    return () => document.removeEventListener('keydown', handler, { capture: true })
  }, [isOpen, togglePalette, closePalette])

  // ── Focus input on open ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [isOpen])

  // ── Load catálogo on first open ─────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    if (drogas.length === 0) {
      apiClient.get<Droga[]>('/productos?categoria=droga', token).then(setDrogas).catch(() => {})
    }
    if (estuches.length === 0) {
      apiClient.get<Estuche[]>('/productos?categoria=estuche', token).then(setEstuches).catch(() => {})
    }
    if (etiquetas.length === 0) {
      apiClient.get<Etiqueta[]>('/productos?categoria=etiqueta', token).then(setEtiquetas).catch(() => {})
    }
    if (frascos.length === 0) {
      apiClient.get<Frasco[]>('/productos?categoria=frasco', token).then(setFrascos).catch(() => {})
    }
  }, [isOpen, drogas.length, estuches.length, etiquetas.length, frascos.length, token])

  // ── Reset query on close ────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) return
    const id = setTimeout(() => { setQuery(''); setMetricResult(null) }, 0)
    return () => clearTimeout(id)
  }, [isOpen])

  // ── Metric query mode ────────────────────────────────────────────────────────
  const metricParams = useMemo(() => parseMetricQuery(query), [query])

  const fetchMetricResult = useCallback(async (params: MetricQueryParams) => {
    setMetricLoading(true)
    setMetricResult(null)
    try {
      const qs = new URLSearchParams()
      if (params.desde) qs.set('desde', params.desde)
      if (params.hasta) qs.set('hasta', params.hasta)
      if (params.categoria) qs.set('categoria', params.categoria)
      const data = await apiClient.get<{
        totalIngresos: number
        totalEgresos: number
        balance: number
        movimientosPeriodo: number
      }>(`/metricas${qs.toString() ? `?${qs.toString()}` : ''}`, token)
      setMetricResult({ params, ...data })
    } catch {
      // ignore — metric mode is best-effort
    } finally {
      setMetricLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (!metricParams) { setMetricResult(null); return }
    const id = setTimeout(() => { fetchMetricResult(metricParams) }, 400)
    return () => clearTimeout(id)
  }, [metricParams, fetchMetricResult])

  // ── Fuzzy results with frequency sorting ────────────────────────────────────
  const results = useMemo<Droga[]>(() => {
    if (!query.trim() || !fuseDrogas) return []
    const freq = getFrequency()
    return fuseDrogas
      .search(query)
      .sort((a, b) => {
        const sa = a.score ?? 1
        const sb = b.score ?? 1
        if (Math.abs(sa - sb) < 0.1) {
          return (freq[b.item.nombreCompleto] ?? 0) - (freq[a.item.nombreCompleto] ?? 0)
        }
        return sa - sb
      })
      .slice(0, 10)
      .map((r) => r.item)
  }, [query, fuseDrogas])

  // ── Estuche fuzzy results ────────────────────────────────────────────────────
  const resultsEstuches = useMemo<Estuche[]>(() => {
    if (!query.trim() || !fuseEstuches) return []
    const freq = getFrequency()
    return fuseEstuches
      .search(query)
      .sort((a, b) => {
        const sa = a.score ?? 1
        const sb = b.score ?? 1
        if (Math.abs(sa - sb) < 0.1) {
          return (freq[b.item.nombreCompleto] ?? 0) - (freq[a.item.nombreCompleto] ?? 0)
        }
        return sa - sb
      })
      .slice(0, 5)
      .map((r) => r.item)
  }, [query, fuseEstuches])

  // ── Navigation with tracking ────────────────────────────────────────────────
  function goTo(droga: Droga, action: 'ver' | 'ingresar' | 'historial') {
    if (query.trim()) saveToHistory(query.trim())
    if (action !== 'historial') incrementFreq(droga.nombreCompleto)
    closePalette()
    if (action === 'ver') navigate(buildInventoryPath('/drogas', droga.nombreCompleto))
    else if (action === 'ingresar')
      navigate('/ingresos', { state: { productoId: droga.id, productoNombre: droga.nombreCompleto, categoria: 'droga' } })
    else navigate(`/movimientos?producto=${encodeURIComponent(droga.nombreCompleto)}`)
  }

  // ── Etiqueta fuzzy results ───────────────────────────────────────────────────
  const resultsEtiquetas = useMemo<Etiqueta[]>(() => {
    if (!query.trim() || !fuseEtiquetas) return []
    const freq = getFrequency()
    return fuseEtiquetas
      .search(query)
      .sort((a, b) => {
        const sa = a.score ?? 1
        const sb = b.score ?? 1
        if (Math.abs(sa - sb) < 0.1) return (freq[b.item.nombreCompleto] ?? 0) - (freq[a.item.nombreCompleto] ?? 0)
        return sa - sb
      })
      .slice(0, 5)
      .map((r) => r.item)
  }, [query, fuseEtiquetas])

  // ── Frasco fuzzy results ─────────────────────────────────────────────────────
  const resultsFrascos = useMemo<Frasco[]>(() => {
    if (!query.trim() || !fuseFrascos) return []
    const freq = getFrequency()
    return fuseFrascos
      .search(query)
      .sort((a, b) => {
        const sa = a.score ?? 1
        const sb = b.score ?? 1
        if (Math.abs(sa - sb) < 0.1) return (freq[b.item.nombreCompleto] ?? 0) - (freq[a.item.nombreCompleto] ?? 0)
        return sa - sb
      })
      .slice(0, 5)
      .map((r) => r.item)
  }, [query, fuseFrascos])

  function goToEstuche(estuche: Estuche, action: 'ver' | 'ingresar' | 'historial') {
    if (query.trim()) saveToHistory(query.trim())
    if (action !== 'historial') incrementFreq(estuche.nombreCompleto)
    closePalette()
    if (action === 'ver') navigate(buildInventoryPath('/estuches', estuche.nombreCompleto, 'todos'))
    else if (action === 'ingresar')
      navigate('/ingresos', { state: { productoId: estuche.id, productoNombre: estuche.nombreCompleto, categoria: 'estuche' } })
    else navigate(`/movimientos?producto=${encodeURIComponent(estuche.nombreCompleto)}`)
  }

  function goToEtiqueta(etiqueta: Etiqueta, action: 'ver' | 'ingresar' | 'historial') {
    if (query.trim()) saveToHistory(query.trim())
    if (action !== 'historial') incrementFreq(etiqueta.nombreCompleto)
    closePalette()
    if (action === 'ver') navigate(buildInventoryPath('/etiquetas', etiqueta.nombreCompleto, 'todos'))
    else if (action === 'ingresar')
      navigate('/ingresos', { state: { productoId: etiqueta.id, productoNombre: etiqueta.nombreCompleto, categoria: 'etiqueta' } })
    else navigate(`/movimientos?producto=${encodeURIComponent(etiqueta.nombreCompleto)}`)
  }

  function goToMetricas(params: MetricQueryParams) {
    if (query.trim()) saveToHistory(query.trim())
    closePalette()
    const qs = new URLSearchParams()
    if (params.desde) qs.set('desde', params.desde)
    if (params.hasta) qs.set('hasta', params.hasta)
    if (params.categoria) qs.set('categoria', params.categoria)
    navigate(`/metricas${qs.toString() ? `?${qs.toString()}` : ''}`)
  }

  function exportMetricPdf(params: MetricQueryParams) {
    const qs = new URLSearchParams()
    if (params.desde) qs.set('desde', params.desde)
    if (params.hasta) qs.set('hasta', params.hasta)
    if (params.categoria) qs.set('categoria', params.categoria)
    const url = `/api/metricas/exportar-pdf${qs.toString() ? `?${qs.toString()}` : ''}`
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `metricas-${params.desde || 'inicio'}-${params.hasta || 'hoy'}.pdf`
        link.click()
        URL.revokeObjectURL(link.href)
      })
      .catch(() => {})
    if (query.trim()) saveToHistory(query.trim())
    closePalette()
  }

  function goToFrasco(frasco: Frasco, action: 'ver' | 'ingresar' | 'historial') {
    if (query.trim()) saveToHistory(query.trim())
    if (action !== 'historial') incrementFreq(frasco.nombreCompleto)
    closePalette()
    if (action === 'ver') navigate(buildInventoryPath('/frascos', frasco.nombreCompleto))
    else if (action === 'ingresar')
      navigate('/ingresos', { state: { productoId: frasco.id, productoNombre: frasco.nombreCompleto, categoria: 'frasco' } })
    else navigate(`/movimientos?producto=${encodeURIComponent(frasco.nombreCompleto)}`)
  }

  // ── Floating button (mobile) — always rendered ──────────────────────────────
  const floatingBtn = !isOpen
    ? createPortal(
        <button
          onClick={openPalette}
          aria-label="Abrir búsqueda"
          className="fixed bottom-5 right-5 z-30 md:hidden flex items-center justify-center w-12 h-12 rounded shadow-float transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(180deg, #54e16d 0%, #00AE42 100%)' }}
        >
          <Search size={20} strokeWidth={1.5} style={{ color: '#003918' }} />
        </button>,
        document.body
      )
    : null

  // ── Palette overlay ─────────────────────────────────────────────────────────
  const palette = isOpen
    ? createPortal(
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={closePalette}
          />

          {/* Container */}
          <div className="fixed inset-x-4 top-[12vh] z-50 mx-auto max-w-2xl">
            <Command
              shouldFilter={false}
              className="overflow-hidden rounded shadow-float"
              style={{
                background: 'rgba(49,54,49,0.88)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
            >
              {/* Input row */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <label htmlFor="command-palette-search" className="sr-only">
                  Buscar en el inventario
                </label>
                <Search
                  size={16}
                  strokeWidth={1.5}
                  className="text-on-surface-variant shrink-0"
                />
                <Command.Input
                  id="command-palette-search"
                  ref={inputRef}
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Buscar drogas, estuches, etiquetas, frascos..."
                  className="flex-1 bg-transparent font-body text-base text-on-surface placeholder:text-on-surface-variant/60 outline-none border-none"
                />
                <kbd className="hidden sm:flex items-center gap-1 font-body text-xs text-on-surface-variant bg-surface-high px-1.5 py-0.5 rounded">
                  Esc
                </kbd>
              </div>

              {/* Divider */}
              <div className="h-px bg-outline-variant/15" />

              {/* List */}
              <Command.List className="max-h-[60vh] overflow-y-auto py-2">

                {/* ── No query: history ──────────────────────────────── */}
                {!query.trim() && history.length > 0 && (
                  <>
                    <div className="px-4 pt-2 pb-1 font-heading text-xs uppercase tracking-widest text-on-surface-variant">
                      Búsquedas recientes
                    </div>
                    {history.map((h) => (
                      <Command.Item
                        key={`hist-${h}`}
                        value={`hist:${h}`}
                        onSelect={() => setQuery(h)}
                        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors data-[selected=true]:bg-surface-bright"
                      >
                        <Clock
                          size={13}
                          strokeWidth={1.5}
                          className="text-on-surface-variant shrink-0"
                        />
                        <span className="font-body text-sm text-on-surface-variant">
                          {h}
                        </span>
                      </Command.Item>
                    ))}
                  </>
                )}

                {!query.trim() && history.length === 0 && (
                  <div className="px-4 py-8 text-center font-body text-sm text-on-surface-variant/60">
                    Escribí para buscar en el inventario
                  </div>
                )}

                {/* ── With query: fuzzy results ──────────────────────── */}
                {query.trim() && results.length > 0 && (
                  <>
                    <div className="px-4 pt-2 pb-1 font-heading text-xs uppercase tracking-widest text-on-surface-variant">
                      Drogas
                    </div>
                    {results.map((droga) => (
                      <Command.Item
                        key={droga.id}
                        value={droga.id}
                        onSelect={() => goTo(droga, 'ver')}
                        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors data-[selected=true]:bg-surface-bright group"
                      >
                        {/* Icon */}
                        <FlaskConical
                          size={14}
                          strokeWidth={1.5}
                          className="text-on-surface-variant shrink-0"
                        />

                        {/* Name + stock */}
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm text-on-surface truncate">
                            {droga.nombreCompleto}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity">
                          <ActionBtn
                            icon={Eye}
                            label="Ver"
                            onClick={() => goTo(droga, 'ver')}
                          />
                          <ActionBtn
                            icon={FilePlus}
                            label="Ingresar"
                            onClick={() => goTo(droga, 'ingresar')}
                          />
                          <ActionBtn
                            icon={History}
                            label="Historial"
                            onClick={() => goTo(droga, 'historial')}
                          />
                        </div>
                      </Command.Item>
                    ))}
                  </>
                )}

                {/* ── With query: estuches results ──────────────────── */}
                {query.trim() && resultsEstuches.length > 0 && (
                  <>
                    <div className="px-4 pt-2 pb-1 font-heading text-xs uppercase tracking-widest text-on-surface-variant">
                      Estuches
                    </div>
                    {resultsEstuches.map((estuche) => (
                      <Command.Item
                        key={estuche.id}
                        value={`estuche-${estuche.id}`}
                        onSelect={() => goToEstuche(estuche, 'ver')}
                        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors data-[selected=true]:bg-surface-bright group"
                      >
                        <Package
                          size={14}
                          strokeWidth={1.5}
                          className="text-on-surface-variant shrink-0"
                        />

                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm text-on-surface truncate">
                            {estuche.nombreCompleto}
                          </p>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity">
                          <ActionBtn
                            icon={Eye}
                            label="Ver"
                            onClick={() => goToEstuche(estuche, 'ver')}
                          />
                          <ActionBtn
                            icon={FilePlus}
                            label="Ingresar"
                            onClick={() => goToEstuche(estuche, 'ingresar')}
                          />
                          <ActionBtn
                            icon={History}
                            label="Historial"
                            onClick={() => goToEstuche(estuche, 'historial')}
                          />
                        </div>
                      </Command.Item>
                    ))}
                  </>
                )}

                {/* ── With query: etiquetas results ─────────────────── */}
                {query.trim() && resultsEtiquetas.length > 0 && (
                  <>
                    <div className="px-4 pt-2 pb-1 font-heading text-xs uppercase tracking-widest text-on-surface-variant">
                      Etiquetas
                    </div>
                    {resultsEtiquetas.map((etiqueta) => (
                      <Command.Item
                        key={etiqueta.id}
                        value={`etiqueta-${etiqueta.id}`}
                        onSelect={() => goToEtiqueta(etiqueta, 'ver')}
                        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors data-[selected=true]:bg-surface-bright group"
                      >
                        <Tag size={14} strokeWidth={1.5} className="text-on-surface-variant shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm text-on-surface truncate">{etiqueta.nombreCompleto}</p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity">
                          <ActionBtn icon={Eye} label="Ver" onClick={() => goToEtiqueta(etiqueta, 'ver')} />
                          <ActionBtn icon={FilePlus} label="Ingresar" onClick={() => goToEtiqueta(etiqueta, 'ingresar')} />
                          <ActionBtn icon={History} label="Historial" onClick={() => goToEtiqueta(etiqueta, 'historial')} />
                        </div>
                      </Command.Item>
                    ))}
                  </>
                )}

                {/* ── With query: frascos results ────────────────────── */}
                {query.trim() && resultsFrascos.length > 0 && (
                  <>
                    <div className="px-4 pt-2 pb-1 font-heading text-xs uppercase tracking-widest text-on-surface-variant">
                      Frascos
                    </div>
                    {resultsFrascos.map((frasco) => (
                      <Command.Item
                        key={frasco.id}
                        value={`frasco-${frasco.id}`}
                        onSelect={() => goToFrasco(frasco, 'ver')}
                        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors data-[selected=true]:bg-surface-bright group"
                      >
                        <Box size={14} strokeWidth={1.5} className="text-on-surface-variant shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm text-on-surface truncate">{frasco.nombreCompleto}</p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity">
                          <ActionBtn icon={Eye} label="Ver" onClick={() => goToFrasco(frasco, 'ver')} />
                          <ActionBtn icon={FilePlus} label="Ingresar" onClick={() => goToFrasco(frasco, 'ingresar')} />
                          <ActionBtn icon={History} label="Historial" onClick={() => goToFrasco(frasco, 'historial')} />
                        </div>
                      </Command.Item>
                    ))}
                  </>
                )}

                {/* ── Metric query mode ─────────────────────────────── */}
                {query.trim() && metricParams && (
                  <>
                    <div className="px-4 pt-2 pb-1 font-heading text-xs uppercase tracking-widest text-on-surface-variant">
                      Consulta de métricas
                    </div>
                    <div className="mx-2 mb-1 rounded p-3" style={{ background: 'rgba(96,165,250,0.08)' }}>
                      {/* Query label */}
                      <div className="flex items-center gap-2 mb-2">
                        <BarChart2 size={13} strokeWidth={1.5} style={{ color: '#60a5fa' }} />
                        <span className="font-heading text-xs text-on-surface-variant capitalize">
                          {metricParams.label}
                        </span>
                      </div>

                      {/* Result row */}
                      {metricLoading ? (
                        <div className="h-5 w-32 bg-surface-high rounded animate-pulse mb-3" />
                      ) : metricResult ? (
                        <div className="flex flex-wrap gap-3 mb-3">
                          <div className="flex flex-col">
                            <span className="font-body text-xs text-on-surface-variant">Ingresos</span>
                            <span className="font-heading text-base font-bold tabular-nums" style={{ color: '#00AE42' }}>
                              {metricResult.totalIngresos.toLocaleString()} uds
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="font-body text-xs text-on-surface-variant">Egresos</span>
                            <span className="font-heading text-base font-bold tabular-nums" style={{ color: '#ef4444' }}>
                              {metricResult.totalEgresos.toLocaleString()} uds
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="font-body text-xs text-on-surface-variant">Balance</span>
                            <span
                              className="font-heading text-base font-bold tabular-nums"
                              style={{ color: metricResult.balance >= 0 ? '#60a5fa' : '#ef4444' }}
                            >
                              {metricResult.balance.toLocaleString()} uds
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="font-body text-xs text-on-surface-variant">Movimientos</span>
                            <span className="font-heading text-base font-bold tabular-nums text-on-surface">
                              {metricResult.movimientosPeriodo}
                            </span>
                          </div>
                        </div>
                      ) : null}

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Command.Item
                          value="metric-ver-reporte"
                          onSelect={() => goToMetricas(metricParams)}
                          className="flex items-center gap-1.5 px-2 py-1.5 rounded font-body text-xs cursor-pointer transition-colors data-[selected=true]:bg-surface-bright text-on-surface-variant hover:text-on-surface"
                          style={{ background: 'rgba(255,255,255,0.06)' }}
                        >
                          <ExternalLink size={11} strokeWidth={1.5} />
                          Ver reporte completo
                        </Command.Item>
                        <Command.Item
                          value="metric-exportar-pdf"
                          onSelect={() => exportMetricPdf(metricParams)}
                          className="flex items-center gap-1.5 px-2 py-1.5 rounded font-body text-xs cursor-pointer transition-colors data-[selected=true]:bg-surface-bright text-on-surface-variant hover:text-on-surface"
                          style={{ background: 'rgba(255,255,255,0.06)' }}
                        >
                          <FileDown size={11} strokeWidth={1.5} />
                          Exportar PDF
                        </Command.Item>
                      </div>
                    </div>
                  </>
                )}

                {query.trim() && !metricParams && results.length === 0 && resultsEstuches.length === 0 && resultsEtiquetas.length === 0 && resultsFrascos.length === 0 && (
                  <div className="px-4 py-8 text-center font-body text-sm text-on-surface-variant/60">
                    Sin resultados para{' '}
                    <span className="text-on-surface">"{query}"</span>
                  </div>
                )}
              </Command.List>

              {/* Footer */}
              <div className="h-px bg-outline-variant/15" />
              <div className="flex items-center gap-4 px-4 py-2">
                <span className="font-body text-xs text-on-surface-variant/60">
                  <kbd className="font-body">↑↓</kbd> navegar
                </span>
                <span className="font-body text-xs text-on-surface-variant/60">
                  <kbd className="font-body">↵</kbd> ver
                </span>
                <span className="font-body text-xs text-on-surface-variant/60">
                  <kbd className="font-body">Esc</kbd> cerrar
                </span>
              </div>
            </Command>
          </div>
        </>,
        document.body
      )
    : null

  return (
    <>
      {floatingBtn}
      {palette}
    </>
  )
}
