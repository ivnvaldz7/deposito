# Feature: ADMIN AUTH — FASE 1B — Matriz de permisos

> Antes de trabajar esta funcionalidad, leer este documento, `.agents/current.md` y la guía del rol aplicable.

## Alcance

Definir formalmente el modelo de autorización **USUARIO → APP → ROL → PERMISO** para la plataforma, basado exclusivamente en el código vigente. No se implementa código, no se toca Prisma, no se crean migraciones, no se modifica frontend y no se generan commits.

Esta fase cierra la arquitectura de autorización que FASE 1A dejó operativa en:

- usuarios internos
- sesiones persistentes y revocación
- password temporal
- cambio obligatorio de contraseña
- reset por admin
- auditoría administrativa

## No objetivos

- No modificar archivos fuente.
- No crear/alterar tablas `Permission`, `RolePermission`, `AppRole` ni campos en Prisma.
- No generar migraciones.
- No tocar componentes React ni stores.
- No realizar refactor masivo de rutas.
- No commit ni push.

## Restricciones

- Todo permiso debe derivarse de una ruta/operación real verificada en el backend.
- La fuente única de la matriz debe residir en `packages/platform-core`.
- `isPlatformAdmin` permanece como privilegio global separado (no se convierte en rol de `AppAccess`).
- La granularidad evita extremos: ni permisos mega-amplios (`pedidos.manage`) ni atómicos absurdos (`pedido.item.quantity.increment`).

## Nivel de riesgo

`alto`

- Justificación: redefine el modelo de autorización transversal a stock, pedidos, actas, usuarios y auditoría. Cambios futuros en este modelo impactan todos los módulos y pueden comprometer la seguridad de datos operativos.
- Riesgo alto requiere Reviewer independiente y Verify.

## Criterios de aceptación

- [ ] Catálogo de permisos por app derivado 100% del código actual.
- [ ] Matriz completa rol → permisos acordada y documentada.
- [ ] Decisiones explícitas sobre `isPlatformAdmin`, ownership y fuente única.
- [ ] API propuesta para helpers compartidos (backend + frontend).
- [ ] Plan de migración incremental por módulos.
- [ ] Inventario de excepciones/hardcodes actuales clasificado.
- [ ] Tests necesarios identificados.

## Plan de implementación

Ver sección "J. Plan de migración incremental".

## Evidencia de implementación

| Cambio | Archivo/ruta | Evidencia |
|---|---|---|
| Plan FASE 1B | `docs/features/ADMIN-AUTH-FASE-1B.md` | Este documento |

## Evidencia de pruebas

| Criterio | Test/comando | Resultado |
|---|---|---|
| Por definir en FASE 1B.1 BUILD | — | — |

## Evidencia de verificación

| Verificación | Evidencia | Resultado |
|---|---|---|
| Matriz revisada contra rutas reales | Este documento | En revisión |

## Estado e historial

- Estado actual: `planificado`
- Historial:
  - 2026-08-20 — Planner — creado plan FASE 1B.

Estados válidos: `planificado` → `en-construcción` → `en-prueba` → `en-revisión` → `en-verificación` → `verificado` → `archivado`. Solo el archive SDD requerido puede pasar `verificado` a `archivado`; desde un estado activo: `bloqueado`.

## Bloqueos

- Ninguno.

---

# A. Catálogo final de permisos por app

Los permisos se nombran con el patrón `<recurso>.<acción>`. Cuando una acción implica sub-acciones relacionadas (ej. lotes dentro de stock), se anida un tercer nivel (`stock.lots.create`).

## A.1 Ale-Bet (logística)

| Permiso | Ruta/operación real que lo origina | Notas |
|---|---|---|
| `dashboard.read` | `GET /api/ale-bet/dashboard` | Todos los roles operativos. |
| `productos.read` | `GET /api/ale-bet/productos` y `/productos/search` | Lectura de catálogo + stock agregado. |
| `productos.manage` | `POST/PUT/DELETE /api/ale-bet/productos` | ABM de productos base. |
| `stock.read` | `GET /api/ale-bet/stock` y `/stock/movimientos` | Stock global + movimientos recientes. |
| `stock.read.archived` | Query `includeArchived=true` en `/stock` y `/productos/:id/stock` | Solo admin/encargado pueden ver lotes inactivos. |
| `stock.transfer` | `POST /api/ale-bet/stock/transferencias` | Transferencia manual entre ubicaciones. |
| `stock.lots.read` | `GET /api/ale-bet/productos/:id/lotes` | Vista de lotes por producto. |
| `stock.lots.create` | `POST /api/ale-bet/productos/:id/lotes` y `/productos/:id/stock/lotes` | Creación de lote (legacy y nuevo). |
| `stock.lots.adjust` | `PUT /api/ale-bet/productos/:id/lotes/:loteId` y `PATCH /productos/:id/stock/lotes/:loteId/ajuste` | Ajuste de cantidad. |
| `stock.history.read` | `GET /api/ale-bet/productos/:id/lotes/historial` | Historial por lote. |
| `clientes.read` | `GET /api/ale-bet/clientes` | Listado de clientes activos. |
| `clientes.create` | `POST /api/ale-bet/clientes` | Vendedor crea en estado `PENDIENTE_CLIENTE`; admin/facturación crean `VALIDADO`. |
| `clientes.update` | `PUT /api/ale-bet/clientes/:id` | Validación/edición. |
| `clientes.import` | `POST /api/ale-bet/clientes/import` | Importación masiva. |
| `transportistas.read` | `GET /api/ale-bet/transportistas` | Transportistas activos. |
| `transportistas.manage` | `POST/PATCH /api/ale-bet/transportistas` | ABM transportistas. |
| `pedidos.read` | `GET /api/ale-bet/pedidos` y `GET /pedidos/:id` | Lectura; se combina con reglas de ownership para vendedores. |
| `pedidos.create` | `POST /api/ale-bet/pedidos` | Crear borrador. |
| `pedidos.edit` | `PATCH /api/ale-bet/pedidos/:id` | Editar borrador/aprobado. |
| `pedidos.approve` | `PUT /api/ale-bet/pedidos/:id/aprobar` | Aprobar borrador con disponibilidad. |
| `pedidos.take` | `PUT /api/ale-bet/pedidos/:id/tomar` | Tomar pedido APROBADO → EN_ARMADO. |
| `pedidos.prepare` | `PUT /api/ale-bet/pedidos/:id/preparar` | Marcar pedido PREPARADO. |
| `pedidos.complete_items` | `PUT /api/ale-bet/pedidos/:id/items/:itemId/completar` | Completar/descompletar ítem. |
| `pedidos.dispatch` | `POST /api/ale-bet/pedidos/:id/despachar` | Despachar pedido PREPARADO. |
| `pedidos.cancel` | `PUT /api/ale-bet/pedidos/:id/cancelar` | Cancelar/directo o solicitar cancelación. |
| `pedidos.confirm_cancel` | `PUT /api/ale-bet/pedidos/:id/confirmar-cancelacion` | Confirmar cancelación EN_ARMADO. |
| `pedidos.availability.read` | `GET /api/ale-bet/pedidos/:id/disponibilidad-stock` | Consultar disponibilidad previa a aprobar. |
| `remitos.create` | `POST /api/ale-bet/pedidos/:id/remitos` | Emitir remito vigente. |
| `remitos.void` | `PUT /api/ale-bet/pedidos/:id/remitos/:remitoId/anular` | Invalidar remito. |
| `remitos.read.pdf` | `GET /api/ale-bet/pedidos/:id/remito.pdf` | Descargar PDF; con restricción de ownership para vendedores. |
| `facturacion.read` | `GET /api/ale-bet/facturacion/ventas` | Reporte de ventas JSON. |
| `facturacion.export.pdf` | `GET /api/ale-bet/facturacion/ventas/pdf` | Exportación PDF de ventas. |
| `historial.read` | `GET /api/ale-bet/historial` | Listado con filtros. |
| `historial.export` | `GET /api/ale-bet/historial/export` | Excel de historial. |
| `notificaciones.stream` | `GET /api/ale-bet/notificaciones/stream` | Conexión SSE. |

