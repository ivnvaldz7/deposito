import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import {
  LayoutDashboard, ClipboardList, Package, Users, Box, Clock, LogOut, AppWindow,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { path: '/ale-bet/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { path: '/ale-bet/pedidos',    label: 'Pedidos',    icon: ClipboardList },
  { path: '/ale-bet/productos',  label: 'Productos',  icon: Package },
  { path: '/ale-bet/clientes',   label: 'Clientes',   icon: Users },
  { path: '/ale-bet/stock',      label: 'Stock',      icon: Box },
  { path: '/ale-bet/historial',  label: 'Historial',  icon: Clock },
]

export default function Sidebar() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const rol = user?.apps?.['ale-bet']?.rol
  const navigate = useNavigate()

  // Only admin sees Stock
  const visibleItems = navItems.filter(
    (item) => item.path !== '/ale-bet/stock' || rol === 'admin'
  )

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
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
            {rol === 'admin' ? 'Admin' : rol === 'vendedor' ? 'Vendedor' : rol === 'armador' ? 'Armador' : '—'}
          </div>
          <div className="font-mono text-[11px] text-outline mt-0.5">
            Ale·Bet
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

        {visibleItems.map(({ path, label, icon: Icon }) => (
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

      {/* Logout */}
      <div className="border-t border-white/5 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-body text-sm font-medium text-on-surface">{user?.name ?? 'Sin usuario'}</p>
            <p className="truncate font-body text-xs text-on-surface-variant">
              {rol === 'admin' ? 'Admin' : rol === 'vendedor' ? 'Vendedor' : rol === 'armador' ? 'Armador' : '—'}
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
