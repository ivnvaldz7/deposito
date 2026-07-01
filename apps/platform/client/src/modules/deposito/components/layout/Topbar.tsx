import { Search } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useCommandPaletteStore } from '../../stores/command-palette-store'
import { ActivityFeed } from '@/components/notifications/ActivityFeed'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
const shortcutLabel = isMac ? '⌘K' : 'Ctrl+Shift+K'

// ─── Topbar ───────────────────────────────────────────────────────────────────

export function Topbar() {
  const user = useAuthStore((s) => s.user)
  const openPalette = useCommandPaletteStore((s) => s.openPalette)

  return (
    <header className="h-12 bg-surface-low flex items-center justify-between px-5 shrink-0">
      <span className="font-body text-on-surface-variant text-xs uppercase tracking-widest">
        <span className="md:hidden font-heading text-primary-container font-bold text-sm tracking-tight normal-case">
          Depósito
        </span>
      </span>

      <div className="flex items-center gap-3">
        {/* Search trigger — desktop */}
        <button
          onClick={openPalette}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright transition-colors text-on-surface-variant hover:text-on-surface"
          title={`Buscar (${shortcutLabel})`}
        >
          <Search size={13} strokeWidth={1.5} />
          <span className="font-body text-xs">Buscar</span>
          <kbd className="font-body text-xs opacity-60 ml-1">{shortcutLabel}</kbd>
        </button>

        {/* Activity Feed (SSE + toggle + panel) */}
        <ActivityFeed />

        {user && (
          <span className="font-body text-on-surface text-sm hidden sm:block">
            {user.name}
          </span>
        )}
      </div>
    </header>
  )
}
