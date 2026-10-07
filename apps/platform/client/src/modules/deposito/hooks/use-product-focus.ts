import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

interface FocusCandidate { id: string; productoId?: string | null; name: string }
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('es')

export function useProductFocus(candidates: FocusCandidate[]) {
  const [searchParams] = useSearchParams()
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const signal = searchParams.get('focus')
  const productoId = searchParams.get('productoId')
  const productoName = searchParams.get('producto')
  const targetId = useMemo(() => {
    if (!signal) return null
    return candidates.find((item) => productoId && item.productoId === productoId)?.id
      ?? candidates.find((item) => productoName && normalize(item.name) === normalize(productoName))?.id
      ?? null
  }, [candidates, productoId, productoName, signal])

  useEffect(() => {
    if (!targetId) return
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-product-focus-id]'))
      .filter((item) => item.dataset.productFocusId === targetId)
    const node = nodes.find((item) => item.offsetParent !== null) ?? nodes[0]
    if (!node) return
    setFocusedId(targetId)
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    node.focus({ preventScroll: true })
    const timer = window.setTimeout(() => setFocusedId(null), 2500)
    return () => window.clearTimeout(timer)
  }, [signal, targetId])

  return { isFocused: (id: string) => focusedId === id, targetProps: (id: string) => ({ 'data-product-focus-id': id, tabIndex: -1 }) }
}
