import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiRequest, type AuthUser } from '@/lib/api'
import { saveToken } from '@/lib/auth'
import { useAuthStore } from '@/stores/auth-store'

export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const response = await apiRequest<{ token: string; user: AuthUser }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        },
        false
      )

      saveToken(response.token)
      login(response.token, response.user)
      navigate('/dashboard', { replace: true })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo iniciar sesión')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-white/6 bg-[var(--surface-low)] p-8">
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--primary)]">Ale-Bet</p>
        <h1 className="mt-3 font-[Montserrat] text-3xl font-semibold">Panel Operativo</h1>
        <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
          Ingresá con un usuario habilitado desde el admin de plataforma.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-white/8 bg-[var(--surface-lowest)] px-4 py-3 outline-none focus:border-[var(--primary)]"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-white/8 bg-[var(--surface-lowest)] px-4 py-3 outline-none focus:border-[var(--primary)]"
            required
          />
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[#07120b] disabled:opacity-60"
          >
            {submitting ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </main>
  )
}
