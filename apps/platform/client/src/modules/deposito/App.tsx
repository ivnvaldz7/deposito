import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'

// Lazy-loaded pages
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const DrogasPage = lazy(() => import('./pages/DrogasPage'))
const EstuchesPage = lazy(() => import('./pages/EstuchesPage'))
const EtiquetasPage = lazy(() => import('./pages/EtiquetasPage'))
const FrascosPage = lazy(() => import('./pages/FrascosPage'))
const ActasPage = lazy(() => import('./pages/ActasPage'))
const ActaNuevaPage = lazy(() => import('./pages/ActaNuevaPage'))
const ActaDetallePage = lazy(() => import('./pages/ActaDetallePage'))
const MovimientosPage = lazy(() => import('./pages/MovimientosPage'))
const PendientesPage = lazy(() => import('./pages/PendientesPage'))
const OrdenesPage = lazy(() => import('./pages/OrdenesPage'))
const UsuariosPage = lazy(() => import('./pages/UsuariosPage'))
const MetricasPage = lazy(() => import('./pages/MetricasPage'))

function LoadingFallback() {
  return (
    <div className="flex h-48 items-center justify-center">
      <p className="font-body text-sm text-on-surface-variant">Cargando...</p>
    </div>
  )
}

export default function DepositoModule() {
  return (
    <AppLayout>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="drogas" element={<DrogasPage />} />
          <Route path="estuches" element={<EstuchesPage />} />
          <Route path="etiquetas" element={<EtiquetasPage />} />
          <Route path="frascos" element={<FrascosPage />} />
          <Route path="actas" element={<ActasPage />} />
          <Route path="actas/:id" element={<ActaDetallePage />} />
          <Route path="ingresos" element={<ActaNuevaPage />} />
          <Route path="ingresos/nueva" element={<ActaNuevaPage />} />
          <Route path="movimientos" element={<MovimientosPage />} />
          <Route path="pendientes" element={<PendientesPage />} />
          <Route path="ordenes" element={<OrdenesPage />} />
          <Route path="usuarios" element={<UsuariosPage />} />
          <Route path="metricas" element={<MetricasPage />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Routes>
      </Suspense>
    </AppLayout>
  )
}
