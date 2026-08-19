import { useEffect, useMemo, useState } from 'react'
import type { AppId, PlatformUser } from '../lib/api'
import { APP_ROLES } from '../lib/roles'

interface AppAccessPanelProps {
  user: PlatformUser | null
  onClose: () => void
  onSaveAccess: (userId: string, payload: { app: AppId; rol: string; activo: boolean }) => Promise<void>
  onRemoveAccess: (userId: string, app: AppId) => Promise<void>
  onToggleStatus: (userId: string, activo: boolean) => Promise<void>
  onResetPassword?: (userId: string) => Promise<string>
}

import { useAuthStore } from '@/stores/auth-store'

export function AppAccessPanel({ user, onClose, onSaveAccess, onRemoveAccess, onToggleStatus, onResetPassword }: AppAccessPanelProps) {
  const currentUser = useAuthStore((s) => s.user)
  
  const initialState = useMemo(() => {
    if (!user) return { deposito: { activo: false, rol: 'encargado' }, ale_bet: { activo: false, rol: 'vendedor' } }
    return {
      deposito: {
        activo: user.appAccess.find((item) => item.app === 'deposito')?.activo ?? false,
        rol: user.appAccess.find((item) => item.app === 'deposito')?.rol ?? 'encargado',
      },
      ale_bet: {
        activo: user.appAccess.find((item) => item.app === 'ale_bet')?.activo ?? false,
        rol: user.appAccess.find((item) => item.app === 'ale_bet')?.rol ?? 'vendedor',
      },
    }
  }, [user])

  const [access, setAccess] = useState(initialState)
  const [globalStatus, setGlobalStatus] = useState(user?.activo ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modals state for "Quitar acceso"
  const [removingApp, setRemovingApp] = useState<AppId | null>(null)

  // Reset password state
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    setAccess(initialState)
    setGlobalStatus(user?.activo ?? false)
    setTempPassword(null)
    setShowResetConfirm(false)
  }, [initialState, user])

  if (!user) return null

  async function handleSaveAll() {
    setSaving(true)
    setError(null)
    try {
      if (globalStatus !== user!.activo) {
        await onToggleStatus(user!.id, globalStatus)
      }
      for (const app of Object.keys(access) as AppId[]) {
        const acc = access[app]
        await onSaveAccess(user!.id, { app, rol: acc.rol, activo: acc.activo })
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  async function confirmRemoveAccess(app: AppId) {
    setSaving(true)
    setError(null)
    try {
      await onRemoveAccess(user!.id, app)
      setAccess(curr => ({ ...curr, [app]: { ...curr[app], activo: false } }))
      setRemovingApp(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al quitar acceso')
    } finally {
      setSaving(false)
    }
  }

  async function handleResetPasswordSubmit() {
    if (!onResetPassword) return
    setResetting(true)
    setError(null)
    try {
      const pwd = await onResetPassword(user!.id)
      setTempPassword(pwd)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al restablecer contraseña')
    } finally {
      setResetting(false)
    }
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-white/10 bg-surface-container-lowest/98 p-6 shadow-float flex flex-col h-full overflow-hidden">
      <div className="flex items-start justify-between shrink-0 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-on-surface">Editar usuario</h2>
          <p className="mt-1 font-body text-sm text-on-surface-variant">
            Gestioná estado y accesos del usuario.
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-3 py-1 font-body text-sm text-on-surface-variant hover:bg-surface-variant/50 transition-colors">
          Cerrar
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 pr-2">
        <div className="rounded-xl border border-white/10 bg-surface-container/60 p-4">
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-body text-xs font-semibold text-on-surface-variant/70">Nombre</p>
              <p className="font-body text-sm text-on-surface">{user.nombre}</p>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="font-body text-xs font-semibold text-on-surface-variant/70">Email</p>
                <p className="font-body text-sm text-on-surface">{user.email}</p>
              </div>
              {currentUser?.isPlatformAdmin && onResetPassword && (
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="rounded border border-white/10 bg-surface-container-high px-2 py-1 font-body text-xs text-on-surface hover:bg-surface-variant/50 transition-colors"
                >
                  Restablecer contraseña
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-surface-container/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-body text-sm font-medium text-on-surface uppercase tracking-wide">Usuario activo</p>
              <p className="font-body text-xs text-on-surface-variant mt-1">Controla el acceso general a la plataforma.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={globalStatus} onChange={(e) => setGlobalStatus(e.target.checked)} />
              <div className="w-11 h-6 bg-surface-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>

        <div>
          <h3 className="font-body text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-3">Accesos por aplicación</h3>
          <div className="space-y-3">
            {(Object.keys(access) as AppId[]).map((app) => (
              <div key={app} className="rounded-xl border border-white/10 bg-surface-container/60 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-body text-sm font-semibold text-on-surface">
                    {app === 'deposito' ? 'Depósito' : 'Ale-Bet / Logística'}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={access[app].activo} onChange={(e) => setAccess(curr => ({ ...curr, [app]: { ...curr[app], activo: e.target.checked } }))} />
                    <div className="w-9 h-5 bg-surface-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="font-body text-xs text-on-surface-variant">Rol:</span>
                    <select
                      value={access[app].rol}
                      disabled={!access[app].activo}
                      onChange={(e) => setAccess(curr => ({ ...curr, [app]: { ...curr[app], rol: e.target.value } }))}
                      className="rounded-lg border border-white/10 bg-surface-container-high px-2 py-1 font-body text-xs text-on-surface disabled:opacity-50 flex-1 max-w-[140px] outline-none"
                    >
                      {APP_ROLES[app].map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>
                  <button type="button" onClick={() => setRemovingApp(app)} className="font-body text-xs font-medium text-error/80 hover:text-error transition-colors">
                    Quitar acceso
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {error ? <p className="font-body text-sm text-error px-1">{error}</p> : null}
      </div>

      <div className="shrink-0 pt-4 border-t border-white/5 mt-4 flex items-center justify-end gap-3">
        <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-white/10 px-4 py-2.5 font-body text-sm font-medium text-on-surface-variant hover:bg-surface-variant/30 transition-colors disabled:opacity-50">
          Cancelar
        </button>
        <button type="button" onClick={() => void handleSaveAll()} disabled={saving} className="rounded-xl bg-primary px-4 py-2.5 font-body text-sm font-medium text-on-primary transition hover:bg-primary-dim scale-hover disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      {removingApp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-on-surface">Quitar acceso a {removingApp === 'deposito' ? 'Depósito' : 'Logística'}</h3>
            <p className="mt-2 font-body text-sm text-on-surface-variant">
              Este usuario dejará de tener acceso a {removingApp === 'deposito' ? 'Depósito' : 'Logística'}.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setRemovingApp(null)} disabled={saving} className="rounded-xl border border-white/10 px-4 py-2 font-body text-sm text-on-surface-variant">
                Cancelar
              </button>
              <button type="button" onClick={() => void confirmRemoveAccess(removingApp)} disabled={saving} className="rounded-xl bg-error px-4 py-2 font-body text-sm font-medium text-on-error hover:bg-error/80">
                {saving ? 'Quitando...' : 'Quitar acceso'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && !tempPassword && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-on-surface">Restablecer contraseña</h3>
            <p className="mt-2 font-body text-sm text-on-surface-variant">
              Se generará una nueva contraseña temporal. El usuario deberá cambiarla en su próximo ingreso.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowResetConfirm(false)} disabled={resetting} className="rounded-xl border border-white/10 px-4 py-2 font-body text-sm text-on-surface-variant">
                Cancelar
              </button>
              <button type="button" onClick={() => void handleResetPasswordSubmit()} disabled={resetting} className="rounded-xl bg-primary px-4 py-2 font-body text-sm font-medium text-on-primary hover:bg-primary-dim">
                {resetting ? 'Generando...' : 'Restablecer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tempPassword && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-on-surface">Contraseña generada</h3>
            <p className="mt-2 font-body text-sm text-on-surface-variant mb-4">
              Copiá la contraseña temporal. No volverá a mostrarse por seguridad.
            </p>
            
            <div className="flex items-center justify-between rounded bg-surface-container-high p-3 mb-4">
              <code className="font-mono text-lg text-primary select-all">{tempPassword}</code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(tempPassword)}
                className="text-xs font-medium text-primary hover:text-primary-dim uppercase"
              >
                Copiar
              </button>
            </div>

            <p className="font-body text-xs text-on-surface-variant/80 italic mb-6">
              El usuario deberá cambiarla en su próximo ingreso.
            </p>

            <div className="flex justify-end">
              <button type="button" onClick={() => { setTempPassword(null); setShowResetConfirm(false) }} className="rounded-xl bg-surface-variant px-4 py-2 font-body text-sm font-medium text-on-surface">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
