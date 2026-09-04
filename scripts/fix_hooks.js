const fs = require('fs');
const path = 'apps/platform/client/src/modules/ale-bet/pages/automation/AutomationPage.tsx';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(
  /const createDraft = useCreateDraft\(\)\r?\n\s*const updateDraft = useUpdateDraft\(\)\r?\n\s*const confirmDraft = useConfirmDraft\(\)/,
  `const createDraft = useCreateDraft()
  const updateDraft = useUpdateDraft()
  const confirmDraft = useConfirmDraft()
  const { data: learnedAliases } = useAutomationAliases()
  const deleteAlias = useDeleteAutomationAlias()
  const [showAliases, setShowAliases] = useState(false)`
);
fs.writeFileSync(path, content);
console.log('Fixed aliases');
