import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import { PermissionRoute } from '@/components/guards/PermissionRoute'

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
const ProductosPage = lazy(() => import('./pages/ProductosPage'))
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
          <Route index element={<Navigate to="/deposito/dashboard" replace />} />
          <Route path="dashboard" element={<PermissionRoute app="deposito" permission="dashboard.read"><DashboardPage /></PermissionRoute>} />
          <Route path="drogas" element={<PermissionRoute app="deposito" permission="drogas.read"><DrogasPage /></PermissionRoute>} />
          <Route path="estuches" element={<PermissionRoute app="deposito" permission="estuches.read"><EstuchesPage /></PermissionRoute>} />
          <Route path="etiquetas" element={<PermissionRoute app="deposito" permission="etiquetas.read"><EtiquetasPage /></PermissionRoute>} />
          <Route path="productos" element={<PermissionRoute app="deposito" permission="productos_catalogo.read"><ProductosPage /></PermissionRoute>} />
          <Route path="frascos" element={<PermissionRoute app="deposito" permission="frascos.read"><FrascosPage /></PermissionRoute>} />
          <Route path="actas" element={<PermissionRoute app="deposito" permission="actas.read"><ActasPage /></PermissionRoute>} />
          <Route path="actas/:id" element={<PermissionRoute app="deposito" permission="actas.read"><ActaDetallePage /></PermissionRoute>} />
          <Route path="ingresos" element={<PermissionRoute app="deposito" permission="ingresos.create"><ActaNuevaPage /></PermissionRoute>} />
          <Route path="ingresos/nueva" element={<PermissionRoute app="deposito" permission="ingresos.create"><ActaNuevaPage /></PermissionRoute>} />
          <Route path="movimientos" element={<PermissionRoute app="deposito" permission="movimientos.read"><MovimientosPage /></PermissionRoute>} />
          <Route path="pendientes" element={<PermissionRoute app="deposito" permission="pendientes.read"><PendientesPage /></PermissionRoute>} />
          <Route path="ordenes" element={<PermissionRoute app="deposito" permission="ordenes.read"><OrdenesPage /></PermissionRoute>} />
          <Route path="usuarios" element={<PermissionRoute app="deposito" permission="usuarios_deposito.read"><UsuariosPage /></PermissionRoute>} />
          <Route path="metricas" element={<PermissionRoute app="deposito" permission="metricas.read"><MetricasPage /></PermissionRoute>} />
          <Route path="*" element={<Navigate to="/deposito/dashboard" replace />} />
        </Routes>
      </Suspense>
    </AppLayout>
  )
}
