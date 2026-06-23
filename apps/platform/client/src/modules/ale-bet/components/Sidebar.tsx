import { NavLink } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'

const navItems = [
  { path: '/ale-bet/dashboard', label: 'Dashboard', icon: '◉' },
  { path: '/ale-bet/pedidos', label: 'Pedidos', icon: '◈' },
  { path: '/ale-bet/productos', label: 'Productos', icon: '◇' },
  { path: '/ale-bet/clientes', label: 'Clientes', icon: '○' },
  { path: '/ale-bet/stock', label: 'Stock', icon: '▣' },
  { path: '/ale-bet/historial', label: 'Historial', icon: '◎' },
]

export default function Sidebar() {
  const user = useAuthStore((state) => state.user)
  const rol = user?.apps?.['ale-bet']?.rol

  // Only admin sees Stock
  const visibleItems = navItems.filter(
    (item) => item.path !== '/ale-bet/stock' || rol === 'admin'
  )

  return (
    <aside className="w-64 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-6 px-3">
        <h2 className="text-[14px] font-bold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>Ale·Bet</h2>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">{rol ?? '—'}</p>
      </div>

      <nav className="space-y-1">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[12px] font-medium transition ${
                isActive
                  ? 'bg-[rgba(26,107,53,0.16)] text-[#7ff6a1]'
                  : 'text-[var(--color-text-3)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]'
              }`
            }
          >
            <span className="text-[14px]">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
