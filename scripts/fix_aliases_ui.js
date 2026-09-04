const fs = require('fs');
const path = 'apps/platform/client/src/modules/ale-bet/pages/automation/AutomationPage.tsx';
let content = fs.readFileSync(path, 'utf8');

const replacement = `
      <div className="space-y-4">
        <textarea`;

const newCode = `
      {aliases && (aliases.productAliases?.length > 0 || aliases.clientAliases?.length > 0) && (
        <div className="mb-8 space-y-4">
          <Button variant="outline" onClick={() => setShowAliases(!showAliases)}>
            {showAliases ? 'Ocultar equivalencias aprendidas' : 'Mostrar equivalencias aprendidas'}
          </Button>
          {showAliases && (
            <div className="space-y-4">
              {aliases.productAliases?.map((alias) => (
                <div key={alias.id} className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-surface-container-high">
                  <div className="text-sm">
                    <span className="font-bold text-on-surface">{alias.alias}</span> <span className="text-outline">→</span> {alias.producto?.nombre}
                  </div>
                  <Button variant="outline" onClick={() => setDeleteAliasPrompt({ type: 'product', id: alias.id, alias: alias.alias })}>
                    Eliminar
                  </Button>
                </div>
              ))}
              {aliases.clientAliases?.map((alias) => (
                <div key={alias.id} className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-surface-container-high">
                  <div className="text-sm">
                    <span className="font-bold text-on-surface">{alias.alias}</span> <span className="text-outline">→</span> {alias.cliente?.razonSocial}
                  </div>
                  <Button variant="outline" onClick={() => setDeleteAliasPrompt({ type: 'client', id: alias.id, alias: alias.alias })}>
                    Eliminar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="space-y-4">
        <textarea`;

content = content.replace(replacement, newCode);

const hookReplacement = `  const createDraft = useCreateDraft()`;

const newHookCode = `  const [showAliases, setShowAliases] = useState(false)
  const { data: aliases } = useAutomationAliases()
  const createDraft = useCreateDraft()`;

content = content.replace(hookReplacement, newHookCode);

fs.writeFileSync(path, content);
console.log('done');
