import { useEffect, useRef, useState } from 'react'
import { LogOut, Search, Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useCommandPaletteStore } from '@/stores/command-palette-store'
import { useNotificationsStore, type Notification } from '@/stores/notifications-store'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
const shortcutLabel = isMac ? '⌘K' : 'Ctrl+Shift+K'

// ─── Tipo chip de notificación ────────────────────────────────────────────────

const TIPO_CHIP_STYLES: Record<string, React.CSSProperties> = {
  ingreso_creado:   { color: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.10)' },
  stock_actualizado:{ color: '#00AE42', backgroundColor: 'rgba(0,174,66,0.10)' },
  orden_creada:     { color: '#FF9800', backgroundColor: 'rgba(255,152,0,0.10)' },
  orden_actualizada:{ color: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.10)' },
  stock_bajo:          { color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.10)' },
  vencimiento_proximo: { color: '#FF9800', backgroundColor: 'rgba(255,152,0,0.10)' },
}

const TIPO_LABELS: Record<string, string> = {
  ingreso_creado: 'Ingreso',
  stock_actualizado: 'Stock',
  orden_creada: 'Orden',
  orden_actualizada: 'Orden',
  stock_bajo: 'Stock bajo',
  vencimiento_proximo: 'Vencimiento',
}

function TipoChip({ tipo }: { tipo: string }) {
  const style = TIPO_CHIP_STYLES[tipo] ?? { color: '#bccbb8', backgroundColor: 'rgba(188,203,184,0.10)' }
  return (
    <span
      className="inline-block font-body text-xs font-medium px-1.5 py-0.5 rounded shrink-0"
      style={style}
    >
      {TIPO_LABELS[tipo] ?? tipo}
    </span>
  )
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'Ahora'
  if (diffMin < 60) return `Hace ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `Hace ${diffH} h`
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

// ─── Panel de notificaciones ──────────────────────────────────────────────────

function NotificationsPanel({
  notifications,
  onMarkAllRead,
  onClose,
}: {
  notifications: Notification[]
  onMarkAllRead: () => void
  onClose: () => void
}) {
  return (
    <div
      className="absolute right-0 top-full mt-2 w-80 rounded overflow-hidden shadow-lg z-50"
      style={{ background: 'rgba(49,54,49,0.97)', backdropFilter: 'blur(12px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/15">
        <span className="font-heading font-semibold text-on-surface text-sm">Notificaciones</span>
        {notifications.some((n) => !n.leida) && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="font-body text-xs text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Marcar todas como leídas
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="font-body text-on-surface-variant text-sm">Sin notificaciones</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className="px-4 py-3 border-b border-outline-variant/10 hover:bg-surface-bright/20 transition-colors"
              style={n.leida ? { opacity: 0.6 } : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {!n.leida && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-hidden="true" />
                  )}
                  <TipoChip tipo={n.tipo} />
                </div>
                <span className="font-body text-on-surface-variant text-xs shrink-0">
                  {formatTimestamp(n.timestamp)}
                </span>
              </div>
              <p className="font-body text-on-surface text-xs mt-1.5 leading-relaxed">
                {n.mensaje}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Footer cerrar */}
      <div className="px-4 py-2 border-t border-outline-variant/15">
        <button
          type="button"
          onClick={onClose}
          className="w-full font-body text-xs text-on-surface-variant hover:text-on-surface transition-colors py-1"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

export function Topbar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const openPalette = useCommandPaletteStore((s) => s.openPalette)
  const notifications = useNotificationsStore((s) => s.notifications)
  const unreadCount = useNotificationsStore((s) => s.unreadCount)
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead)

  const [panelOpen, setPanelOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  // Cerrar panel al hacer click fuera
  useEffect(() => {
    if (!panelOpen) return
    function handler(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [panelOpen])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  function handleBellClick() {
    setPanelOpen((v) => !v)
  }

  return (
    <header className="h-12 bg-surface-low flex items-center justify-between px-5 shrink-0">
      <span className="font-body text-on-surface-variant text-xs uppercase tracking-widest">
        <span className="md:hidden font-heading text-primary-container font-bold text-sm tracking-tight normal-case">
          Depósito
        </span>
      </span>

      <div className="flex items-center gap-3">
        {/* Search trigger — desktop */}
        <button
          onClick={openPalette}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright transition-colors text-on-surface-variant hover:text-on-surface"
          title={`Buscar (${shortcutLabel})`}
        >
          <Search size={13} strokeWidth={1.5} />
          <span className="font-body text-xs">Buscar</span>
          <kbd className="font-body text-xs opacity-60 ml-1">{shortcutLabel}</kbd>
        </button>

        {/* Campana de notificaciones */}
        <div ref={bellRef} className="relative">
          <button
            type="button"
            onClick={handleBellClick}
            aria-label="Notificaciones"
            title="Notificaciones"
            className="relative text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <Bell size={16} strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span
                className="absolute -top-1 -right-1 flex items-center justify-center rounded-full font-body text-white font-medium"
                style={{
                  fontSize: '0.55rem',
                  width: '14px',
                  height: '14px',
                  backgroundColor: '#ef4444',
                  lineHeight: 1,
                }}
                aria-label={`${unreadCount} notificaciones sin leer`}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {panelOpen && (
            <NotificationsPanel
              notifications={notifications}
              onMarkAllRead={markAllAsRead}
              onClose={() => setPanelOpen(false)}
            />
          )}
        </div>

        {user && (
          <span className="font-body text-on-surface text-sm hidden sm:block">
            {user.name}
          </span>
        )}
        <button
          onClick={handleLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <LogOut size={16} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  )
}
