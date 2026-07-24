import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { AppRouter } from '@/router'
import { useAuthStore } from '@/stores/auth-store'
import { applyStoredTheme } from '@/lib/theme'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const authResolved = useAuthStore((s) => s.authResolved)
  const initializeAuth = useAuthStore((s) => s.initializeAuth)

  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  useEffect(() => {
    applyStoredTheme()
  }, [])

  if (!authResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-lowest">
        <p className="text-gray-400">Verificando sesión…</p>
      </div>
    )
  }

  return <>{children}</>
}

export default function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthBootstrap>
            <AppRouter />
          </AuthBootstrap>
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
