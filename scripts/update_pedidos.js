const fs = require('fs');
const path = 'apps/platform/client/src/modules/ale-bet/pages/PedidosPage.tsx';
let content = fs.readFileSync(path, 'utf8');

const newPedidoCard = `function PedidoCard({ pedido, onAbrir }: PedidoCardProps) {
  const meta = ESTADO_META[pedido.estado]
  const remitoVigente = Boolean(pedido.remitos?.some((r) => r.estado === 'VIGENTE'))
  const clientePendiente = pedidoClientePendiente(pedido)
  const cancelacionSolicitada = Boolean(pedido.cancelacionSolicitadaAt)
  const esCancelado = pedido.estado === 'CANCELADO'
  const isAuto = esPedidoAutomation(pedido)

  let senalOperativa = ''
  if (cancelacionSolicitada) senalOperativa = 'Cancelación solicitada'
  else if (clientePendiente) senalOperativa = 'Pendiente de validación'
  else if (isAuto) senalOperativa = remitoVigente ? 'Remito emitido' : 'Pendiente de remito'
  else if (pedido.estado === 'APROBADO') senalOperativa = 'Pendiente de armado'
  else if (pedido.estado === 'EN_ARMADO') senalOperativa = 'En preparación'
  else if (pedido.estado === 'PREPARADO' && !remitoVigente) senalOperativa = 'Esperando remito'
  else if (pedido.estado === 'PREPARADO' && remitoVigente) senalOperativa = 'Listo para despacho'

  const { card } = meta

  return (
    <article
      data-testid={\`pedido-card-\${pedido.id}\`}
      data-estado={pedido.estado}
      onClick={onAbrir}
      className={cn(
        'group relative flex cursor-pointer flex-col justify-between gap-4 rounded-xl p-5 transition-all duration-200 shadow-sm hover:shadow-md',
        esCancelado && 'opacity-60 grayscale-[50%]'
      )}
      style={{
        backgroundColor: card.bg,
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: card.border,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget
        el.style.backgroundColor = card.bgHover
        el.style.borderColor = card.borderHover
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget
        el.style.backgroundColor = card.bg
        el.style.borderColor = card.border
      }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[18px] font-bold text-on-surface">
            {pedido.cliente.nombre}
          </p>
          {isAuto ? (
            <p className="mt-1 truncate font-body text-[13px] font-medium text-on-surface-variant">Automation · Confirmado</p>
          ) : (
            <p className="mt-1 truncate font-body text-[13px] font-medium text-on-surface-variant">
              {pedido.vendedorNombre ? \`Vendedor \${pedido.vendedorNombre}\` : 'Vendedor sin asignar'}
            </p>
          )}
        </div>
        {!isAuto && (
          <div className="shrink-0 pt-0.5">
            <Badge variant={meta.variant} className="shadow-sm">
              {meta.label}
            </Badge>
          </div>
        )}
      </header>

      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {senalOperativa && (
            <p
              className="truncate font-body text-[13px] font-semibold"
              style={isAuto ? { color: 'var(--text-on-surface-variant, #A0A0A0)' } : { color: card.accent }}
            >
              {senalOperativa}
            </p>
          )}
        </div>
        <ChevronRight
          size={18}
          className="shrink-0 transition-colors"
          style={{ color: card.accent }}
        />
      </div>
    </article>
  )
}`

content = content.replace(/function PedidoCard\(\{ pedido, onAbrir \}: PedidoCardProps\) \{[\s\S]*?\n\}/, newPedidoCard)

fs.writeFileSync(path, content)
console.log("Success modifying PedidosPage.tsx");
