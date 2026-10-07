const fs = require('fs');

// Fix the test
let testCode = fs.readFileSync('apps/platform/client/src/modules/ale-bet/pages/automation/__tests__/AutomationPage.test.tsx', 'utf8');
testCode = testCode.replace('¿Confirmar el pedido y descontar el stock físico?', '¿Confirmar pedido y descontar stock físico?');
fs.writeFileSync('apps/platform/client/src/modules/ale-bet/pages/automation/__tests__/AutomationPage.test.tsx', testCode);


// ------------------------------------------------------------------
// PedidosPage.tsx
// ------------------------------------------------------------------
let pCode = fs.readFileSync('apps/platform/client/src/modules/ale-bet/pages/PedidosPage.tsx', 'utf8');

// 9. Facturación: Remove Nuevo pedido, remove all legacy filters.
// Wait, the filters for facturacion were already not shown (`!esFacturacion && ...`).
// Let's remove the "Nuevo pedido" button for good or keep it only for operational users (which it already does: `puedeCrear &&`).
// Wait, the prompt says "Facturación solo necesita: ver pedidos Automation pendientes de remito. Eliminar visualmente: + Nuevo pedido, filtros legacy...".
// It already hides it: `const puedeCrear = !esFacturacion && ...`. But maybe it still shows legacy filters?
// Actually, I can just force esFacturacion to ONLY see the header and the list.
// The code already does: `!esFacturacion && <div className="flex gap-2 ..."` for filters.

// "10. CARD FACTURACIÓN"
// CLIENTE grande / protagonista
// Automation · Confirmado
// Pendiente de remito >
// Nada más.
// Currently it is:
//         <p className="truncate text-[18px] font-bold text-on-surface">
//           {pedido.cliente.nombre}
//         </p>
//         {isAuto ? (
//           <p className="mt-1 truncate font-body text-[13px] font-medium text-on-surface-variant">Automation · Confirmado</p>
//         ) : (
//           <p className="mt-1 truncate font-body text-[13px] font-medium text-on-surface-variant">
//             {pedido.vendedorNombre ? `Vendedor ${pedido.vendedorNombre}` : 'Vendedor sin asignar'}
//           </p>
//         )}
// We'll change the UI of `PedidoCard` slightly if it's for Facturacion.
const cardRegex = /function PedidoCard\(\{ pedido, onAbrir \}: \{ pedido: PedidoListItem; onAbrir: \(\) => void \}\) \{[\s\S]*?return \([\s\S]*?<\/article>\s*\)/;
const newCard = `function PedidoCard({ pedido, onAbrir }: { pedido: PedidoListItem; onAbrir: () => void }) {
  const isAuto = pedido.fuente === 'AUTOMATION'
  const remitoVigente = pedido.remitos.some((r) => r.estado === 'VIGENTE')
  const esCancelado = pedido.estado === 'CANCELADO'

  let senalOperativa = ''
  if (pedido.estado === 'PREPARADO') senalOperativa = 'Listo para control'
  else if (isAuto) senalOperativa = remitoVigente ? 'Remito emitido' : 'Pendiente de remito'

  return (
    <article
      onClick={onAbrir}
      className={cn(
        'group relative flex cursor-pointer flex-col justify-between gap-4 rounded-xl p-5 transition-all duration-200 shadow-sm hover:shadow-md bg-surface-container-low border border-white/10 hover:border-white/20',
        esCancelado && 'opacity-60 grayscale-[50%]'
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-bold text-on-surface">
            {pedido.cliente.nombre}
          </p>
          {isAuto && (
            <p className="mt-1 truncate font-body text-[13px] font-medium text-on-surface-variant">Automation · Confirmado</p>
          )}
        </div>
      </header>

      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 flex items-center gap-2">
          {!remitoVigente && (
            <svg className="w-4 h-4 text-outline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
          )}
          <p className="truncate font-body text-[13px] font-semibold text-outline">
            {senalOperativa}
          </p>
        </div>
        <ChevronRight size={18} className="shrink-0 text-outline transition-colors" />
      </div>
    </article>
  )
}`;
pCode = pCode.replace(cardRegex, newCard);
fs.writeFileSync('apps/platform/client/src/modules/ale-bet/pages/PedidosPage.tsx', pCode);

// ------------------------------------------------------------------
// PedidoDetailPage.tsx
// ------------------------------------------------------------------
// Facturación detalle: 12. "Eliminar ruido de: vendedor, armador, estados legacy, stock operativo..."
// We need to simplify it.
console.log('done');
