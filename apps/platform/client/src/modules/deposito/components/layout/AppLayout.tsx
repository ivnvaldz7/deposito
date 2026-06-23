import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from '../command-palette/CommandPalette'
import { useSSE } from '../../hooks/use-sse'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  useSSE()

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />
        <main className="flex-1 p-5 md:p-8">
          {children}
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}
