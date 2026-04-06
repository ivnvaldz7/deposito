import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { LoginPage } from '@/features/auth/login-page'
import { AppLayout } from '@/components/layout/app-layout'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { DrogasPage } from '@/features/drogas/drogas-page'
import { EstuchesPage } from '@/features/estuches/estuches-page'
import { EtiquetasPage } from '@/features/etiquetas/etiquetas-page'
import { FrascosPage } from '@/features/frascos/frascos-page'
import { ActasPage } from '@/features/actas/actas-page'
import { ActaNuevaPage } from '@/features/actas/acta-nueva-page'
import { ActaDetallePage } from '@/features/actas/acta-detalle-page'
import { MovimientosPage } from '@/features/movimientos/movimientos-page'
import { PendientesPage } from '@/features/pendientes/pendientes-page'

function ProtectedRoute() {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <Outlet />
}

function PublicRoute() {
  const token = useAuthStore((s) => s.token)
  if (token) return <Navigate to="/dashboard" replace />
  return <Outlet />
}


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/drogas" element={<DrogasPage />} />
            <Route path="/estuches" element={<EstuchesPage />} />
            <Route path="/etiquetas" element={<EtiquetasPage />} />
            <Route path="/frascos" element={<FrascosPage />} />
            <Route path="/ingresos" element={<ActaNuevaPage />} />
            <Route path="/actas" element={<ActasPage />} />
            <Route path="/actas/:id" element={<ActaDetallePage />} />
            <Route path="/movimientos" element={<MovimientosPage />} />
            <Route path="/pendientes" element={<PendientesPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
