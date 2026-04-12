# Auditoría: Órdenes de Producción

**Fecha:** 2026-04-06
**Auditor:** Codex
**Scope:** Backend y frontend de órdenes de producción (`server/src/routes/ordenes.ts`, `client/src/features/ordenes/`) con foco en lógica de estados, ejecución con descuento de inventario, permisos por rol y edge cases operativos.

---

## 🔴 Crítico (bugs, seguridad)
Issues que deben resolverse antes de seguir.

### Issue 1
- **Archivo:** `server/src/routes/ordenes.ts` y `server/prisma/schema.prisma`
- **Línea:** `ordenes.ts` ~247-256, `schema.prisma` ~172-180
- **Problema:** Al ejecutar una orden se crea un `Movimiento` con `referenciaId: orden.id`, pero en el schema Prisma `Movimiento.referenciaId` está modelado contra `ActaItem.id`. Eso deja la ejecución acoplada a una foreign key semánticamente incorrecta: si la FK se aplica, la transacción puede fallar al ejecutar una orden válida; si no se aplica, queda un movimiento apuntando a una entidad equivocada y la trazabilidad del egreso queda corrupta.
- **Fix sugerido:** Separar la referencia de movimientos de órdenes respecto de `ActaItem`, o dejar `referenciaId`/`tipoReferencia` modelados explícitamente para órdenes. Mientras exista la relación actual, no debería persistirse `orden.id` en un campo que Prisma interpreta como `ActaItem.id`.

### Issue 2
- **Archivo:** `server/src/routes/ordenes.ts`
- **Línea:** ~194-267 y ~298-309
- **Problema:** La ruta `PUT /api/ordenes/:id/rechazar` solo bloquea estados finales (`completada`, `rechazada`), así que una orden ya `ejecutada` todavía puede pasar a `rechazada`. Eso rompe la máquina de estados: la ejecución ya descontó stock y creó un movimiento de egreso, pero luego el estado final visible puede quedar como rechazado sin rollback ni movimiento compensatorio.
- **Fix sugerido:** Restringir `rechazar` a estados previos a la ejecución (`solicitada` y, si el negocio lo permite, `aprobada`) y cubrir con tests el caso “ejecutada -> rechazada”. La transición desde `ejecutada` debería devolver `409`.

---

## 🟡 Importante (refactor, performance)
No se detectaron hallazgos de esta severidad en el scope auditado.

Validaciones correctas observadas:
- `POST /api/auth/login` sigue pública y las rutas de órdenes usan permisos consistentes: creación para `solicitante`/`encargado`, acciones de aprobar/ejecutar/rechazar/completar solo para `encargado`.
- En frontend, `solicitante` puede crear pero no aprobar/ejecutar/rechazar/completar; `observador` no ve acciones ni botón de creación; `encargado` sí ve todas las acciones.
- Los edge cases pedidos quedaron bien cubiertos en backend para `stock 0`, ejecutar una orden ya ejecutada, rechazar sin motivo y aprobar una orden rechazada.

---

## 🟢 Sugerencia (mejoras menores)
Nice to have, no urgente.

### Issue 1
- **Archivo:** `server/src/routes/ordenes.ts` y `client/src/features/ordenes/ordenes-page.tsx`
- **Sugerencia:** Agregar tests de regresión para ciclo de vida y permisos. Este módulo ya concentra varias invariantes sensibles: visibilidad por rol, ownership de solicitante, validación de stock por categoría y transiciones `solicitada -> aprobada -> ejecutada -> completada/rechazada`. Una suite mínima de API/UI evitaría reabrir bugs en estados o permisos al seguir iterando el módulo.

---

## Resumen
| Severidad | Cantidad |
|-----------|----------|
| 🔴 Crítico | 2 |
| 🟡 Importante | 0 |
| 🟢 Sugerencia | 1 |

## Próximos pasos recomendados
1. Corregir la referencia de `Movimiento` creada al ejecutar una orden para que no use un campo modelado contra `ActaItem`.
2. Cerrar la transición inválida `ejecutada -> rechazada` y validar explícitamente qué estados pueden rechazarse.
3. Agregar tests de backend/frontend para permisos por rol y edge cases de órdenes antes de seguir ampliando el módulo.
