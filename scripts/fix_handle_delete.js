const fs = require('fs');
const path = 'apps/platform/client/src/modules/ale-bet/pages/automation/AutomationPage.tsx';
let content = fs.readFileSync(path, 'utf8');

const regexDelete = /  const handleDeleteAlias = async \(\) => \{\r?\n    if \(!deleteAliasPrompt\) return\r?\n    const \{ type, id \} = deleteAliasPrompt\r?\n    try \{\r?\n      await deleteAlias.mutateAsync\(\{ type, id \}\)\r?\n      toast\.success\('Equivalencia eliminada'\)\r?\n    \} catch \(error\) \{\r?\n      toast\.error\(error instanceof Error \? error\.message : 'No se pudo eliminar la equivalencia'\)\r?\n    \} finally \{\r?\n      setDeleteAliasPrompt\(null\)\r?\n    \}\r?\n  \}/;

const match = content.match(regexDelete);
if (match) {
  content = content.replace(regexDelete, '');
  content = content.replace('  const handleKeyDown', match[0] + '\n\n  const handleKeyDown');
  fs.writeFileSync(path, content);
  console.log('done');
} else {
  console.log('Not found');
}
