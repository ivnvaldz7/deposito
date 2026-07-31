# MVP-01 — Catálogo maestro de productos e importación

> **Estado:** `DESIGN_READY`
> **Riesgo:** `ALTO` — modifica catálogo, permisos, inventario y migraciones.
> **Próximo rol:** `BUILDER`

Esta feature define el catálogo maestro de Depósito. No autoriza por sí sola implementación, migraciones, tests, UI, commits ni push.

## Decisión funcional congelada

`DepositoProducto` evoluciona como único catálogo maestro de Depósito; no se crea otro catálogo. Sus categorías Prisma siguen siendo `droga`, `estuche`, `etiqueta` y `frasco`; en UI, `droga` se muestra como **Materia Prima (MP)**. Ale-Bet permanece separado. Las cajas de embalaje, la carga de stock real y los ajustes de stock quedan fuera de MVP-01.

| Categoría | Catálogo | Mercado | Inventario al activar |
|---|---|---|---|
| `etiqueta` | código, nombre, presentación y mercados habilitados | Uno o más, obligatorio | Una fila en cero por mercado habilitado. |
| `estuche` | código, nombre, presentación y mercados habilitados | Uno o más, obligatorio | Una fila en cero por mercado habilitado. |
| `frasco` | código, nombre y presentación | No aplica | No se crea; nace con el primer ingreso físico. |
| `droga` / MP | código y nombre; concentración propia si aplica | No aplica | No se crea; nace con el primer ingreso físico y lote. |

`VENEZUELA` se agrega al enum existente `Mercado`. La visualización de presentación usa `cm³` para Venezuela y `ml` para los demás mercados, sin alterar el valor almacenado. `presentacion` es propia del material de empaque; no reutiliza `volumen` + `unidad`, que representan concentración de MP en el modelo actual.

## Estados, permisos y ciclo de vida

```text
PENDIENTE_REVISION → ACTIVO → INACTIVO → ACTIVO
```

- Alta manual: exclusivamente `encargado`; crea `ACTIVO` mediante la misma operación transaccional de activación.
- Importación CSV/XLSX: crea solo `PENDIENTE_REVISION`, sin inventario, stock ni `Movimiento`; solo `encargado` puede aprobar/activar.
- Pendiente: permite editar código, nombre, categoría, presentación y mercados; puede eliminarse si no tiene relaciones operativas.
- Activo: código, categoría y mercados quedan inmutables (solo si el código está informado). Nombre y presentación siguen editables y se auditan.
- Inactivo: conserva trazabilidad. Un inactivo histórico con `codigo=null` puede recibir una única asignación explícita, única y auditada por `encargado` antes de reactivarse; una vez asignado, el código vuelve a ser inmutable. Categoría y mercados permanecen bloqueados. Reactivar exige código válido solo para etiqueta/estuche; frasco y droga pueden reactivarse sin código.
- Se permite hard-delete solo a pendientes sin relaciones operativas. La auditoría específica de catálogo no cuenta como relación operativa bajo esta política y se elimina junto al pendiente; stock, movimientos, ingresos, actas y órdenes siguen bloqueando el hard-delete. Los activos e inactivos se desactivan para conservar la auditoría de activación y toda relación histórica.

El código es global, único e inmutable tras activar cuando está informado. Su obligatoriedad depende de la categoría:

| Categoría | Código | Prefijo |
|---|---|---|
| Etiqueta | Obligatorio | `IGET` |
| Estuche | Obligatorio | `IGES` |
| Frasco | Opcional | — |
| Droga / MP | Opcional | — |

La unicidad es global únicamente para códigos no nulos. El campo vacío se normaliza a `null`. Nunca se generan códigos implícitos ni se descartan registros para resolver duplicados. No existe un futuro `codigo NOT NULL` global; la fase CONTRACT no fuerza esa constraint.

## Ingresos e inventario físico

Para `etiqueta` y `estuche`, `POST /api/deposito/ingresos` exige `mercado` explícito, válido y contenido en los mercados habilitados del producto. No hay fallback a `argentina` ni a otro mercado. El inventario se identifica por `productoId + mercado`.

