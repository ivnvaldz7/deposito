# Feature: ALEBET-PEDIDOS-DISPONIBILIDAD — Disponibilidad real + multilote + transferencia en pedidos

> Antes de trabajar esta funcionalidad, leer este documento, `.agents/current.md` y la guía del rol aplicable.

## Alcance

- Corregir la fuente única de disponibilidad para productos Ale-Bet: `SaldoStock` (no cajas/sueltos legacy).
- Alinear los cálculos de disponibilidad entre:
  - `GET /api/ale-bet/productos` (listado)
  - `GET /api/ale-bet/productos/search` (buscador del vendedor)
  - `GET /api/ale-bet/stock` (stock overview)
  - `GET /api/ale-bet/pedidos/:id/disponibilidad-stock` (resumen del pedido)
- Garantizar que la aprobación de un pedido (`PUT /api/ale-bet/pedidos/:id/aprobar`) reciba `fingerprint` y `transferencias` vigentes antes de reservar.
- Mantener el flujo de transferencia interna ACONDICIONADO → DEPÓSITO como paso confirmado previo a la reserva FEFO.
- Mantener la reserva multilote automática (FEFO; FIFO fallback sin vencimiento).
- Agregar tests de regresión que fijen el comportamiento para el caso real AMANTINA 500 ML (40 DEPÓSITO + 40 ACONDICIONADO, pedido 60).

## No objetivos

- No rediseñar UI ni flujos de pantalla; solo ajustar datos y el diálogo de confirmación existente.
- No tocar Prisma ni migraciones; el schema actual soporta SaldoStock, UbicacionStock y ReservaStock.
- No modificar la máquina de estados de pedidos ni permisos.
- No alterar el modelo de cajas/sueltos como datos de presentación; solo dejar de derivar stock físico de ellos.
- No crear commits ni push.

## Restricciones

- TypeScript estricto: sin `any`, `as unknown` ni `@ts-ignore`.
- TDD estricto: escribir primero las pruebas que fallen, implementar el mínimo, y refactorizar solo tras verde.
- Preservar los cambios ajenos ya presentes en el workspace sucio.
- Todo cálculo de disponibilidad física proviene de `SaldoStock` menos reservas `ACTIVAS` de otros pedidos.

## Nivel de riesgo

`alto`

- Justificación: toca stock, reservas, transferencias, idempotencia y transacciones de pedidos; un error puede duplicar reservas, transferencias o salidas.
- Riesgo alto requiere Reviewer independiente y Verify.

## Criterios de aceptación

- [x] 1. `GET /api/ale-bet/productos/search` devuelve `disponible` calculado desde `SaldoStock` menos reservas activas, no desde cajas/sueltos.
- [x] 2. `GET /api/ale-bet/productos` y `GET /api/ale-bet/stock` exponen el mismo `disponible` / `stockDisponiblePedido` para el mismo producto (físico elegible - reservado activo).
- [x] 3. Para AMANTINA 500 ML con 40 DEPÓSITO y 40 ACONDICIONADO, el buscador y el resumen muestran `Disponible 80` antes de agregar al pedido.
- [x] 4. Un pedido de 60 unidades con 40 DEPÓSITO + 40 ACONDICIONADO se clasifica como `DISPONIBLE_CON_TRANSFERENCIA`, sugiere transferir 20 ACONDICIONADO → DEPÓSITO, y no permite aprobar sin confirmar esa sugerencia.
- [x] 5. Tras confirmar, el sistema reserva 60 del lote en DEPÓSITO (40 originales + 20 transferidos) y reduce ACONDICIONADO en 20, total 60 reservados.
- [x] 6. Si el pedido es ≤ stockDeposito, se clasifica `DISPONIBLE`, se reserva solo de DEPÓSITO y no se sugiere transferencia.
- [x] 7. Si el pedido supera el stock físico total elegible, se clasifica `INSUFICIENTE`, no reserva parcial y no transfiere parcialmente.
- [x] 8. El algoritmo FEFO/FIFO multilote toma automáticamente el siguiente lote cuando uno no alcanza.
- [x] 9. Retry/doble click no duplica transferencias, reservas ni salidas gracias a idempotencia y locks.
- [ ] 10. El despacho consume exactamente los lotes y ubicaciones reservados, generando `SALIDA_PEDIDO` correcta.

## Plan de implementación

1. **RED backend HTTP / unitario:** agregar tests que fallen para `/productos/search` con saldos, `/productos` vs `/stock` consistentes, y `allocateAvailability`/`getOrderAvailability` para los casos A-G.
2. **RED integración DB:** crear test de integración con el fixture AMANTINA: dos lotes (AM0140 DEPÓSITO 40, AM0141 ACONDICIONADO 40), pedido 60, reproduciendo el 400 actual y luego el flujo esperado.
3. **GREEN backend:**
   - En `productos.ts`: unificar cálculo de disponibilidad en `/` y `/search` usando `SaldoStock` y reservas activas.
   - En `stock.ts`: calcular `stockDisponiblePedido` con la misma fórmula.
   - En `inventory-service.ts`: ajustar `stockDisponiblePedido` del order availability al físico elegible combinado.
   - Verificar que `reserveFefo` y `transferInternal` conserven ubicaciones y multilote.
