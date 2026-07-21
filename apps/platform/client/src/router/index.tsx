import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import { ProtectedRoute } from '@/components/guards/ProtectedRoute'
import { AdminRoute } from '@/components/guards/AdminRoute'
import LoginPage from '@/modules/auth/LoginPage'
import GoogleCallbackHandler from '@/modules/auth/GoogleCallbackHandler'
import NoAccessPage from '@/modules/auth/NoAccessPage'
import DesignPreviewPage from '@/modules/design-preview/DesignPreviewPage'

// Lazy-loaded modules
const AppSelector = lazy(() => import('@/modules/app-selector/AppSelector'))
const AdminModule = lazy(() => import('@/modules/admin/App'))
const DepositoModule = lazy(() => import('@/modules/deposito/App'))
const AleBetModule = lazy(() => import('@/modules/ale-bet/App'))

function NavigateBasedOnAccess() {
  const { token, user } = useAuthStore()
  const lastApp = useAppStore((s) => s.lastApp)

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  const activeApps = Object.entries(user.apps ?? {})
    .filter(([_, a]) => a.activo)
    .map(([app]) => app)

  if (activeApps.length === 0) {
    return <Navigate to="/no-access" replace />
  }

  if (activeApps.length === 1) {
    return <Navigate to={`/${activeApps[0]}`} replace />
  }

  // Multiple apps — check lastApp
  if (lastApp && activeApps.includes(lastApp)) {
    return <Navigate to={`/${lastApp}`} replace />
  }

  return <Navigate to="/app-selector" replace />
}

function LoadingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-lowest">
      <p className="text-gray-400">Cargando…</p>
    </div>
  )
}

export function AppRouter() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/google/callback" element={<GoogleCallbackHandler />} />
      <Route path="/no-access" element={<NoAccessPage />} />
      <Route path="/design-preview" element={<DesignPreviewPage />} />

      {/* App selector */}
      <Route
        path="/app-selector"
        element={
          <ProtectedRoute>
            <Suspense fallback={<LoadingShell />}>
              <AppSelector />
            </Suspense>
          </ProtectedRoute>
        }
      />

      {/* Admin module */}
      <Route
        path="/admin/*"
        element={
          <AdminRoute>
            <Suspense fallback={<LoadingShell />}>
              <AdminModule />
            </Suspense>
          </AdminRoute>
        }
      />

      {/* Deposito module */}
      <Route
        path="/deposito/*"
        element={
          <ProtectedRoute app="deposito">
            <Suspense fallback={<LoadingShell />}>
              <DepositoModule />
            </Suspense>
          </ProtectedRoute>
        }
      />

      {/* Ale-Bet module */}
      <Route
        path="/ale-bet/*"
        element={
          <ProtectedRoute app="ale-bet">
            <Suspense fallback={<LoadingShell />}>
              <AleBetModule />
            </Suspense>
          </ProtectedRoute>
        }
      />

      {/* Default: redirect based on auth state */}
      <Route path="*" element={<NavigateBasedOnAccess />} />
    </Routes>
  )
}
