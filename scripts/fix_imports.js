const fs = require('fs');
const path = 'apps/platform/client/src/modules/ale-bet/pages/automation/AutomationPage.tsx';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(
  /import \{ useCreateDraft, useUpdateDraft, useConfirmDraft, useDraft \} from '\.\.\/\.\.\/queries\/use-automation'/,
  `import { useAutomationAliases, useConfirmDraft, useCreateDraft, useDeleteAutomationAlias, useDraft, useUpdateDraft } from '../../queries/use-automation'`
);
fs.writeFileSync(path, content);
console.log('Fixed imports');
