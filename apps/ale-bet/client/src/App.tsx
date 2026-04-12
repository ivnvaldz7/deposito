import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout'
import { LoginPage } from '@/features/auth-login'
import { ClientesPage } from '@/features/clientes/page'
import { DashboardPage } from '@/features/dashboard/page'
import { PedidosPage } from '@/features/pedidos/page'
import { ProductosPage } from '@/features/productos/page'
import { StockPage } from '@/features/stock/page'
import { getToken } from '@/lib/auth'
import { useAuthStore } from '@/stores/auth-store'

function ProtectedLayout() {
  const user = useAuthStore((state) => state.user)
  const token = useAuthStore((state) => state.token)

  if (!token || !user || !getToken()) {
    return <Navigate to="/login" replace />
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}

function RoleGuard({ roles }: { roles: string[] }) {
  const user = useAuthStore((state) => state.user)

  if (!user || !roles.includes(user.rol)) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/pedidos" element={<PedidosPage />} />
        <Route element={<RoleGuard roles={['admin', 'vendedor']} />}>
          <Route path="/clientes" element={<ClientesPage />} />
        </Route>
        <Route element={<RoleGuard roles={['admin']} />}>
          <Route path="/productos" element={<ProductosPage />} />
          <Route path="/stock" element={<StockPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