`frasco` y `droga` rechazan un mercado. El primer ingreso de frasco exige `cantidadCajas` y `unidadesPorCaja`; mantiene `total = cantidadCajas × unidadesPorCaja`. Esos campos pertenecen a `InventarioFrasco`, nunca al catálogo. El primer ingreso de MP crea el inventario por `productoId + lote` con sus datos operativos; no se crean lotes ni stock cero al activar.

## Diseño técnico

### Prisma y representación de datos

Se agrega `EstadoProductoCatalogo` con `PENDIENTE_REVISION`, `ACTIVO` e `INACTIVO`; no se agrega una categoría `MATERIA_PRIMA`. La fase EXPAND mantiene los campos actuales y añade, de forma nullable/compatible:

```prisma
enum EstadoProductoCatalogo {
  PENDIENTE_REVISION
  ACTIVO
  INACTIVO
  @@schema("deposito")
}

enum OrigenProductoCatalogo {
  MANUAL
  IMPORTACION
  MIGRACION
  @@schema("deposito")
}

enum TipoAuditoriaCatalogo {
  NOMBRE_ACTUALIZADO
  PRESENTACION_ACTUALIZADA
  ACTIVADO
  DESACTIVADO
  IMPORTACION_APROBADA
  @@schema("deposito")
}

model DepositoProducto {
  // se conservan temporalmente nombreBase, volumen, unidad, variante,
  // nombreCompleto y activo para compatibilidad
  codigo               String?                  @unique
  estado               EstadoProductoCatalogo?
  origen               OrigenProductoCatalogo   @default(MIGRACION)
  presentacion         Int?
  mercadosHabilitados  Mercado[]                @default([]) @map("mercados_habilitados")
  auditoriasCatalogo   AuditoriaCatalogoProducto[]
}

model AuditoriaCatalogoProducto {
  id            String                 @id @default(uuid())
  productoId    String                 @map("producto_id")
  tipo          TipoAuditoriaCatalogo
  valorAnterior Json?                  @map("valor_anterior")
  valorNuevo    Json?                  @map("valor_nuevo")
  usuarioId     String                 @map("usuario_id")
  createdAt     DateTime               @default(now()) @map("created_at")
  producto      DepositoProducto       @relation(fields: [productoId], references: [id], onDelete: Restrict)
  usuario       User                   @relation(fields: [usuarioId], references: [id])
  @@index([productoId, createdAt])
  @@map("auditorias_catalogo_producto")
  @@schema("deposito")
}
```

`Mercado[]` es la representación elegida: PostgreSQL soporta arrays de enum, evita una tabla puente innecesaria y permite validar pertenencia antes de cada ingreso. Zod y el servicio imponen: lista no vacía solo para etiqueta/estuche; lista vacía para frasco/droga. Una constraint SQL se agrega como `NOT VALID` y solo se valida después de sanear datos heredados.

`codigo String? @unique` expresa la unicidad temporal en Prisma. La migración EXPAND crea el índice unique parcial sobre valores no nulos para que la regla quede explícita durante el rollout: permite múltiples `NULL` y rechaza cualquier duplicado no nulo. La futura fase CONTRACT pasa a `estado EstadoProductoCatalogo @default(PENDIENTE_REVISION)` y `activo` desaparece. `codigo` se mantiene nullable porque frasco y droga pueden estar ACTIVOS sin código; no hay un `codigo NOT NULL` global planificado.

Los inventarios de mercado incorporan `@@unique([productoId, mercado])`; frascos, `@@unique([productoId])`; drogas, `@@unique([productoId, lote])`. Los índices legacy por `articulo`/`nombre` se mantienen durante compatibilidad y se eliminan únicamente tras preflight que confirme que las relaciones existentes no se pierden. Las nuevas escrituras usan la identidad por producto, no el nombre mutable.

### Migración y rollout: EXPAND → CODE_LOAD → MIGRATE → CONTRACT

