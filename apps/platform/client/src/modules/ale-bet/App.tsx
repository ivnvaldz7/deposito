import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const PedidosPage = lazy(() => import('./pages/PedidosPage'))
const ProductosPage = lazy(() => import('./pages/ProductosPage'))
const ClientesPage = lazy(() => import('./pages/ClientesPage'))
const StockPage = lazy(() => import('./pages/StockPage'))
const HistorialPage = lazy(() => import('./pages/HistorialPage'))

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center p-12">
      <p className="text-sm text-[var(--color-text-2)]">Cargando...</p>
    </div>
  )
}

export default function AleBetModule() {
  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <main className="flex-1 p-5 md:p-8">
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="pedidos" element={<PedidosPage />} />
              <Route path="productos" element={<ProductosPage />} />
              <Route path="clientes" element={<ClientesPage />} />
              <Route path="stock" element={<StockPage />} />
              <Route path="historial" element={<HistorialPage />} />
              <Route path="*" element={<Navigate to="dashboard" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
