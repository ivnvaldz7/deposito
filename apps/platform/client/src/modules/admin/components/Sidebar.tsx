import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'
import { AppSidebarLayout, SidebarNavItem } from '@/components/layout/AppSidebar'
import type { NavItemDef } from '@/components/layout/AppSidebar'

const NAV_ITEMS: NavItemDef[] = [
  { path: '/admin/usuarios', label: 'Usuarios', icon: Users },
]

export default function AdminSidebar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      await apiClient.post('/auth/logout')
    } catch {
      // logout local
    }
    logout()
    navigate('/login', { replace: true })
  }

  const navNodes = (
    <>
      <div className="px-3 py-2 mt-2">
        <p className="font-body text-[11px] uppercase tracking-widest text-on-surface-variant/60 font-semibold">
          Administración
        </p>
      </div>
      {NAV_ITEMS.map((item) => (
        <SidebarNavItem key={item.path} item={item} />
      ))}
    </>
  )

  return (
    <AppSidebarLayout
      appName="ADMIN"
      userInitials={user?.name?.charAt(0)?.toUpperCase() ?? '?'}
      userName={user?.name ?? 'Sin usuario'}
      userRole="Admin"
      onLogout={handleLogout}
      navItems={navNodes}
    />
  )
}
