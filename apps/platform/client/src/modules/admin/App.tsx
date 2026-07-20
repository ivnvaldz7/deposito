import { Route, Routes, useNavigate } from 'react-router-dom'
import UsersPage from './pages/UsersPage'
import { ArrowLeft } from 'lucide-react'

function AdminHeader() {
  const navigate = useNavigate()

  return (
    <div className="flex items-center gap-4 border-b border-outline-variant bg-surface-lowest px-6 py-3">
      <button
        type="button"
        onClick={() => navigate('/app-selector')}
        className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-container transition-colors"
      >
        <ArrowLeft size={16} strokeWidth={1.5} />
        Volver a apps
      </button>
      <h1 className="text-lg font-heading font-bold text-on-surface">Admin</h1>
    </div>
  )
}

export default function AdminModule() {
  return (
    <div className="min-h-screen bg-surface">
      <AdminHeader />
      <Routes>
        <Route index element={<UsersPage />} />
        <Route path="usuarios" element={<UsersPage />} />
      </Routes>
    </div>
  )
}
