import { useMemo, useState, type FormEvent } from 'react'
import type { AppId } from '@/lib/api'

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
    [access]
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
      setError(submitError instanceof Error ? submitError.message : 'No se pudo crear el usuario')
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 px-4">
      <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-slate-950/60">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Nuevo usuario</h2>
            <p className="mt-1 text-sm text-slate-400">Creá credenciales y accesos por app.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300"
          >
            Cerrar
          </button>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-300">
              <span>Nombre</span>
              <input
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-500"
                required
              />
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-500"
                required
              />
            </label>
          </div>

          <label className="space-y-2 text-sm text-slate-300">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-500"
              required
            />
          </label>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
              Accesos
            </h3>

            <div className="mt-4 space-y-4">
              <div className="grid gap-3 rounded-2xl border border-slate-800 p-4 md:grid-cols-[auto_1fr] md:items-center">
                <label className="inline-flex items-center gap-3 text-sm text-slate-200">
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
                  onChange={(event) => updateAccess('deposito', { rol: event.target.value })}
                  disabled={!access.deposito.enabled}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 disabled:opacity-50"
                >
                  <option value="encargado">encargado</option>
                  <option value="observador">observador</option>
                  <option value="solicitante">solicitante</option>
                </select>
              </div>

              <div className="grid gap-3 rounded-2xl border border-slate-800 p-4 md:grid-cols-[auto_1fr] md:items-center">
                <label className="inline-flex items-center gap-3 text-sm text-slate-200">
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
                  onChange={(event) => updateAccess('ale_bet', { rol: event.target.value })}
                  disabled={!access.ale_bet.enabled}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 disabled:opacity-50"
                >
                  <option value="operador">operador</option>
                  <option value="supervisor">supervisor</option>
                </select>
              </div>
            </div>
          </div>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
