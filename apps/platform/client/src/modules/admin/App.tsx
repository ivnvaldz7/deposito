import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AdminSidebar from './components/Sidebar'

const UsersPage = lazy(() => import('./pages/UsersPage'))

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center p-12">
      <p className="font-body text-sm text-on-surface-variant">Cargando...</p>
    </div>
  )
}

export default function AdminModule() {
  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <div className="flex flex-col flex-1 min-w-0 md:ml-72">
        <main className="flex-1 p-margin-desktop overflow-y-auto">
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route index element={<Navigate to="usuarios" replace />} />
              <Route path="usuarios" element={<UsersPage />} />
              <Route path="*" element={<Navigate to="usuarios" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
