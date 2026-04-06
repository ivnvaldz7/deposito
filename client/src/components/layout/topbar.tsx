import { LogOut, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useCommandPaletteStore } from '@/stores/command-palette-store'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
const shortcutLabel = isMac ? '⌘K' : 'Ctrl+Shift+K'

export function Topbar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const openPalette = useCommandPaletteStore((s) => s.openPalette)

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
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

        {user && (
          <span className="font-body text-on-surface text-sm hidden sm:block">
            {user.name}
          </span>
        )}
        <button
          onClick={handleLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <LogOut size={16} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  )
}
