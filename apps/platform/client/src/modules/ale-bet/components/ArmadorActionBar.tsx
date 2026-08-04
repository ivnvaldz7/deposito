import { Button } from '@/components/ui/Button'
import type { Pedido } from '../lib/api'
import { canAccionesBarraArmador, canConfirmarCancelacion, canDespachar, canPreparar, canTomar, esArmadorAsignado } from '../lib/estados'

interface ArmadorActionBarProps {
  pedido: Pedido
  rol: string
  userId: string
  despachando?: boolean
  onTomar: () => void
  onPreparar: () => void
  onDespachar: () => void
  onConfirmarCancelacion: () => void
}

/**
 * Sticky mobile action bar for armador/admin. Fixed at the bottom of the
 * viewport with safe-area padding; hidden on lg+ where the same actions live
 * in the page content. Pages use `canAccionesBarraArmador` to add bottom
 * padding so content is never covered by the bar.
 */
export function ArmadorActionBar({
  pedido,
  rol,
  userId,
  despachando = false,
  onTomar,
  onPreparar,
  onDespachar,
  onConfirmarCancelacion,
}: ArmadorActionBarProps) {
  if (!canAccionesBarraArmador(pedido, rol, userId)) return null

  const enArmado = pedido.estado === 'EN_ARMADO' && (rol === 'admin' || esArmadorAsignado(pedido, userId))
  const prepararListo = canPreparar(pedido, rol, userId)
  const itemsCompletados = pedido.items.filter((i) => i.completado).length
  const itemsPendientes = pedido.items.length - itemsCompletados

  return (
    <div
      data-testid="armador-action-bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-surface-container-low shadow-float lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {canTomar(pedido, rol, userId) && (
          <Button onClick={onTomar} className="min-h-11 w-full">
            Tomar pedido
          </Button>
        )}
        {enArmado && (
          <>
            <div className="flex shrink-0 flex-col items-center leading-none">
              <span className="font-heading text-[16px] font-bold text-on-surface">
                {itemsCompletados}/{pedido.items.length}
              </span>
              <span className="font-body text-[9px] font-semibold uppercase tracking-wide text-outline">items</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Button onClick={onPreparar} disabled={!prepararListo} className="min-h-11 w-full">
                Preparar
              </Button>
              {itemsPendientes > 0 && (
                <p className="text-center font-body text-[10px] font-medium text-warning">
                  Faltan {itemsPendientes} items
                </p>
              )}
            </div>
          </>
        )}
        {canDespachar(pedido, rol, userId) && (
          <button
            type="button"
            onClick={onDespachar}
            disabled={despachando}
            className="min-h-11 w-full rounded-full border border-error/40 font-body text-[13px] font-semibold text-error transition hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirmar despacho
          </button>
        )}
        {canConfirmarCancelacion(pedido, rol, userId) && (
          <button
            type="button"
            onClick={onConfirmarCancelacion}
            className="min-h-11 w-full rounded-full border border-warning/50 font-body text-[13px] font-semibold text-warning transition hover:bg-warning/20"
          >
            Confirmar cancelación
          </button>
        )}
      </div>
    </div>
  )
}
