import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AppRouter } from '@/router'
import { useAuthStore } from '@/stores/auth-store'

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const authResolved = useAuthStore((s) => s.authResolved)
  const initializeAuth = useAuthStore((s) => s.initializeAuth)

  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  if (!authResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-obsidian-900">
        <p className="text-gray-400">Verificando sesión…</p>
      </div>
    )
  }

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthBootstrap>
        <AppRouter />
      </AuthBootstrap>
    </BrowserRouter>
  )
}
