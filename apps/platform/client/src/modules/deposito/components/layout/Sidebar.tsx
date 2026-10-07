import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  LayoutDashboard, FlaskConical, Package, Tag, Box, BookOpen,
  ArrowLeftRight, BarChart2, LogOut, Users, Menu, X
} from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'
import { can } from '@/lib/permissions'
import { AppSidebarLayout, SidebarNavItem } from '@/components/layout/AppSidebar'
import type { NavItemDef } from '@/components/layout/AppSidebar'

const navItems: NavItemDef[] = [
  { path: '/deposito/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { path: '/deposito/actas',       label: 'Actas',        icon: BookOpen },
  { path: '/deposito/ordenes',     label: 'Órdenes',      icon: BookOpen },
  { path: '/deposito/estuches',    label: 'Estuches',     icon: Package },
  { path: '/deposito/etiquetas',   label: 'Etiquetas',    icon: Tag },
  { path: '/deposito/frascos',     label: 'Frascos',      icon: Box },
  { path: '/deposito/drogas',      label: 'Drogas',       icon: FlaskConical },
  { path: '/deposito/materiales-empaque', label: 'Material de empaque', icon: Package },
  { path: '/deposito/movimientos', label: 'Movimientos',  icon: ArrowLeftRight },
  { path: '/deposito/pendientes', label: 'Pendientes', icon: ArrowLeftRight },
  { path: '/deposito/ordenes/archivadas', label: 'Órdenes archivadas', icon: BookOpen },
  { path: '/deposito/metricas', label: 'Métricas', icon: BarChart2 },
]

export function Sidebar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const depositoRole = user?.apps?.['deposito']?.rol
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  async function handleLogout() {
    try {
      await apiClient.post('/auth/logout')
    } catch {}
    logout()
    navigate('/login', { replace: true })
  }

  const roleLabel = depositoRole === 'encargado' ? 'Encargado' : depositoRole === 'observador' ? 'Observador' : depositoRole === 'solicitante' ? 'Solicitante' : 'Operador'
  
  const allItems = [
    ...navItems,
  ]

  const items = allItems.filter(item => {
    switch(item.path) {
      case '/deposito/dashboard': return can(user, 'deposito', 'dashboard.read')
      case '/deposito/productos': return can(user, 'deposito', 'productos_catalogo.read')
      case '/deposito/drogas': return can(user, 'deposito', 'drogas.read')
      case '/deposito/estuches': return can(user, 'deposito', 'estuches.read')
      case '/deposito/etiquetas': return can(user, 'deposito', 'etiquetas.read')
      case '/deposito/frascos': return can(user, 'deposito', 'frascos.read')
      case '/deposito/materiales-empaque': return can(user, 'deposito', 'productos_catalogo.read')
      case '/deposito/actas': return can(user, 'deposito', 'actas.read')
      case '/deposito/ingresos': return can(user, 'deposito', 'ingresos.create')
      case '/deposito/movimientos': return can(user, 'deposito', 'movimientos.read')
      case '/deposito/pendientes': return can(user, 'deposito', 'pendientes.read')
      case '/deposito/ordenes': return can(user, 'deposito', 'ordenes.read')
      case '/deposito/ordenes/archivadas': return can(user, 'deposito', 'ordenes.read')
      case '/deposito/metricas': return can(user, 'deposito', 'metricas.read')
      default: return true
    }
  })

  const mobilePrimaryPaths = [
    '/deposito/dashboard',
    '/deposito/actas',
    '/deposito/ordenes',
    '/deposito/pendientes',
  ]
  const mobileItems = items.filter((item) => mobilePrimaryPaths.includes(item.path))
  const moreItems = items.filter((item) => !mobilePrimaryPaths.includes(item.path))

  const mobileNav = (
    <>
      {moreOpen && (
        <div className="absolute bottom-full left-0 right-0 border-t border-white/10 bg-surface-container-low px-3 pb-3 pt-3 shadow-float">
          <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
            {moreItems.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) => `flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'border-primary/50 bg-primary/10 text-primary' : 'border-white/10 bg-surface-container-high text-on-surface-variant'}`}
              >
                <Icon size={17} />
                <span className="truncate">{label}</span>
              </NavLink>
            ))}
            <button type="button" onClick={() => navigate('/app-selector')} className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-surface-container-high px-3 py-2 text-left text-sm font-medium text-on-surface-variant">
              <ArrowLeftRight size={17} /> Cambiar módulo
            </button>
            <button type="button" onClick={handleLogout} className="flex min-h-11 items-center gap-2 rounded-lg border border-error/20 bg-error/5 px-3 py-2 text-left text-sm font-medium text-error">
              <LogOut size={17} /> Cerrar sesión
            </button>
          </div>
        </div>
      )}
      {mobileItems.map(({ path, label, icon: Icon }) => (
        <NavLink key={path} to={path} onClick={() => setMoreOpen(false)} className={({ isActive }) => `flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-medium transition-colors ${isActive ? 'text-primary' : 'text-on-surface-variant'}`}>
          <Icon size={19} strokeWidth={2} />
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
      <button type="button" aria-label="Más opciones" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)} className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-medium ${moreOpen ? 'text-primary' : 'text-on-surface-variant'}`}>
        {moreOpen ? <X size={19} /> : <Menu size={19} />}
        <span>Más</span>
      </button>
    </>
  )

  return (
    <AppSidebarLayout
      appName="Depósito"
      userInitials={user?.name?.charAt(0)?.toUpperCase() ?? '?'}
      userName={user?.name ?? 'Sin usuario'}
      userRole={roleLabel}
      onLogout={handleLogout}
      navItems={items.map((item) => <SidebarNavItem key={item.path} item={item} />)}
      bottomMobileContent={mobileNav}
    />
  )
}
