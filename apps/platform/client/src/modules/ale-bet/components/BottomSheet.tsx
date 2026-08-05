import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  /**
   * 'sheet': modal bottom sheet on every breakpoint.
   * 'panel': bottom sheet on mobile, always-visible side panel on lg+.
   * 'modal': bottom sheet on mobile, centered modal on md+.
   */
  desktop?: 'panel' | 'sheet' | 'modal'
}

interface PanelShellProps {
  title?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  variant: 'mobile' | 'desktop'
}

function PanelShell({ title, onClose, children, footer, variant }: PanelShellProps) {
  const isMobile = variant === 'mobile'
  return (
    <div
      role="dialog"
      aria-modal
      aria-label={title ?? 'Panel'}
      data-testid={isMobile ? 'bottom-sheet' : 'cart-panel'}
      className={cn(
        'flex flex-col overflow-hidden border border-white/10 bg-surface-container-low shadow-float relative',
        isMobile
          ? 'mt-auto max-h-[85dvh] rounded-t-2xl md:mt-0 md:max-h-[85dvh] md:rounded-xl'
          : 'max-h-[calc(100dvh-3rem)] rounded-xl',
        variant === 'desktop' && 'w-full'
      )}
    >
      {isMobile && (
        <div className="flex shrink-0 justify-center pb-1 pt-2 md:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-outline/40" />
        </div>
      )}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
        <h3 className="text-[15px] font-bold text-on-surface">{title}</h3>
        {isMobile && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-surface-high hover:text-on-surface"
          >
            ✕
          </button>
        )}
      </div>
      <div className={cn('flex-1 overflow-y-auto px-4', isMobile ? 'pb-[max(env(safe-area-inset-bottom),1rem)] md:pb-4' : 'pb-4')}>
        {children}
      </div>
      {footer && (
        <div
          className={cn(
            'shrink-0 border-t border-white/10 px-4 pt-3',
            isMobile ? 'pb-[max(env(safe-area-inset-bottom),1rem)] md:pb-4' : 'pb-4',
          )}
        >
          {footer}
        </div>
      )}
    </div>
  )
}

export function BottomSheet({ open, onClose, title, children, footer, desktop = 'sheet' }: BottomSheetProps) {
  const isPanel = desktop === 'panel'
  const isModal = desktop === 'modal'

  if (!open && !isPanel) return null

  return (
    <>
      {open && (
        <div className={cn('fixed inset-0 z-50 flex', isPanel ? 'lg:hidden flex-col' : (isModal ? 'flex-col md:items-center md:justify-center md:p-6' : 'flex-col'))}>
          <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
          <div className={cn('relative w-full z-10 flex flex-col', isModal ? 'md:max-w-[560px]' : '', !isModal && !isPanel ? 'mt-auto' : (!isModal ? 'mt-auto' : 'mt-auto md:mt-0'))}>
            <PanelShell variant="mobile" title={title} onClose={onClose} footer={footer}>
              {children}
            </PanelShell>
          </div>
        </div>
      )}
      {isPanel && (
        <div className="hidden min-w-0 lg:flex lg:flex-col lg:self-start lg:sticky lg:top-6">
          <PanelShell variant="desktop" title={title} onClose={onClose} footer={footer}>
            {children}
          </PanelShell>
        </div>
      )}
    </>
  )
}