## A.2 Depósito

| Permiso | Ruta/operación real que lo origina | Notas |
|---|---|---|
| `dashboard.read` | `GET /api/deposito/dashboard/stats` | Resumen de inventario. |
| `drogas.read` | `GET /api/deposito/drogas` | Inventario de drogas. |
| `drogas.read.por_vencer` | `GET /api/deposito/drogas/por-vencer` | Drogas próximas a vencer. |
| `estuches.read` | `GET /api/deposito/estuches` | Inventario de estuches. |
| `estuches.manage` | `POST/PUT/DELETE /api/deposito/estuches` | ABM estuches. |
| `etiquetas.read` | `GET /api/deposito/etiquetas` | Inventario de etiquetas. |
| `etiquetas.manage` | `POST/PUT/DELETE /api/deposito/etiquetas` | ABM etiquetas. |
| `frascos.read` | `GET /api/deposito/frascos` | Inventario de frascos. |
| `frascos.manage` | `POST/PUT/DELETE /api/deposito/frascos` | ABM frascos. |
| `actas.read` | `GET /api/deposito/actas` y `/actas/:id` | Listado y detalle de actas. |
| `actas.create` | `POST /api/deposito/actas` | Crear acta. |
| `actas.items.add` | `POST /api/deposito/actas/:id/items` | Agregar ítem a acta. |
| `actas.items.quality_approve` | `PUT /api/deposito/actas/:id/items/:itemId/aprobar-calidad` | Aprobar calidad. |
| `actas.items.distribute` | `POST /api/deposito/actas/:id/items/:itemId/distribuir` | Distribuir ítem a inventario. |
| `ingresos.create` | `POST /api/deposito/ingresos` | Ingreso directo completado automáticamente. |
| `movimientos.read` | `GET /api/deposito/movimientos` | Historial de movimientos con filtros. |
| `pendientes.read` | `GET /api/deposito/pendientes` | Insumos pendientes. |
| `pendientes.manage` | `POST/PUT/PUT recibir /api/deposito/pendientes` | Gestión de pendientes. |
| `ordenes.read` | `GET /api/deposito/ordenes` y `/ordenes/:id` | Lectura; solicitante ve solo propias. |
| `ordenes.create` | `POST /api/deposito/ordenes` | Crear orden de producción. |
| `ordenes.approve` | `PUT /api/deposito/ordenes/:id/aprobar` | Aprobar orden. |
| `ordenes.execute` | `POST /api/deposito/ordenes/:id/ejecutar` | Ejecutar orden (descuento de stock). |
| `ordenes.reject` | `PUT /api/deposito/ordenes/:id/rechazar` | Rechazar orden. |
| `ordenes.complete` | `PUT /api/deposito/ordenes/:id/completar` | Completar orden ejecutada. |
| `productos_catalogo.read` | `GET /api/deposito/productos` y `/productos/:id` | Catálogo maestro. |
| `productos_catalogo.manage` | `POST/PATCH/DELETE /api/deposito/productos` y transiciones de estado | ABM + activar/desactivar/reactivar. |
| `productos_catalogo.import` | `POST /api/deposito/productos/importaciones/dry-run` y `/confirmar` | Importación masiva. |
| `metricas.read` | `GET /api/deposito/metricas` | Resumen de métricas. |
| `metricas.export.pdf` | `GET /api/deposito/metricas/exportar-pdf` | PDF de métricas. |
| `metricas.productos.read` | `GET /api/deposito/metricas/productos` | Autocomplete de productos para filtros. |
| `lotes.read.next` | `GET /api/deposito/lotes/siguiente` | Próximo número de lote. |
| `importaciones_iniciales.create` | `POST /api/deposito/importaciones/estuches-inicial` | Importación inicial legacy. |
| `eventos.stream` | `POST /api/deposito/events/auth` + `GET /events?ticket=...` | Conexión SSE. |
| `usuarios_deposito.read` | `GET /api/deposito/users` | Usuarios legacy del módulo Depósito. |
| `usuarios_deposito.manage` | `PUT/DELETE /api/deposito/users/:id` | Editar/eliminar usuarios legacy. |

