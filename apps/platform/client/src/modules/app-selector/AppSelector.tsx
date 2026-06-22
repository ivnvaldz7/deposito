import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'

const APP_LABELS: Record<string, { name: string; desc: string }> = {
  deposito: { name: 'Depósito', desc: 'Stock, insumos y producción' },
  'ale-bet': { name: 'Ale·Bet', desc: 'Pedidos, armado y despacho' },
  admin: { name: 'Admin', desc: 'Usuarios y permisos' },
}

export default function AppSelector() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setLastApp = useAppStore((s) => s.setLastApp)

  const activeApps = Object.entries(user?.apps ?? {})
    .filter(([_, access]) => access.activo)

  if (activeApps.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-obsidian-900">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-white">Sin apps disponibles</h1>
          <p className="text-gray-400">No tenés acceso a ninguna aplicación.</p>
        </div>
      </div>
    )
  }

  const handleSelect = (app: string) => {
    setLastApp(app)
    navigate(`/${app}`)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-obsidian-900">
      <div className="w-full max-w-lg p-8">
        <h1 className="mb-2 text-center text-2xl font-bold text-white">
          Plataforma
        </h1>
        <p className="mb-8 text-center text-sm text-gray-400">
          Seleccioná una aplicación
        </p>

        <div className="space-y-4">
          {activeApps.map(([appId, access]) => {
            const info = APP_LABELS[appId] ?? { name: appId, desc: '' }
            return (
              <button
                key={appId}
                type="button"
                onClick={() => handleSelect(appId)}
                className="w-full rounded-lg bg-obsidian-700 p-5 text-left transition-colors hover:bg-obsidian-600"
              >
                <h2 className="text-lg font-semibold text-white">{info.name}</h2>
                {info.desc && (
                  <p className="mt-1 text-sm text-gray-400">{info.desc}</p>
                )}
                <span className="mt-2 inline-block text-sm font-medium text-emerald-400">
                  Ingresar →
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
