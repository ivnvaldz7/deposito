import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient, ApiError } from '@/lib/api-client'
import type { AuthUser } from '@/stores/auth-store'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
})

type LoginFormData = z.infer<typeof loginSchema>

interface LoginResponse {
  token: string
  user: AuthUser
}

export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginFormData) {
    setServerError(null)
    try {
      const res = await apiClient.post<LoginResponse>('/auth/login', data)
      login(res.token, res.user)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message)
      } else {
        setServerError('Error de conexión. Intentá de nuevo.')
      }
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold text-primary-container tracking-tight">
            Depósito
          </h1>
          <p className="font-body text-on-surface-variant text-sm mt-1 tracking-widest uppercase">
            Sistema de gestión operativa
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface-low p-8 rounded" style={{ boxShadow: 'var(--shadow-float)' }}>
          <h2 className="font-heading text-on-surface font-semibold text-lg mb-6">
            Iniciar sesión
          </h2>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <div className="space-y-1">
              <label htmlFor="login-email" className="font-body text-on-surface-variant text-xs font-medium uppercase tracking-widest">
                Email
              </label>
              <input
                id="login-email"
                {...register('email')}
                type="email"
                placeholder="nombre@laboratorio.com"
                className="input-field"
                autoComplete="email"
              />
              {errors.email && (
                <p className="font-body text-error text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="login-password" className="font-body text-on-surface-variant text-xs font-medium uppercase tracking-widest">
                Contraseña
              </label>
              <input
                id="login-password"
                {...register('password')}
                type="password"
                placeholder="••••••••"
                className="input-field"
                autoComplete="current-password"
              />
              {errors.password && (
                <p className="font-body text-error text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <div className="bg-error/10 text-error font-body text-sm px-4 py-3 rounded">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary mt-2"
            >
              {isSubmitting ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>

        <p className="font-body text-on-surface-variant text-xs text-center mt-6 opacity-50">
          v0.1.0 — Fase 1 MVP
        </p>
      </div>
    </div>
  )
}
