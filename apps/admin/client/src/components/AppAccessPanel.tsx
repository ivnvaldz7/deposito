import { useEffect, useMemo, useState } from 'react'
import type { AppId, PlatformUser } from '@/lib/api'

interface AppAccessPanelProps {
  user: PlatformUser | null
  onClose: () => void
  onSaveAccess: (userId: string, payload: {
    app: AppId
    rol: string
    activo: boolean
  }) => Promise<void>
  onToggleStatus: (userId: string, activo: boolean) => Promise<void>
}

const appRoleOptions: Record<AppId, string[]> = {
  deposito: ['encargado', 'observador', 'solicitante'],
  ale_bet: ['operador', 'supervisor'],
}

export function AppAccessPanel({
  user,
  onClose,
  onSaveAccess,
  onToggleStatus,
}: AppAccessPanelProps) {
  const initialState = useMemo(() => {
    if (!user) {
      return {
        deposito: { activo: false, rol: 'encargado' },
        ale_bet: { activo: false, rol: 'operador' },
      }
    }

    return {
      deposito: {
        activo: user.appAccess.find((item) => item.app === 'deposito')?.activo ?? false,
        rol: user.appAccess.find((item) => item.app === 'deposito')?.rol ?? 'encargado',
      },
      ale_bet: {
        activo: user.appAccess.find((item) => item.app === 'ale_bet')?.activo ?? false,
        rol: user.appAccess.find((item) => item.app === 'ale_bet')?.rol ?? 'operador',
      },
    }
  }, [user])

  const [access, setAccess] = useState(initialState)
  const [savingStatus, setSavingStatus] = useState(false)
  const [savingApp, setSavingApp] = useState<AppId | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAccess(initialState)
  }, [initialState])

  if (!user) {
    return null
  }

  const currentUser = user

  async function handleStatusChange(nextStatus: boolean) {
    setSavingStatus(true)
    setError(null)

    try {
      await onToggleStatus(currentUser.id, nextStatus)
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'No se pudo actualizar el estado')
    } finally {
      setSavingStatus(false)
    }
  }

  async function handleSave(app: AppId) {
    setSavingApp(app)
    setError(null)

    try {
      await onSaveAccess(currentUser.id, {
        app,
        rol: access[app].rol,
        activo: access[app].activo,
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el acceso')
    } finally {
      setSavingApp(null)
    }
  }

  function setAppAccess(app: AppId, value: Partial<{ activo: boolean; rol: string }>) {
    setAccess((current) => ({
      ...current,
      [app]: {
        ...current[app],
        ...value,
      },
    }))
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-slate-800 bg-slate-950/98 p-6 shadow-2xl shadow-black/50">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Editar usuario</h2>
          <p className="mt-1 text-sm text-slate-400">Gestioná accesos por app y estado general.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300"
        >
          Cerrar
        </button>
      </div>

      <div className="mt-6 space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Nombre</p>
          <p className="mt-1 text-sm text-slate-100">{currentUser.nombre}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Email</p>
          <p className="mt-1 text-sm text-slate-100">{currentUser.email}</p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-100">Usuario activo</p>
            <p className="mt-1 text-xs text-slate-400">Desactiva el acceso completo del usuario.</p>
          </div>
          <button
            type="button"
            onClick={() => void handleStatusChange(!user.activo)}
            disabled={savingStatus}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              currentUser.activo
                ? 'bg-emerald-500/20 text-emerald-200'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {savingStatus ? 'Guardando...' : currentUser.activo ? 'Activo' : 'Inactivo'}
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {(Object.keys(access) as AppId[]).map((app) => (
          <section key={app} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  {app === 'deposito' ? 'Depósito' : 'Ale-Bet'}
                </h3>
                <p className="mt-1 text-xs text-slate-400">Rol y estado del acceso.</p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={access[app].activo}
                  onChange={(event) => setAppAccess(app, { activo: event.target.checked })}
                />
                Activo
              </label>
            </div>

            <select
              value={access[app].rol}
              disabled={!access[app].activo}
              onChange={(event) => setAppAccess(app, { rol: event.target.value })}
              className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 disabled:opacity-50"
            >
              {appRoleOptions[app].map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void handleSave(app)}
              disabled={savingApp === app}
              className="mt-4 w-full rounded-xl border border-sky-500/50 bg-sky-500/15 px-4 py-3 text-sm font-medium text-sky-200 transition hover:bg-sky-500/25 disabled:opacity-50"
            >
              {savingApp === app ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </section>
        ))}
      </div>

      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
    </aside>
  )
}
