# Contexto operativo vigente

> **Snapshot de evidencia verificado solo al 2026-07-29.** No usarlo como prueba de estado posterior. Solo **Verify** puede actualizar este archivo después de reconciliarlo con evidencia; los demás roles proponen cambios.
## Estado operativo solicitado

- Etapa actual: Verificación — fix de disponibilidad Ale-Bet (UAT: Disponible 0 vs 80 y 400 al aprobar AMANTINA 60u)
- Feature diferida: Cajas de embalaje y salida por lote
- Feature activa siguiente: MVP-01 — Catálogo maestro de productos e importación
- Próximo rol: Reviewer (previo a Verify final)
- Implementación activa: ALEBET-PEDIDOS-DISPONIBILIDAD

## Arquitectura

- Aplicación activa: `apps/platform/client` y `apps/platform/server`.
- Paquetes activos: `packages/db` y `packages/platform-core`.
- Monorepo: npm workspaces + Turborepo.
- Base de datos: PostgreSQL con Prisma y schemas `platform`, `deposito` y `ale_bet`.
- Evidencia al 2026-07-29: existe un piloto local no versionado de Graphify 0.9.29 en `codex/graphify-pilot`. Sus salidas no son fuente de verdad y no deben versionarse; la extracción completa de contenido no-code quedó bloqueada por requerir API key.

## Rutas fuente exactas

| Área | Ruta |
|---|---|
| Cliente | `apps/platform/client` |
| Servidor | `apps/platform/server` |
| Depósito (server) | `apps/platform/server/src/deposito/routes/` |
| Depósito (client) | `apps/platform/client/src/modules/deposito/` |
| Ale-Bet (server) | `apps/platform/server/src/routes/ale-bet/` |
| Ale-Bet (client) | `apps/platform/client/src/modules/ale-bet/` |
| Admin | `apps/platform/server/src/routes/admin/`, `apps/platform/client/src/modules/admin/` |
| Auth | `apps/platform/server/src/routes/auth/`, `apps/platform/client/src/modules/auth/` |
| Core | `packages/platform-core/src/auth/` |
| Prisma | `packages/db/prisma/schema.prisma` |

## Comandos oficiales

```bash
npm run dev
npm run build
npm run build:prod
npm run lint
npm run typecheck
npm --workspace @platform/client run test
npm --workspace @platform/server run test
npm --workspace @platform/server run test:integration
npm --workspace @platform/server run db:migrate
```

## Reglas críticas de stock

- Mantener constraints de inventario no negativo y movimientos de cantidad distinta de cero.
- Proteger inventario y lotes con `FOR UPDATE` y orden determinista.
- Ale-Bet: FEFO/fecha de vencimiento y luego `id`.
- Depósito de drogas: FIFO/fecha de vencimiento y luego `id`.
- Las transacciones deben hacer rollback ante fallas.
- Mantener registros/replay de idempotencia.
- Conflictos de inventario o estado devuelven HTTP 409.
- Aplicar control de acceso por roles.

## Riesgo y ciclo de vida

| Riesgo | Criterio |
|---|---|
| Bajo | Solo documentación o comentarios. |
| Estándar | Código o tests normales. |
| Alto | Stock, auth, transacciones, permisos, Prisma/schema o CI. |

Estados válidos: `planificado` → `en-construcción` → `en-prueba` → `en-revisión` → `en-verificación` → `verificado` → `archivado`. Solo el archive SDD requerido puede pasar `verificado` a `archivado`; desde cualquier estado activo: `bloqueado`.

## Cambio en curso: ALEBET-PEDIDOS-DISPONIBILIDAD

**Objetivo**: que búsqueda, listado y aprobación de pedidos Ale-Bet usen `SaldoStock` como única fuente de verdad; soportar transferencia ACONDICIONADO→DEPÓSITO con confirmación; multilote FEFO; idempotencia.

**Causas raíz atendidas**:
1. `/api/ale-bet/productos/search` calculaba `fisico` desde `lote.cajas`/`lote.sueltos`.
2. `/api/ale-bet/stock` exponía `stockDisponiblePedido` como solo depósito.
3. `NuevoPedidoPage` aprobaba sin `fingerprint` ni `transferencias` (400).

**Archivos modificados / nuevos**:
- `docs/features/ALEBET-PEDIDOS-DISPONIBILIDAD.md` (nuevo)
- `apps/platform/server/src/routes/ale-bet/stock-aggregation.ts` (nuevo)
- `apps/platform/server/src/routes/ale-bet/productos.ts`
- `apps/platform/server/src/routes/ale-bet/stock.ts`
- `apps/platform/server/src/routes/ale-bet/inventory-service.ts`
- `apps/platform/server/src/routes/ale-bet/__tests__/stock.test.ts`
- `apps/platform/server/src/__tests__/ale-bet.test.ts`
- `apps/platform/server/src/__tests__/integration/aprobar-409-integration.test.ts`
- `apps/platform/server/src/__tests__/integration/alebet-pedidos-disponibilidad.test.ts` (nuevo)
- `apps/platform/client/src/modules/ale-bet/pages/NuevoPedidoPage.tsx`
- `apps/platform/client/src/modules/ale-bet/pages/__tests__/NuevoPedidoPage.test.tsx`

**Evidencia de tests** (2026-08-19):
- Cliente typecheck: OK.
- Cliente tests Ale-Bet: 16 archivos / 172 tests passed.
- Servidor tests Ale-Bet unit: 15 archivos / 126 tests passed (1 suite preexistente sin DB URL).
- Servidor tests integración: 14 archivos / 71 tests passed.
- Servidor typecheck: fallas preexistentes en `src/__tests__/test-desmarcar.ts` y `src/scripts/reset-estuches.ts`; el cambio no agrega errores nuevos.
- Cliente tests completos: 7 fallas preexistentes en módulo `deposito`; el cambio no afecta Ale-Bet.

## Mínimo de contexto

Cada rol lee únicamente: este archivo, el feature doc y su guía de rol; luego abre solo los archivos necesarios para su tarea. Si falta evidencia o el alcance es ambiguo, bloquear y solicitar/registrar la información faltante, sin inventar hechos.
