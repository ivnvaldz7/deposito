# Feature: ALEBET-01 — Descartar borradores al cancelar

> Antes de trabajar esta funcionalidad, leer este documento, `.agents/current.md` y la guía del rol aplicable.

## Alcance

- Mantener `PUT /api/ale-bet/pedidos/:id/cancelar` como único endpoint de cancelación.
- Para un `Pedido` en `BORRADOR`, validar propietario/admin y `expectedVersion`, eliminar sus `ItemPedido` y luego el pedido dentro de la transacción e idempotencia existente.
- Devolver un contrato explícito de descarte (por ejemplo, `discarded: true`, `requested: false`, `pedidoId`) que no requiera un `Pedido` eliminado para que el cliente pueda invalidar y navegar.
- Conservar sin rediseño el flujo actual de `APROBADO`, `EN_ARMADO` y `PREPARADO`; `DESPACHADO` continúa no cancelable.
- Ajustar el contrato React Query y la vista de detalle para que el borrador descartado invalide listas/detalle/dashboard, navegue a `/ale-bet/pedidos`, no renderice una tarjeta `CANCELADO`, y muestre el copy diferenciado solicitado.
- Agregar cobertura unitaria HTTP, integración real de DB y componente para descarte de borrador y regresiones de cancelación existente.

## No objetivos

- No crear un endpoint nuevo ni rediseñar la máquina de estados operativos.
- No modificar `Prisma` ni migraciones: las FKs actuales permiten resolverlo mediante eliminación explícita de `ItemPedido` seguida de `Pedido`.
- No eliminar `Cliente`, `Producto`, `Lote`, ni movimientos/historial compartidos.
- No alterar reservas ni stock de un borrador; no cambiar los flujos de aprobar, tomar, preparar, despachar o remitos.
- No hacer commit ni push, ni alterar `.agents/current.md`.

## Restricciones

- TypeScript estricto: sin `any`, `as unknown` ni `@ts-ignore`.
- TDD estricto: escribir primero las pruebas que fallen, implementar el mínimo, y refactorizar solo tras verde.
- Preservar los cambios ajenos ya presentes en el workspace sucio.
- Si la evidencia de integración mostrara una FK distinta de la migración versionada, detenerse y reportar antes de proponer una migración.

## Nivel de riesgo

`alto`

- Justificación: cambia una transición operativa que borra datos y usa transacción/idempotencia; debe demostrar que no afecta inventario, reservas, trazabilidad de pedidos no-borrador ni dashboard.
- Riesgo alto requiere Reviewer independiente y Verify.

## Criterios de aceptación

- [ ] 1. Crear un pedido `BORRADOR` y cancelarlo mediante el endpoint existente devuelve éxito con una señal inequívoca de descarte (`discarded: true`) y sin un `Pedido` cancelado en la respuesta.
- [ ] 2. Tras descartar un `BORRADOR`, `GET /api/ale-bet/pedidos/:id` devuelve 404.
- [ ] 3. El borrador descartado no aparece en `GET /api/ale-bet/pedidos` ni en los pedidos recientes/contadores del dashboard.
- [ ] 4. No quedan `ItemPedido` huérfanos ni `PedidoAuditoria`, `ReservaStock` o `Remito` asociados al borrador; no se eliminan `Cliente`, `Producto` ni `Lote` compartidos.
- [ ] 5. El descarte de borrador no invoca liberación de reservas, no cambia lotes/stock físico y no genera movimientos de stock.
- [ ] 6. Cancelar `APROBADO` sigue conservando el pedido como `CANCELADO`, libera reservas activas y conserva la auditoría existente.
- [ ] 7. Cancelar `EN_ARMADO` conserva la solicitud/confirmación, el pedido final `CANCELADO` y su auditoría/reservas según las reglas actuales; `PREPARADO` mantiene su cancelación existente y `DESPACHADO` sigue rechazado.
- [ ] 8. En frontend, un `BORRADOR` muestra confirmación “Descartar borrador” y “Este borrador se eliminará.”; al confirmar desaparece de caché/listados, navega a `/ale-bet/pedidos` y nunca muestra una card/estado `CANCELADO`.

## Plan de implementación

