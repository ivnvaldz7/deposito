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

import { can } from '@/lib/permissions'
import type { PlatformUser } from '@/stores/auth-store'

type Rol = string | undefined

function visibleItems(user: PlatformUser | null): NavItemDef[] {
  const rol = user?.apps?.['ale-bet']?.rol
  return NAV_ITEMS.filter((item) => {
    switch (item.path) {
      case '/ale-bet/stock': return can(user, 'ale-bet', 'stock.read')
      case '/ale-bet/pedidos': return can(user, 'ale-bet', 'pedidos.read')
      case '/ale-bet/transportistas': return rol === 'admin' || rol === 'facturacion'
      default: return true
    }
  })
}

function bottomNavItems(user: PlatformUser | null): NavItemDef[] {
  const item = (path: string) => NAV_ITEMS.find((entry) => entry.path === path)
  const rol = user?.apps?.['ale-bet']?.rol

  const extra: NavItemDef[] = []
  if (can(user, 'ale-bet', 'stock.read')) {
    const s = item('/ale-bet/stock')
    if (s) extra.push(s)
  }
  if (rol === 'admin' || rol === 'facturacion') {
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

  const items = visibleItems(user)
  const bottomItems = bottomNavItems(user)
  const showNuevoPedido = can(user, 'ale-bet', 'pedidos.create')

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
