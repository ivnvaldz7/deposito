const fs = require('fs');
let code = fs.readFileSync('apps/platform/client/src/modules/ale-bet/pages/PedidoDetailPage.tsx', 'utf8');

if (!code.includes("const esFacturacion = rol === 'facturacion'")) {
  code = code.replace("const rol = user?.apps?.['ale-bet']?.rol ?? ''", "const rol = user?.apps?.['ale-bet']?.rol ?? ''\n  const esFacturacion = rol === 'facturacion'");
}

code = code.replace('{!esAutomation && pedido.vendedorNombre && (', '{!esFacturacion && !esAutomation && pedido.vendedorNombre && (');
code = code.replace('{pedido.armadorNombre && (', '{!esFacturacion && pedido.armadorNombre && (');

const badgeBlockRegex = /<div className="flex flex-wrap items-center gap-2 mb-3">\s*<Badge variant=\{meta\.variant\}>\{esAutomation \? 'Confirmado' : meta\.label\}<\/Badge>\s*\{esAutomation && <Badge variant="info">Automation<\/Badge>\}\s*\{clientePendiente && <Badge variant="warning">Pendiente de validación<\/Badge>\}\s*<\/div>/;

const newBadgeBlock = `
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {esFacturacion && esAutomation ? (
                  <span className="text-[13px] font-medium text-on-surface-variant">Automation · Confirmado</span>
                ) : (
                  <>
                    <Badge variant={meta.variant}>{esAutomation ? 'Confirmado' : meta.label}</Badge>
                    {esAutomation && <Badge variant="info">Automation</Badge>}
                  </>
                )}
                {clientePendiente && (
                  esFacturacion ? 
                    <span className="text-[13px] text-[#A06869] flex items-center gap-1">⚠ Pendiente de validación</span> 
                  : <Badge variant="warning">Pendiente de validación</Badge>
                )}
              </div>
`;
code = code.replace(badgeBlockRegex, newBadgeBlock);

// For the LineaDetalle render:
// Insert the isFacturacion check right before `return (` of the default block!
const target = "  return (\n    <div\n      data-testid={`linea-${productoId}`}";

const newIdleReturn = `
  if (isFacturacion) {
    return (
      <div data-testid={\`linea-\${productoId}\`} className={cn('group flex flex-col justify-between gap-1 py-3 px-4 lg:px-8 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors', ceroUnidades && 'opacity-50')}>
        <p className="text-[15px] font-bold text-on-surface">{nombre}</p>
        <p className="font-body text-[13px] text-on-surface-variant">Lote: —</p>
        <div className="flex justify-between items-center mt-1">
          <p className="font-body text-[13px] text-on-surface-variant">
            <span className="text-on-surface">{cajas} caja{cajas !== 1 ? 's' : ''}</span>
            <span className="mx-2">·</span>
            <span className="text-on-surface">{sueltos} suelto{sueltos !== 1 ? 's' : ''}</span>
          </p>
          <p className="font-body text-[15px] font-bold text-on-surface">{unidades} unidades</p>
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid={\`linea-\${productoId}\`}`;

code = code.replace(target, newIdleReturn);

fs.writeFileSync('apps/platform/client/src/modules/ale-bet/pages/PedidoDetailPage.tsx', code);
console.log('patched successfully');