| Fase | Migraciones y despliegue | Garantía |
|---|---|---|
| **1. EXPAND** | Crear enum de estado, añadir `estado` nullable, `codigo` nullable unique, `origen`, `presentacion`, `mercadosHabilitados`, auditoría, `VENEZUELA` e índices nuevos. Mantener `activo`; no aplicar `codigo NOT NULL`, ni modificar filas existentes. | La base admite la carga explícita de códigos sin perder compatibilidad con el modelo anterior. |
| **2. CODE_LOAD** | Gate de despliegue posterior a EXPAND y anterior a MIGRATE. Solo una acción manual autenticada de `encargado` (`PATCH /api/deposito/productos/:id`) o la importación de catálogo puede asignar `codigo`; ambas auditan el actor. Cada valor se carga explícitamente y se revalida contra la unicidad global. Para etiqueta/estuche activos, la misma acción debe completar presentación y mercados habilitados si faltan; MIGRATE falla antes del backfill si ese requisito quedó incompleto. Nunca se deriva desde `variante`, nombre, IDs, secuencias ni valores ficticios. No crea inventario, stock ni movimientos. | La fuente de un código histórico queda trazable y no se altera la semántica de campos descriptivos. Puede no cargar códigos: esos registros siguen al caso sin código de MIGRATE. |
| **3. MIGRATE** | Solo tras completar o cerrar explícitamente CODE_LOAD: preflight de duplicados de código, relaciones de inventario y mercados; luego backfill transaccional exacto por categoría: `activo=true` + etiqueta/estuche con código válido → `ACTIVO`; `activo=true` + etiqueta/estuche sin código → `PENDIENTE_REVISION`; `activo=true` + frasco/droga (con o sin código) → `ACTIVO`; `activo=false` → `INACTIVO`. Marca origen `MIGRACION`, instala el trigger temporal de compatibilidad (category-aware) y no borra filas. Desplegar después la aplicación que lee `estado` y escribe ambos campos durante la ventana de mezcla. | Etiquetas y estuches ACTIVO requieren código; frascos y drogas pueden estar ACTIVOS sin código. |
| **4. CONTRACT** | Tras métricas y verificación del despliegue, fijar `estado NOT NULL`, eliminar trigger y columna `activo`; el estado queda como única fuente de verdad. `codigo` se mantiene nullable; no hay fase que fuerce `codigo NOT NULL` global. | No se confunden saneamiento humano y cambio de schema; no hay migración destructiva. |

El preflight falla de forma explícita —sin borrar ni transformar datos— si detecta códigos duplicados no resolubles, inventario no vinculable o mercados heredados que no puedan validarse. Es una detención segura, no una pérdida de datos.

### Servicios, endpoints y validación

Crear `CatalogoProductoService` server-side. `activate` ejecuta una transacción serializable, bloquea el producto (`FOR UPDATE`), valida estado/datos/código, cambia el estado y crea auditoría. Para etiqueta/estuche inserta las filas cero con `createMany({ skipDuplicates: true })` respaldado por `productoId + mercado`; para frasco/droga no inserta inventario. Si ya está activo, devuelve el mismo resultado sin otra auditoría ni filas duplicadas: es idempotente.

| Endpoint | Rol | Contrato |
|---|---|---|
| `GET /api/deposito/productos` | autenticado | Lista, busca y filtra; selectores operativos reciben solo `ACTIVO`. |
| `POST /api/deposito/productos` | encargado | Alta manual; valida payload completo y crea/activa transaccionalmente. |
| `PATCH /api/deposito/productos/:id` | encargado | Pendiente: todos los campos; activo/inactivo: solo nombre y presentación. Registra auditoría cuando corresponde. |
| `POST /api/deposito/productos/:id/activar` | encargado | Aprueba pendiente; crea cero solo para etiqueta/estuche y registra activación + aprobación si `origen=IMPORTACION`. |
| `POST /api/deposito/productos/:id/reactivar` | encargado | Reactiva inactivo tras validar código y datos. |
| `POST /api/deposito/productos/:id/desactivar` | encargado | Cambia a inactivo y audita. |
| `DELETE /api/deposito/productos/:id` | encargado | Solo pendiente sin inventarios, stock/movimientos, acta-items ni órdenes. La auditoría específica de catálogo se elimina junto al pendiente y no bloquea esta operación; devuelve 409 ante cualquier relación operativa. |
| `POST /api/deposito/productos/importaciones/dry-run` | encargado | `multipart/form-data`; analiza CSV/XLSX y devuelve filas/errores sin escribir. |
| `POST /api/deposito/productos/importaciones/confirmar` | encargado | Revalida el archivo o token de dry-run y crea pendientes en una transacción; jamás inventario, stock ni movimientos. |

