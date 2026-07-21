import { useNavigate } from 'react-router-dom'
import { Package, ClipboardList, Shield, ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'

interface AppInfo {
  name: string
  desc: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const APP_LABELS: Record<string, AppInfo> = {
  deposito: {
    name: 'Depósito',
    desc: 'Stock, insumos y producción',
    icon: Package,
  },
  'ale-bet': {
    name: 'Ale·Bet',
    desc: 'Pedidos, armado y despacho',
    icon: ClipboardList,
  },
  admin: {
    name: 'Admin',
    desc: 'Usuarios y permisos',
    icon: Shield,
  },
}

function EmptyState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-lowest">
      <div className="text-center animate-fade-in">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container">
          <Shield size={28} className="text-on-surface-variant" />
        </div>
        <h1 className="mb-2 font-heading text-2xl font-bold text-on-surface">
          Sin apps disponibles
        </h1>
        <p className="font-body text-sm text-on-surface-variant">
          No tenés acceso a ninguna aplicación.
        </p>
      </div>
    </div>
  )
}

export default function AppSelector() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setLastApp = useAppStore((s) => s.setLastApp)

  const activeApps = Object.entries(user?.apps ?? {})
    .filter(([_, access]) => access.activo)

  if (activeApps.length === 0) {
    return <EmptyState />
  }

  const handleSelect = (app: string) => {
    setLastApp(app)
    navigate(`/${app}`)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-lowest">
      {/* Ambient decorative gradients */}
      <div className="pointer-events-none absolute -inset-40 opacity-30">
        <div className="absolute right-1/4 top-1/4 h-96 w-96 rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/4 h-80 w-80 rounded-full bg-primary/5 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md px-6 py-12 animate-fade-in">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary-container">
            <Package size={24} className="text-on-primary-container" />
          </div>
          <h1 className="mb-1 font-heading text-2xl font-bold tracking-tight text-on-surface">
            Plataforma
          </h1>
          <p className="font-body text-sm text-on-surface-variant">
            Seleccioná una aplicación
          </p>
        </div>

        {/* App cards */}
        <div className="space-y-4">
          {activeApps.map(([appId, _access], index) => {
            const info = APP_LABELS[appId]
            if (!info) return null

            const Icon = info.icon

            return (
              <button
                key={appId}
                type="button"
                onClick={() => handleSelect(appId)}
                className={cn(
                  'group relative w-full overflow-hidden rounded-xl text-left transition-all duration-200',
                  'glass border border-white/5',
                  'hover:border-primary/20 hover:shadow-float',
                  'scale-hover',
                  'animate-slide-up',
                )}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                {/* Left accent gradient bar */}
                <div className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-primary to-primary-dim opacity-60" />

                <div className="relative flex items-start gap-4 p-5">
                  {/* Icon container */}
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-container-high group-hover:bg-primary-container/30 transition-colors">
                    <Icon size={22} className="text-primary group-hover:text-on-primary-container transition-colors" />
                  </div>

                  {/* Text content */}
                  <div className="min-w-0 flex-1">
                    <h2 className="font-heading text-base font-semibold text-on-surface group-hover:text-primary transition-colors">
                      {info.name}
                    </h2>
                    {info.desc && (
                      <p className="mt-0.5 font-body text-sm text-on-surface-variant">
                        {info.desc}
                      </p>
                    )}

                    <span className="mt-2 inline-flex items-center gap-1.5 font-heading text-xs font-medium text-primary/80 group-hover:text-primary transition-colors">
                      Ingresar
                      <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
