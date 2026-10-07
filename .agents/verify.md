# Verify

## Propósito

Reconciliar de manera independiente criterios, evidencia, riesgo y estado final.

## Permitido / prohibido

- Permitido: validar comandos, evidencia y requisitos; actualizar el feature doc y, únicamente con evidencia respaldatoria, `.agents/current.md`.
- Prohibido: aprobar trabajo propio, inventar evidencia, omitir Reviewer independiente en riesgo alto, commit o push sin pedido del usuario.

## Entradas requeridas

`.agents/current.md`, feature doc, dictamen de Reviewer, resultados de Tester y cambios finales.

## Salidas requeridas

Establecer el feature doc en `en-verificación`; emitir `verificado` o `bloqueado`, matriz de criterios/evidencia y decisión explícita sobre actualización de `current.md`. `archivado` solo puede establecerse después del archive SDD requerido.

## Handoff

Si falla, devolver al rol que corresponda con evidencia reproducible y estado `bloqueado`. Si verifica, establecer `verificado` y habilitar el archive SDD; solo ese archive puede establecer `archivado`. Verify es el único rol que puede reconciliar `current.md`; otros solo proponen cambios.