## A.3 Admin / Platform

Admin no es una app operativa con roles varios; todas sus rutas requieren `isPlatformAdmin` en el token y revalidación contra DB.

| Permiso conceptual | Operación real | Notas |
|---|---|---|
| `platform_admin` | Todas las rutas bajo `/api/admin/*` | Gate global. |
| `users.read` | `GET /api/admin/` | Listar `PlatformUser`. |
| `users.create` | `POST /api/admin/` | Crear usuario interno. |
| `users.access.grant` | `POST /api/admin/` y `PUT /api/admin/:id/access` | Crear o actualizar `AppAccess`. |
| `users.access.revoke` | `DELETE /api/admin/:id/access/:app` | Eliminar `AppAccess`. |
| `users.access.role_change` | `PUT /api/admin/:id/access` | Cambiar rol de app. |
| `users.access.enable_disable` | `PUT /api/admin/:id/access` | Activar/desactivar acceso. |
| `users.disable` | `PUT /api/admin/:id/status` | Desactivar usuario global. |
| `users.password.reset` | `POST /api/admin/:id/reset-password` | Reset de password temporal. |
| `users.audit.read` | (por agregar) | Lectura de `PlatformAuditoria`. |

---

# B. Matriz rol → permisos

## B.1 Ale-Bet

