import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import {
  LayoutDashboard, ClipboardList, Package, Users, Box, Clock, Truck, Plus, LogOut, ArrowLeftRight, BarChart2,
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
    encargado: 'Encargado',
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
  { path: '/ale-bet/ventas', label: 'Ventas por cliente', icon: BarChart2 },
  { path: '/ale-bet/stock', label: 'Stock', icon: Box },
  { path: '/ale-bet/historial', label: 'Historial', icon: Clock },
  { path: '/ale-bet/transportistas', label: 'Transportistas', icon: Truck },
]

type Rol = string | undefined

const canSeeClientes = (rol: Rol) => rol === 'admin' || rol === 'facturacion'
const canSeeVentas = (rol: Rol) => rol === 'admin' || rol === 'facturacion'
const canSeeStock = (rol: Rol) => rol === 'admin' || rol === 'encargado'
const canSeeInsumos = (rol: Rol) => rol === 'admin' || rol === 'encargado'
const canSeeHistorial = (rol: Rol) => rol === 'admin' || rol === 'vendedor'
const canSeeTransportistas = (rol: Rol) => rol === 'admin' || rol === 'facturacion'
const canCreatePedido = (rol: Rol) => rol === 'admin' || rol === 'vendedor'

function visibleItems(rol: Rol): NavItem[] {
  return [
    ...NAV_ITEMS.filter((item) => {
      switch (item.path) {
        case '/ale-bet/clientes': return canSeeClientes(rol)
        case '/ale-bet/ventas': return canSeeVentas(rol)
        case '/ale-bet/stock': return canSeeStock(rol)
        case '/ale-bet/historial': return canSeeHistorial(rol)
        case '/ale-bet/transportistas': return canSeeTransportistas(rol)
        default: return true
      }
    }),
    ...(canSeeInsumos(rol) ? [{ path: '/deposito', label: 'Insumos', icon: Box }] : [])
  ]
}

function bottomNavItems(rol: Rol): NavItem[] {
  const item = (path: string) => NAV_ITEMS.find((entry) => entry.path === path)

  const extra: NavItem | null =
    canSeeVentas(rol) ? item('/ale-bet/ventas') ?? null
    : canSeeStock(rol) ? item('/ale-bet/stock') ?? null
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
          'flex items-center gap-3 px-3 py-2.5 rounded-lg font-body text-[14px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          isActive
            ? 'bg-surface-variant/30 text-on-surface font-semibold'
            : 'text-on-surface-variant hover:bg-surface-variant/20 hover:text-on-surface',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
          {label}
        </>
      )}
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
      <aside className="hidden md:flex flex-col h-full w-[280px] rounded-r-2xl border-r border-white/5 bg-surface-container-low shadow-sm py-6 z-40 fixed top-0 left-0">

        {/* App Name */}
        <div className="px-5 mb-6">
          <h1 className="text-xs font-bold tracking-widest text-on-surface-variant uppercase">
            Logística
          </h1>
        </div>

        {/* Profile Block */}
        <div className="flex items-center px-5 mb-8">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[40px] h-[40px] rounded-full bg-surface-variant flex items-center justify-center text-primary font-bold text-[14px] shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0 flex flex-col justify-center">
              <div className="text-[14px] font-semibold text-on-surface truncate leading-tight">
                {user?.name ?? 'Sin usuario'}
              </div>
              <div className="font-body text-[12px] text-on-surface-variant truncate mt-0.5">
                {formatRol(rol)}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 flex flex-col gap-1 px-3 overflow-y-auto">
          {items.map((item) => <NavItemLink key={item.path} item={item} />)}
        </nav>

        {/* Bottom Actions */}
        <div className="px-5 pt-4 border-t border-white/5 mt-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/app-selector')}
              title="Cambiar módulo"
              aria-label="Cambiar módulo"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-variant/50 hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <ArrowLeftRight size={18} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-error/15 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-error/50"
            >
              <LogOut size={18} strokeWidth={1.75} />
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
