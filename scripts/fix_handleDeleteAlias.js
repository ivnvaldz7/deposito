const fs = require('fs');
const path = 'apps/platform/client/src/modules/ale-bet/pages/automation/AutomationPage.tsx';
let content = fs.readFileSync(path, 'utf8');

// I need to add handleDeleteAlias back into the component since it was erased.
// I'll add it right before handleConfirm
const newDeleteAlias = `  const handleDeleteAlias = async () => {
    if (!deleteAliasPrompt) return
    const { type, id } = deleteAliasPrompt
    try {
      await deleteAlias.mutateAsync({ type, id })
      toast.success('Equivalencia eliminada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar la equivalencia')
    } finally {
      setDeleteAliasPrompt(null)
    }
  }

  `;

// Let's insert it before "const handleConfirm = async () =>"
content = content.replace("const handleConfirm = async () =>", newDeleteAlias + "const handleConfirm = async () =>");

fs.writeFileSync(path, content);
console.log('Fixed handleDeleteAlias');
