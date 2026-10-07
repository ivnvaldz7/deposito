# Feature: Edición segura de carga inicial de drogas

> Antes de trabajar esta funcionalidad, leer este documento, `.agents/current.md` y la guía del rol aplicable.

## Alcance

- Permitir correcciones manuales y auditables de la carga inicial de drogas/materia prima.
- Permitir correcciones sucesivas mientras solo existan correcciones de precarga auditadas; bloquear únicamente ante movimientos operativos posteriores.

## No objetivos

- No modificar automáticamente la precarga, ni borrar/recrear productos, lotes o movimientos.

## Restricciones

- La implementación será aditiva y preservará IDs y trazabilidad existente.
- Se detiene ante una semántica de APERTURA no inequívoca.

## Nivel de riesgo

`alto`

- Justificación: inventario, movimientos y auditoría.

## Criterios de aceptación

- [x] Una apertura sin movimientos operativos posteriores se puede corregir más de una vez, incluso a cero.
- [x] Producto, lote e IDs permanecen; la corrección genera auditoría con anterior/nuevo/delta/motivo/usuario.
- [x] Cada corrección se identifica como `CORRECCION_PRECARGA`, vinculada al ID del lote y al movimiento de apertura, sin usar el texto libre del motivo para clasificarla.
- [x] Un movimiento operativo posterior, incluido un `ajuste_manual` operativo normal, bloquea la edición y dirige a ajuste de stock.
- [x] Editor cierra solo después de éxito e invalidación; conserva contexto ante error.

## Plan de implementación

- [x] Reutilizar `InventarioDroga` y `Movimiento` sin migración ni modificación automática de la precarga.
- [x] Implementar `PATCH /drogas/:productoId/apertura/:inventarioId` con transacción, lock e idempotencia.
- [x] Añadir modal mínimo en el listado de Drogas para lotes de apertura.

## Evidencia de implementación

| Cambio | Archivo/ruta | Evidencia |
|---|---|---|
| Edición protegida de apertura | `apps/platform/server/src/deposito/routes/drogas.ts` | Lock, una única apertura auditada, correcciones `CORRECCION_PRECARGA` vinculadas a apertura/lote, bloqueo de movimientos operativos y transacción. |
| Editor de apertura | `apps/platform/client/src/modules/deposito/pages/DrogasPage.tsx` | Acción lápiz para `APERTURA` y `APERTURA-SIN-LOTE`; no rediseña la lista. |
| Mutación con invalidación | `apps/platform/client/src/modules/deposito/queries/use-drogas.ts` | Idempotency-Key y espera de invalidación antes del cierre. |

## Evidencia de pruebas

| Criterio | Test/comando | Resultado |
|---|---|---|
| Correcciones 75→82→80, cero, auditoría, bloqueo y validaciones | `npm --workspace @platform/server run test -- src/deposito/__tests__/editar-apertura.test.ts --reporter=verbose` | PASS — 6 tests |
| Apertura existente + edición | `npm --workspace @platform/server run test -- src/deposito/__tests__/apertura.test.ts src/deposito/__tests__/editar-apertura.test.ts --reporter=verbose` | PASS — 7 tests |
| UI éxito/error | `npm --workspace @platform/client run test -- src/modules/deposito/pages/__tests__/DrogasPage.test.tsx --reporter=verbose` | PASS — 10 tests |
| TypeScript cliente/servidor | `npm --workspace @platform/{client,server} run typecheck` | PASS |
| Suite existente de listado Drogas | `src/deposito/__tests__/drogas.test.ts` | No ejecutable: falta `PLATFORM_DATABASE_URL` antes de cargar la suite. |

## Evidencia de verificación

| Verificación | Evidencia | Resultado |
|---|---|---|

## Estado e historial

- Estado actual: `en-revisión`
- Historial:
  - 2026-09-25 — Codex — alcance creado; descubrimiento en curso.
  - 2026-09-25 — Codex — implementación y pruebas focalizadas completadas.

## Bloqueos

- La suite histórica `drogas.test.ts` requiere `PLATFORM_DATABASE_URL` en el runner; no se modificó la configuración ni se ejecutó contra la precarga para evitar una mutación accidental.
