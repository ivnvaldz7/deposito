import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import {
  LayoutDashboard, ClipboardList, Package, Box, Truck, Users, History, Zap, FileText, Menu, X
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
  { path: '/ale-bet/automation', label: 'Automation', icon: Zap },
  { path: '/ale-bet/pedidos', label: 'Pedidos', icon: ClipboardList },
  { path: '/ale-bet/remitos', label: 'Remitos', icon: FileText },
  { path: '/ale-bet/productos', label: 'Productos', icon: Package },
  { path: '/ale-bet/stock', label: 'Stock', icon: Box },
  { path: '/ale-bet/clientes', label: 'Clientes', icon: Users },
  { path: '/ale-bet/transportistas', label: 'Transportistas', icon: Truck },
  { path: '/ale-bet/historial', label: 'Historial', icon: History },
]

import { can } from '@/lib/permissions'
import type { PlatformUser } from '@/stores/auth-store'

type Rol = string | undefined

function visibleItems(user: PlatformUser | null): NavItemDef[] {
  return NAV_ITEMS.filter((item) => {
    switch (item.path) {
      case '/ale-bet/dashboard': return can(user, 'ale-bet', 'dashboard.read')
      case '/ale-bet/automation': return can(user, 'ale-bet', 'pedidos.approve')
      case '/ale-bet/stock': return can(user, 'ale-bet', 'stock.read')
      case '/ale-bet/pedidos': return can(user, 'ale-bet', 'pedidos.read')
      case '/ale-bet/remitos': return can(user, 'ale-bet', 'remitos.create')
      case '/ale-bet/clientes': return can(user, 'ale-bet', 'clientes.read')
      case '/ale-bet/transportistas': return can(user, 'ale-bet', 'transportistas.read')
      case '/ale-bet/historial': return can(user, 'ale-bet', 'historial.read')
      default: return true
    }
  })
}

function mobilePrimaryItems(user: PlatformUser | null): NavItemDef[] {
  const paths = [
    '/ale-bet/dashboard',
    ...(can(user, 'ale-bet', 'pedidos.approve') ? ['/ale-bet/automation'] : []),
    '/ale-bet/pedidos',
    '/ale-bet/productos',
  ]
  return paths
    .map((path) => NAV_ITEMS.find((entry) => entry.path === path))
    .filter((entry): entry is NavItemDef => entry !== undefined)
}

export default function Sidebar() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const rol = user?.apps?.['ale-bet']?.rol
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const items = visibleItems(user)
  const bottomItems = mobilePrimaryItems(user)
  const moreItems = items.filter((item) => !bottomItems.some((primary) => primary.path === item.path))

  const mobileContent = (
    <>
      {bottomItems.map((item) => {
        const { path, label, icon: Icon } = item
        return (
          <NavLink
            key={path}
            to={path}
            onClick={() => setMoreOpen(false)}
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
      {moreItems.length > 0 && (
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-label={moreOpen ? 'Cerrar más opciones' : 'Más opciones'}
          aria-expanded={moreOpen}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 font-body text-[10px] transition-colors',
            moreOpen ? 'bg-surface-variant text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface',
          )}
        >
          {moreOpen ? <X size={18} strokeWidth={2} /> : <Menu size={18} strokeWidth={1.75} />}
          Más
        </button>
      )}
    </>
  )

  return (
    <>
      <AppSidebarLayout
      appName="Logística"
      userInitials={user?.name?.charAt(0)?.toUpperCase() ?? '?'}
      userName={user?.name ?? 'Sin usuario'}
      userRole={formatRol(rol)}
      onLogout={handleLogout}
      navItems={items.map((item) => <SidebarNavItem key={item.path} item={item} />)}
      bottomMobileContent={mobileContent}
      />
      {moreOpen && (
      <div className="fixed inset-0 z-30 md:hidden" aria-label="Más secciones">
        <button type="button" aria-label="Cerrar más opciones" className="absolute inset-0 bg-black/55" onClick={() => setMoreOpen(false)} />
        <div className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] rounded-2xl border border-white/10 bg-surface-container-low p-3 shadow-float">
          <p className="px-2 pb-2 font-body text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Más secciones</p>
          <div className="grid grid-cols-2 gap-2">
            {moreItems.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) => cn(
                  'flex min-h-12 items-center gap-3 rounded-xl px-3 font-body text-[13px] font-medium',
                  isActive ? 'bg-primary/15 text-primary' : 'bg-surface-container text-on-surface-variant',
                )}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
      )}
    </>
  )
}
