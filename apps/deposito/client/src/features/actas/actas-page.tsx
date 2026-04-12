import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Plus } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient } from '@/lib/api-client'
import { PageHeader } from '@/components/layout/page-header'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { EstadoChip } from './estado-chip'
import type { ActaListItem } from './types'

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function uniqueJoined(values: string[]): string {
  return [...new Set(values)].join(', ')
}

function hasQualityNoAprobada(acta: ActaListItem): boolean {
  return acta.items?.some((item) => item.aprobadoCalidad === false) ?? false
}

function CalidadWarningChip() {
  return (
    <span
      className="inline-flex items-center gap-1 font-body text-xs font-medium px-2 py-0.5 rounded"
      style={{ color: '#FF9800', backgroundColor: 'rgba(255,152,0,0.10)' }}
    >
      <AlertTriangle size={12} strokeWidth={1.5} />
      Calidad pendiente
    </span>
  )
}

export function ActasPage() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const isEncargado = user?.role === 'encargado'
  const navigate = useNavigate()

  const [actas, setActas] = useState<ActaListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiClient
      .get<ActaListItem[]>('/actas', token)
      .then(setActas)
      .catch(() => setError('No se pudo cargar las actas'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="font-body text-on-surface-variant text-sm">Cargando...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="font-body text-error text-sm">{error}</p>
      </div>
    )
  }

  const calidadPendienteCount = actas.filter(hasQualityNoAprobada).length
  const completadasCount = actas.filter((acta) => acta.estado === 'completada').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="ACTAS"
        stats={[
          { label: 'actas', value: actas.length },
          { label: 'completadas', value: completadasCount },
          { label: 'calidad pendiente', value: calidadPendienteCount, warning: calidadPendienteCount > 0 },
        ]}
        primaryAction={
          isEncargado
            ? {
                label: 'Nuevo ingreso',
                onClick: () => navigate('/ingresos'),
                icon: <Plus size={14} strokeWidth={2} />,
              }
            : undefined
        }
      />

      {actas.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 bg-surface-low rounded gap-3">
          <p className="font-body text-on-surface-variant text-sm">
            No hay actas registradas todavía.
          </p>
          {isEncargado && (
            <p className="font-body text-on-surface-variant/60 text-xs">
              Usá "Nuevo Ingreso" para empezar.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="hidden md:block bg-surface-low rounded overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Lote(s)</TableHead>
                  <TableHead>Productos</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-20">Items</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actas.map((acta) => {
                  const lotes = uniqueJoined(acta.items?.map((i) => i.lote) ?? [])
                  const productos = uniqueJoined(acta.items?.map((i) => i.productoNombre) ?? [])
                  const hasQualityIssue = hasQualityNoAprobada(acta)

                  return (
                    <TableRow
                      key={acta.id}
                      onClick={() => navigate(`/actas/${acta.id}`)}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-body text-on-surface tabular-nums">
                        {formatFecha(acta.fecha)}
                      </TableCell>
                      <TableCell
                        className="font-body text-on-surface-variant text-sm max-w-[140px] truncate"
                        title={lotes || undefined}
                      >
                        {lotes || '—'}
                      </TableCell>
                      <TableCell
                        className="font-body text-on-surface text-sm max-w-xs truncate"
                        title={productos || undefined}
                      >
                        {productos || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <EstadoChip estado={acta.estado} />
                          {hasQualityIssue && <CalidadWarningChip />}
                        </div>
                      </TableCell>
                      <TableCell className="font-body text-on-surface-variant tabular-nums">
                        {acta._count?.items ?? acta.items?.length ?? 0}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden space-y-2">
            {actas.map((acta) => {
              const lotes = uniqueJoined(acta.items?.map((i) => i.lote) ?? [])
              const productos = uniqueJoined(acta.items?.map((i) => i.productoNombre) ?? [])
              const hasQualityIssue = hasQualityNoAprobada(acta)

              return (
                <div
                  key={acta.id}
                  onClick={() => navigate(`/actas/${acta.id}`)}
                  className="bg-surface-low rounded px-4 py-3 cursor-pointer hover:bg-surface-bright transition-colors space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-body text-on-surface text-sm tabular-nums">
                      {formatFecha(acta.fecha)}
                    </p>
                    <EstadoChip estado={acta.estado} />
                  </div>
                  {productos && (
                    <p className="font-body text-on-surface text-sm truncate">{productos}</p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    {lotes && (
                      <span className="font-body text-on-surface-variant text-xs truncate">
                        Lote: {lotes}
                      </span>
                    )}
                    <span className="font-body text-on-surface-variant text-xs shrink-0">
                      {acta._count?.items ?? acta.items?.length ?? 0} items
                    </span>
                    {hasQualityIssue && <CalidadWarningChip />}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
