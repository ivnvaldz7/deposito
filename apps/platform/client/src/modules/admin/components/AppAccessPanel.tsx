import { useEffect, useMemo, useState } from 'react'
import type { AppId, PlatformUser } from '../lib/api'

interface AppAccessPanelProps {
  user: PlatformUser | null
  onClose: () => void
  onSaveAccess: (
    userId: string,
    payload: { app: AppId; rol: string; activo: boolean },
  ) => Promise<void>
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
        activo:
          user.appAccess.find((item) => item.app === 'deposito')?.activo ?? false,
        rol:
          user.appAccess.find((item) => item.app === 'deposito')?.rol ?? 'encargado',
      },
      ale_bet: {
        activo:
          user.appAccess.find((item) => item.app === 'ale_bet')?.activo ?? false,
        rol:
          user.appAccess.find((item) => item.app === 'ale_bet')?.rol ?? 'operador',
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
      setError(
        statusError instanceof Error
          ? statusError.message
          : 'No se pudo actualizar el estado',
      )
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
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'No se pudo guardar el acceso',
      )
    } finally {
      setSavingApp(null)
    }
  }

  function setAppAccess(
    app: AppId,
    value: Partial<{ activo: boolean; rol: string }>,
  ) {
    setAccess((current) => ({
      ...current,
      [app]: {
        ...current[app],
        ...value,
      },
    }))
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-white/10 bg-surface-container-lowest/98 p-6 shadow-float">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold font-heading text-on-surface">Editar usuario</h2>
          <p className="mt-1 font-body text-sm text-on-surface-variant">
            Gestioná accesos por app y estado general.
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

      <div className="mt-6 space-y-3 rounded-xl border border-white/10 bg-surface-container/60 p-4">
        <div>
          <p className="font-body text-xs uppercase tracking-[0.18em] text-on-surface-variant/70">
            Nombre
          </p>
          <p className="mt-1 font-body text-sm text-on-surface">{currentUser.nombre}</p>
        </div>
        <div>
          <p className="font-body text-xs uppercase tracking-[0.18em] text-on-surface-variant/70">
            Email
          </p>
          <p className="mt-1 font-body text-sm text-on-surface">{currentUser.email}</p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-surface-container/60 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-body text-sm font-medium text-on-surface">Usuario activo</p>
            <p className="mt-1 font-body text-xs text-on-surface-variant">
              Desactiva el acceso completo del usuario.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleStatusChange(!user.activo)}
            disabled={savingStatus}
            className={`rounded-full px-4 py-2 font-body text-sm font-medium ${
              currentUser.activo
                ? 'bg-success/20 text-success'
                : 'bg-surface-container-high text-on-surface-variant'
            }`}
          >
            {savingStatus
              ? 'Guardando...'
              : currentUser.activo
                ? 'Activo'
                : 'Inactivo'}
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {(Object.keys(access) as AppId[]).map((app) => (
          <section
            key={app}
            className="rounded-xl border border-white/10 bg-surface-container/60 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-body text-sm font-semibold text-on-surface">
                  {app === 'deposito' ? 'Depósito' : 'Ale-Bet'}
                </h3>
                <p className="mt-1 font-body text-xs text-on-surface-variant">
                  Rol y estado del acceso.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 font-body text-sm text-on-surface-variant">
                <input
                  type="checkbox"
                  checked={access[app].activo}
                  onChange={(event) =>
                    setAppAccess(app, { activo: event.target.checked })
                  }
                />
                Activo
              </label>
            </div>

            <select
              value={access[app].rol}
              disabled={!access[app].activo}
              onChange={(event) =>
                setAppAccess(app, { rol: event.target.value })
              }
              className="mt-4 w-full rounded-xl border border-white/10 bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface disabled:opacity-50"
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
              className="mt-4 w-full rounded-xl border border-primary/50 bg-primary/15 px-4 py-3 font-body text-sm font-medium text-primary transition hover:bg-primary/25 disabled:opacity-50 scale-hover"
            >
              {savingApp === app ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </section>
        ))}
      </div>

      {error ? (
        <p className="mt-4 font-body text-sm text-error">{error}</p>
      ) : null}
    </aside>
  )
}
