import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, FlaskConical, Package, Tag, Box, PackagePlus, BookOpen, ArrowLeftRight, Clock, Users, ClipboardList, BarChart2, LogOut, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { getStoredTheme, setTheme, type ThemeMode } from '@/lib/theme'
import { useAuthStore } from '@/stores/auth-store'

const navItems = [
  { path: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { path: '/drogas',      label: 'Drogas',       icon: FlaskConical },
  { path: '/estuches',    label: 'Estuches',     icon: Package },
  { path: '/etiquetas',   label: 'Etiquetas',    icon: Tag },
  { path: '/frascos',     label: 'Frascos',      icon: Box },
  { path: '/ingresos',    label: 'Ingresos',     icon: PackagePlus },
  { path: '/actas',       label: 'Actas',        icon: BookOpen },
  { path: '/movimientos', label: 'Movimientos',  icon: ArrowLeftRight },
  { path: '/pendientes',  label: 'Pendientes',   icon: Clock },
  { path: '/ordenes',     label: 'Órdenes',      icon: ClipboardList },
]

export function Sidebar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const isEncargado = user?.role === 'encargado'
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
    <aside className="hidden md:flex flex-col w-56 min-h-screen bg-surface-lowest shrink-0 border-r border-outline-variant">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-outline-variant/15">
        <span className="font-heading text-primary-container font-bold text-lg tracking-tight">
          depósito
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded font-heading font-semibold text-sm transition-colors',
                isActive
                  ? 'bg-surface-high text-on-surface'
                  : 'text-on-surface-variant hover:bg-surface-bright hover:text-on-surface'
              )
            }
          >
            <Icon size={16} strokeWidth={1.5} />
            {label}
          </NavLink>
        ))}
        {(isEncargado || user?.role === 'observador') && (
          <NavLink
            to="/metricas"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded font-heading font-semibold text-sm transition-colors',
                isActive
                  ? 'bg-surface-high text-on-surface'
                  : 'text-on-surface-variant hover:bg-surface-bright hover:text-on-surface'
              )
            }
          >
            <BarChart2 size={16} strokeWidth={1.5} />
            Métricas
          </NavLink>
        )}
        {isEncargado && (
          <NavLink
            to="/usuarios"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded font-heading font-semibold text-sm transition-colors',
                isActive
                  ? 'bg-surface-high text-on-surface'
                  : 'text-on-surface-variant hover:bg-surface-bright hover:text-on-surface'
              )
            }
          >
            <Users size={16} strokeWidth={1.5} />
            Usuarios
          </NavLink>
        )}
      </nav>

      <div className="border-t border-outline-variant px-3 py-2">
        <button
          type="button"
          onClick={handleToggleTheme}
          className="flex w-full items-center gap-3 px-3 py-2.5 font-heading text-sm font-semibold text-on-surface-variant transition-colors hover:text-on-surface"
        >
          {theme === 'dark' ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
          {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        </button>
      </div>

      <div className="border-t border-outline-variant px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-body text-sm font-medium text-on-surface">{user?.name ?? 'Sin usuario'}</p>
            <p className="truncate font-body text-xs text-on-surface-variant">{user?.role ?? ''}</p>
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
