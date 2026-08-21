import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FlaskConical, Package, Tag, Box, BookOpen,
  ArrowLeftRight, BarChart2, LogOut,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'
import { can } from '@/lib/permissions'
import { useSidebarStore } from '../../stores/sidebar-store'

const navItems = [
  { path: '/deposito/dashboard',   label: 'Dashboard',   icon: LayoutDashboard, permission: 'dashboard.read' },
  { path: '/deposito/productos',   label: 'Productos',   icon: Package, permission: 'productos_catalogo.read' },
  { path: '/deposito/drogas',      label: 'Drogas',      icon: FlaskConical, permission: 'drogas.read' },
  { path: '/deposito/estuches',    label: 'Estuches',    icon: Package, permission: 'estuches.read' },
  { path: '/deposito/etiquetas',   label: 'Etiquetas',   icon: Tag, permission: 'etiquetas.read' },
  { path: '/deposito/frascos',     label: 'Frascos',     icon: Box, permission: 'frascos.read' },
  { path: '/deposito/actas',       label: 'Actas',       icon: BookOpen, permission: 'actas.read' },
  { path: '/deposito/movimientos', label: 'Movimientos', icon: ArrowLeftRight, permission: 'movimientos.read' },
  { path: '/deposito/pendientes',  label: 'Pendientes',  icon: ArrowLeftRight, permission: 'pendientes.read' },
  { path: '/deposito/ordenes',     label: 'Órdenes',     icon: BookOpen, permission: 'ordenes.read' },
] as const

export function Sidebar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const depositoRole = user?.apps?.['deposito']?.rol
  const visibleNavItems = navItems.filter((item) => can(user, 'deposito', item.permission))
  const navigate = useNavigate()
  const collapsed = useSidebarStore((s) => s.collapsed)
  const [hoverOpen, setHoverOpen] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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
          'hidden md:flex fixed inset-y-0 left-0 z-40 flex-col transition-all duration-300 ease-in-out backdrop-blur-md',
          isOpen
            ? 'w-72 border-r border-white/10 rounded-r-xl bg-surface-container-low/95 shadow-float py-lg'
            : 'w-0 overflow-hidden border-0 rounded-none bg-surface-container-low',
        )}
      >
        <div className="flex items-center gap-2 px-4 mb-xl">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-surface-variant border-2 border-primary flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-primary truncate">
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
          {visibleNavItems.map(({ path, label, icon: Icon }, index) => (
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

          {can(user, 'deposito', 'metricas.read') && (
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
              style={{ animationDelay: `${visibleNavItems.length * 0.04}s` }}
            >
              <BarChart2 size={16} strokeWidth={1.5} className="shrink-0" />
              Métricas
            </NavLink>
          )}
        </nav>

        {/* Bottom actions */}
        <div className={cn('border-t border-white/5 mx-3 px-2 pt-3', isOpen ? 'animate-slide-in-left' : 'opacity-0')} style={{ animationDelay: '0.4s' }}>
          <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-surface-container/40 p-1">
            <button type="button" onClick={() => navigate('/app-selector')} title="Cambiar módulo" aria-label="Cambiar módulo" className="flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-variant/50 hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              <ArrowLeftRight size={18} strokeWidth={1.75} />
            </button>
            <button type="button" onClick={handleLogout} title="Cerrar sesión" aria-label="Cerrar sesión" className="flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-error/15 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-error/50">
              <LogOut size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
