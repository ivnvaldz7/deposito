import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import {
  LayoutDashboard, ClipboardList, Package, Box, Plus, Truck
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppSidebarLayout, SidebarNavItem } from '@/components/layout/AppSidebar'
import type { NavItemDef } from '@/components/layout/AppSidebar'

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

const NAV_ITEMS: NavItemDef[] = [
  { path: '/ale-bet/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/ale-bet/pedidos', label: 'Pedidos', icon: ClipboardList },
  { path: '/ale-bet/productos', label: 'Productos', icon: Package },
  { path: '/ale-bet/stock', label: 'Stock', icon: Box },
  { path: '/ale-bet/transportistas', label: 'Transportistas', icon: Truck },
]

type Rol = string | undefined

const canSeeStock = (rol: Rol) => rol === 'admin' || rol === 'encargado'
const canCreatePedido = (rol: Rol) => rol === 'admin' || rol === 'vendedor'
const canManageTransportistas = (rol: Rol) => rol === 'admin' || rol === 'facturacion'

function visibleItems(rol: Rol): NavItemDef[] {
  return NAV_ITEMS.filter((item) => {
    switch (item.path) {
      case '/ale-bet/stock': return canSeeStock(rol)
      case '/ale-bet/transportistas': return canManageTransportistas(rol)
      default: return true
    }
  })
}

function bottomNavItems(rol: Rol): NavItemDef[] {
  const item = (path: string) => NAV_ITEMS.find((entry) => entry.path === path)

  const extra: NavItemDef[] = []
  if (canSeeStock(rol)) {
    const s = item('/ale-bet/stock')
    if (s) extra.push(s)
  }
  if (canManageTransportistas(rol)) {
    const t = item('/ale-bet/transportistas')
    if (t) extra.push(t)
  }

  const base = [
    item('/ale-bet/dashboard'),
    item('/ale-bet/pedidos'),
    item('/ale-bet/productos'),
  ].filter((entry): entry is NavItemDef => entry !== null)

  return [...base, ...extra]
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

  const mobileContent = (
    <>
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
    </>
  )

  return (
    <AppSidebarLayout
      appName="Logística"
      userInitials={user?.name?.charAt(0)?.toUpperCase() ?? '?'}
      userName={user?.name ?? 'Sin usuario'}
      userRole={formatRol(rol)}
      onLogout={handleLogout}
      navItems={items.map((item) => <SidebarNavItem key={item.path} item={item} />)}
      bottomMobileContent={mobileContent}
    />
  )
}
