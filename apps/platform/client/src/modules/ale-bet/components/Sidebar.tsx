import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import {
  LayoutDashboard, ClipboardList, Package, Users, Box, Clock, Truck, Plus, LogOut, AppWindow,
} from 'lucide-react'
import { cn } from '@/lib/utils'

function formatRol(rol: string | undefined): string {
  if (!rol) return '—'
  const map: Record<string, string> = {
    admin: 'Admin',
    vendedor: 'Vendedor',
    armador: 'Armador',
    facturacion: 'Facturación',
    observador: 'Observador',
  }
  return map[rol] ?? rol.charAt(0).toUpperCase() + rol.slice(1)
}

interface NavItem {
  path: string
  label: string
  icon: typeof LayoutDashboard
}

const NAV_ITEMS: NavItem[] = [
  { path: '/ale-bet/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/ale-bet/pedidos', label: 'Pedidos', icon: ClipboardList },
  { path: '/ale-bet/productos', label: 'Productos', icon: Package },
  { path: '/ale-bet/clientes', label: 'Clientes', icon: Users },
  { path: '/ale-bet/stock', label: 'Stock', icon: Box },
  { path: '/ale-bet/historial', label: 'Historial', icon: Clock },
  { path: '/ale-bet/transportistas', label: 'Transportistas', icon: Truck },
]

type Rol = string | undefined

const canSeeClientes = (rol: Rol) => rol === 'admin' || rol === 'facturacion'
const canSeeStock = (rol: Rol) => rol === 'admin'
const canSeeHistorial = (rol: Rol) => rol === 'admin' || rol === 'vendedor'
const canSeeTransportistas = (rol: Rol) => rol === 'admin' || rol === 'facturacion'
const canCreatePedido = (rol: Rol) => rol === 'admin' || rol === 'vendedor'

function visibleItems(rol: Rol): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    switch (item.path) {
      case '/ale-bet/clientes': return canSeeClientes(rol)
      case '/ale-bet/stock': return canSeeStock(rol)
      case '/ale-bet/historial': return canSeeHistorial(rol)
      case '/ale-bet/transportistas': return canSeeTransportistas(rol)
      default: return true
    }
  })
}

function bottomNavItems(rol: Rol): NavItem[] {
  const item = (path: string) => NAV_ITEMS.find((entry) => entry.path === path)

  const extra: NavItem | null =
    canSeeStock(rol) ? item('/ale-bet/stock') ?? null
    : canSeeClientes(rol) ? item('/ale-bet/clientes') ?? null
    : canSeeHistorial(rol) ? item('/ale-bet/historial') ?? null
    : null

  const base = [
    item('/ale-bet/dashboard'),
    item('/ale-bet/pedidos'),
    item('/ale-bet/productos'),
  ].filter((entry): entry is NavItem => entry !== null)

  return extra ? [...base, extra] : base
}

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { path, label, icon: Icon } = item
  return (
    <NavLink
      key={path}
      to={path}
      onClick={onNavigate}
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
  )
}

export default function Sidebar() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const rol = user?.apps?.['ale-bet']?.rol
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const items = visibleItems(rol)
  const bottomItems = bottomNavItems(rol)
  const showNuevoPedido = canCreatePedido(rol)

  return (
    <>
      <aside className="hidden md:flex flex-col h-full w-72 rounded-r-xl border-r border-white/10 bg-surface-container-low shadow-float py-lg z-40 fixed top-0 left-0">
        {/* Profile Header */}
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
                {formatRol(rol)}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 flex flex-col gap-1 px-3">
          {items.map((item) => <NavItemLink key={item.path} item={item} />)}
        </nav>



        {/* Bottom */}
        <div className="border-t border-white/5 px-3 py-2">
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
            Cambiar módulo
          </NavLink>
        </div>

        <div className="border-t border-white/5 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-body text-sm font-medium text-on-surface">{user?.name ?? 'Sin usuario'}</p>
              <p className="truncate font-body text-xs text-on-surface-variant">
                {formatRol(rol)}
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

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-surface-container-low shadow-float">
        <div className="flex items-stretch justify-around px-2 py-2">
          {bottomItems.map((item) => {
            const { path, label, icon: Icon } = item
            return (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  cn(
                    'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 font-body text-[10px] transition-colors',
                    isActive ? 'text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface',
                  )
                }
              >
                <Icon size={18} strokeWidth={1.75} />
                {label}
              </NavLink>
            )
          })}
          {showNuevoPedido && (
            <NavLink
              to="/ale-bet/pedidos/nuevo"
              className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full bg-primary px-2 py-1.5 font-body text-[10px] font-semibold text-on-primary"
            >
              <Plus size={18} strokeWidth={2} />
              Nuevo
            </NavLink>
          )}
        </div>
      </nav>
    </>
  )
}
