const fs = require('fs');
const path = 'apps/platform/client/src/modules/ale-bet/pages/automation/AutomationPage.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add ConfirmDialog component at the top
const confirmDialogCode = `
interface ConfirmDialogProps {
  open: boolean
  titulo: string
  mensaje: React.ReactNode
  accion: string
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}

function ConfirmDialog({ open, titulo, mensaje, accion, loading, onCancel, onConfirm }: ConfirmDialogProps) {
  if (!open) return null
  return (
    <div
      data-testid="confirm-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-backdrop-in bg-black/50"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container-low p-5 animate-dialog-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[16px] font-bold text-on-surface">{titulo}</h2>
        <div className="mt-2 font-body text-[13px] leading-relaxed text-on-surface-variant">{mensaje}</div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} loading={loading}>
            {accion}
          </Button>
        </div>
      </div>
    </div>
  )
}
`;
content = content.replace(/(import type \{ Cliente \} from '\.\.\/\.\.\/lib\/api'\s*)/, "$1" + confirmDialogCode);

// 2. Add state variables at the top of the component
content = content.replace(/const \[isInterpreting, setIsInterpreting\] = useState\(false\)/, `const [isInterpreting, setIsInterpreting] = useState(false)
  const [deleteAliasPrompt, setDeleteAliasPrompt] = useState<{type: 'product' | 'client', id: string, alias: string} | null>(null)
  const [confirmOrderPrompt, setConfirmOrderPrompt] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)`);

// 3. Move handleDeleteAlias to the top of the component
const newDeleteAlias = `
  const handleDeleteAlias = async () => {
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

  const handleConfirm = async () => {`;
  
content = content.replace(/const handleConfirm = async \(\) => \{/, newDeleteAlias);

// 4. Update handleConfirm error handling
const oldHandleConfirmError = `} catch (e) {
        if (e instanceof Error) {
          if (e.message.includes('Stock insuficiente')) {
            toast.error('El stock cambió desde la última revisión.')
            refetchDraft()
          } else if (e.message.includes('versión')) {
            toast.error('El pedido fue actualizado. Revisamos los datos nuevamente.')
            refetchDraft()
          } else if (e.message.includes('READY antes de confirmar')) {
            toast.error('Este pedido ya fue confirmado o procesado.')
            refetchDraft()
          } else if (e.message.includes('idempotencia')) {
            toast.error('Hubo un conflicto procesando la solicitud, por favor revisá si ya se procesó.')
            refetchDraft()
          } else {
            toast.error(e.message)
          }
        } else {
          toast.error('Error al confirmar')
        }
      }`;

const newHandleConfirmError = `} catch (e) {
        if (e instanceof Error) {
          if (e.message.includes('Stock insuficiente')) {
            setConfirmError('El stock cambió desde la última revisión.')
            refetchDraft()
          } else if (e.message.includes('versión')) {
            setConfirmError('El pedido fue actualizado. Revisamos los datos nuevamente.')
            refetchDraft()
          } else if (e.message.includes('READY antes de confirmar')) {
            setConfirmError('Este pedido ya fue confirmado o procesado.')
            refetchDraft()
          } else if (e.message.includes('idempotencia')) {
            setConfirmError('Hubo un conflicto procesando la solicitud, por favor revisá si ya se procesó.')
            refetchDraft()
          } else {
            setConfirmError(e.message)
          }
        } else {
          setConfirmError('Error al confirmar')
        }
      }`;

content = content.replace(oldHandleConfirmError, newHandleConfirmError);
content = content.replace(/setIsProcessing\(true\)/, "setIsProcessing(true)\n      setConfirmError(null)");

// 5. Replace onClick confirm with state prompt
content = content.replace(/onClick=\{handleConfirm\}/, "onClick={() => setConfirmOrderPrompt(true)}");
content = content.replace(/onClick=\{\(\) => handleDeleteAlias\(alias\.type, alias\.id, alias\.alias\)\}/g, `onClick={() => setDeleteAliasPrompt({ type: alias.type, id: alias.id, alias: alias.alias })}`);
content = content.replace(/const handleDeleteAlias = async[\s\S]*?toast\.error\('No se pudo eliminar la equivalencia'\)\s*\}\s*\}/, "");

// 6. Insert Modals into the Draft return block
const modalRender = `
      <ConfirmDialog
        open={confirmOrderPrompt}
        titulo={confirmError ? "No se pudo confirmar el pedido" : "Confirmar pedido"}
        mensaje={
          confirmError ? (
            confirmError
          ) : (
            isProcessing ? "Procesando pedido..." : "¿Confirmar el pedido y descontar el stock físico?"
          )
        }
        accion={confirmError ? "Reintentar" : "Confirmar"}
        loading={isProcessing}
        onCancel={() => {
          setConfirmOrderPrompt(false)
          setConfirmError(null)
        }}
        onConfirm={handleConfirm}
      />
      
      <ConfirmDialog
        open={!!deleteAliasPrompt}
        titulo="Eliminar equivalencia"
        mensaje={deleteAliasPrompt ? \`¿Eliminar "\${deleteAliasPrompt.alias}"? Esta acción no elimina el producto ni el cliente.\` : ''}
        accion="Eliminar"
        loading={deleteAlias.isPending}
        onCancel={() => setDeleteAliasPrompt(null)}
        onConfirm={handleDeleteAlias}
      />
`;

content = content.replace(/(<\/div>\s*<\/div>\s*<\/div>\s*\)\s*\}\s*return \(\s*<div)/, modalRender + "\n$1");

fs.writeFileSync(path, content);
console.log("Success modifying AutomationPage.tsx");
