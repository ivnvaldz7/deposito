import { useMemo, useState, type FormEvent } from 'react'
import type { AppId } from '../lib/api'

interface UserModalProps {
  open: boolean
  onClose: () => void
  onCreate: (payload: {
    nombre: string
    email: string
    password: string
    appAccess: Array<{ app: AppId; rol: string }>
  }) => Promise<void>
}

type AccessState = Record<AppId, { enabled: boolean; rol: string }>

const initialAccess: AccessState = {
  deposito: { enabled: false, rol: 'encargado' },
  ale_bet: { enabled: false, rol: 'operador' },
}

export function UserModal({ open, onClose, onCreate }: UserModalProps) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [access, setAccess] = useState<AccessState>(initialAccess)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const appAccess = useMemo(
    () =>
      (Object.entries(access) as Array<[AppId, AccessState[AppId]]>)
        .filter(([, value]) => value.enabled)
        .map(([app, value]) => ({
          app,
          rol: value.rol,
        })),
    [access],
  )

  if (!open) {
    return null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await onCreate({
        nombre,
        email,
        password,
        appAccess,
      })

      setNombre('')
      setEmail('')
      setPassword('')
      setAccess(initialAccess)
      onClose()
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No se pudo crear el usuario',
      )
    } finally {
      setSubmitting(false)
    }
  }

  function updateAccess(app: AppId, next: Partial<AccessState[AppId]>) {
    setAccess((current) => ({
      ...current,
      [app]: {
        ...current[app],
        ...next,
      },
    }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-dim/85 px-4">
      <div className="w-full max-w-xl rounded-xl border border-white/10 bg-surface-container-low p-6 shadow-float">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold font-heading text-on-surface">Nuevo usuario</h2>
            <p className="mt-1 font-body text-sm text-on-surface-variant">
              Creá credenciales y accesos por app.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1 font-body text-sm text-on-surface-variant"
          >
            Cerrar
          </button>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 font-body text-sm text-on-surface-variant">
              <span>Nombre</span>
              <input
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-surface-container-high px-4 py-3 text-on-surface outline-none transition focus:border-primary"
                required
              />
            </label>
            <label className="space-y-2 font-body text-sm text-on-surface-variant">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-surface-container-high px-4 py-3 text-on-surface outline-none transition focus:border-primary"
                required
              />
            </label>
          </div>

          <label className="space-y-2 font-body text-sm text-on-surface-variant">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-surface-container-high px-4 py-3 text-on-surface outline-none transition focus:border-primary"
              required
            />
          </label>

          <div className="rounded-xl border border-white/10 bg-surface-dim/40 p-4">
            <h3 className="font-body text-sm font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
              Accesos
            </h3>

            <div className="mt-4 space-y-4">
              <div className="grid gap-3 rounded-xl border border-white/10 p-4 md:grid-cols-[auto_1fr] md:items-center">
                <label className="inline-flex items-center gap-3 font-body text-sm text-on-surface">
                  <input
                    type="checkbox"
                    checked={access.deposito.enabled}
                    onChange={(event) =>
                      updateAccess('deposito', { enabled: event.target.checked })
                    }
                  />
                  Depósito
                </label>
                <select
                  value={access.deposito.rol}
                  onChange={(event) =>
                    updateAccess('deposito', { rol: event.target.value })
                  }
                  disabled={!access.deposito.enabled}
                  className="rounded-xl border border-white/10 bg-surface-container px-4 py-3 font-body text-sm text-on-surface disabled:opacity-50"
                >
                  <option value="encargado">encargado</option>
                  <option value="observador">observador</option>
                  <option value="solicitante">solicitante</option>
                </select>
              </div>

              <div className="grid gap-3 rounded-xl border border-white/10 p-4 md:grid-cols-[auto_1fr] md:items-center">
                <label className="inline-flex items-center gap-3 font-body text-sm text-on-surface">
                  <input
                    type="checkbox"
                    checked={access.ale_bet.enabled}
                    onChange={(event) =>
                      updateAccess('ale_bet', { enabled: event.target.checked })
                    }
                  />
                  Ale-Bet
                </label>
                <select
                  value={access.ale_bet.rol}
                  onChange={(event) =>
                    updateAccess('ale_bet', { rol: event.target.value })
                  }
                  disabled={!access.ale_bet.enabled}
                  className="rounded-xl border border-white/10 bg-surface-container px-4 py-3 font-body text-sm text-on-surface disabled:opacity-50"
                >
                  <option value="operador">operador</option>
                  <option value="supervisor">supervisor</option>
                </select>
              </div>
            </div>
          </div>

          {error ? <p className="font-body text-sm text-error">{error}</p> : null}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-3 font-body text-sm text-on-surface-variant"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-primary px-4 py-3 font-body text-sm font-medium text-on-primary transition hover:bg-primary-dim disabled:opacity-50 scale-hover"
            >
              {submitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