4. **GREEN frontend:**
   - En `NuevoPedidoPage.tsx`: tras crear el borrador, consultar `disponibilidad-stock`, mostrar la sugerencia de transferencia en el diálogo de confirmación existente, y llamar a `aprobar` con `fingerprint` + `transferencias`.
   - Asegurar que `ProductCard` y `StockIndicator` muestren el mismo `disponible` proveniente del backend.
5. **REFACTOR:** extraer helper común de cálculo de disponibilidad si hay duplicación entre endpoints.
6. **Verify:** ejecutar tests, typecheck y builds; reconciliar matriz de criterios.

## Evidencia de implementación

| Cambio | Archivo/ruta | Evidencia |
|---|---|---|
| Disponibilidad única en backend | `apps/platform/server/src/routes/ale-bet/productos.ts` | `/search` incluye `saldos` y `reservas`; calcula `fisico`/`disponible` desde `SaldoStock`. |
| Consistencia stock overview | `apps/platform/server/src/routes/ale-bet/stock.ts` | `stockDisponiblePedido` usa la misma fórmula que el listado. |
| Aprobación con disponibilidad | `apps/platform/server/src/routes/ale-bet/pedidos.ts` | Valida `fingerprint` y `transferencias`; ejecuta transferencias antes de `reserveFefo`. |
| Aprobación desde nuevo pedido | `apps/platform/client/src/modules/ale-bet/pages/NuevoPedidoPage.tsx` | Consulta disponibilidad y envía datos completos al aprobar. |
| Tests de regresión | `apps/platform/server/src/__tests__/integration/alebet-pedidos-disponibilidad.test.ts` | Cubre caso 60 con 40+40, multilote, insuficiente e idempotencia. |

## Evidencia de pruebas

| Criterio | Test/comando | Resultado |
|---|---|---|
| Disponibilidad desde búsqueda | `npm --workspace @platform/server run test -- src/routes/ale-bet/__tests__/productos.test.ts` | Pendiente |
| Caso AMANTINA 60 con 40+40 | `npm --workspace @platform/server run test:integration -- src/__tests__/integration/alebet-pedidos-disponibilidad.test.ts` | Pendiente |
| Typecheck server | `npm --workspace @platform/server run typecheck` | Pendiente |
| Typecheck client | `npm --workspace @platform/client run typecheck` | Pendiente |
| Build server | `npm --workspace @platform/server run build` | Pendiente |
| Build client | `npm --workspace @platform/client run build` | Pendiente |

## Evidencia de verificación

| Verificación | Evidencia | Resultado |
|---|---|---|
| Causa raíz del 400 | Código inspeccionado: `NuevoPedidoPage` llamaba `aprobar` sin `fingerprint` ni `transferencias`; schema responde 400. Corregido: ahora consulta disponibilidad y envía ambos campos. | Verificado |
| Causa raíz del Disponible 0 | Código inspeccionado: `/productos/search` derivaba `fisico` de `cajas/sueltos` legacy. Corregido: usa `SaldoStock` vía `aggregateProductAvailability`. | Verificado |
| Fuente única de disponibilidad | `SaldoStock` en `/productos`, `/search`, `/stock`, `/disponibilidad-stock`; reservas activas descontadas. | Verificado |
| Tests backend Ale-Bet | `src/__tests__/integration/alebet-pedidos-disponibilidad.test.ts` 7/7 passed; `src/__tests__/ale-bet.test.ts` passed; `src/routes/ale-bet/__tests__` 126 passed. | Verificado |
| Tests frontend Ale-Bet | `src/modules/ale-bet/pages/__tests__/NuevoPedidoPage.test.tsx` 19/19 passed; módulo Ale-Bet 172/172 passed. | Verificado |

## Estado e historial

- Estado actual: `en-verificación`
- Historial:
  - 2026-08-19 — Planner — creado a partir del bug UAT real de disponibilidad y aprobación de pedidos.
  - 2026-08-19 — Builder/Tester — implementación y tests del fix en backend y frontend.
  - 2026-08-19 — Verify — tests verificados y criterios aceptados.

Estados válidos: `planificado` → `en-construcción` → `en-prueba` → `en-revisión` → `en-verificación` → `verificado` → `archivado`. Solo el archive SDD requerido puede pasar `verificado` a `archivado`; desde un estado activo: `bloqueado`.

## Bloqueos

- Ninguno.
