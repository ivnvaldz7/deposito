import { useState, useEffect, useRef, useMemo } from 'react'
import Fuse from 'fuse.js'
import { api } from '../lib/api'
import type { Mercado } from './inventory-shared/mercados'
import { Box } from 'lucide-react' // just for some icon
import { compareProductsByNaturalPresentation, sortProductsByNaturalPresentation } from '@/lib/natural-product-order'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CategoriaProducto = 'droga' | 'estuche' | 'etiqueta' | 'frasco' | 'material_empaque'

export interface Producto {
  id: string
  nombreBase: string
  volumen: string | null
  unidad: string | null
  variante: string | null
  categoria: CategoriaProducto
  nombreCompleto: string
  codigo?: string
  presentacion?: number
  stockActual?: number
  stockPorMercado?: Partial<Record<Mercado, number>>
  activo: boolean
  estado: 'PENDIENTE_REVISION' | 'ACTIVO' | 'INACTIVO'
  mercadosHabilitados: Mercado[]
}

interface ProductoSelectorProps {
  id?: string
  categoria?: CategoriaProducto
  expandirMercados?: boolean
  mercadoFiltro?: Mercado | null
  displayValue: string
  onChange: (productoId: string, nombreCompleto: string, producto?: Producto, mercado?: Mercado) => void
  placeholder?: string
  disabled?: boolean
}

const PLACEHOLDERS: Record<CategoriaProducto, string> = {
  droga:    'Buscá una droga del catálogo...',
  estuche:  'Buscá un estuche del catálogo...',
  etiqueta: 'Buscá una etiqueta del catálogo...',
  frasco:   'Buscá un frasco del catálogo...',
  material_empaque: 'Buscá un material auxiliar del catálogo...',
}

export const MARKET_ABBR: Record<string, string> = {
  argentina: 'ARG 🇦🇷',
  colombia: 'COL 🇨🇴',
  mexico: 'MEX 🇲🇽',
  ecuador: 'ECU 🇪🇨',
  bolivia: 'BOL 🇧🇴',
  paraguay: 'PAR 🇵🇾',
  VENEZUELA: 'VEN 🇻🇪',
  no_exportable: 'NO EXP 🚫',
}

interface VirtualRow {
  key: string
  producto: Producto
  mercadoContext?: Mercado
  displayText: string
  secundaryText?: string
}

function getStockDetail(producto: Producto, mercado?: Mercado): string | null {
  if (producto.stockActual === undefined) return null
  if (mercado && (producto.categoria === 'estuche' || producto.categoria === 'etiqueta')) {
    return `Stock: ${producto.stockPorMercado?.[mercado] ?? 0}`
  }
  return producto.categoria === 'estuche' || producto.categoria === 'etiqueta'
    ? `Stock total: ${producto.stockActual}`
    : `Stock: ${producto.stockActual}`
}

