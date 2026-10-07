import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CartBottomBarProps {
  productos: number
  unidades: number
  onOpen: () => void
  primaryAction?: ReactNode
  className?: string
}

/**
 * Sticky mobile cart summary bar. Renders fixed at the bottom of the viewport
 * with safe-area padding; hidden on lg+ where the cart panel is always visible.
 * Pages can pass a className to raise the bar above other fixed elements.
 */
export function CartBottomBar({ productos, unidades, onOpen, primaryAction, className }: CartBottomBarProps) {
  return (
    <div
      className={cn('fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-surface-container-low shadow-float lg:hidden', className)}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      data-testid="cart-bottom-bar"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-full border border-white/10 bg-surface-container-high px-4 font-body text-[13px] transition enabled:active:scale-[0.99]"
        >
          <span className="truncate font-semibold text-on-surface">
            {productos} productos · {unidades} unidades
          </span>
          <span className="shrink-0 font-semibold text-primary">Ver pedido</span>
        </button>
        {primaryAction}
      </div>
    </div>
  )
}