- [ ] 1. **RED backend HTTP:** extender el mock de Prisma con `pedido.delete`; agregar en `apps/platform/server/src/__tests__/ale-bet.test.ts` el caso BORRADOR que exige respuesta `discarded`, `itemPedido.deleteMany({ where: { pedidoId } })`, `pedido.delete`, y ausencia de `releaseActiveReservations`/movimientos; ajustar solo expectativas necesarias de contratos existentes.
- [ ] 2. **RED integración DB:** ampliar `apps/platform/server/src/__tests__/integration/alebet01-verify-fixes.test.ts` con fixture BORRADOR real, items y auditoría; ejecutar cancelación y verificar 404, listado/dashboard sin pedido, cero dependientes, cliente/producto/lote intactos, reservas y stock sin variación. Añadir regresiones APROBADO y EN_ARMADO contra DB real para confirmar persistencia `CANCELADO`, liberación/auditoría según el flujo actual.
- [ ] 3. **GREEN backend:** en `apps/platform/server/src/routes/ale-bet/pedidos.ts`, luego de lock/autorización/versionado y antes de `releaseActiveReservations`, bifurcar `BORRADOR`: borrar explícitamente los items (la FK a `Pedido` es `RESTRICT`), borrar `Pedido`, devolver el contrato de descarte e integrarlo con la persistencia idempotente. No invocar auditoría de “cancelado” para un registro que se elimina; la auditoría de creación se elimina por cascada.
- [ ] 4. **GREEN frontend:** actualizar `CancelarPedidoResponse` y `useCancelarPedido` para invalidar por `pedidoId` sin asumir `pedido`; en `PedidoDetailPage.tsx` usar `discarded` para toast, invalidación/refetch de queries de pedidos/dashboard y `navigate('/ale-bet/pedidos')`. Diferenciar título, descripción y acción de confirmación para BORRADOR.
- [ ] 5. **RED/GREEN frontend:** actualizar `PedidoDetailPage.test.tsx` para el contrato `discarded`, textos exactos, llamado API, navegación a la bandeja e invalidación/no render de `CANCELADO`; conservar la prueba de APROBADO con copy y resultado de cancelación vigente.
- [ ] 6. **REFACTOR y revisión:** mantener las ramas de cancelación legibles, sin modificar estados no involucrados; inspección independiente de la transacción, idempotencia y alcance del diff antes de Verify.

## Evidencia de implementación

| Cambio | Archivo/ruta | Evidencia |
|---|---|---|
| Bifurcación BORRADOR → descarte | `apps/platform/server/src/routes/ale-bet/pedidos.ts` | Tras lock, autorización y `expectedVersion`, elimina `ItemPedido` y `Pedido` en la misma transacción idempotente; responde `{ discarded: true, requested: false, pedidoId }` sin liberar reservas ni auditar una cancelación. |
| Contrato API y caché | `apps/platform/client/src/modules/ale-bet/lib/api.ts`, `apps/platform/client/src/modules/ale-bet/queries/use-pedidos.ts` | Tipo discriminado para descarte sin `Pedido`; invalida listas, detalle y dashboard por `pedidoId`. |
| UX de descarte | `apps/platform/client/src/modules/ale-bet/pages/PedidoDetailPage.tsx` | BORRADOR muestra “Descartar borrador” y “Este borrador se eliminará.”; tras éxito muestra toast, invalida y navega a `/ale-bet/pedidos`. |
| Cobertura backend | `apps/platform/server/src/__tests__/ale-bet.test.ts`, `apps/platform/server/src/__tests__/integration/alebet01-verify-fixes.test.ts` | HTTP cubre contrato, borrado de items/pedido y ausencia de stock/auditoría. La integración real 6/6 PASS cubre BORRADOR, APROBADO y EN_ARMADO contra `platform_test` ya alineada. |
| Cobertura frontend | `apps/platform/client/src/modules/ale-bet/pages/__tests__/PedidoDetailPage.test.tsx` | Cubre copy exacto, contrato `discarded`, llamada API, toast y navegación a bandeja. |

### Evidencia TDD del Builder

| Tarea | Safety net | RED | GREEN | Triangulación / refactor |
|---|---|---|---|---|
| Cancelación BORRADOR | Server 21/21 y client 30/30 antes de editar | HTTP dirigido falló: esperaba `{ discarded: true, requested: false, pedidoId }` y recibió el `Pedido` `CANCELADO` existente | Server 22/22 y client 30/30 tras la bifurcación y ajuste de contrato | Regresiones de APROBADO/EN_ARMADO conservadas; integración real ampliada para los tres estados. Sin refactor adicional necesario. |

