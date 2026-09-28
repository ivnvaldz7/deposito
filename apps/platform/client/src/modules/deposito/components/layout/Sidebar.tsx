import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FlaskConical, Package, Tag, Box, BookOpen,
  ArrowLeftRight, BarChart2, LogOut, Users
} from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'
import { can } from '@/lib/permissions'
import { AppSidebarLayout, SidebarNavItem } from '@/components/layout/AppSidebar'
import type { NavItemDef } from '@/components/layout/AppSidebar'

const navItems: NavItemDef[] = [
  { path: '/deposito/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { path: '/deposito/productos',   label: 'Productos',   icon: Package },
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
  const navigate = useNavigate()

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
    { path: '/deposito/pendientes', label: 'Pendientes', icon: ArrowLeftRight },
    { path: '/deposito/ordenes', label: 'Órdenes', icon: BookOpen },
    { path: '/deposito/metricas', label: 'Métricas', icon: BarChart2 },
  ]

  const items = allItems.filter(item => {
    switch(item.path) {
      case '/deposito/dashboard': return can(user, 'deposito', 'dashboard.read')
      case '/deposito/productos': return can(user, 'deposito', 'productos_catalogo.read')
      case '/deposito/drogas': return can(user, 'deposito', 'drogas.read')
      case '/deposito/estuches': return can(user, 'deposito', 'estuches.read')
      case '/deposito/etiquetas': return can(user, 'deposito', 'etiquetas.read')
      case '/deposito/frascos': return can(user, 'deposito', 'frascos.read')
      case '/deposito/actas': return can(user, 'deposito', 'actas.read')
      case '/deposito/ingresos': return can(user, 'deposito', 'ingresos.create')
      case '/deposito/movimientos': return can(user, 'deposito', 'movimientos.read')
      case '/deposito/pendientes': return can(user, 'deposito', 'pendientes.read')
      case '/deposito/ordenes': return can(user, 'deposito', 'ordenes.read')
      case '/deposito/metricas': return can(user, 'deposito', 'metricas.read')
      default: return true
    }
  })

  return (
    <AppSidebarLayout
      appName="Depósito"
      userInitials={user?.name?.charAt(0)?.toUpperCase() ?? '?'}
      userName={user?.name ?? 'Sin usuario'}
      userRole={roleLabel}
      onLogout={handleLogout}
      navItems={items.map((item) => <SidebarNavItem key={item.path} item={item} />)}
    />
  )
}
