import { Route, Routes } from 'react-router-dom'
import UsersPage from './pages/UsersPage'

export default function AdminModule() {
  return (
    <Routes>
      <Route index element={<UsersPage />} />
      <Route path="usuarios" element={<UsersPage />} />
    </Routes>
  )
}
