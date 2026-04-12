import { Outlet } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { CommandPalette } from '@/components/command-palette/command-palette'
import { useSSE } from '@/hooks/use-sse'

export function AppLayout() {
  useSSE()

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />
        <main className="flex-1 p-5 md:p-8">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}
