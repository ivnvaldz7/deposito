# Auditoría: Fase 3

**Fecha:** 2026-04-06
**Auditor:** Codex
**Scope:** Roles (`observador` / `solicitante` / `encargado`), gestión de usuarios, órdenes de producción, SSE en tiempo real, sistema de toasts y mejoras en pendientes.

---

## 🔴 Crítico (bugs, seguridad)
Issues que deben resolverse antes de seguir.

### Issue 1
- **Archivo:** `server/prisma/schema.prisma`, `server/src/routes/actas.ts`, `server/src/routes/ordenes.ts`
- **Estado:** **Resuelto**
- **Problema original:** La ejecución de una orden creaba un `Movimiento` con `referenciaId = orden.id`, pero `referenciaId` estaba modelado contra `ActaItem.id`.
- **Revalidación:** En [schema.prisma](C:/Users/Usuario/Desktop/deposito/server/prisma/schema.prisma) `Movimiento` ahora usa `referenciaId` genérico más `referenciaTipo` con enum `RefTipo` (`acta_item` / `orden`). En [actas.ts](C:/Users/Usuario/Desktop/deposito/server/src/routes/actas.ts) los ingresos registran `referenciaTipo: 'acta_item'`, y en [ordenes.ts](C:/Users/Usuario/Desktop/deposito/server/src/routes/ordenes.ts) los egresos de órdenes registran `referenciaTipo: 'orden'`. La inconsistencia semántica original quedó corregida.

### Issue 2
- **Archivo:** `server/src/routes/ordenes.ts`, `client/src/features/ordenes/ordenes-page.tsx`
- **Estado:** **Resuelto**
- **Problema original:** Una orden `ejecutada` todavía podía pasar a `rechazada`, dejando stock ya descontado y movimiento ya creado.
- **Revalidación:** En [ordenes.ts](C:/Users/Usuario/Desktop/deposito/server/src/routes/ordenes.ts) `PUT /api/ordenes/:id/rechazar` ahora solo permite rechazo en estados `solicitada` y `aprobada`. En [ordenes-page.tsx](C:/Users/Usuario/Desktop/deposito/client/src/features/ordenes/ordenes-page.tsx) `canRechazar` quedó limitado a esos mismos estados, así que el backend y el frontend están alineados.

---

## 🟡 Importante (refactor, performance)
Issues que deberían resolverse pronto.

### Issue 1
- **Archivo:** `server/src/routes/events.ts`
- **Estado:** **Resuelto**
- **Problema original:** La autenticación del stream SSE usaba el JWT crudo por query string (`/api/events?token=...`).
- **Revalidación:** En [events.ts](C:/Users/Usuario/Desktop/deposito/server/src/routes/events.ts) el flujo ahora es `POST /api/events/auth` autenticado por header para emitir un ticket temporal, seguido de `GET /api/events?ticket=...`. El ticket vive en memoria, expira en 30 segundos y se invalida al primer uso. El JWT ya no viaja en la URL del stream.

### Issue 2
- **Archivo:** `client/src/hooks/use-sse.ts`
- **Estado:** **Resuelto**
- **Problema original:** La reconexión del SSE reintentaba indefinidamente cada 5 segundos, incluso ante errores de autenticación.
- **Revalidación:** En [use-sse.ts](C:/Users/Usuario/Desktop/deposito/client/src/hooks/use-sse.ts) ahora hay `MAX_RETRIES = 5`, backoff progresivo (`5s`, `10s`, `20s`, `40s`, `60s`) y `logout()` cuando `POST /api/events/auth` devuelve `401`. El loop infinito original quedó cerrado.

---

## 🟢 Sugerencia (mejoras menores)
Nice to have, no urgente.

### Issue 1
- **Archivo:** `server/src/routes/ordenes.ts`, `server/src/routes/events.ts`, `client/src/hooks/use-sse.ts`, `server/src/routes/pendientes.ts`
- **Estado:** **Pendiente**
- **Sugerencia:** Agregar tests de integración para la matriz de estados de órdenes (`solicitada -> aprobada -> ejecutada -> completada/rechazada`), para la creación del movimiento de egreso, para auth/reconexión de SSE y para recepción parcial de pendientes. Hoy los flujos más sensibles dependen de validación manual.

---

## Revalidación de fixes
- **Fix 1 — `Movimiento.referenciaId` genérico con `referenciaTipo`:** **Resuelto**. Validado en [schema.prisma](C:/Users/Usuario/Desktop/deposito/server/prisma/schema.prisma), [actas.ts](C:/Users/Usuario/Desktop/deposito/server/src/routes/actas.ts) y [ordenes.ts](C:/Users/Usuario/Desktop/deposito/server/src/routes/ordenes.ts).
- **Fix 2 — Rechazar orden solo en `solicitada` / `aprobada`:** **Resuelto**. Validado en [ordenes.ts](C:/Users/Usuario/Desktop/deposito/server/src/routes/ordenes.ts) y [ordenes-page.tsx](C:/Users/Usuario/Desktop/deposito/client/src/features/ordenes/ordenes-page.tsx).
- **Fix 3 — SSE auth con ticket temporal (`POST /api/events/auth` -> `GET /api/events?ticket=`):** **Resuelto**. Validado en [events.ts](C:/Users/Usuario/Desktop/deposito/server/src/routes/events.ts).
- **Fix 4 — Reconexión con máximo 5 reintentos, backoff y logout en `401`:** **Resuelto**. Validado en [use-sse.ts](C:/Users/Usuario/Desktop/deposito/client/src/hooks/use-sse.ts).

## Validaciones OK
- **Permisos de órdenes:** `POST /api/ordenes` permite `solicitante` y `encargado`; `GET /api/ordenes` y `GET /api/ordenes/:id` requieren `authenticate`; `PUT /aprobar`, `PUT /ejecutar`, `PUT /rechazar` y `PUT /completar` quedan restringidos a `encargado`. Además, el backend limita al `solicitante` a sus propias órdenes en listado y detalle.
- **Frontend de órdenes:** `observador` no ve `Nueva orden` ni acciones operativas; `solicitante` puede crear pero no ve aprobar/ejecutar/rechazar/completar; `encargado` sí ve todas las acciones. La visibilidad está correctamente gateada en [ordenes-page.tsx](C:/Users/Usuario/Desktop/deposito/client/src/features/ordenes/ordenes-page.tsx).
- **Pendientes:** `PUT /api/pendientes/:id/recibir` valida `cantidadRecibida`, usa transacción y crea correctamente el remanente cuando la recepción es parcial. En frontend, el fuzzy search de frascos limpia la selección al tipear y no permite enviar texto libre.
- **SSE manager:** no encontré fugas obvias en el manager. El backend elimina clientes al cerrar la request y también los purga si falla `res.write`; en frontend se limpian `EventSource` y `setTimeout` al desmontar.
- **Toasts:** no quedan `alert()` ni `window.alert()` reales en `client/src`. La coincidencia de `confirm` en `acta-detalle-page.tsx` es una función local, no una notificación nativa del browser.

## Resumen
| Severidad | Cantidad |
|-----------|----------|
| 🔴 Crítico | 0 pendientes / 2 resueltos |
| 🟡 Importante | 0 pendientes / 2 resueltos |
| 🟢 Sugerencia | 1 pendiente |

## Próximos pasos recomendados
1. Agregar tests de integración para órdenes, SSE y pendientes.
2. Mantener una segunda pasada de auditoría si cambia el flujo de tickets SSE o la política de expiración de sesión.
