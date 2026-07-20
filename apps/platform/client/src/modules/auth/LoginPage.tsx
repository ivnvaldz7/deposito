import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'

const API_URL = import.meta.env.VITE_API_URL || ''
const IS_DEV = import.meta.env.DEV

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Usuario no autorizado. Contactá al administrador.',
  disabled: 'Cuenta deshabilitada. Contactá al administrador.',
}

const DEV_USERS = [
  { email: 'admin@example.com', label: 'Admin' },
  { email: 'encargado@deposito.com', label: 'Encargado Depósito' },
  { email: 'observador@ale-bet.com', label: 'Observador Ale-Bet' },
]

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const error = searchParams.get('error')
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const setLastApp = useAppStore((s) => s.setLastApp)
  const lastApp = useAppStore((s) => s.lastApp)

  const handleGoogleLogin = () => {
    window.location.href = `${API_URL}/api/auth/google`
  }

  const handleDevLogin = async (email: string) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error de conexión' }))
        alert(err.error)
        return
      }

      const data = await res.json()
      login(data.token, data.user)

      const activeApps = Object.entries(data.user.apps ?? {})
        .filter(([_, a]) => a.activo)
        .map(([app]) => app)

      if (activeApps.length === 0) {
        navigate('/no-access', { replace: true })
      } else if (activeApps.length === 1) {
        const target = activeApps[0]
        setLastApp(target)
        navigate(`/${target}`, { replace: true })
      } else {
        if (lastApp && activeApps.includes(lastApp)) {
          navigate(`/${lastApp}`, { replace: true })
        } else {
          navigate('/app-selector', { replace: true })
        }
      }
    } catch {
      alert('Error al iniciar sesión')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-obsidian-900">
      <div className="w-full max-w-sm rounded-lg bg-obsidian-800 p-8 shadow-lg">
        <h1 className="mb-2 text-center text-2xl font-bold text-white">
          Plataforma
        </h1>
        <p className="mb-8 text-center text-sm text-gray-400">
          Iniciá sesión para continuar
        </p>

        {error && ERROR_MESSAGES[error] && (
          <div
            role="alert"
            className="mb-6 rounded-md bg-rose-500/10 px-4 py-3 text-sm text-rose-500"
          >
            {ERROR_MESSAGES[error]}
          </div>
        )}

        {error && !ERROR_MESSAGES[error] && (
          <div
            role="alert"
            className="mb-6 rounded-md bg-rose-500/10 px-4 py-3 text-sm text-rose-500"
          >
            Error desconocido
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleLogin}
          className="flex w-full items-center justify-center gap-3 rounded-md bg-white px-4 py-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-100"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Iniciar sesión con Google
        </button>

        {IS_DEV && (
          <>
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-obsidian-600" />
              <span className="text-xs text-gray-500">DEV</span>
              <div className="h-px flex-1 bg-obsidian-600" />
            </div>

            <div className="space-y-2">
              <p className="text-xs text-gray-500">Inicio rápido (desarrollo):</p>
              {DEV_USERS.map((user) => (
                <button
                  key={user.email}
                  type="button"
                  onClick={() => handleDevLogin(user.email)}
                  className="w-full rounded-md border border-obsidian-600 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-emerald-600 hover:text-emerald-400"
                >
                  {user.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
