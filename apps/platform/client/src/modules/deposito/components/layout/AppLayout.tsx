import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from '../command-palette/CommandPalette'
import { useCommandPaletteStore } from '../../stores/command-palette-store'

const INGRESOS_PATHS = ['/ingresos', '/ingresos/nueva']

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const togglePalette = useCommandPaletteStore((s) => s.togglePalette)
  const isIngreso = INGRESOS_PATHS.some((p) => pathname.endsWith(p))

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'K' && e.shiftKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        togglePalette()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [togglePalette])

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 transition-all duration-300 ease-in-out">
        {!isIngreso && <Topbar />}
        <main className="flex-1 p-margin-desktop overflow-y-auto animate-fadeIn">
          {children}
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}