## Evidencia de pruebas

| Criterio | Test/comando | Resultado |
|---|---|---|
| HTTP dirigido y regresiones de estados | `npm --workspace @platform/server run test -- src/__tests__/ale-bet.test.ts` | PASS — 22/22 |
| Integración Ale-Bet con PostgreSQL | `npm --workspace @platform/server run test:integration -- src/__tests__/integration/alebet01-verify-fixes.test.ts` | PASS — 6/6 contra `platform_test` después de aplicar la migración existente `20260804103000_alebet_dynamic_units_per_box`; no se crearon ni editaron migraciones. |
| Dashboard afectado | `npm --workspace @platform/server run test -- src/routes/ale-bet/__tests__/dashboard.test.ts` | PASS — 5/5 |
| Cancelación frontend | `npm --workspace @platform/client run test -- src/modules/ale-bet/pages/__tests__/PedidoDetailPage.test.tsx` | PASS — 30/30 |
| Typecheck server | `npm --workspace @platform/server run typecheck` | PASS |
| Build server | `npm --workspace @platform/server run build` | PASS |
| Typecheck client | `npm --workspace @platform/client run typecheck` | PASS |
| Build client | `npm --workspace @platform/client run build` | PASS |

## Evidencia de verificación

### Matriz independiente de criterios

| Criterio | Evidencia inspeccionada/ejecutada | Estado Verify |
|---|---|---|
| 1. Contrato de descarte | HTTP dirigido 22/22 PASS e integración real 6/6 PASS: BORRADOR devuelve exactamente `{ discarded: true, requested: false, pedidoId }`. | PASS. |
| 2. GET devuelve 404 | Integración real 6/6 PASS ejecuta `GET /api/ale-bet/pedidos/:id` posterior al descarte y recibe 404. | PASS. |
| 3. No aparece en listado/dashboard | Integración real 6/6 PASS comprueba la ausencia del borrador en `GET /pedidos` y `dashboard.pedidosRecientes`; dashboard unitario 5/5 también está verde. | PASS. |
| 4. Sin dependientes y sin borrar compartidos | Integración real 6/6 PASS comprueba cero `ItemPedido`, `PedidoAuditoria`, `ReservaStock` y `MovimientoStock` por pedido, y conserva Cliente, Producto y Lote. | PASS. |
| 5. Sin reservas/stock/movimientos | Integración real 6/6 PASS verifica cero reservas/movimientos y snapshot idéntico de cajas/sueltos del lote; HTTP dirigido confirma que no se invoca `releaseActiveReservations`. | PASS. |
| 6. APROBADO persiste CANCELADO | Integración real 6/6 PASS verifica `CANCELADO`, `canceladoAt`, reserva `LIBERADA` y auditoría `PEDIDO_CANCELADO`. | PASS. |
| 7. EN_ARMADO y otros estados preservados | Integración real 6/6 PASS verifica solicitud 202, permanencia temporal en `EN_ARMADO`, confirmación del armador a `CANCELADO`, reserva `LIBERADA` y ambas auditorías. La expectativa corregida usa versión 1/2: el fixture hace un `update` directo de estado que no incrementa `version`; el endpoint de solicitud la incrementa a 2. | PASS. |
| 8. UX frontend | `PedidoDetailPage.test.tsx`: 30/30 PASS. Comprueba copy exacto, contrato `discarded`, navegación e invalidación de pedidos, detalle y dashboard. | PASS. |

### Ejecución independiente

| Comando | Resultado |
|---|---|
| `npm --workspace @platform/server run test -- src/__tests__/ale-bet.test.ts` | PASS — 22/22. |
| `npm --workspace @platform/server run test -- src/routes/ale-bet/__tests__/dashboard.test.ts` | PASS — 5/5. |
| `npm --workspace @platform/client run test -- src/modules/ale-bet/pages/__tests__/PedidoDetailPage.test.tsx` | PASS — 30/30. |
| `npm --workspace @platform/server run typecheck` | PASS. |
| `npm --workspace @platform/server run build` | PASS. |
| `npm --workspace @platform/client run typecheck` | PASS. |
| `npm --workspace @platform/client run build` | PASS. |
| `npx prisma migrate status` desde `packages/db`, con `PLATFORM_DATABASE_URL` cargada explícitamente desde `.env.test` | PASS — destino `platform_test`, 12 migraciones encontradas y schema al día; incluye la migración existente `20260804103000_alebet_dynamic_units_per_box`. |
| `npm --workspace @platform/server run test:integration -- src/__tests__/integration/alebet01-verify-fixes.test.ts`, con `.env.test`, `NODE_ENV=test` y guardia de destino `platform_test` | PASS — 6/6 en 4.94s. |

