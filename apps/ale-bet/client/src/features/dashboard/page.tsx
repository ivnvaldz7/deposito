import { useEffect, useMemo, useState } from 'react'
import { Section, StatCard, StatusChip } from '@/components/ui'
import { apiRequest, type Pedido, type Producto, type StockOverview } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

function estadoLabel(estado: Pedido['estado']): string {
  switch (estado) {
    case 'PENDIENTE':
      return 'Nuevo'
    case 'EN_ARMADO':
      return 'En prep.'
    case 'COMPLETADO':
      return 'OK'
    case 'CANCELADO':
      return 'Cancelado'
  }
}

function estadoTone(estado: Pedido['estado']): 'amber' | 'blue' | 'green' | 'slate' {
  switch (estado) {
    case 'PENDIENTE':
      return 'amber'
    case 'EN_ARMADO':
      return 'blue'
    case 'COMPLETADO':
      return 'green'
    case 'CANCELADO':
      return 'slate'
  }
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load(): Promise<void> {
      if (!user) {
        return
      }

      setLoading(true)
      setError(null)

      try {
        const pedidosPromise = apiRequest<Pedido[]>('/api/pedidos')
        const productoPromise =
          user.rol === 'admin'
            ? apiRequest<StockOverview>('/api/stock')
            : apiRequest<Producto[]>('/api/productos')

        const [pedidosData, productosData] = await Promise.all([
          pedidosPromise,
          productoPromise,
        ])

        setPedidos(pedidosData)
        setProductos(Array.isArray(productosData) ? productosData : productosData.productos)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el dashboard')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [user])

  const metrics = useMemo(() => {
    if (!user) {
      return []
    }

    if (user.rol === 'admin') {
      return [
        {
          label: 'Stock Crítico',
          value: productos.filter((producto) => producto.stockBajo).length,
          accent: 'text-amber-300',
        },
        {
          label: 'Pedidos Hoy',
          value: pedidos.filter((pedido) => {
            const created = new Date(pedido.createdAt)
            const now = new Date()
            return created.toDateString() === now.toDateString()
          }).length,
          accent: 'text-sky-300',
        },
        {
          label: 'En Armado',
          value: pedidos.filter((pedido) => pedido.estado === 'EN_ARMADO').length,
          accent: 'text-[var(--primary-container)]',
        },
        {
          label: 'Total Productos',
          value: productos.length,
          accent: 'text-emerald-300',
        },
      ]
    }

    if (user.rol === 'vendedor') {
      return [
        {
          label: 'Mis Pedidos Hoy',
          value: pedidos.filter((pedido) => {
            const created = new Date(pedido.createdAt)
            const now = new Date()
            return created.toDateString() === now.toDateString()
          }).length,
          accent: 'text-[var(--primary-container)]',
        },
        {
          label: 'Pendientes',
          value: pedidos.filter((pedido) => pedido.estado === 'PENDIENTE').length,
          accent: 'text-amber-300',
        },
        {
          label: 'Completados',
          value: pedidos.filter((pedido) => pedido.estado === 'COMPLETADO').length,
          accent: 'text-emerald-300',
        },
      ]
    }

    return [
      {
        label: 'Pendientes de Tomar',
        value: pedidos.filter((pedido) => pedido.estado === 'PENDIENTE').length,
        accent: 'text-amber-300',
      },
      {
        label: 'En Armado por Mí',
        value: pedidos.filter(
          (pedido) => pedido.estado === 'EN_ARMADO' && pedido.armadorId === user.id
        ).length,
        accent: 'text-sky-300',
      },
    ]
  }, [pedidos, productos, user])

  if (loading) {
    return <p className="text-sm text-[var(--on-surface-variant)]">Cargando dashboard...</p>
  }

  if (error) {
    return <p className="text-sm text-rose-300">{error}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--primary)]">Dashboard</p>
        <h1 className="mt-2 font-[Montserrat] text-3xl font-semibold">Vista Operativa</h1>
      </div>

      <div className={`grid gap-4 ${metrics.length === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
        {metrics.map((metric) => (
          <StatCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            accent={metric.accent}
          />
        ))}
      </div>

      <Section
        title="Actividad reciente"
        description="Últimos pedidos registrados en el circuito operativo."
      >
        <div className="space-y-3">
          {pedidos.slice(0, 10).map((pedido) => (
            <div
              key={pedido.id}
              className="flex flex-col gap-2 rounded-2xl border border-white/6 bg-[var(--surface-lowest)] px-4 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium text-[var(--on-surface)]">{pedido.numero}</p>
                <p className="text-sm text-[var(--on-surface-variant)]">{pedido.cliente.nombre}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusChip label={estadoLabel(pedido.estado)} tone={estadoTone(pedido.estado)} />
                <span className="text-sm text-[var(--on-surface-variant)]">
                  {new Date(pedido.updatedAt).toLocaleString('es-AR')}
                </span>
              </div>
            </div>
          ))}
          {pedidos.length === 0 ? (
            <p className="text-sm text-[var(--on-surface-variant)]">Sin actividad reciente.</p>
          ) : null}
        </div>
      </Section>
    </div>
  )
}