export function ProductoSelector({
  id,
  categoria,
  expandirMercados = true,
  mercadoFiltro,
  displayValue,
  onChange,
  placeholder,
  disabled,
}: ProductoSelectorProps) {
  const [query, setQuery] = useState(displayValue)
  const [allData, setAllData] = useState<Producto[]>([])
  const [results, setResults] = useState<VirtualRow[]>([])
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryRef = useRef(displayValue)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  
  const fuseRef = useRef<Fuse<VirtualRow>>(new Fuse<VirtualRow>([], { keys: ['displayText', 'secundaryText', 'producto.codigo'], threshold: 0.3 }))
  const rowsRef = useRef<VirtualRow[]>([])

  useEffect(() => {
    api
      .get<Producto[]>(`/productos${categoria ? `?categoria=${categoria}&` : '?'}activo=true&incluirStock=true`)
      .then((data) => {
        setAllData(sortProductsByNaturalPresentation(data, (producto) => producto.nombreCompleto))
      })
      .catch(() => {/* silencioso */})
  }, [categoria])

  useEffect(() => {
    let base = allData
    if (mercadoFiltro && (categoria === 'estuche' || categoria === 'etiqueta')) {
      base = base.filter(p => p.mercadosHabilitados.includes(mercadoFiltro))
    }

    const virtualRows: VirtualRow[] = []
    base.forEach(p => {
      // If we are showing a market-based category and we DON'T have a specific market filter,
      // expand the product into one row per market so the user can choose the market via the product.
      if (expandirMercados && !mercadoFiltro && (categoria === 'estuche' || categoria === 'etiqueta') && p.mercadosHabilitados.length > 0) {
        p.mercadosHabilitados.forEach(m => {
          virtualRows.push({
            key: `${p.id}-${m}`,
            producto: p,
            mercadoContext: m,
            displayText: `${p.nombreCompleto} — ${MARKET_ABBR[m] ?? m}`,
            secundaryText: [p.codigo, getStockDetail(p, m), categoria ?? p.categoria].filter(Boolean).join(' • ')
          })
        })
      } else {
        // Frascos, Drogas, or Estuche/Etiqueta with already selected market filter
        virtualRows.push({
          key: p.id,
          producto: p,
          mercadoContext: mercadoFiltro || undefined,
          displayText: p.nombreCompleto,
            secundaryText: [
              p.nombreBase,
              p.codigo,
              getStockDetail(p, mercadoFiltro || undefined),
              categoria ?? p.categoria,
            (!mercadoFiltro && p.mercadosHabilitados.length > 0) ? `(${p.mercadosHabilitados.map(m => MARKET_ABBR[m] || m).join(', ')})` : null
          ].filter(Boolean).join(' • ')
        })
      }
    })

    fuseRef.current = new Fuse(virtualRows, { keys: ['displayText', 'secundaryText', 'producto.codigo'], threshold: 0.3 })
    rowsRef.current = virtualRows
    if (inputRef.current === document.activeElement) {
      const activeQuery = queryRef.current
      const matchingRows = activeQuery.trim()
        ? fuseRef.current.search(activeQuery).map(result => result.item).slice(0, 10)
        : virtualRows.slice(0, 10)
      setResults(matchingRows)
      setOpen(matchingRows.length > 0)
    }
    // We don't automatically trigger a search here so the dropdown doesn't pop open unexpectedly,
    // but if it's already open, we could refresh it. For simplicity, we just rebuild the index.
  }, [allData, mercadoFiltro, categoria, expandirMercados])

  useEffect(() => {
    if (highlightIndex >= 0) optionRefs.current[highlightIndex]?.scrollIntoView?.({ block: 'nearest' })
  }, [highlightIndex])

  function handleInput(q: string) {
    queryRef.current = q
    setQuery(q)
    if (!q.trim()) {
      onChange('', '')
      setResults(rowsRef.current.slice(0, 10))
      setOpen(rowsRef.current.length > 0)
      setHighlightIndex(-1)
      return
    }
    const res = fuseRef.current
      .search(q)
      .map((r) => r.item)
      .sort((a, b) => compareProductsByNaturalPresentation(a.displayText, b.displayText))
      .slice(0, 10)
    setResults(res)
    setOpen(res.length > 0)
    setHighlightIndex(-1)
  }

  function select(row: VirtualRow) {
    queryRef.current = row.producto.nombreCompleto
    setQuery(row.producto.nombreCompleto)
    onChange(row.producto.id, row.producto.nombreCompleto, row.producto, row.mercadoContext)
    setResults([])
    setOpen(false)
    setHighlightIndex(-1)
  }

  return (
    <div className="relative">
      <input
        id={id}
        ref={inputRef}
        type="text"
        value={query}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id ?? 'producto-selector'}-options`}
        aria-activedescendant={highlightIndex >= 0 ? `${id ?? 'producto-selector'}-option-${highlightIndex}` : undefined}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={(e) => {
          if (!e.target.value.trim()) {
            setResults(rowsRef.current.slice(0, 10))
            setOpen(rowsRef.current.length > 0)
          } else if (results.length === 0) {
            handleInput(e.target.value)
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlightIndex((i) => Math.min(i + 1, results.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlightIndex((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' && highlightIndex >= 0) {
            e.preventDefault()
            select(results[highlightIndex]!)
          } else if (e.key === 'Escape') {
            setResults([])
            setOpen(false)
            setHighlightIndex(-1)
          }
        }}
        placeholder={placeholder ?? (categoria ? PLACEHOLDERS[categoria] : 'Buscá un producto terminado...')}
        className="input-field"
        autoComplete="off"
      />
      {open && (
        <div id={`${id ?? 'producto-selector'}-options`} role="listbox" className="absolute z-20 w-full mt-1 bg-surface-highest/90 backdrop-blur-[12px] rounded shadow-float overflow-hidden max-h-64 overflow-y-auto">
          {results.map((row, i) => (
            <button
              key={row.key}
              id={`${id ?? 'producto-selector'}-option-${i}`}
              ref={(element) => { optionRefs.current[i] = element }}
              role="option"
              aria-selected={i === highlightIndex}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                select(row)
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-surface-bright transition-colors border-b border-white/5 last:border-0"
              style={i === highlightIndex ? { background: 'var(--color-surface-bright)' } : undefined}
            >
              <div className="font-body text-sm text-on-surface font-medium">
                {row.displayText}
              </div>
              {row.secundaryText && (
                <div className="font-body text-xs text-on-surface-variant/70 mt-0.5">
                  {row.secundaryText}
                </div>
              )}
            </button>
          ))}
          {results.length === 0 && query.trim() && (
            <div className="px-4 py-3 text-sm text-on-surface-variant font-body text-center">
              No se encontraron productos.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