Los DTO Zod son discriminados por categoría y se ejecutan luego de recuperar el producto: etiqueta/estuche exigen presentación y mercados; frasco exige presentación y prohíbe mercado; droga prohíbe mercado. El ingreso usa un segundo esquema por categoría: etiqueta/estuche exigen `cantidad` y `mercado`; frasco exige `cantidadCajas` y `unidadesPorCaja`; droga exige `cantidad`, `lote` y datos de vencimiento. El endpoint rechaza productos no activos y filtra/actualiza inventario por `productoId` y, si aplica, `mercado`.

La auditoría es una tabla específica, no `Movimiento`: guarda producto, `valorAnterior`/`valorNuevo` JSON, usuario, fecha y uno de los cinco tipos requeridos. `Movimiento` sigue reservado a stock.

### Interfaz e importación

`/deposito/productos` agrega tabla con estado, código, categoría, presentación y chips de mercado; filtros, búsqueda, alta/edición con campos condicionados, acciones de activar/reactivar/desactivar/eliminar e importación en dos pasos. La UI muestra MP para `droga`, `Código pendiente` para inactivos null y bloquea campos inmutables. El formulario de ingreso selecciona mercado solo después de escoger una etiqueta/estuche activo y no muestra ese control para frasco/MP.

La importación usa `exceljs` ya instalado para XLSX y CSV; se agrega middleware de carga en memoria con límite de tamaño y tipo, sin persistir archivos. Cada fila pasa por el mismo Zod/servicio de catálogo; el dry-run devuelve errores por fila y la confirmación repite todas las validaciones para evitar TOCTOU.

## Archivos de implementación previstos

| Archivo | Acción |
|---|---|
| `packages/db/prisma/schema.prisma` | Estados, código, mercados, auditoría e índices de identidad. |
| `packages/db/prisma/migrations/<timestamp>_mvp01_expand/migration.sql` | EXPAND aditivo: estructuras nullable, auditoría e índice de código. |
| Despliegue CODE_LOAD mediante rutas de catálogo | Gate operativo de `encargado`: carga explícita/auditada de códigos o importación, sin SQL derivado. |
| `packages/db/prisma/migrations/<timestamp>_mvp01_migrate/migration.sql` | Preflight, matriz de backfill post-CODE_LOAD y trigger temporal de compatibilidad. |
| `packages/db/prisma/migrations/<timestamp>_mvp01_contract_estado/migration.sql` | Retiro de `activo` tras despliegue. |
| `packages/db/prisma/migrations/<timestamp>_mvp01_contract_estado/migration.sql` | Retiro de `activo` tras despliegue; `codigo` se mantiene nullable. |
| `apps/platform/server/src/deposito/routes/productos.ts` | API de catálogo, importación y permisos. |
| `apps/platform/server/src/deposito/services/catalogo-producto-service.ts` | Transacciones, idempotencia, auditoría y eliminación segura. |
| `apps/platform/server/src/deposito/routes/ingresos.ts` | Mercado explícito, inventario por producto/mercado y primer ingreso de frasco/MP. |
| `apps/platform/server/src/deposito/routes/{etiquetas,estuches,frascos,drogas}.ts` | Identidad por `productoId`, no por nombre mutable. |
| `apps/platform/server/src/deposito/routes/shared/mercado-inventory-helpers.ts` | `VENEZUELA` y helpers por identidad. |
| `apps/platform/server/package.json` | Middleware de carga y tipos, si no existe una solución interna equivalente. |
| `apps/platform/client/src/modules/deposito/{App.tsx,components/layout/Sidebar.tsx}` | Ruta y navegación Productos. |
| `apps/platform/client/src/modules/deposito/pages/ProductosPage.tsx` | Pantalla de catálogo e importación. |
| `apps/platform/client/src/modules/deposito/queries/use-productos.ts` | Queries y mutaciones del catálogo. |
| `apps/platform/client/src/modules/deposito/{components/ProductoSelector.tsx,pages/ActaNuevaPage.tsx}` | Selector activo y mercado explícito en ingresos. |
| `apps/platform/server/src/deposito/__tests__/{catalogo,ingresos}.test.ts` | Contratos unitarios HTTP y permisos. |
| `apps/platform/server/src/__tests__/integration/mvp01-catalogo.test.ts` | Migración, concurrencia, rollback e idempotencia con PostgreSQL. |
| `apps/platform/client/src/modules/deposito/pages/__tests__/ProductosPage.test.tsx` | Estados, campos condicionados e importación dry-run. |

