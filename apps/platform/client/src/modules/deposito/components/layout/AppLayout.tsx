import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { CommandPalette } from '../command-palette/CommandPalette'
import { useCommandPaletteStore } from '../../stores/command-palette-store'
import { useSSE } from '../../hooks/use-sse'
import { useAuthStore } from '@/stores/auth-store'
import { can } from '@/lib/permissions'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const togglePalette = useCommandPaletteStore((s) => s.togglePalette)

  useSSE()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isInput = target instanceof HTMLInputElement ||
                      target instanceof HTMLTextAreaElement ||
                      target instanceof HTMLSelectElement ||
                      target.isContentEditable

      if (e.key === 'K' && e.shiftKey && !isInput) {
        e.preventDefault()
        togglePalette()
      }

      const isModalOpen = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))
      if (e.key.toLowerCase() === 'n' && e.shiftKey && !isInput && !isModalOpen && can(user, 'deposito', 'ingresos.create')) {
        e.preventDefault()
        navigate('/deposito/ingresos')
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [navigate, togglePalette, user])

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 md:ml-[280px]">
        <main key={pathname} className="flex-1 overflow-y-auto animate-page-enter p-3 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:p-5 md:p-margin-desktop">
          {children}
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}
