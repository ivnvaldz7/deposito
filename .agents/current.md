# Contexto operativo vigente

> **Snapshot de evidencia verificado solo al 2026-07-29.** No usarlo como prueba de estado posterior. Solo **Verify** puede actualizar este archivo después de reconciliarlo con evidencia; los demás roles proponen cambios.
## Estado operativo solicitado

- Etapa actual: Planificación de MVP-01 — Catálogo maestro de productos e importación
- Feature diferida: Cajas de embalaje y salida por lote
- Feature activa siguiente: MVP-01 — Catálogo maestro de productos e importación
- Próximo rol: Reviewer
- Implementación activa: Ninguna

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

## Mínimo de contexto

Cada rol lee únicamente: este archivo, el feature doc y su guía de rol; luego abre solo los archivos necesarios para su tarea. Si falta evidencia o el alcance es ambiguo, bloquear y solicitar/registrar la información faltante, sin inventar hechos.
