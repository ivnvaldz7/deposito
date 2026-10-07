# Feature: Transferencias configurables, lotes cero y autocierre

> Antes de trabajar esta funcionalidad, leer este documento, `.agents/current.md` y la guía del rol aplicable.

## Alcance

- Reglas configurables de producto origen a producto destino para transferencias desde ACONDICIONADO.
- Ocultar lotes cuyo total operativo sea cero, sin eliminarlos.
- Cerrar el modal de stock solo después de una mutación exitosa.

## No objetivos

- No modificar cantidades, lotes, saldos ni movimientos de la precarga.
- No rediseñar la UI ni tocar el automatizador.

## Restricciones

- Toda migración será aditiva y las reglas iniciales solo podrán referenciar productos inequívocos ya existentes.
- Si no hay una semántica inequívoca para trazar el lote en un producto destino distinto, se detiene esa parte.

## Nivel de riesgo

`alto`

- Justificación: stock, transacciones, trazabilidad y Prisma schema.

## Criterios de aceptación

- [x] Lotes con total operativo cero se ocultan sin eliminarlos; historial/archivo los conserva.
- [x] Ajustar, ingresar y transferir cierran el modal principal solo tras éxito e invalidación.
- [x] Transferencias configurables cuya identidad se resuelve exactamente contra la precarga PROD-02B.
- [x] Las catorce reglas solicitadas se resuelven por identidad exacta de catálogo.

## Plan de implementación

- [x] Filtrar lotes en cero desde los contratos operativos y en el modal.
- [x] Esperar la invalidación de caché antes de cerrar el modal padre.
- [x] Implementar reglas persistidas, transferencia atómica y lote derivado con trazabilidad explícita.
- [x] Normalizar el producto legacy `GALLO` a `AVES` conservando su ID, SKU y relaciones.
- [x] Incorporar los tres productos Aminoácidos faltantes mediante un patch de catálogo aditivo.
- [x] Inicializar las catorce reglas por ID + SKU + nombre exactos y de forma idempotente.

## Evidencia de implementación

| Cambio | Archivo/ruta | Evidencia |
|---|---|---|
| Ocultamiento operativo de lotes cero | `apps/platform/server/src/routes/ale-bet/stock.ts`, `product-stock-admin-service.ts` | El filtro no muta ni elimina `Lote`/`SaldoStock`; archivo mantiene la vista completa. |
| Autocierre poséxito | `GestionarStockModal.tsx`, `use-productos.ts` | Las mutaciones esperan invalidación y solo entonces notifican al modal padre. |
| Reglas y lote derivado | `schema.prisma`, migración `20260925160000_product_transfer_rules` | `ProductoTransferRule` y `Lote.derivedFromLoteId` son aditivos; el lote derivado es único por producto destino + lote origen. |
| Transferencia de presentación | `presentation-transfer-service.ts`, `stock.ts` | Bloquea saldo/lote origen, crea o reutiliza el lote derivado y registra origen/destino/regla en la referencia del movimiento dentro de una transacción. |
| Inicializador aislado | `seed-product-transfer-rules.ts` | Lee exclusivamente el manifiesto PROD-02B, valida ID/nombre/SKU en destino y hace upsert solo de reglas. |
| Parche de catálogo Aminoácidos | `20260925170000_amino_catalog_presentations` | Con 49 productos preparados, renombra exclusivamente el ID legacy GALLO a AVES e inserta base 50 ML, 1 L EQUINO y 1 L CERDOS; no toca stock. |
| Catálogo y manifiesto de precarga | `prod-02a2-catalog.ts`, `PROD-02B-initial-stock-manifest.json` | El catálogo contiene 52 productos; D10 conserva ID/SKU/lote/cantidad y solo cambia su nombre canónico a AVES. |

## Evidencia de pruebas

| Criterio | Test/comando | Resultado |
|---|---|---|
| Lotes cero operativos, archivo y reaparición | `npm --workspace @platform/server run test -- src/routes/ale-bet/__tests__/stock.test.ts --reporter=verbose` | PASS — 19 tests |
| Modal: éxito cierra / error preserva | `npm --workspace @platform/client run test -- src/modules/ale-bet/components/__tests__/GestionarStockModal.test.tsx` | PASS — 7 tests |
| TypeScript cliente | `npm --workspace @platform/client run typecheck` | PASS |
| TypeScript servidor | `npm --workspace @platform/server run typecheck` | PASS |
| Transferencia normal, presentación, retry, concurrencia y rollback | `npm --workspace @platform/server run test:integration -- src/__tests__/integration/product-stock-admin.test.ts` | PASS — 23 tests, exclusivamente en `platform_test_automation`. |
| Servicio y contrato HTTP de stock | `npm --workspace @platform/server run test -- src/routes/ale-bet/__tests__/stock.test.ts src/routes/ale-bet/__tests__/inventory-service.test.ts` | PASS — 23 tests. |
| Modal con destinos del backend y regresión de autocierre | `npm --workspace @platform/client run test -- src/modules/ale-bet/components/__tests__/GestionarStockModal.test.tsx` | PASS — 8 tests. |
| Patch de catálogo, preservación GALLO y inicializador duplicado | `npm --workspace @platform/server run test:integration -- src/__tests__/integration/amino-catalog-patch.test.ts --reporter=verbose` | PASS — 3 tests, exclusivamente en `platform_test_automation`. |
| Transferencias Aminoácidos 50 ML/1 L y lote derivado reutilizado | `npm --workspace @platform/server run test:integration -- src/__tests__/integration/product-stock-admin.test.ts -t "transfers the four confirmed" --reporter=verbose` | PASS — 1 test focalizado (23 omitidos), exclusivamente en `platform_test_automation`. |

## Evidencia de verificación

| Verificación | Evidencia | Resultado |
|---|---|---|

## Estado e historial

- Estado actual: `en-revisión` — catálogo confirmado e implementación completa, pendiente de UAT.
- Historial:
  - 2026-09-25 — Codex — alcance creado; descubrimiento en curso.
  - 2026-09-25 — Codex — lotes cero y autocierre implementados; transferencia configurable detenida con evidencia.
  - 2026-09-25 — Codex — catálogo Aminoácidos confirmado; patch aditivo, las catorce reglas y pruebas focalizadas completados.

## Bloqueos

- Sin bloqueos de identidad de catálogo: la fuente es `docs/operations/PROD-02B-initial-stock-manifest.json` junto a `prod-02a2-catalog.ts`.
