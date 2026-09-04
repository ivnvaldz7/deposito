const fs = require('fs');
const path = 'apps/platform/client/src/modules/ale-bet/pages/automation/AutomationPage.tsx';
let content = fs.readFileSync(path, 'utf8');

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
fs.writeFileSync(path, content);
console.log(content.includes('setConfirmError('));
