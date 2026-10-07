const fs = require('fs');
let code = fs.readFileSync('apps/platform/client/src/modules/ale-bet/pages/automation/AutomationPage.tsx', 'utf8');

// 1. Client Badges -> Soft Text
code = code.replace(
  /<Badge variant="success">✓ Reconocido<\/Badge>/g,
  '<span className="text-[13px] text-[#5A7A5A] flex items-center gap-1">✓ Reconocido</span>'
);
code = code.replace(
  /<Badge variant="warning">⚠ Sugerido<\/Badge>/g,
  '<span className="text-[13px] text-[#A06869] flex items-center gap-1">⚠ Revisar cliente</span>'
);

// 2. Product Warning Badge -> Soft text
code = code.replace(
  /<Badge variant="error">⚠ Revisar producto<\/Badge>/g,
  '<span className="text-[13px] text-[#A06869] flex items-center gap-1">⚠ Revisar producto</span>'
);

// 3. Product Availability text
const availRegex = /<div className=\{cn\("mt-3 text-\[13px\] font-medium", avail\.status === 'INSUFICIENTE' \? "font-bold text-error" : "text-on-surface-variant"\)\}>[\s\S]*?<\/div>/;
const newAvail = `
                          <div className={cn("mt-3 text-[13px]", avail.status === 'INSUFICIENTE' ? "text-error" : "text-[#5A7A5A]")}>
                            {avail.status === 'INSUFICIENTE' ? (
                              <span>⚠ Sin stock ({avail.availableUnits} disponibles)</span>
                            ) : (
                              <span>✓ Disponible: {avail.availableUnits} unidades</span>
                            )}
                          </div>`;
code = code.replace(availRegex, newAvail);

// 4. Modal success copy and actions.
const successRegex = /<div className="flex flex-col items-center justify-center p-8 text-center">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*\)\s*\}/;

const newSuccess = `
        <div className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container-low p-6 shadow-xl animate-in zoom-in-95 duration-500 fade-in">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#5A7A5A]/20 text-[#5A7A5A] ring-4 ring-[#5A7A5A]/10">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h2 className="mb-4 text-xl font-bold text-on-surface">✓ Pedido confirmado</h2>
            
            <div className="w-full mb-6 text-sm text-left bg-surface-container p-4 rounded-lg border border-white/5">
              <p className="font-semibold text-on-surface mb-2">{draftData.snapshot.customerCandidate?.cliente?.razonSocial}</p>
              <p className="text-on-surface-variant mb-1">{draftData.snapshot.lines.length} productos</p>
              <p className="text-on-surface-variant">
                {draftData.snapshot.lines.reduce((acc: number, l: any) => acc + (l.quantity?.totalUnits ?? 0), 0)} unidades
              </p>
            </div>

            <p className="font-body text-on-surface-variant text-sm mb-6">
              Stock actualizado correctamente.
            </p>

            <div className="flex w-full flex-col gap-3">
              <Button onClick={handleProcessAnother} className="w-full">
                Procesar otro pedido
              </Button>
              <Button variant="outline" onClick={() => window.location.href = \`/platform/ale-bet/logistica/pedidos/\${draft.id}\`} className="w-full">
                Ver pedido
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }`;

code = code.replace(successRegex, newSuccess);

// Confirm Dialog Summary
const confirmMensajeRegex = /isProcessing \? "Procesando pedido\.\.\." : "¿Confirmar el pedido y descontar el stock físico\?"/;
const newConfirmMensaje = `
            isProcessing ? (
              <div className="flex items-center gap-3"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>Procesando pedido...</div>
            ) : (
              <div className="space-y-3">
                <p>¿Confirmar pedido y descontar stock físico?</p>
                <div className="bg-surface-container p-3 rounded border border-white/5 text-sm">
                  <p className="font-semibold mb-1">{draftData?.snapshot?.customerCandidate?.cliente?.razonSocial}</p>
                  <p>{draftData?.snapshot?.lines?.length ?? 0} productos</p>
                  <p>{draftData?.snapshot?.lines?.reduce((acc: number, l: any) => acc + (l.quantity?.totalUnits ?? 0), 0) ?? 0} unidades</p>
                </div>
              </div>
            )`;
code = code.replace(confirmMensajeRegex, newConfirmMensaje);

fs.writeFileSync('apps/platform/client/src/modules/ale-bet/pages/automation/AutomationPage.tsx', code);
console.log('AutomationPage fixed.');
