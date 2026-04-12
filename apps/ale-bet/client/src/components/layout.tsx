import type { ReactNode } from 'react'
import { LogOut, Boxes, ClipboardList, LayoutDashboard, Package2, Users } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { removeToken } from '@/lib/auth'
import { useAuthStore } from '@/stores/auth-store'

interface LayoutProps {
  children: ReactNode
}

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/pedidos', label: 'Pedidos', icon: ClipboardList },
  { path: '/clientes', label: 'Clientes', icon: Users },
  { path: '/productos', label: 'Productos', icon: Package2 },
  { path: '/stock', label: 'Stock', icon: Boxes },
]

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  const visibleItems = navItems.filter((item) => {
    if (item.path === '/productos' || item.path === '/stock') {
      return user?.rol === 'admin'
    }

    if (item.path === '/clientes') {
      return user?.rol === 'admin' || user?.rol === 'vendedor'
    }

    return true
  })

  function handleLogout(): void {
    removeToken()
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-transparent text-[var(--on-surface)] md:flex">
      <aside className="hidden min-h-screen w-60 shrink-0 border-r border-white/6 bg-[var(--surface-lowest)] md:flex md:flex-col">
        <div className="border-b border-white/6 px-6 py-5">
          <span className="font-[Montserrat] text-lg font-bold tracking-tight text-[var(--primary-container)]">
            Ale-Bet
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {visibleItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-[var(--surface-high)] text-[var(--on-surface)]'
                    : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-bright)] hover:text-[var(--on-surface)]'
                }`
              }
            >
              <Icon size={16} strokeWidth={1.6} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-white/6 bg-[var(--surface-low)] px-5">
          <div>
            <span className="font-[Montserrat] text-sm font-semibold tracking-[0.18em] text-[var(--on-surface-variant)]">
              Kinetic Monolith
            </span>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <span className="text-sm text-[var(--on-surface)]">
                {user.nombre} · {user.rol}
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleLogout}
              className="text-[var(--on-surface-variant)] transition hover:text-[var(--on-surface)]"
              aria-label="Cerrar sesión"
            >
              <LogOut size={16} strokeWidth={1.6} />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  )
}
