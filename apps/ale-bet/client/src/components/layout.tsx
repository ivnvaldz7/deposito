import { useEffect, useState, type ReactNode } from 'react'
import { LogOut, Boxes, ClipboardList, History, LayoutDashboard, Package2, Users } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { removeToken } from '@/lib/auth'
import { useAuthStore } from '@/stores/auth-store'
import { Toast } from '@/components/Toast'
import { useSSE } from '@/hooks/useSSE'

interface LayoutProps {
  children: ReactNode
}

interface ToastState {
  message: string
  type: 'info' | 'success'
}

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/pedidos', label: 'Pedidos', icon: ClipboardList },
  { path: '/historial', label: 'Historial', icon: History },
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
  const [toast, setToast] = useState<ToastState | null>(null)

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

  useSSE({
    onPedidoAprobado: (data) => {
      if (user?.rol === 'armador' || user?.rol === 'admin') {
        setToast({
          message: `Nuevo pedido listo para armar: ${data.numero}`,
          type: 'info',
        })
      }
    },
    onPedidoCompletado: (data) => {
      if (user?.rol === 'vendedor' || user?.rol === 'admin') {
        setToast({
          message: `Pedido ${data.numero} completado y listo para salir`,
          type: 'success',
        })
      }
    },
    onRefresh: () => {
      window.dispatchEvent(new CustomEvent('alebet:refresh'))
    },
  })

  const visibleItems = navItems.filter((item) => {
    if (item.path === '/productos') {
      return user?.rol === 'admin' || user?.rol === 'vendedor'
    }

    if (item.path === '/stock') {
      return user?.rol === 'admin'
    }

    if (item.path === '/clientes') {
      return user?.rol === 'admin' || user?.rol === 'vendedor'
    }

    if (item.path === '/historial') {
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
      className="layout-root flex min-h-screen text-[var(--color-text)]"
      style={{ minHeight: '100vh', height: '100vh', overflow: 'hidden', background: 'transparent' }}
    >
      <aside className="hidden min-h-screen w-56 shrink-0 border-r border-[var(--color-border-soft)] bg-[linear-gradient(180deg,rgba(24,29,24,0.98)_0%,rgba(20,24,20,0.98)_100%)] md:flex md:flex-col">
        <div className="border-b border-[var(--color-border-soft)] px-7 py-5">
          <span
            className="font-bold text-[var(--color-accent)]"
            style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '15px', letterSpacing: '0.8px' }}
          >
            logística
          </span>
        </div>

        <nav className="flex-1 space-y-1.5 px-3 py-4">
          {visibleItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-4 py-2.5 text-[14px] font-semibold transition-colors ${
                  isActive
                    ? 'border border-[var(--color-border-soft)] bg-[rgba(255,255,255,0.03)] text-[var(--color-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]'
                    : 'text-[var(--color-text-2)] hover:bg-[rgba(255,255,255,0.02)] hover:text-[var(--color-text)]'
                }`
              }
            >
              <Icon size={16} strokeWidth={1.6} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-[var(--color-border-soft)] px-4 py-[14px]">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-soft)] bg-[rgba(26,107,53,0.12)] text-[11px] font-semibold text-[var(--color-text-2)]">
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
        className="layout-content flex flex-1 flex-col"
        style={{ minHeight: '100vh', height: '100vh', background: 'transparent' }}
      >
        <main
          className="layout-main flex-1 px-6 py-7 text-[var(--color-text)] md:px-8"
          style={{ flex: 1, minHeight: '100vh', height: '100vh', overflowY: 'auto', background: 'transparent' }}
        >
          {children}
        </main>
      </div>

      {toast ? (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      ) : null}
    </div>
  )
}
