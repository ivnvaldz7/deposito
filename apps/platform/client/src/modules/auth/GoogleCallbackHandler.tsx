import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'

export default function GoogleCallbackHandler() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const setLastApp = useAppStore((s) => s.setLastApp)
  const lastApp = useAppStore((s) => s.lastApp)
  const calledRef = useRef(false)

  useEffect(() => {
    if (calledRef.current) return
    calledRef.current = true

    const token = searchParams.get('token')
    if (!token) {
      navigate('/login?error=unauthorized', { replace: true })
      return
    }

    // Fetch user info with the token
    const initAuth = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || ''}/api/auth/me`,
          { headers: { Authorization: `Bearer ${token}` }, credentials: 'include' },
        )
        if (!res.ok) {
          navigate('/login?error=unauthorized', { replace: true })
          return
        }
        const user = await res.json()
        login(token, user)

        // Determine redirect based on user's apps
        const activeApps = Object.entries(user.apps ?? {})
          .filter(([_, a]) => a.activo)
          .map(([app]) => app)

        if (activeApps.length === 0) {
          navigate('/no-access', { replace: true })
        } else if (activeApps.length === 1) {
          const target = activeApps[0]
          setLastApp(target)
          navigate(`/${target}`, { replace: true })
        } else {
          // Multiple apps — check lastApp
          if (lastApp && activeApps.includes(lastApp)) {
            navigate(`/${lastApp}`, { replace: true })
          } else {
            navigate('/app-selector', { replace: true })
          }
        }
      } catch {
        navigate('/login?error=unauthorized', { replace: true })
      }
    }

    initAuth()
  }, [searchParams, navigate, login, setLastApp, lastApp])

  return (
    <div className="flex min-h-screen items-center justify-center bg-obsidian-900">
      <p className="text-gray-400">Iniciando sesión…</p>
    </div>
  )
}
