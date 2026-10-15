import { useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { useCommandPaletteStore } from '../../stores/command-palette-store'
import { ActivityFeed } from '@/components/notifications/ActivityFeed'
import { getStoredTheme, setTheme, type ThemeMode } from '../../lib/theme'

export function Topbar() {
  const openPalette = useCommandPaletteStore((s) => s.openPalette)
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme() ?? 'light')

  function handleToggleTheme() {
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    setThemeState(nextTheme)
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={openPalette}
        className="font-body text-xs font-semibold uppercase tracking-[0.14em] text-on-surface-variant transition-colors hover:text-primary"
        title="Abrir buscador inteligente (Shift+K)"
      >
        Buscador inteligente
      </button>

      <ActivityFeed />

      <button
        type="button"
        onClick={handleToggleTheme}
        className="rounded p-1.5 text-on-surface-variant transition-colors hover:bg-surface-high hover:text-on-surface"
        title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      >
        {theme === 'dark' ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
      </button>
    </div>
  )
}
