import { useMemo, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { can } from '@/lib/permissions'
import { ApiError } from '../lib/api'
import { useMaterialesEmpaque, useUpdateMaterialEmpaque, type MaterialEmpaque } from '../queries/use-materiales-empaque'
import { InlineNumberEditor } from '../components/inventory-shared/inline-number-editor'
import { EmptyState, ErrorState, LoadingState } from '../components/inventory-shared/inventory-states'
import { InventoryPageHeader } from '../components/inventory-shared/InventoryPageHeader'
import { InventoryDataSurface } from '../components/inventory-shared/inventory-surfaces'
import { StockChip } from '../components/inventory-shared/stock-chip'
import { getStockStatus } from '../lib/stock-status'
import { toast } from '../lib/toast'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table'

function grupo(nombre: string): 'Prospectos' | 'Cajas' | 'Tapas' | 'Otros' {
  if (nombre.startsWith('PROSPECTO ')) return 'Prospectos'
  if (nombre.startsWith('CAJA ')) return 'Cajas'
  if (nombre.startsWith('TAPA ')) return 'Tapas'
  return 'Otros'
}

function CantidadCell({ material }: { material: MaterialEmpaque }) {
  const update = useUpdateMaterialEmpaque()
  return <InlineNumberEditor value={material.cantidad} label={`Cantidad de ${material.articulo}`} onSave={async (cantidad) => {
    try {
      await update.mutateAsync({ id: material.id, cantidad })
      toast.info(`Stock de "${material.articulo}" actualizado.`)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo actualizar el stock')
      throw error
    }
  }} />
}

export default function MaterialesEmpaquePage() {
  const user = useAuthStore((state) => state.user)
  const canManage = can(user, 'deposito', 'productos_catalogo.manage')
  const { data: materiales = [], isLoading, error } = useMaterialesEmpaque()
  const [soloBajo, setSoloBajo] = useState(false)
  const groups = useMemo(() => ['Prospectos', 'Cajas', 'Tapas', 'Otros'].map((name) => ({
    name,
    items: materiales.filter((material) => grupo(material.articulo) === name && (!soloBajo || getStockStatus(material.cantidad, material.stockMinimo) === 'bajo')),
  })).filter((group) => group.items.length > 0), [materiales, soloBajo])
  const lowCount = materiales.filter((material) => getStockStatus(material.cantidad, material.stockMinimo) === 'bajo').length

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message={error instanceof ApiError ? error.message : 'No se pudieron cargar los materiales de empaque'} />

  return <div className="space-y-5">
    <InventoryPageHeader title="Material auxiliar de empaque" description="Prospectos, cajas y tapas. El stock se cuenta por unidades." stats={[
      { label: 'artículos', value: materiales.length },
      { label: soloBajo ? 'stock bajo (activo)' : 'stock bajo', value: lowCount, warning: lowCount > 0 || soloBajo, active: soloBajo, onClick: () => setSoloBajo((current) => !current) },
    ]} />
    {groups.length === 0 ? <EmptyState message={soloBajo ? 'No hay materiales con stock bajo.' : 'No hay materiales auxiliares cargados.'} /> : groups.map((group) => (
      <section key={group.name} className="space-y-2">
        <h2 className="font-body text-sm font-semibold uppercase tracking-wide text-on-surface-variant">{group.name}</h2>
        <InventoryDataSurface label={`Materiales de empaque: ${group.name}`}><div className="hidden md:block"><Table>
          <TableHeader><TableRow><TableHead>Artículo</TableHead><TableHead className="w-40">Estado</TableHead><TableHead className="w-40 text-right">Cantidad</TableHead></TableRow></TableHeader>
          <TableBody>{group.items.map((material) => <TableRow key={material.id}>
            <TableCell className="font-body text-on-surface">{material.articulo}</TableCell>
            <TableCell><StockChip cantidad={material.cantidad} stockMinimo={material.stockMinimo} /></TableCell>
            <TableCell className="text-right">{canManage ? <div className="flex justify-end"><CantidadCell material={material} /></div> : <span className="font-body tabular-nums">{material.cantidad}</span>}</TableCell>
          </TableRow>)}</TableBody>
        </Table></div></InventoryDataSurface>
        <div className="space-y-2 md:hidden">{group.items.map((material) => <div key={material.id} className="flex items-center justify-between gap-3 rounded bg-surface-container-low px-4 py-3">
          <div><p className="font-body text-sm text-on-surface">{material.articulo}</p><div className="mt-1"><StockChip cantidad={material.cantidad} stockMinimo={material.stockMinimo} /></div></div>
          {canManage ? <CantidadCell material={material} /> : <span className="font-body tabular-nums">{material.cantidad}</span>}
        </div>)}</div>
      </section>
    ))}
  </div>
}