| Permiso | admin | encargado | vendedor | armador | facturacion | observador |
|---|---|---|---|---|---|---|
| `dashboard.read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `productos.read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `productos.manage` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `stock.read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `stock.read.archived` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `stock.transfer` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `stock.lots.read` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `stock.lots.create` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `stock.lots.adjust` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `stock.history.read` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `clientes.read` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `clientes.create` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| `clientes.update` | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `clientes.import` | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `transportistas.read` | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `transportistas.manage` | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `pedidos.read` | ✅ | ✅ | ✅* | ✅ | ✅ | ✅ |
| `pedidos.create` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `pedidos.edit` | ✅ | ❌ | ✅* | ❌ | ❌ | ❌ |
| `pedidos.approve` | ✅ | ❌ | ✅* | ❌ | ❌ | ❌ |
| `pedidos.take` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `pedidos.prepare` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `pedidos.complete_items` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `pedidos.dispatch` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `pedidos.cancel` | ✅ | ❌ | ✅* | ❌ | ❌ | ❌ |
| `pedidos.confirm_cancel` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `pedidos.availability.read` | ✅ | ❌ | ✅* | ❌ | ❌ | ❌ |
| `remitos.create` | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `remitos.void` | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `remitos.read.pdf` | ✅ | ✅ | ✅* | ✅ | ✅ | ✅ |
| `facturacion.read` | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `facturacion.export.pdf` | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `historial.read` | ✅ | ✅ | ✅* | ✅ | ✅ | ✅ |
| `historial.export` | ✅ | ✅ | ✅* | ✅ | ✅ | ✅ |
| `notificaciones.stream` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |

`*` Aplican reglas de ownership documentadas en sección L.

### Justificación por rol Ale-Bet

- **admin**: full grants. No confundir con `isPlatformAdmin`.
- **encargado**: operaciones logísticas amplias sin venta/facturación. Puede gestionar stock, lotes, transferencias, tomar/preparar/despachar pedidos, confirmar cancelaciones. No crea pedidos ni clientes ni remitos de facturación.
- **vendedor**: consulta stock/productos/clientes, crea y gestiona sus borradores/pedidos, puede aprobar los propios según flujo vigente, cancela los propios, ve su historial. No toca stock físico ni remitos.
- **armador**: toma pedidos aprobados, prepara, completa ítems, despacha, confirma cancelaciones. Solo puede actuar sobre pedidos que le fueron asignados (ownership). No crea pedidos ni clientes.
- **facturacion**: emite/anula remitos, gestiona transportistas, reportes de ventas, importa/actualiza clientes. No prepara pedidos ni gestiona stock.
- **observador**: lectura exclusiva. No recibe notificaciones SSE operativas.

## B.2 Depósito

| Permiso | encargado | observador | solicitante |
|---|---|---|---|
| `dashboard.read` | ✅ | ✅ | ✅ |
| `drogas.read` | ✅ | ✅ | ✅ |
| `drogas.read.por_vencer` | ✅ | ✅ | ✅ |
| `estuches.read` | ✅ | ✅ | ✅ |
| `estuches.manage` | ✅ | ❌ | ❌ |
| `etiquetas.read` | ✅ | ✅ | ✅ |
| `etiquetas.manage` | ✅ | ❌ | ❌ |
| `frascos.read` | ✅ | ✅ | ✅ |
| `frascos.manage` | ✅ | ❌ | ❌ |
| `actas.read` | ✅ | ✅ | ✅ |
| `actas.create` | ✅ | ❌ | ❌ |
| `actas.items.add` | ✅ | ❌ | ❌ |
| `actas.items.quality_approve` | ✅ | ❌ | ❌ |
| `actas.items.distribute` | ✅ | ❌ | ❌ |
| `ingresos.create` | ✅ | ❌ | ❌ |
| `movimientos.read` | ✅ | ✅ | ✅ |
| `pendientes.read` | ✅ | ✅ | ✅ |
| `pendientes.manage` | ✅ | ❌ | ❌ |
| `ordenes.read` | ✅ | ✅ | ✅* |
| `ordenes.create` | ✅ | ❌ | ✅ |
| `ordenes.approve` | ✅ | ❌ | ❌ |
| `ordenes.execute` | ✅ | ❌ | ❌ |
| `ordenes.reject` | ✅ | ❌ | ❌ |
| `ordenes.complete` | ✅ | ❌ | ❌ |
| `productos_catalogo.read` | ✅ | ✅ | ✅ |
| `productos_catalogo.manage` | ✅ | ❌ | ❌ |
| `productos_catalogo.import` | ✅ | ❌ | ❌ |
| `metricas.read` | ✅ | ✅ | ❌ |
| `metricas.export.pdf` | ✅ | ✅ | ❌ |
| `metricas.productos.read` | ✅ | ✅ | ✅ |
| `lotes.read.next` | ✅ | ✅ | ✅ |
| `importaciones_iniciales.create` | ✅ | ❌ | ❌ |
| `eventos.stream` | ✅ | ✅ | ✅ |
| `usuarios_deposito.read` | ✅ | ❌ | ❌ |
| `usuarios_deposito.manage` | ✅ | ❌ | ❌ |

`*` Solicitante ve solo sus órdenes en lectura.

### Justificación por rol Depósito

- **encargado**: full grants del módulo. Crea actas, ingresos, gestiona inventario, aprueba/ejecuta/rechaza/completa órdenes, administra catálogo, métricas, usuarios legacy.
- **observador**: lectura en todo el módulo, incluyendo métricas.
- **solicitante**: crea órdenes de producción y consulta estado de las propias. No modifica inventario ni actas.

## B.3 Admin / Platform

| Permiso conceptual | Platform Admin |
|---|---|
| `platform_admin` (gate global) | ✅ |
| `users.read` | ✅ |
| `users.create` | ✅ |
| `users.access.grant` | ✅ |
| `users.access.revoke` | ✅ |
| `users.access.role_change` | ✅ |
| `users.access.enable_disable` | ✅ |
| `users.disable` | ✅ |
| `users.password.reset` | ✅ |
| `users.audit.read` | ✅ |

---

# C. Conflictos encontrados

## C.1 Ale-Bet

1. **`encargado` puede tomar/preparar/despachar pedidos** (`requireApp('ale-bet', ['admin', 'armador', 'encargado'])`).
   - El frontend `canTomar`, `canPreparar`, `canDespachar` solo considera `admin` y `armador`.
   - **Discrepancia**: el backend permite acciones que el frontend oculta. Decisión: homologar. Se recomienda mantener backend y ajustar frontend para que `encargado` vea la barra de armador.

2. **`encargado` en stock/productos**: backend permite crear/ajustar lotes y transferir stock; frontend solo muestra Stock si `rol === 'admin' || rol === 'encargado'`.
   - Coherente. No hay conflicto.

3. **`facturacion` no está en notificaciones SSE** (`/notificaciones/stream` requiere `['admin', 'vendedor', 'armador', 'encargado']`).
   - Si facturación emite remitos, podría necesitar notificaciones. Decisión pendiente.

4. **Remito PDF**: backend `canReadRemitoPdf` restringe a vendedores propietarios; otros roles ven todos. El frontend no aplica control adicional.
   - Coherente con matriz.

5. **`observador` puede conectarse a SSE** según backend actual (no está en allowed roles). Decisión: mantener observador fuera de SSE operativo.

## C.2 Depósito

1. **No existe rol `admin` en Depósito** (`APP_ROLES` y Prisma `Role` enum solo tienen `encargado/observador/solicitante`).
   - El frontend `Sidebar.tsx` usa fallback `'Operador'` para roles no conocidos. No hay rutas que requieran `admin`.
   - **Inconsistencia tolerable**: ninguna.

2. **`ingresos.create` vs `actas.create`**:
   - `ingresos.ts` crea un acta completada automáticamente; `actas.ts` crea acta pendiente.
   - Son permisos distintos porque representan capacidades de negocio distintas.

3. **`metricas.read` permite `observador` pero `eventos.stream` permite a todos**:
   - Coherente: observador lee métricas; SSE es transversal de notificaciones.

## C.3 Admin

1. **Admin UI (`AppAccessPanel`) usa defaults `encargado` y `vendedor`** para Depósito y Ale-Bet respectivamente.
   - Son defaults de UX, no reglas de negocio. El backend valida con `isValidAppRole`.

2. **La app `admin` tiene rol `admin` en `APP_ROLES`**, pero no se usa operativamente; todo depende de `isPlatformAdmin`.
   - Decisión: no expandir roles dentro de app `admin`; mantener `admin` como placeholder.

## C.4 Cross-app

1. **`isPlatformAdmin` vs `admin` de Ale-Bet**:
   - Son privilegios distintos. Un `admin` de Ale-Bet no es Platform Admin automáticamente.
   - El frontend `AdminRoute.tsx` solo verifica `isPlatformAdmin`. Correcto.

2. **`portal` con rol `viewer`**:
   - Existe en `APP_ROLES` y en `bootstrap` para el superadmin, pero no hay rutas ni UI.
   - **Inconsistencia**: rol/app muerto. Decisión: mantener en catálogo por compatibilidad del schema; no asignar permisos operativos.

---

# D. Roles legacy / inconsistentes

| Rol/estructura | Ubicación | Estado | Recomendación |
|---|---|---|---|
| `deposito.User.role` enum `encargado/observador/solicitante` | `packages/db/prisma/schema.prisma` | Legacy activo | A largo plazo migrar a `AppAccess` de platform y deprecar `deposito.User`. No en FASE 1B. |
| `portal.viewer` | `packages/platform-core/src/users/roles.ts`, `bootstrap/index.ts` | App sin rutas ni UI | Mantener como app fantasma; no asignar permisos hasta que exista funcionalidad. |
| Rol `admin` dentro de app `admin` | `APP_ROLES.admin: ['admin']` | Placeholder | No agregar permisos operativos; todo admin se gobierna por `isPlatformAdmin`. |
| `canGestionarStock`, `canAprobar`, `canEmitirRemito`, etc. | `apps/platform/client/src/modules/ale-bet/lib/estados.ts` | Hardcodes UX | Migrar a helper `can(user, app, permission)` en FASE 1B.2. |
| `canSeeStock`, `canCreatePedido`, `canManageTransportistas` | `apps/platform/client/src/modules/ale-bet/components/Sidebar.tsx` | Hardcodes UX | Reemplazar por permisos del catálogo. |
| `isEncargado` en múltiples páginas de Depósito | `ActasPage`, `EtiquetasPage`, `EstuchesPage`, `FrascosPage`, `OrdenesPage`, `PendientesPage`, `ProductosPage`, `UsuariosPage` | Hardcodes UX | Reemplazar por `can(user, 'deposito', '<permiso>')`. |
| `actorRole(user) !== 'admin'` en pedidos.ts | `apps/platform/server/src/routes/ale-bet/pedidos.ts` | Hardcode backend | Reemplazar por check de permiso + ownership. |
| `role === 'vendedor'` en clientes.ts | `apps/platform/server/src/routes/ale-bet/clientes.ts` | Hardcode de regla de negocio | Mantener como regla de negocio (estado `PENDIENTE_CLIENTE`); separar de autorización. |

---

# E. Decisión sobre ownership

**Principio**: el ownership no se modela como permiso adicional. Se usa un permiso base de lectura/escritura y se aplica una regla de filtro/scope en el handler.

**Casos actuales**:

| App | Recurso | Regla de ownership actual | Mantener |
|---|---|---|---|
| Ale-Bet | Pedidos (lectura) | Vendedor ve solo sus pedidos en `GET /pedidos` y `GET /pedidos/:id` | Sí |
| Ale-Bet | Pedidos (mutación) | Solo el vendedor propietario o `admin` puede editar/aprobar/cancelar su propio pedido | Sí |
| Ale-Bet | Remito PDF | Vendedor solo descarga remito de pedidos propios; otros roles descargan cualquiera | Sí |
| Ale-Bet | Ítems de pedido | Solo el armador asignado puede completar/preparar; `admin` puede sobreescribir | Sí |
| Depósito | Órdenes | Solicitante ve solo sus órdenes; encargado ve todas | Sí |

**API propuesta**:

```ts
// ownership.ts en platform-core
export function ownsAleBetPedido(pedido: { vendedorId: string }, user: JwtPayload): boolean
export function isAssignedArmador(pedido: { armadorId: string | null }, user: JwtPayload): boolean
export function ownsDepositoOrden(orden: { solicitanteId: string }, user: JwtPayload): boolean
```

**Regla de combinación**:

```ts
if (!hasPermission(user, 'ale-bet', 'pedidos.read')) return 403
if (!canReadAll(user, 'ale-bet', 'pedidos') && !ownsAleBetPedido(pedido, user)) return 403
```

En FASE 1B no se introduce `pedidos.read.all` / `pedidos.read.own`. Si en el futuro aparece un rol que necesite ver todos los pedidos sin poder editarlos (ej. auditor externo), se evaluará entonces.

---

# F. Decisión sobre `isPlatformAdmin`

**Decisión**: se mantiene `isPlatformAdmin` como privilegio global separado en FASE 1B.

**Razonamiento**:

1. Es el gate de todas las rutas `/api/admin/*`.
2. No se representa como un `AppAccess` porque no opera sobre una app funcional con recursos propios.
3. Conceptualmente equivale a `admin.*` sobre todas las apps, pero no se materializa en la matriz de `AppAccess`.
4. Cambiarlo ahora implicaría tocar schema, JWT, middleware `requirePlatformAdmin`, Admin UI y bootstrap. Fuera de alcance.

**Mapeo conceptual**:

```ts
if (user.isPlatformAdmin) {
  // Equivalente a full grants en admin + posibilidad de gestionar usuarios/apps
}
```

**Auditoría**: todo cambio de `isPlatformAdmin` debe registrarse en `PlatformAuditoria` (acción nueva `PLATFORM_ADMIN_TOGGLED` propuesta).

---

# G. API propuesta para helpers compartidos

Ubicación: `packages/platform-core/src/auth/permissions.ts`

```ts
// ─── Tipos ──────────────────────────────────────────────────────────────────

export type AppPermissionKey = 'ale-bet' | 'deposito' | 'admin' | 'portal'

export type AleBetPermission =
  | 'dashboard.read'
  | 'productos.read' | 'productos.manage'
  | 'stock.read' | 'stock.read.archived' | 'stock.transfer'
  | 'stock.lots.read' | 'stock.lots.create' | 'stock.lots.adjust'
  | 'stock.history.read'
  | 'clientes.read' | 'clientes.create' | 'clientes.update' | 'clientes.import'
  | 'transportistas.read' | 'transportistas.manage'
  | 'pedidos.read' | 'pedidos.create' | 'pedidos.edit' | 'pedidos.approve'
  | 'pedidos.take' | 'pedidos.prepare' | 'pedidos.complete_items'
  | 'pedidos.dispatch' | 'pedidos.cancel' | 'pedidos.confirm_cancel'
  | 'pedidos.availability.read'
  | 'remitos.create' | 'remitos.void' | 'remitos.read.pdf'
  | 'facturacion.read' | 'facturacion.export.pdf'
  | 'historial.read' | 'historial.export'
  | 'notificaciones.stream'

export type DepositoPermission =
  | 'dashboard.read'
  | 'drogas.read' | 'drogas.read.por_vencer'
  | 'estuches.read' | 'estuches.manage'
  | 'etiquetas.read' | 'etiquetas.manage'
  | 'frascos.read' | 'frascos.manage'
  | 'actas.read' | 'actas.create' | 'actas.items.add'
  | 'actas.items.quality_approve' | 'actas.items.distribute'
  | 'ingresos.create'
  | 'movimientos.read'
  | 'pendientes.read' | 'pendientes.manage'
  | 'ordenes.read' | 'ordenes.create' | 'ordenes.approve'
  | 'ordenes.execute' | 'ordenes.reject' | 'ordenes.complete'
  | 'productos_catalogo.read' | 'productos_catalogo.manage' | 'productos_catalogo.import'
  | 'metricas.read' | 'metricas.export.pdf' | 'metricas.productos.read'
  | 'lotes.read.next'
  | 'importaciones_iniciales.create'
  | 'eventos.stream'
  | 'usuarios_deposito.read' | 'usuarios_deposito.manage'

export type AdminPermission =
  | 'platform_admin'
  | 'users.read' | 'users.create'
  | 'users.access.grant' | 'users.access.revoke' | 'users.access.role_change' | 'users.access.enable_disable'
  | 'users.disable' | 'users.password.reset' | 'users.audit.read'

export type Permission = AleBetPermission | DepositoPermission | AdminPermission

// ─── Catálogo ─────────────────────────────────────────────────────────────────

export const PERMISSIONS: Record<AppPermissionKey, readonly string[]> = {
  'ale-bet': [...] as const,
  deposito: [...] as const,
  admin: [...] as const,
  portal: [],
}

// ─── Matriz ───────────────────────────────────────────────────────────────────

export const ROLE_PERMISSIONS: {
  [K in AppPermissionKey]: Record<string, readonly Permission[]>
} = {
  'ale-bet': {
    admin: [...],
    encargado: [...],
    vendedor: [...],
    armador: [...],
    facturacion: [...],
    observador: [...],
  },
  deposito: {
    encargado: [...],
    observador: [...],
    solicitante: [...],
  },
  admin: {
    admin: ['platform_admin', ...],
  },
  portal: {
    viewer: [],
  },
}

// ─── Helpers puros ────────────────────────────────────────────────────────────

export function isValidPermission(app: string, permission: string): boolean
export function roleHasPermission(app: string, role: string, permission: Permission): boolean
export function getRolePermissions(app: string, role: string): Permission[]
export function hasPermission(
  user: JwtPayload | null | undefined,
  app: AppPermissionKey,
  permission: Permission,
): boolean
export function hasAnyPermission(
  user: JwtPayload | null | undefined,
  app: AppPermissionKey,
  permissions: Permission[],
): boolean
export function hasAllPermissions(
  user: JwtPayload | null | undefined,
  app: AppPermissionKey,
  permissions: Permission[],
): boolean
```

**Notas de diseño**:

- `portal` tiene catálogo vacío hasta que se defina funcionalidad.
- `admin` solo tiene rol `admin` con permisos de plataforma.
- Los helpers no dependen de Prisma; son puros y testeables unitariamente.

---

# H. Middleware backend propuesto

Ubicación: `apps/platform/server/src/middlewares/require-permission.ts`

```ts
import { hasPermission, type Permission, type AppPermissionKey } from '@platform/core'
import type { Request, Response, NextFunction } from 'express'

export function requirePermission(app: AppPermissionKey, permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice('Bearer '.length).trim()
      : null

    if (!token) {
      res.status(401).json({ error: 'Token requerido' })
      return
    }

    const payload = verifyAccessToken(token)
    if (!payload) {
      res.status(401).json({ error: 'Token inválido o expirado' })
      return
    }

    if (!hasPermission(payload, app, permission)) {
      res.status(403).json({ error: 'Permiso insuficiente' })
      return
    }

    req.user = payload
    next()
  }
}
```

**Compatibilidad con `requireApp`**:

```ts
// requireApp sigue funcionando como wrapper de permisos + lista de roles legacy
export function requireApp(app: string, roles?: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // ...verifica token y app access...
    if (roles && roles.length > 0 && !roles.includes(appAccess.rol)) {
      res.status(403).json({ error: 'Rol insuficiente para esta acción' })
      return
    }
    req.user = payload
    next()
  }
}
```

Durante la migración se pueden combinar:

```ts
router.post('/transferencias',
  requireApp('ale-bet'), // valida acceso a app
  requirePermission('ale-bet', 'stock.transfer'), // valida permiso específico
  handler
)
```

Una vez migrado todo, `requireApp` puede reducirse a solo validar acceso activo a la app.

---

# I. Helper / hook frontend propuesto

Ubicación: `apps/platform/client/src/lib/permissions.ts` (importa desde `@platform/core` si está expuesto, o duplica tipos con fuente única en core).

```ts
import { hasPermission, type Permission, type AppPermissionKey } from '@platform/core'
import { useAuthStore } from '@/stores/auth-store'

export function can(
  user: ReturnType<typeof useAuthStore.getState>['user'],
  app: AppPermissionKey,
  permission: Permission,
): boolean {
  if (!user) return false
  return hasPermission(
    {
      sub: user.sub,
      email: user.email,
      name: user.name,
      isPlatformAdmin: user.isPlatformAdmin,
      apps: user.apps,
    },
    app,
    permission,
  )
}

export function useCan(app: AppPermissionKey, permission: Permission): boolean {
  const user = useAuthStore((s) => s.user)
  return can(user, app, permission)
}
```

**Ejemplos de reemplazo**:

```tsx
// Antes (Sidebar Ale-Bet)
const canSeeStock = (rol) => rol === 'admin' || rol === 'encargado'

// Después
const canSeeStock = useCan('ale-bet', 'stock.read')
```

```tsx
// Antes (estados.ts)
export function canGestionarStock(rol) { return rol === 'admin' || rol === 'encargado' }

// Después
export function canGestionarStock(user) { return can(user, 'ale-bet', 'stock.lots.create') }
```

---

# J. Plan de migración incremental

## FASE 1B.1 — Catálogo + helpers + rutas críticas

1. Crear `packages/platform-core/src/auth/permissions.ts` con catálogo, matriz y helpers.
2. Exportar desde `packages/platform-core/src/index.ts`.
3. Crear `apps/platform/server/src/middlewares/require-permission.ts`.
4. Migrar rutas críticas de Ale-Bet a `requirePermission`:
   - `POST /stock/transferencias` → `stock.transfer`
   - `POST/PUT/DELETE /productos` → `productos.manage`
   - `POST/PUT /productos/:id/lotes` y ajustes → `stock.lots.*`
   - `GET /productos/:id/lotes/historial` → `stock.history.read`
   - `POST/PUT /transportistas` → `transportistas.manage`
   - `POST/PUT /pedidos/:id/remitos` y anular → `remitos.*`
   - `GET/POST /facturacion/ventas` → `facturacion.*`
5. Migrar rutas críticas de Depósito:
   - `POST /actas`, `/actas/:id/items/*`, `/ingresos` → `actas.*`, `ingresos.create`
   - `POST/PUT/DELETE /productos` → `productos_catalogo.manage`
   - `POST /ordenes/:id/ejecutar` → `ordenes.execute`
6. Migrar Admin UI para que use helpers de permisos en lugar de `isPlatformAdmin` directo donde corresponda.
7. Tests unitarios de helpers y tests de middleware.

## FASE 1B.2 — Migración módulo por módulo

**Orden recomendado** (del más aislado al más acoplado):

1. **Admin** (rutas `/api/admin/*` y UI): reemplazar checks de `isPlatformAdmin` por `requirePermission('admin', '...')`.
2. **Ale-Bet stock/productos**: completar migración de todos los endpoints de stock y productos.
3. **Ale-Bet pedidos**: migrar acciones de pedidos (`take`, `prepare`, `dispatch`, etc.) combinando permisos + ownership.
4. **Ale-Bet clientes/transportistas/remitos/facturación/historial**.
5. **Depósito catálogo e inventarios** (drogas, estuches, etiquetas, frascos).
6. **Depósito actas, órdenes, pendientes, métricas**.
7. **Depósito usuarios legacy**: deprecar `deposito/users` o migrar a admin.
8. **Frontend general**: reemplazar todos los `role === ...` por `useCan`/`can`.

## FASE 1B.3 — Limpieza

1. Revisar que `requireApp` ya no reciba listas de roles; solo valide app activa.
2. Eliminar `canGestionarStock`, `canAprobar`, etc., del frontend si ya no se usan.
3. Documentar matriz final y actualizar `.agents/current.md`.

---

# K. Archivos / áreas que tocaría Build

## Backend

- `packages/platform-core/src/auth/permissions.ts` (nuevo)
- `packages/platform-core/src/index.ts` (exportar helpers)
- `apps/platform/server/src/middlewares/require-permission.ts` (nuevo)
- `apps/platform/server/src/middlewares/require-app.ts` (compatibilidad)
- `apps/platform/server/src/routes/ale-bet/pedidos.ts`
- `apps/platform/server/src/routes/ale-bet/productos.ts`
- `apps/platform/server/src/routes/ale-bet/stock.ts`
- `apps/platform/server/src/routes/ale-bet/clientes.ts`
- `apps/platform/server/src/routes/ale-bet/transportistas.ts`
- `apps/platform/server/src/routes/ale-bet/remitos.ts`
- `apps/platform/server/src/routes/ale-bet/facturacion.ts`
- `apps/platform/server/src/routes/ale-bet/historial.ts`
- `apps/platform/server/src/routes/ale-bet/notificaciones.ts`
- `apps/platform/server/src/deposito/routes/actas.ts`
- `apps/platform/server/src/deposito/routes/ingresos.ts`
- `apps/platform/server/src/deposito/routes/ordenes.ts`
- `apps/platform/server/src/deposito/routes/productos.ts`
- `apps/platform/server/src/deposito/routes/pendientes.ts`
- `apps/platform/server/src/deposito/routes/frascos.ts`
- `apps/platform/server/src/deposito/routes/shared/mercado-inventory-helpers.ts`
- `apps/platform/server/src/deposito/routes/metricas.ts`
- `apps/platform/server/src/deposito/routes/users.ts` (legacy)
- `apps/platform/server/src/routes/admin/users.ts` (auditoría de permisos)

## Frontend

- `apps/platform/client/src/lib/permissions.ts` (nuevo)
- `apps/platform/client/src/modules/ale-bet/components/Sidebar.tsx`
- `apps/platform/client/src/modules/ale-bet/lib/estados.ts`
- `apps/platform/client/src/modules/ale-bet/pages/PedidoDetailPage.tsx`
- `apps/platform/client/src/modules/ale-bet/pages/ClientesPage.tsx`
- `apps/platform/client/src/modules/ale-bet/pages/DashboardPage.tsx`
- `apps/platform/client/src/modules/ale-bet/pages/HistorialPage.tsx`
- `apps/platform/client/src/modules/deposito/components/layout/Sidebar.tsx`
- `apps/platform/client/src/modules/deposito/pages/ActasPage.tsx`
- `apps/platform/client/src/modules/deposito/pages/EtiquetasPage.tsx`
- `apps/platform/client/src/modules/deposito/pages/EstuchesPage.tsx`
- `apps/platform/client/src/modules/deposito/pages/FrascosPage.tsx`
- `apps/platform/client/src/modules/deposito/pages/OrdenesPage.tsx`
- `apps/platform/client/src/modules/deposito/pages/PendientesPage.tsx`
- `apps/platform/client/src/modules/deposito/pages/ProductosPage.tsx`
- `apps/platform/client/src/modules/deposito/pages/UsuariosPage.tsx`
- `apps/platform/client/src/components/guards/AdminRoute.tsx`

## Tests

- `packages/platform-core/src/auth/permissions.test.ts` (nuevo)
- `apps/platform/server/src/__tests__/require-permission.test.ts` (nuevo)
- Tests de rutas migradas (uno por módulo).

---

# L. Tests necesarios

## L.1 Unitarios

1. **Helpers de `permissions.ts`**:
   - `roleHasPermission` devuelve `true` para cada permiso esperado de cada rol.
   - `roleHasPermission` devuelve `false` para permisos no asignados.
   - `hasPermission` funciona con JWT realista.
   - `hasPermission` devuelve `false` si el acceso a la app está inactivo.
   - `isValidPermission` rechaza permisos inexistentes.

2. **Ownership**:
   - `ownsAleBetPedido` devuelve `true` solo si `pedido.vendedorId === user.sub`.
   - `isAssignedArmador` devuelve `true` solo si `pedido.armadorId === user.sub`.
   - `ownsDepositoOrden` devuelve `true` solo si `orden.solicitanteId === user.sub`.

## L.2 Integración (backend)

1. **Middleware `requirePermission`**:
   - 401 sin token.
   - 403 con token válido pero sin permiso.
   - 200 con token válido y permiso correcto.

2. **Rutas críticas migradas** (al menos una por módulo):
   - `POST /api/ale-bet/stock/transferencias` rechaza vendedor/armador/observador.
   - `POST /api/ale-bet/productos` rechaza no-admin.
   - `POST /api/ale-bet/pedidos/:id/remitos` rechaza vendedor/encargado/armador.
   - `POST /api/deposito/ordenes/:id/ejecutar` rechaza solicitante/observador.
   - `POST /api/deposito/actas` rechaza observador/solicitante.
   - `POST /api/deposito/productos` rechaza observador/solicitante.

3. **Compatibilidad `requireApp`**:
   - Rutas que aún usan `requireApp(...roles)` siguen funcionando igual.

4. **Ownership**:
   - Vendedor no puede ver pedido de otro vendedor (`GET /pedidos/:id`).
   - Armador no puede preparar pedido no asignado.
   - Solicitante no puede ver orden de otro solicitante.

## L.3 Componentes (frontend)

1. **Hook `useCan`**:
   - Renderiza UI según permiso.
   - No renderiza acciones sin permiso.

2. **Sidebar Ale-Bet**:
   - Vendedor no ve Stock ni Transportistas.
   - Admin/encargado ven Stock.
   - Admin/facturación ven Transportistas.

3. **Sidebar Depósito**:
   - Observador ve todo el menú de lectura.
   - Solicitante no ve Métricas.
   - Encargado ve Métricas.

## L.4 Auditoría

1. Verificar que `APP_ACCESS_ROLE_CHANGED` se registra al cambiar rol.
2. Verificar que `APP_ACCESS_GRANTED`/`APP_ACCESS_REVOKED` se registran.
3. Proponer test para nuevo evento `PLATFORM_ADMIN_TOGGLED` si se implementa.

---

# M. Reglas de lectura vs escritura

**Regla**: un permiso de escritura nunca implica visibilidad. Todos los roles que necesiten consultar datos generales deben tener el permiso de lectura correspondiente.

| Recurso | Lectura | Escritura/gestión | Roles con lectura |
|---|---|---|---|
| Productos Ale-Bet | `productos.read` | `productos.manage` | Todos |
| Stock Ale-Bet | `stock.read` | `stock.transfer`, `stock.lots.*` | Todos |
| Clientes Ale-Bet | `clientes.read` | `clientes.create/update/import` | Todos excepto armador |
| Pedidos Ale-Bet | `pedidos.read` | `pedidos.*` mutaciones | Todos |
| Transportistas Ale-Bet | `transportistas.read` | `transportistas.manage` | admin, facturacion |
| Remitos Ale-Bet | `remitos.read.pdf` | `remitos.create/void` | Todos (con ownership) |
| Facturación Ale-Bet | `facturacion.read` | `facturacion.export.pdf` | admin, facturacion |
| Historial Ale-Bet | `historial.read` | `historial.export` | Todos |
| Inventarios Depósito | `drogas/estuches/etiquetas/frascos.read` | `*.manage` | Todos |
| Actas Depósito | `actas.read` | `actas.create`, `actas.items.*` | Todos |
| Órdenes Depósito | `ordenes.read` | `ordenes.*` mutaciones | Todos |
| Productos catálogo Depósito | `productos_catalogo.read` | `productos_catalogo.manage/import` | Todos |
| Métricas Depósito | `metricas.read` | `metricas.export.pdf` | encargado, observador |

---

# N. Auditoría de autorización

Eventos que merecen auditoría en `PlatformAuditoria`:

| Evento | Acción propuesta | Prioridad |
|---|---|---|
| Cambio de rol de AppAccess | `APP_ACCESS_ROLE_CHANGED` (ya existe) | Alta |
| Grant de acceso a app | `APP_ACCESS_GRANTED` (ya existe) | Alta |
| Revoke de acceso a app | `APP_ACCESS_REVOKED` (ya existe) | Alta |
| Habilitar/deshabilitar acceso | `APP_ACCESS_ENABLED` / `APP_ACCESS_DISABLED` (ya existen) | Alta |
| Cambio de `isPlatformAdmin` | `PLATFORM_ADMIN_TOGGLED` (nueva) | Alta |
| Intento de acción prohibida | No loguear cada 403 | — |
| Cambios en la matriz de permisos | No aplica en FASE 1B (catálogo en código) | — |
| Lectura de auditoría por admin | `AUDIT_READ` (nueva) | Media |

**Regla**: no loguear cada `403` por ruido. Solo auditar mutaciones de privilegios y eventos de seguridad explícitos.

---

# O. Notas finales para Build

1. No tocar `packages/db/prisma/schema.prisma` ni generar migraciones.
2. No duplicar la matriz en frontend: importar desde `@platform/core`.
3. Preservar `requireApp(...roles)` durante toda la FASE 1B.1.
4. Cada endpoint migrado debe tener al menos un test de 403.
5. Revisar que `encargado` de Ale-Bet tenga visibilidad de acciones de armador en frontend (discrepancia encontrada en C.1).
6. Documentar cualquier desviación de esta matriz en `.agents/current.md` al finalizar Verify.

---

**ADMIN AUTH FASE 1B — MATRIZ DE PERMISOS LISTA PARA DECISIÓN**