## Plan de pruebas

| Capa | Casos obligatorios |
|---|---|
| Unitarias | Zod por categoría; código único/inmutable; mercados; permisos; auditoría; importación sin efectos. |
| API | Alta manual activa; importación pendiente; solo encargado activa; edición bloqueada; eliminación 409 con relaciones; Venezuela. |
| Integración PostgreSQL | EXPAND/CODE_LOAD/MIGRATE/CONTRACT; escenario histórico sin CODE_LOAD, matriz completa post-CODE_LOAD, duplicados, rollback, dos activaciones concurrentes sin filas cero duplicadas y ausencia de fallback Argentina. |
| Cliente | Formulario condicional, UI de pendiente/inactivo, mercados permitidos y flujo dry-run/confirmación. |

## División de implementación

| Responsable | Trabajo |
|---|---|
| **Codex (crítico)** | Migraciones y preflight/trigger; Prisma; `CatalogoProductoService`; transacción idempotente; permisos; refactor de `ingresos.ts`; pruebas de integración y concurrencia. |
| **DeepSeek V4 Flash (mecánico, bajo revisión)** | Página y componentes de Productos, hooks React Query, navegación, estados visuales, fixtures y tests de UI; parser/import UI usando el contrato server ya definido. |

## Riesgos técnicos reales

- El esquema actual tiene inventarios y relaciones `productoId` opcionales; antes de retirar índices legacy se debe medir y conservar cada fila no vinculable, nunca forzar ni borrar una asociación.
- La retirada de `activo` exige confirmar que no quedan servidores antiguos; el trigger de MIGRATE evita divergencia durante esa ventana.

## Criterios de aceptación

- [ ] Un único catálogo `DepositoProducto` cubre ME y MP (`droga` interna), sin cambios en Ale-Bet.
- [ ] Solo etiqueta y estuche tienen mercados habilitados e inventario cero por mercado al activar; frasco y MP nacen con su primer ingreso físico.
- [ ] Ingresos de etiqueta/estuche exigen mercado explícito habilitado y nunca asumen Argentina.
- [ ] Código global único solo para valores no nulos; código inmutable tras activación cuando está informado; obligatorio para etiqueta/estuche ACTIVO, opcional para frasco/droga.
- [ ] Rollout EXPAND → CODE_LOAD → MIGRATE → CONTRACT conserva datos e historial; CODE_LOAD es explícito y autorizado; `activo` se elimina solo tras despliegue compatible; no hay fase que fuerce `codigo NOT NULL` global.
- [ ] Importar no crea stock ni movimientos; aprobación, activación y cambios editables quedan auditados y restringidos a encargado.
- [ ] Ajustes de stock, Ale-Bet y cajas de embalaje permanecen fuera de MVP-01.

## Handoff

- **Estado:** `DESIGN_READY`
- **Riesgo:** `ALTO`
- **Próximo rol:** `BUILDER`
- **Autorización de implementación:** pendiente de aprobación del flujo.
