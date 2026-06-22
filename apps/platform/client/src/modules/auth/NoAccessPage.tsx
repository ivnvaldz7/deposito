import { Link } from 'react-router-dom'

export default function NoAccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-obsidian-900">
      <div className="text-center">
        <h1 className="mb-4 text-2xl font-bold text-white">Sin acceso</h1>
        <p className="mb-6 text-gray-400">
          No tenés acceso a ninguna aplicación.
        </p>
        <Link
          to="/login"
          className="text-sm text-emerald-400 hover:text-emerald-300"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
