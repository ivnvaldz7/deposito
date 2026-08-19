import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient, ApiError } from '@/lib/api-client'

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { initializeAuth } = useAuthStore()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [fieldErrors, setFieldErrors] = useState<{ current?: string; new?: string; confirm?: string }>({})
  const [localError, setLocalError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const validateForm = () => {
    const errors: { current?: string; new?: string; confirm?: string } = {}
    
    if (!currentPassword) {
      errors.current = 'Contraseña actual requerida'
    }
    
    if (!newPassword) {
      errors.new = 'Nueva contraseña requerida'
    } else if (newPassword.length < 8) {
      errors.new = 'Debe tener al menos 8 caracteres'
    } else if (newPassword === currentPassword) {
      errors.new = 'Debe ser distinta a la actual'
    }
    
    if (!confirmPassword) {
      errors.confirm = 'Confirmar contraseña requerida'
    } else if (confirmPassword !== newPassword) {
      errors.confirm = 'Las contraseñas no coinciden'
    }
    
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (!validateForm()) return

    setLoading(true)
    try {
      const data = await apiClient.post<{ token: string; user: any }>('/auth/change-password', {
        currentPassword,
        newPassword
      })

      // The backend has already rotated the session and returned the new token and user.
      // We just need to update the store with the new credentials.
      useAuthStore.getState().login(data.token, data.user)
      
      navigate('/app-selector', { replace: true })
    } catch (err: any) {
      if (err instanceof ApiError) {
        setLocalError(err.message || 'No se pudo cambiar la contraseña')
      } else {
        setLocalError('Error de conexión')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-lowest px-4 py-8">
      <div className="w-full max-w-[28rem] rounded-xl border border-white/5 bg-surface-container p-6 shadow-lg sm:p-8">
        <h1 className="mb-2 text-center text-2xl font-bold text-on-surface">
          Cambiar contraseña
        </h1>
        <p className="mb-8 text-center font-body text-sm text-on-surface-variant">
          Estás usando una contraseña temporal. Elegí una nueva contraseña para continuar.
        </p>

        <form onSubmit={handleSubmit} className="mb-6 space-y-4">
          <Input
            label="Contraseña actual"
            type="password"
            placeholder="••••••••"
            value={currentPassword}
            onChange={setCurrentPassword}
            error={fieldErrors.current}
            disabled={loading}
          />

          <Input
            label="Nueva contraseña"
            type="password"
            placeholder="Mínimo 8 caracteres"
            value={newPassword}
            onChange={setNewPassword}
            error={fieldErrors.new}
            disabled={loading}
          />

          <Input
            label="Confirmar nueva contraseña"
            type="password"
            placeholder="Repetí la nueva contraseña"
            value={confirmPassword}
            onChange={setConfirmPassword}
            error={fieldErrors.confirm}
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
            className="mt-4 inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Cambiando contraseña…' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
