import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'

const API_URL = import.meta.env.VITE_API_URL || ''

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Usuario no autorizado. Contactá al administrador.',
  disabled: 'Cuenta deshabilitada. Contactá al administrador.',
}

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const error = searchParams.get('error')
  const login = useAuthStore((s) => s.login)
  const setLastApp = useAppStore((s) => s.setLastApp)

  // Local form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})

  const validateForm = (): boolean => {
    const errors: { email?: string; password?: string } = {}
    if (!email.trim()) {
      errors.email = 'Email requerido'
    }
    if (!password) {
      errors.password = 'Contraseña requerida'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (!validateForm()) return

    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: 'include',
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error de conexión' }))
        if (err.error === 'Cuenta deshabilitada') {
          setLocalError(err.error)
        } else {
          setLocalError('Email o contraseña incorrectos')
        }
        return
      }

      const data = await res.json()
      login(data.token, data.user)

      // Redirect based on user's apps (same logic as GoogleCallbackHandler)
      const user = data.user as import('@/stores/auth-store').PlatformUser
      const activeApps = Object.entries(user.apps ?? {})
        .filter(([_, a]) => a.activo)
        .map(([app]) => app)

      if (activeApps.length === 0) {
        navigate('/no-access', { replace: true })
      } else if (activeApps.length === 1) {
        const target = activeApps[0]
        setLastApp(target)
        navigate(`/${target}`, { replace: true })
      } else {
        navigate('/app-selector', { replace: true })
      }
    } catch {
      setLocalError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-lowest px-4 py-8">
      <div className="w-full max-w-[28rem] rounded-xl border border-white/5 bg-surface-container p-6 shadow-lg sm:p-8">
        <div className="flex justify-center mb-8 mt-2">
          <div className="relative w-[180px] sm:w-[220px] h-[36px] sm:h-[44px] overflow-hidden">
            <img 
              src="/brand/AB-SVG.svg" 
              alt="Ale-Bet" 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-auto invert opacity-90" 
            />
          </div>
        </div>

        {error && ERROR_MESSAGES[error] && (
          <div
            role="alert"
            className="mb-6 rounded-md bg-error/10 px-4 py-3 text-sm text-error"
          >
            {ERROR_MESSAGES[error]}
          </div>
        )}

        {error && !ERROR_MESSAGES[error] && (
          <div
            role="alert"
            className="mb-6 rounded-md bg-error/10 px-4 py-3 text-sm text-error"
          >
            Error desconocido
          </div>
        )}

        {/* Local login form */}
        <form onSubmit={handleLocalLogin} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={setEmail}
            error={fieldErrors.email}
            disabled={loading}
          />

          <Input
            label="Contraseña"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={setPassword}
            error={fieldErrors.password}
            disabled={loading}
          />

          {localError && (
            <p role="alert" className="font-body text-xs text-error">
              {localError}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  )
}
