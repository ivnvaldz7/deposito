import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FlaskConical, Package, Tag, Box, PackagePlus, BookOpen, ArrowLeftRight, Clock, Users, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

const navItems = [
  { path: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { path: '/drogas',      label: 'Drogas',       icon: FlaskConical },
  { path: '/estuches',    label: 'Estuches',     icon: Package },
  { path: '/etiquetas',   label: 'Etiquetas',    icon: Tag },
  { path: '/frascos',     label: 'Frascos',      icon: Box },
  { path: '/ingresos',    label: 'Ingresos',     icon: PackagePlus },
  { path: '/actas',       label: 'Actas',        icon: BookOpen },
  { path: '/movimientos', label: 'Movimientos',  icon: ArrowLeftRight },
  { path: '/pendientes',  label: 'Pendientes',   icon: Clock },
  { path: '/ordenes',     label: 'Órdenes',      icon: ClipboardList },
]

export function Sidebar() {
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.role === 'encargado'

  return (
    <aside className="hidden md:flex flex-col w-56 min-h-screen bg-surface-lowest shrink-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-outline-variant/15">
        <span className="font-heading text-primary-container font-bold text-lg tracking-tight">
          Depósito
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded font-heading font-semibold text-sm transition-colors',
                isActive
                  ? 'bg-surface-high text-on-surface'
                  : 'text-on-surface-variant hover:bg-surface-bright hover:text-on-surface'
              )
            }
          >
            <Icon size={16} strokeWidth={1.5} />
            {label}
          </NavLink>
        ))}
        {isEncargado && (
          <NavLink
            to="/usuarios"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded font-heading font-semibold text-sm transition-colors',
                isActive
                  ? 'bg-surface-high text-on-surface'
                  : 'text-on-surface-variant hover:bg-surface-bright hover:text-on-surface'
              )
            }
          >
            <Users size={16} strokeWidth={1.5} />
            Usuarios
          </NavLink>
        )}
      </nav>
    </aside>
  )
}
