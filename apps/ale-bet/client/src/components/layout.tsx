import { useEffect, type ReactNode } from 'react'
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return '?'
  }

  return parts
    .map((part) => part[0]?.toUpperCase() ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
}

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  useEffect(() => {
    const linkId = 'ale-bet-fonts'

    if (document.getElementById(linkId)) {
      return
    }

    const preconnect = document.createElement('link')
    preconnect.rel = 'preconnect'
    preconnect.href = 'https://fonts.googleapis.com'
    preconnect.dataset.aleBetFont = 'preconnect'

    const preconnectStatic = document.createElement('link')
    preconnectStatic.rel = 'preconnect'
    preconnectStatic.href = 'https://fonts.gstatic.com'
    preconnectStatic.crossOrigin = 'anonymous'
    preconnectStatic.dataset.aleBetFont = 'preconnect'

    const link = document.createElement('link')
    link.id = linkId
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400&family=Montserrat:wght@600;700&display=swap'

    document.head.append(preconnect, preconnectStatic, link)

    return () => {
      document.querySelectorAll('[data-ale-bet-font="preconnect"]').forEach((node) => {
        node.remove()
      })
      link.remove()
    }
  }, [])

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
    <div
      className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] md:flex"
      style={{ minHeight: '100vh', height: '100vh', overflow: 'hidden', background: 'var(--color-bg)' }}
    >
      <aside className="hidden min-h-screen w-60 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] md:flex md:flex-col">
        <div className="border-b border-[var(--color-border)] px-6 py-5">
          <span
            className="font-bold text-[var(--color-accent)]"
            style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '15px', letterSpacing: '1px' }}
          >
            logística
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
                    ? 'bg-[var(--color-accent-bg)] text-[var(--color-text)]'
                    : 'text-[var(--color-text-2)] hover:bg-[var(--color-accent-bg)] hover:text-[var(--color-text)]'
                }`
              }
            >
              <Icon size={16} strokeWidth={1.6} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-[var(--color-border)] px-4 py-[14px]">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-accent-bg)] text-[11px] font-semibold text-[var(--color-text-3)]">
              {getInitials(user?.nombre ?? '')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[var(--color-text)]">{user?.nombre ?? 'Sin usuario'}</p>
              <p className="truncate text-[11px] text-[var(--color-text-2)]">{user?.rol ?? ''}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="text-[var(--color-text-2)] transition hover:text-[var(--color-text)]"
              aria-label="Cerrar sesión"
            >
              <LogOut size={16} strokeWidth={1.6} />
            </button>
          </div>
        </div>
      </aside>

      <div
        className="flex min-h-screen flex-1 flex-col bg-[var(--color-bg)] text-[var(--color-text)]"
        style={{ minHeight: '100vh', height: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)' }}
      >
        <main
          className="flex-1 bg-[var(--color-bg)] px-6 py-6 text-[var(--color-text)]"
          style={{ flex: 1, minHeight: '100vh', height: '100vh', overflowY: 'auto', background: 'var(--color-bg)', color: 'var(--color-text)' }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
