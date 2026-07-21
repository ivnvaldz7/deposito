import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Shield,
  Users,
  LogOut,
  Moon,
  Sun,
  AppWindow,
} from 'lucide-react'
import { cn } from '@/modules/deposito/lib/utils'
import { apiClient } from '@/lib/api-client'
import { getStoredTheme, setTheme, type ThemeMode } from '@/modules/deposito/lib/theme'
import { useAuthStore } from '@/stores/auth-store'

const navItems = [
  { path: '/admin/usuarios', label: 'Usuarios', icon: Users },
]

export default function AdminSidebar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme() ?? 'light')

  async function handleLogout() {
    try {
      await apiClient.post('/auth/logout')
    } catch {
      // logout local incluso si el clear-cookie falla
    }
    logout()
    navigate('/login', { replace: true })
  }

  function handleToggleTheme() {
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    setThemeState(nextTheme)
  }

  return (
    <aside className="hidden md:flex flex-col h-full w-72 rounded-r-xl border-r border-white/10 bg-surface-container-low shadow-float py-lg z-40 fixed top-0 left-0">
      {/* Profile Header */}
      <div className="px-4 mb-xl flex items-center space-x-3">
        <div className="w-12 h-12 rounded-full bg-surface-variant border-2 border-primary flex items-center justify-center text-primary font-heading font-bold text-lg shrink-0">
          {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0">
          <div className="font-heading text-sm font-semibold text-primary truncate">
            {user?.name ?? 'Sin usuario'}
          </div>
          <div className="font-body text-xs text-on-surface-variant truncate">
            Admin
          </div>
          <div className="font-mono text-[11px] text-outline mt-0.5">
            Plataforma
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 flex flex-col gap-1 px-3">
        <NavLink
          to="/app-selector"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-4 py-2.5 rounded-lg font-body text-sm transition-all duration-200 scale-hover',
              isActive
                ? 'bg-primary-container/20 text-primary border-l-4 border-primary'
                : 'text-on-surface-variant hover:bg-surface-variant/50 hover:text-on-surface',
            )
          }
        >
          <AppWindow size={16} strokeWidth={1.5} />
          Cambiar app
        </NavLink>
        <div className="border-t border-white/5 my-1" />

        <div className="px-4 py-2">
          <p className="font-body text-[11px] uppercase tracking-widest text-on-surface-variant/60 font-semibold">
            Administración
          </p>
        </div>

        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-4 py-2.5 rounded-lg font-body text-sm transition-all duration-200 scale-hover',
                isActive
                  ? 'bg-primary-container/20 text-primary border-l-4 border-primary font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-variant/50 hover:text-on-surface',
              )
            }
          >
            <Icon size={16} strokeWidth={1.5} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-white/5 px-3 py-2">
        <button
          type="button"
          onClick={handleToggleTheme}
          className="flex w-full items-center gap-3 px-4 py-2.5 rounded-lg font-body text-sm text-on-surface-variant hover:bg-surface-variant/50 hover:text-on-surface transition-all duration-200 scale-hover"
        >
          {theme === 'dark' ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
          {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        </button>
      </div>

      <div className="border-t border-white/5 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-body text-sm font-medium text-on-surface">{user?.name ?? 'Sin usuario'}</p>
            <p className="truncate font-body text-xs text-on-surface-variant">
              Admin
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <LogOut size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </aside>
  )
}
