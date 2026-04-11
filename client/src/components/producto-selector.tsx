import { useState, useEffect, useRef } from 'react'
import Fuse from 'fuse.js'
import { apiClient } from '@/lib/api-client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CategoriaProducto = 'droga' | 'estuche' | 'etiqueta' | 'frasco'

export interface Producto {
  id: string
  nombreBase: string
  volumen: string | null   // Decimal serialized as string
  unidad: string | null
  variante: string | null
  categoria: CategoriaProducto
  nombreCompleto: string
  activo: boolean
}

interface ProductoSelectorProps {
  id?: string
  categoria: CategoriaProducto
  displayValue: string    // texto visible en el input
  onChange: (productoId: string, nombreCompleto: string) => void
  token: string | null
  placeholder?: string
  disabled?: boolean
}

const PLACEHOLDERS: Record<CategoriaProducto, string> = {
  droga:    'Buscar droga del catálogo...',
  estuche:  'Buscar estuche del catálogo...',
  etiqueta: 'Buscar etiqueta del catálogo...',
  frasco:   'Buscar frasco del catálogo...',
}

export function ProductoSelector({
  id,
  categoria,
  displayValue,
  onChange,
  token,
  placeholder,
  disabled,
}: ProductoSelectorProps) {
  const [query, setQuery] = useState(displayValue)
  const [results, setResults] = useState<Producto[]>([])
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const fuseRef = useRef<Fuse<Producto>>(new Fuse([], { keys: ['nombreCompleto'], threshold: 0.4 }))

  useEffect(() => {
    if (!token) return
    apiClient
      .get<Producto[]>(`/productos?categoria=${categoria}`, token)
      .then((data) => {
        fuseRef.current = new Fuse(data, { keys: ['nombreCompleto'], threshold: 0.4 })
      })
      .catch(() => {/* silencioso */})
  }, [categoria, token])

  function handleInput(q: string) {
    setQuery(q)
    // If user clears the input, clear selection
    if (!q.trim()) {
      onChange('', '')
      setResults([])
      setOpen(false)
      setHighlightIndex(-1)
      return
    }
    const res = fuseRef.current.search(q).map((r) => r.item).slice(0, 10)
    setResults(res)
    setOpen(res.length > 0)
    setHighlightIndex(-1)
  }

  function select(producto: Producto) {
    setQuery(producto.nombreCompleto)
    onChange(producto.id, producto.nombreCompleto)
    setResults([])
    setOpen(false)
    setHighlightIndex(-1)
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={query}
        disabled={disabled}
        onChange={(e) => handleInput(e.target.value)}
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
        placeholder={placeholder ?? PLACEHOLDERS[categoria]}
        className="input-field"
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 w-full mt-1 bg-surface-highest/90 backdrop-blur-[12px] rounded shadow-float overflow-hidden">
          {results.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                select(p)
              }}
              className="w-full text-left px-4 py-2.5 font-body text-sm text-on-surface hover:bg-surface-bright transition-colors"
              style={i === highlightIndex ? { background: 'var(--color-surface-bright)' } : undefined}
            >
              {p.nombreCompleto}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
