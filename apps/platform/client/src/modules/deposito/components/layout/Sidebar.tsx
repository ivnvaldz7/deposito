import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FlaskConical, Package, Tag, Box, BookOpen,
  ArrowLeftRight, BarChart2, LogOut, AppWindow,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'
import { useSidebarStore } from '../../stores/sidebar-store'

const navItems = [
  { path: '/deposito/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { path: '/deposito/drogas',      label: 'Drogas',       icon: FlaskConical },
  { path: '/deposito/estuches',    label: 'Estuches',     icon: Package },
  { path: '/deposito/etiquetas',   label: 'Etiquetas',    icon: Tag },
  { path: '/deposito/frascos',     label: 'Frascos',      icon: Box },
  { path: '/deposito/actas',       label: 'Actas',        icon: BookOpen },
  { path: '/deposito/movimientos', label: 'Movimientos',  icon: ArrowLeftRight },
]

export function Sidebar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const depositoRole = user?.apps?.['deposito']?.rol
  const isEncargado = depositoRole === 'encargado'
  const navigate = useNavigate()
  const collapsed = useSidebarStore((s) => s.collapsed)
  const [hoverOpen, setHoverOpen] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>()

  const isOpen = collapsed ? hoverOpen : true

  useEffect(() => {
    return () => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }
  }, [])

  function handleMouseEnter() {
    if (collapsed) {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
      setHoverOpen(true)
    }
  }

  function handleMouseLeave() {
    if (collapsed) {
      hoverTimer.current = setTimeout(() => setHoverOpen(false), 300)
    }
  }

  async function handleLogout() {
    try {
      await apiClient.post('/auth/logout')
    } catch {}
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      {collapsed && (
        <div
          className="fixed top-0 left-0 w-1 h-full z-50 cursor-pointer"
          onMouseEnter={handleMouseEnter}
        />
      )}

      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          'hidden md:flex flex-col transition-all duration-300 ease-in-out',
          isOpen
            ? 'w-72 border-r border-white/10 rounded-r-xl bg-surface-container-low shadow-float py-lg'
            : 'w-0 overflow-hidden border-0 rounded-none bg-surface-container-low',
        )}
      >
        <div className="flex items-center gap-2 px-4 mb-xl">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-surface-variant border-2 border-primary flex items-center justify-center text-primary font-heading font-bold text-sm shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <div className="font-heading text-sm font-semibold text-primary truncate">
                {user?.name ?? 'Sin usuario'}
              </div>
              <div className="font-body text-xs text-on-surface-variant truncate">
                {depositoRole === 'encargado' ? 'Encargado' : depositoRole === 'observador' ? 'Observador' : 'Operador'}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 flex flex-col gap-1 px-3">
          {navItems.map(({ path, label, icon: Icon }, index) => (
            <NavLink
              key={path}
              to={path}
              style={{ animationDelay: `${index * 0.04}s` }}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-lg font-body text-sm transition-all duration-200 scale-hover whitespace-nowrap',
                  isOpen ? 'animate-slide-in-left' : 'opacity-0',
                  isActive
                    ? 'bg-primary-container/20 text-primary border-l-4 border-primary font-semibold'
                    : 'text-on-surface-variant hover:bg-surface-variant/50 hover:text-on-surface',
                )
              }
            >
              <Icon size={16} strokeWidth={1.5} className="shrink-0" />
              {label}
            </NavLink>
          ))}

          {(isEncargado || depositoRole === 'observador') && (
            <NavLink
              to="/deposito/metricas"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-lg font-body text-sm transition-all duration-200 scale-hover whitespace-nowrap',
                  isOpen ? 'animate-slide-in-left' : 'opacity-0',
                  isActive
                    ? 'bg-primary-container/20 text-primary border-l-4 border-primary font-semibold'
                    : 'text-on-surface-variant hover:bg-surface-variant/50 hover:text-on-surface',
                )
              }
              style={{ animationDelay: `${navItems.length * 0.04}s` }}
            >
              <BarChart2 size={16} strokeWidth={1.5} className="shrink-0" />
              Métricas
            </NavLink>
          )}
        </nav>

        {/* Bottom */}
        <div className={cn('border-t border-white/5 px-3 py-2', isOpen ? 'animate-slide-in-left' : 'opacity-0')}
             style={{ animationDelay: '0.4s' }}>
          <NavLink
            to="/app-selector"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-4 py-2.5 rounded-lg font-body text-sm transition-all duration-200 scale-hover whitespace-nowrap',
                isActive
                  ? 'bg-primary-container/20 text-primary border-l-4 border-primary'
                  : 'text-on-surface-variant hover:bg-surface-variant/50 hover:text-on-surface',
              )
            }
          >
            <AppWindow size={16} strokeWidth={1.5} className="shrink-0" />
            Cambiar app
          </NavLink>
        </div>

        <div className="border-t border-white/5 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-body text-sm font-medium text-on-surface">{user?.name ?? 'Sin usuario'}</p>
              <p className="truncate font-body text-xs text-on-surface-variant">
                {depositoRole === 'encargado' ? 'Encargado' : depositoRole === 'observador' ? 'Observador' : 'Operador'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Cerrar sesión"
              className="text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <LogOut size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