### Revisión, alcance y TDD

- Reviewer independiente: `APPROVED`; confirmó la transacción, las FKs y la preservación de los demás estados.
- Alcance ALEBET: no hay cambios bajo `packages/db/prisma/` ni migraciones nuevas. El artefacto generado `packages/db/src/generated/client/index.d.ts` y los demás cambios del workspace son preexistentes/ajenos al alcance de este Verify.
- TDD: hay evidencia RED/GREEN en este documento y los archivos de prueba existen. La auditoría de aserciones de los casos agregados no encontró tautologías ni aserciones sin ejecución de código. La cobertura específica no se ejecutó porque no hay comando de cobertura declarado para este cambio.
- Revisión independiente de EN_ARMADO: el único ajuste posterior del test fue alinear `expectedVersion` a 1 para solicitar la cancelación y 2 para confirmarla. El fixture crea APROBADO con versión 1 y luego lo pasa a EN_ARMADO mediante `prisma.pedido.update` sin incremento explícito; la ruta de solicitud sí incrementa la versión a 2. La ejecución real cubre el flujo completo y sus auditorías, por lo que la corrección no oculta una regresión de producción.

### Dictamen Verify

**VERIFICADO.** `platform_test` quedó alineada con las 12 migraciones versionadas, incluida `20260804103000_alebet_dynamic_units_per_box`, sin crear ni editar migraciones. La integración real 6/6 demuestra el descarte de BORRADOR, la integridad de dependencias/stock y la preservación de los flujos APROBADO y EN_ARMADO. No queda blocker runtime para retest UAT.

## Estado e historial

- Estado actual: `verificado`
- Historial:
  - 2026-08-05 — Planner — creado para el bugfix ALEBET-01.
  - 2026-08-05 — Builder — implementó descarte transaccional de BORRADOR, contrato `discarded`, UX mínima y cobertura dirigida; integración bloqueada por schema desactualizado en `platform_test`.
  - 2026-08-05 — Tester — agregó aserciones de título e invalidación de pedidos/detalle/dashboard para el descarte; HTTP 22/22, dashboard 5/5, frontend 30/30, typecheck y build server/client PASS. La integración real permanece bloqueada por el schema de `platform_test` desactualizado.
  - 2026-08-05 — Reviewer independiente — `APPROVED`; no encontró hallazgos bloqueantes en la transacción, FKs, contratos ni UX dentro del alcance ALEBET.
  - 2026-08-05 — Verify — estado transitorio `en-verificación`; reejecutó HTTP, dashboard, frontend, typecheck y builds con PASS. La integración real reprodujo el mismo bloqueo ambiental antes de ejecutar sus aserciones.
  - 2026-08-05 — Verify — `bloqueado`: `platform_test` tiene pendiente `20260804103000_alebet_dynamic_units_per_box`; sin esa migración aplicada no existe evidencia runtime DB suficiente para `verificado`.
  - 2026-08-05 — Verify independiente — confirmó `platform_test` al día con las 12 migraciones versionadas y reejecutó integración ALEBET-01: 6/6 PASS. Verificó que el ajuste EN_ARMADO 1/2 corrige una expectativa stale del fixture sin ocultar regresión de producción. Estado final: `verificado`.

Estados válidos: `planificado` → `en-construcción` → `en-prueba` → `en-revisión` → `en-verificación` → `verificado` → `archivado`. Solo el archive SDD requerido puede pasar `verificado` a `archivado`; desde un estado activo: `bloqueado`.

## Bloqueos

- Ninguno. La migración existente `20260804103000_alebet_dynamic_units_per_box` ya está aplicada en `platform_test`; no se creó ni modificó ninguna migración. La FK `ItemPedido_pedidoId` sigue siendo `ON DELETE RESTRICT` y el flujo la resuelve borrando items antes del pedido dentro de la transacción; `PedidoAuditoria`, `ReservaStock` y `Remito` aplican sus cascadas.
