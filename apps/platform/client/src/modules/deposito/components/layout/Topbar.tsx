import { useState } from 'react'
import { Search, Sun, Moon } from 'lucide-react'
import { useCommandPaletteStore } from '../../stores/command-palette-store'
import { ActivityFeed } from '@/components/notifications/ActivityFeed'
import { getStoredTheme, setTheme, type ThemeMode } from '../../lib/theme'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
const shortcutLabel = isMac ? '⌘K' : 'Shift+K'

export function Topbar() {
  const openPalette = useCommandPaletteStore((s) => s.openPalette)
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme() ?? 'light')

  function handleToggleTheme() {
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    setThemeState(nextTheme)
  }

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

        {/* Theme toggle */}
        <button
          type="button"
          onClick={handleToggleTheme}
          className="p-1.5 rounded text-on-surface-variant hover:bg-surface-high hover:text-on-surface transition-colors"
          title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        >
          {theme === 'dark' ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
        </button>

      </div>
    </header>
  )
}
