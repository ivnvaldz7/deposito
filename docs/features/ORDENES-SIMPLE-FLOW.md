# Órdenes — flujo simple por producto

> Una orden representa un único producto de catálogo. Aprobar valida y descuenta stock atómicamente; rechazar solo cambia su estado.

## Alcance

- Crear órdenes desde `DepositoProducto` activo; cantidades decimales para drogas y unidades enteras para empaque.
- Aprobar/descontar en una transacción; rechazar sin motivo obligatorio y sin tocar inventario.
- Retirar Partidas de la experiencia frontend/API expuesta, preservando esquema e historia.
- Mantener roles y permisos existentes.

## No objetivos

- Migrar o escribir datos productivos; deploy, seed, commit o push.
- Eliminar tablas/modelos/historia de Partidas.
- Cambiar Ale-Bet, OrdenProduccion a multiproducto, BOM o recetas.

## Restricciones

- `productoId` real y activo obligatorio; mercado obligatorio solo en estuche/etiqueta.
- Drogas: FIFO por vencimiento/id y cantidad decimal.
- Frascos: disponibilidad en unidades (`InventarioFrasco.total`), cajas derivadas conservando unidades parciales.
- No permitir aprobación/rechazo fuera de `solicitada`; stock, movimientos y estado se confirman atómicamente.
- Si cantidad deja de ser entera, conversión de esquema no destructiva; no aplicar migraciones en producción.

## Nivel de riesgo

`alto`

- Justificación: descuento de stock, transacciones, concurrencia, permisos y cambio de escala de cantidad.
- Requiere Reviewer independiente y Verify antes de deploy.

## Criterios de aceptación

- [x] Crear órdenes de producto único desde catálogo activo, incluyendo productos sin inventario.
- [x] Aprobar descuenta droga FIFO, frasco por unidades, estuche y etiqueta por producto+mercado.
- [x] Stock insuficiente revierte la transacción; segunda transición no duplica descuento.
- [x] Rechazo funciona sin motivo y no afecta inventario ni movimientos.
- [x] UI muestra estados de carga/éxito/error y elimina la acción separada de ejecutar.
- [x] Partidas desaparece de navegación/rutas frontend y endpoint montado; sus tablas/datos permanecen.
- [x] Tests focalizados, typechecks, build productivo y diff check; no se accedió a producción.

## Plan de implementación

- [x] Auditar contratos actuales de UI, API, esquema, stock, movimientos, locking y permisos.
- [x] Escribir tests de regresión para solicitud, aprobación atómica por categoría, rechazo y UI.
- [x] Implementar aprobación con descuento y selector de catálogo; hacer opcional rechazo.
- [x] Retirar la experiencia/endpoints visibles de Partidas sin eliminar modelos ni tablas.
- [x] Verificar sin modificar ni desplegar producción.

## Evidencia de implementación

| Cambio | Archivo/ruta | Evidencia |
|---|---|---|
| Solicitud y descuento por categoría | `server/src/deposito/routes/ordenes.ts`, `server/src/deposito/services/orden-stock-service.ts` | Catálogo activo por ID; transacción única para bloqueo, descuento, movimiento y estado. |
| Formulario / respuesta visual | `client/src/modules/deposito/pages/OrdenesPage.tsx` | Selector por categoría real, mercado condicional, feedback de acción y error. |
| Retiro visible de Partidas | Rutas/nav/barrel client; `server/src/deposito/routes/index.ts` | Página, query hook y endpoint no están expuestos; tablas/modelos conservados. |
| Precisión drogas | `packages/db/prisma/schema.prisma`, migration `20260923120000_orden_cantidad_decimal` | `OrdenProduccion.cantidad` Float mediante ALTER no destructivo; pendiente de aplicar donde se despliegue. |

## Evidencia de pruebas

| Criterio | Test/comando | Resultado |
|---|---|---|
| Server API / inventario | `server/src/deposito/__tests__/ordenes.test.ts` | 13/13 pasan; categorías, cantidad droga fraccional, mercados, movimientos, stock insuficiente, rechazo y doble aprobación secuencial. |
| Feedback formulario | `client/src/modules/deposito/pages/__tests__/OrdenesPage.test.tsx` | 8/8 pasan; loading/success/error y selector de estuche/mercado. |

## Evidencia de verificación

| Verificación | Evidencia | Resultado |
|---|---|---|
| Client/server typecheck | `npm --workspace @platform/client run typecheck`; `npm --workspace @platform/server run typecheck` | OK |
| Build | `npm run build:prod` | OK; solo warnings no bloqueantes de chunk de cliente/config Vite. |
| ESLint focalizado / diff | `npx eslint` sobre archivos del cambio; `git diff --check` | OK |
| Reviewer independiente y Verify de alto riesgo | No disponible en esta sesión | Pendiente antes del despliegue productivo. |

## Estado e historial

- Estado actual: `en-revisión`
- Historial:
  - 2026-09-23 — Implementación nativa — implementación y pruebas focalizadas completas; revisión independiente pendiente.

Estados válidos: `planificado` → `en-construcción` → `en-prueba` → `en-revisión` → `en-verificación` → `verificado` → `archivado`. Solo el archive SDD requerido puede pasar `verificado` a `archivado`; desde un estado activo: `bloqueado`.

## Bloqueos

- Revisión independiente de riesgo alto pendiente antes de deploy.
