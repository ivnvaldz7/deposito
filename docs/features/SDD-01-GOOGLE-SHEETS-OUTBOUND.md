# Feature: SDD-01 — Google Sheets outbound de stock físico

> Antes de trabajar esta funcionalidad, leer este documento, `.agents/current.md` y la guía del rol aplicable.

## Alcance

- Proyectar exclusivamente desde PostgreSQL hacia una hoja nueva de Google Sheets un snapshot completo e idempotente del stock físico Ale-Bet por `Producto + Lote + UbicacionStock`.
- Reutilizar `StockProjectionOutbox`; no crear un segundo outbox.
- Publicar dos tablas de valores administrados, con encabezados `PRODUCTO | LOTE | TOTAL`, una para “PRODUCTO TERMINADO” y otra para “SIN ACONDICIONAR”, según el mapping autoritativo aprobado.
- Generar la proyección tras confirmación efectiva de Automation, ajuste/apertura manual, transferencia interna y cualquier otro flujo vigente que cambie `SaldoStock`.
- Ejecutar la escritura después del commit de negocio; una falla de Google no revierte pedidos, movimientos ni saldos.
- Reconciliar un snapshot autoritativo al iniciar el runtime habilitado, sin depender del replay completo de eventos históricos.
- Exponer observabilidad mínima de estados `PENDING`, `SYNCED`, `ERROR`, última sincronización, trabajo pendiente y último error.

## No objetivos

- No implementar Google Sheets → PostgreSQL, sincronización bidireccional, Apps Script como núcleo, fórmulas de stock ni deltas.
- No proyectar pedidos, clientes, remitos, movimientos históricos ni reservas.
- No modificar la hoja histórica, recrear el spreadsheet ni borrar formato.
- No tocar Depósito, WhatsApp, Railway/cloud ni rediseñar Automation, Facturación o la UI general.
- No agregar un botón de sincronización, F5 requerido ni polling del usuario.

## Restricciones

- PostgreSQL y `SaldoStock` son la única fuente de verdad física; `Lote.cajas`/`Lote.sueltos` no son fallback.
- La API de Sheets solo puede reemplazar valores absolutos en rangos administrados de la hoja nueva. El borrado de valores obsoletos debe preservar colores, bordes, anchos y otros formatos.
- Las credenciales de Service Account permanecen fuera del repositorio; solo se documentan nombres de variables y placeholders sin secretos.
- TypeScript estricto: sin `any`, `as unknown` ni `@ts-ignore` nuevos.
- No crear migración sin una necesidad demostrada por schema y tests.
- No iniciar Builder mientras no exista una decisión explícita sobre el mapping de ubicaciones.
- Preservar el worktree sucio y no hacer commit ni push.

## Nivel de riesgo

`alto`

- Justificación: integra stock, transacciones, outbox, proceso en segundo plano, credenciales y una dependencia externa; una cobertura incompleta puede dejar una vista operativa obsoleta o asociar cantidades a una tabla incorrecta.
- Riesgo alto requiere Reviewer independiente y Verify.

## Decisión autoritativa de ubicaciones — Checkpoint 0 resuelto

El schema no define un enum de ubicaciones. `UbicacionStock` es una tabla de datos y la migración vigente crea únicamente:

- `DEPOSITO` / `Depósito`.
- `ACONDICIONADO` / `Acondicionado`.

El flujo real crea lotes en `ACONDICIONADO` y permite transferir `ACONDICIONADO → DEPOSITO`. El mantenedor aprobó explícitamente esta representación empresarial:

| `UbicacionStock.codigo` real | Tabla visible de Google Sheets |
|---|---|
| `DEPOSITO` | `PRODUCTO TERMINADO` |
| `ACONDICIONADO` | `SIN ACONDICIONAR` |

La ambigüedad del nombre técnico `ACONDICIONADO` no autoriza a cambiar el dominio. SDD-01 no renombra `UbicacionStock`, no modifica el schema y no crea migraciones. Las constantes de proyección deben usar estos códigos reales y fallar cerrado si falta o se duplica una ubicación requerida.

## Criterios de aceptación

- [ ] 1. El mapping aprobado usa exclusivamente códigos reales de `UbicacionStock` y falla cerrado si falta o se duplica una ubicación requerida.
- [ ] 2. Una función pura produce exactamente `{ productoTerminado, sinAcondicionar }` con filas `{ producto, lote, total }` a partir del estado autoritativo actual.
- [ ] 3. `TOTAL` es la cantidad absoluta de un único `Producto + Lote + Ubicación`; nunca suma ubicaciones ni publica deltas.
- [ ] 4. El orden agrupa por nombre/familia, ordena la presentación normalizada en mililitros y mantiene consecutivos los lotes del mismo producto por `Lote.createdAt`, con `id` como desempate estable.
- [ ] 5. Si hay lotes positivos para producto/ubicación, solo se publican esos lotes; los lotes cero no se borran de PostgreSQL.
- [ ] 6. Si todos los lotes del producto/ubicación están en cero, se publica una única fila cero: el lote activo más reciente por `createdAt`/`id`, o el lote más reciente total si ninguno está activo.
- [ ] 7. La repetición del snapshot produce los mismos valores, sin filas duplicadas ni mutaciones de stock.
- [ ] 8. Confirmar Automation persiste stock, movimiento y outbox en una transacción, responde sin esperar a Google y termina convergiendo en Sheets.
- [ ] 9. Todo servicio vigente que modifique físicamente `SaldoStock` crea una señal de outbox en la misma transacción; una transferencia actualiza ambas tablas aunque el total global no cambie. No se crean workflows nuevos de despacho, vendedor o armador.
- [ ] 10. Crear un lote administrado que cambie la fila cero determinista también genera una señal; un ajuste sin cambio (`delta = 0`) no crea ruido.
- [ ] 11. Emitir, anular o reemitir remitos no modifica stock, no crea outbox de stock y no cambia Sheets.
- [ ] 12. La caída de Google deja el negocio confirmado y el evento como trabajo no sincronizado; el retry posterior construye un snapshot nuevo desde PostgreSQL y converge.
- [ ] 13. El inicio del runtime habilitado ejecuta reconciliación completa aun cuando no existan eventos históricos pendientes.
- [ ] 14. La escritura limpia y reemplaza únicamente valores de rangos administrados de la hoja nueva y conserva el formato manual.
- [ ] 15. El estado mínimo informa última sincronización, conteos pendientes/con error y último error saneado, sin exponer credenciales.
- [ ] 16. UAT-01 a UAT-09 se ejecutan contra una hoja nueva compartida con la Service Account y quedan documentados.

## Estrategia técnica condicionada

- Snapshot: consultar productos activos, todos sus lotes y saldos de las dos ubicaciones aprobadas; tratar la ausencia de `SaldoStock` para un lote/ubicación como cantidad física cero, sin materializar datos.
- Orden: normalizar Unicode, espacios y mayúsculas; detectar una presentación `n ML` o `n L` en el nombre, convertirla a mililitros y ordenar por prefijo/familia, presentación, sufijo y nombre completo. Lotes: `createdAt ASC`, `id ASC`.
- Cero: para cada producto/ubicación, emitir todas las filas positivas; si no hay ninguna, elegir un solo lote priorizando `activo`, luego `createdAt DESC`, `id DESC`. Un producto sin lotes no puede producir una fila sin inventar un lote.
- Outbox: extraer un helper transaccional idempotente y llamarlo desde los servicios que mutan `SaldoStock` o cambian la selección de fila cero. Los eventos son señales de suciedad; el payload no contiene deltas ni cantidades.
- Worker: al iniciar y ante eventos vencidos `PENDING`/`ERROR`, construir un snapshot global actual, escribirlo y marcar la tanda capturada `SYNCED`. En falla, incrementar `attempts`, guardar un error saneado, calcular `nextRetryAt` con backoff acotado y reintentar también eventos `ERROR`.
- Sheets: crear solo la pestaña configurada si no existe; declarar rangos/columnas exclusivos para ambas tablas; usar `values.clear`/`values.batchUpdate` sobre esos rangos para eliminar valores obsoletos y escribir encabezados/filas completas sin tocar formato.
- Runtime: módulo iniciable/detenible desde `src/index.ts`, ejecución inicial inmediata y ciclo corto de backend; `GOOGLE_SHEETS_ENABLED=false` no requiere credenciales ni inicia el worker.
- Observabilidad: estado en memoria del worker combinado con agregados del outbox; endpoint autenticado bajo Ale-Bet/stock y logs estructurados sin payload de credenciales.

### Política de visibilidad física implementada en Slice 1

- `Producto` solo tiene `activo` como estado de visibilidad. La lectura incluye `Producto.activo = true`, coherente con el catálogo operativo y con los servicios actuales, que rechazan nuevas operaciones de stock para productos inactivos. Un producto activo sin lotes no genera una fila porque no existe identidad de lote que publicar.
- `Lote` no tiene un enum/estado adicional: dispone de `activo`, `fechaProduccion`, `fechaVencimiento` y `createdAt`. La proyección consulta todos los lotes de un producto visible, incluidos los inactivos y vencidos.
- Un saldo físico positivo se publica aunque el lote esté inactivo o vencido. `activo` y `fechaVencimiento` afectan elegibilidad comercial, pero no eliminan existencia física de `SaldoStock`.
- Cuando todos los saldos de producto+ubicación son cero o ausentes, el representante se elige entre lotes activos por `createdAt DESC, id DESC`; si no existe ninguno activo, se usa el lote más reciente total con el mismo desempate. El vencimiento no participa de esta selección.
- Las ubicaciones requeridas deben existir exactamente una vez y estar activas. La proyección falla cerrada si `DEPOSITO` o `ACONDICIONADO` falta, está duplicada en la entrada o está inactiva.

### Catálogo inspeccionado para el orden empresarial

La consulta read-only del catálogo actual confirmó presentaciones de volumen `20 ML`, `50 ML`, `100 ML`, `250 ML`, `300 ML`, `500 ML`, `1 L` y `5 L`, además de peso `35 GR`. El parser backend conserva la semántica del helper cliente: acepta decimales con punto/coma, `ML`, `L`, `G`/`GR` y `KG`, convierte litros/kilos a base 1000 y nunca compara numéricamente volumen contra peso.

## Configuración propuesta

- `GOOGLE_SHEETS_ENABLED`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_SHEET_NAME`
- `GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE`

Los nombres siguen el prefijo `GOOGLE_` ya usado por el servidor y aíslan la Service Account de las credenciales OAuth existentes. Solo se agregan a `.env.example` después de aprobar el mapping; el archivo real de credenciales queda fuera del repo.

## Tareas de implementación por slices

Las tareas posteriores quedan documentadas, pero el único alcance autorizado para Builder en esta iteración es Slice 1. Cada checkpoint es un límite obligatorio: no se inicia el slice siguiente hasta recibir aprobación explícita.

### Checkpoint 0 — mapping de dominio

- [x] **CP0.1** Registrar `DEPOSITO → PRODUCTO TERMINADO` y `ACONDICIONADO → SIN ACONDICIONAR` como mapping autoritativo.
- [x] **CP0.2** Confirmar que no se renombra `UbicacionStock`, no se modifica Prisma y no se crea migración.
- [x] **CP0.3** Habilitar Tasks y Builder exclusivamente para Slice 1.

### Slice 1 — snapshot autoritativo, orden y lotes cero

- [x] **S1.1 — Contratos puros.** Crear el módulo reusable de transformación con tipos explícitos para la fila `{ producto, lote, total }`, el resultado `{ productoTerminado, sinAcondicionar }` y la entrada mínima proveniente de `Producto`, `Lote`, `UbicacionStock` y `SaldoStock`. Mantenerlo independiente de Prisma, Google, outbox, timers y frontend.
- [x] **S1.2 — Mapping cerrado.** Implementar las constantes `DEPOSITO` y `ACONDICIONADO` en la frontera de proyección; rechazar datos ambiguos cuando falte o se duplique una ubicación requerida. Demostrar que cada saldo se conserva en su tabla y nunca se suma con la otra ubicación.
- [x] **S1.3 — Política de visibilidad física.** Inspeccionar y documentar en este feature doc los campos reales `Producto.activo`, `Lote.activo`/estado y vencimiento. La selección debe representar stock físico: no excluir un saldo positivo solo por inelegibilidad comercial salvo contrato vigente explícito; no inventar filas para productos sin lotes.
- [x] **S1.4 — Saldos ausentes.** Construir combinaciones únicamente desde productos/lotes válidos y las dos ubicaciones requeridas; interpretar la ausencia de `SaldoStock` como cero en memoria sin crear registros ni duplicados.
- [x] **S1.5 — Política cero.** Para cada producto+ubicación publicar todos y solo los lotes con `cantidad > 0`; cuando ninguno sea positivo, publicar exactamente un lote cero determinista. Elegir primero entre lotes válidos según la política documentada y desempatar por `createdAt DESC`, `id DESC`. La aparición posterior de un positivo debe retirar naturalmente la fila cero.
- [x] **S1.6 — Orden empresarial.** Revisar el catálogo actual y `apps/platform/client/src/lib/natural-product-order.ts`; implementar una estrategia backend estable y compartible que normalice las presentaciones reales a mililitros y ordene por familia/base, volumen numérico, variante y nombre canónico. Mantener los lotes de un producto consecutivos y ordenarlos por `createdAt ASC`, `id ASC`.
- [x] **S1.7 — Repositorio Prisma.** Crear una lectura read-only que obtenga exclusivamente `Producto`, `Lote`, `UbicacionStock` y `SaldoStock`, con selects explícitos y sin consultar `Lote.cajas`/`Lote.sueltos`. Separar por completo esta lectura de la transformación pura.
- [x] **S1.8 — Tests unitarios.** Cubrir: mapping; independencia de ubicaciones; secuencia `100 ML < 250 ML < 500 ML < 1 L < 5 L`; familias agrupadas; lotes consecutivos; `createdAt ASC`/`id ASC`; cero+positivo; todos cero con el lote más reciente; reemplazo de fila cero por positivo; y el mismo lote en ambas tablas con cantidades independientes.
- [x] **S1.9 — Test de integración Prisma.** Preparar fixture aislado `Producto X 500 ML` con lotes A/B y saldos `DEPOSITO A=0, B=200`, `ACONDICIONADO A=100, B=0`; verificar el objeto exacto y luego, con ambos saldos positivos llevados a cero, una única fila cero determinista por tabla. Preservar aislamiento y limpieza conforme al harness existente.
- [x] **S1.10 — Evidencia técnica.** Ejecutar tests unitarios, integración focalizada y typecheck relevante; registrar comandos/resultados y distinguir cualquier falla preexistente.
- [x] **S1.11 — Handoff.** Tester entrega evidencia a Reviewer; Reviewer inspecciona los siete invariantes del pedido; Verify valida únicamente Slice 1. No iniciar Slice 2.

### Checkpoint 1 — aceptación de Slice 1

- [x] **CP1.1** Confirmar que el snapshot deriva exclusivamente de PostgreSQL y `SaldoStock.cantidad`.
- [x] **CP1.2** Confirmar mapping e independencia de ubicaciones, shape exacto, orden estable y política cero determinista.
- [x] **CP1.3** Confirmar que un lote nuevo queda debajo de los lotes existentes del producto y que no se excluye stock físico positivo por reglas comerciales no aplicables.
- [x] **CP1.4** Confirmar ausencia de Google, worker, timers, productores outbox nuevos, frontend, migraciones y cambios de dominio.

### Slice 2 — productores del outbox existente

- [ ] **S2.1 — Inventario de escritores.** Localizar todos los servicios vigentes que crean, actualizan o eliminan cantidad física de `SaldoStock`; registrar operación, transacción y cobertura actual de outbox.
- [ ] **S2.2 — Helper transaccional.** Extraer o crear un helper para dejar `StockProjectionOutbox` en `PENDING` dentro de la misma transacción de stock, sin cantidades/deltas en el payload y sin segundo outbox.
- [ ] **S2.3 — Instrumentación acotada.** Instrumentar únicamente los escritores físicos existentes: confirmación Automation, ajuste manual, apertura/saldo inicial, transferencia y cualquier otro escritor vigente encontrado. No crear workflows de despacho, vendedor o armador.
- [ ] **S2.4 — Señales relevantes.** Evitar señal en ajustes sin cambio; asegurar señal cuando una transferencia cambia ubicaciones aunque el total global sea igual y cuando una creación/cambio de lote altere la fila cero determinista.
- [ ] **S2.5 — Regresión de remitos.** Demostrar que emitir, anular o reemitir remitos no modifica `SaldoStock` ni crea outbox de stock.
- [ ] **S2.6 — Tests transaccionales.** Probar commit conjunto, rollback conjunto, idempotencia y cobertura de cada escritor físico vigente.

### Checkpoint 2 — aceptación de productores

- [ ] **CP2.1** Reviewer compara el inventario de escritores con llamadas al helper y confirma que no quedan mutadores físicos sin señal.
- [ ] **CP2.2** Tester/Verify confirman rollback, ausencia de ruido, transferencia entre ubicaciones y regresión de remitos.
- [ ] **CP2.3** Confirmar que no se agregó ningún workflow legacy.

### Slice 3 — adapter de Google Sheets y configuración

- [ ] **S3.1 — Puerto y fake.** Definir un puerto interno de escritura de snapshot y un fake para tests; la lógica de dominio no depende del SDK.
- [ ] **S3.2 — Configuración.** Validar `GOOGLE_SHEETS_ENABLED`, spreadsheet, nombre de pestaña y ruta externa de Service Account; deshabilitado no requiere credenciales. Documentar placeholders sin secretos.
- [ ] **S3.3 — Adapter.** Instalar el SDK aprobado e implementar Service Account; trabajar solo sobre el spreadsheet/pestaña configurados y crear únicamente la pestaña nueva si falta.
- [ ] **S3.4 — Rangos administrados.** Declarar rangos no superpuestos para las dos tablas; limpiar valores obsoletos y escribir encabezados/snapshot completo con operaciones de valores, sin requests de formato, dimensiones o borrado de hoja.
- [ ] **S3.5 — Contract tests.** Verificar rangos exactos, snapshot absoluto, repetición idempotente, eliminación de sobrantes y ausencia de operaciones destructivas de formato.

### Checkpoint 3 — aceptación del adapter

- [ ] **CP3.1** Reviewer inspecciona que ninguna request recree spreadsheet, borre hoja completa o modifique formato.
- [ ] **CP3.2** Tester/Verify confirman configuración cerrada, credenciales externas, rangos exclusivos e idempotencia con fake.

### Slice 4 — worker, retry y reconciliación

- [ ] **S4.1 — Ciclo de vida.** Implementar worker iniciable/detenible, sin ejecuciones solapadas, habilitado solo por configuración y con shutdown controlado.
- [ ] **S4.2 — Reconciliación inicial.** Al arrancar habilitado, construir y escribir el snapshot PostgreSQL actual aun sin eventos históricos pendientes.
- [ ] **S4.3 — Toma de trabajo.** Capturar eventos `PENDING` y `ERROR` vencidos, construir un único snapshot actual, escribirlo y marcar la tanda capturada `SYNCED` solo después del éxito.
- [ ] **S4.4 — Fallas y retry.** En error incrementar intentos, guardar mensaje saneado y calcular `nextRetryAt` con backoff acotado; el negocio nunca espera ni revierte por Google.
- [ ] **S4.5 — Convergencia.** Cada retry relee PostgreSQL actual y no reproduce deltas; probar que cambios posteriores convergen sin doble descuento ni duplicaciones.
- [ ] **S4.6 — Tests deterministas.** Usar reloj y adapter fake para inicio, solapamiento, error recuperable, retry, shutdown e idempotencia.

### Checkpoint 4 — aceptación del worker

- [ ] **CP4.1** Simular Google caído durante una operación de negocio: stock y outbox persisten sin bloquear la respuesta.
- [ ] **CP4.2** Restaurar el adapter y confirmar snapshot final autoritativo, eventos sincronizados e idempotencia.
- [ ] **CP4.3** Confirmar reconciliación correcta después de reinicio sin depender del replay histórico.

### Slice 5 — observabilidad mínima

- [ ] **S5.1 — Estado.** Combinar estado en memoria del worker con agregados del outbox para última sincronización, pendientes, errores y último error saneado.
- [ ] **S5.2 — Endpoint natural.** Exponer el estado bajo una ruta Ale-Bet/stock existente o equivalente, protegida con permisos ya vigentes; no abrir una feature de UI.
- [ ] **S5.3 — Logs.** Emitir logs estructurados para inicio, éxito, retry y error sin credenciales ni payload sensible.
- [ ] **S5.4 — Tests.** Cubrir permisos, estados vacíos/activos, conteos, timestamps y saneamiento del último error.

### Checkpoint 5 — aceptación de observabilidad

- [ ] **CP5.1** Reviewer confirma mínimo alcance, autorización existente y ausencia de secretos.
- [ ] **CP5.2** Tester/Verify contrastan endpoint/logs con el outbox y estado real del worker.

### Slice 6 — UAT contra hoja nueva real

- [ ] **S6.1 — Preparación externa.** Crear/seleccionar una hoja nueva, compartirla con la Service Account y configurar credenciales fuera del repo; no tocar la hoja histórica.
- [ ] **S6.2 — Ejecución UAT.** Ejecutar y documentar UAT-01 Automation, UAT-02 ajuste, UAT-03 transferencia, UAT-04 nuevo lote, UAT-05 lote agotado, UAT-06 todos cero, UAT-07 caída de Internet/Google, UAT-08 idempotencia y UAT-09 remitos.
- [ ] **S6.3 — Evidencia.** Registrar estado PostgreSQL/outbox, valores de ambas tablas y tiempos de convergencia sin capturar secretos.
- [ ] **S6.4 — Limpieza controlada.** Retirar solo fixtures UAT acordados; preservar formato manual y datos fuera de los rangos administrados.

### Checkpoint 6 — cierre de SDD-01

- [ ] **CP6.1** Reviewer independiente revisa los criterios de aceptación completos y nueva evidencia de riesgo.
- [ ] **CP6.2** Verify ejecuta la matriz final, registra evidencia vigente y confirma que no se tocó Depósito, WhatsApp, Railway/cloud ni workflows fuera de alcance.
- [ ] **CP6.3** No cerrar ni archivar hasta aprobar UAT-01 a UAT-09; commit/push solo por pedido explícito del usuario.

## Archivos previstos por slices

- `apps/platform/server/src/routes/ale-bet/stock-projection/snapshot.ts` y tests unitarios.
- `apps/platform/server/src/routes/ale-bet/stock-projection/snapshot-repository.ts` y test de integración.
- `apps/platform/server/src/routes/ale-bet/stock-projection/outbox.ts`.
- `apps/platform/server/src/routes/ale-bet/stock-projection/google-sheets-adapter.ts` y tests con fake/mock.
- `apps/platform/server/src/routes/ale-bet/stock-projection/worker.ts` y tests.
- `apps/platform/server/src/routes/ale-bet/inventory-service.ts`.
- `apps/platform/server/src/routes/ale-bet/product-stock-admin-service.ts`.
- `apps/platform/server/src/routes/ale-bet/reservas-service.ts`.
- `apps/platform/server/src/routes/ale-bet/automation/automation-service.ts` solo si se centraliza el productor existente, sin cambiar comportamiento funcional.
- `apps/platform/server/src/routes/ale-bet/productos.ts`, `stock.ts` e `index.ts` para wiring/estado mínimo.
- `apps/platform/server/src/index.ts` para ciclo de vida del worker.
- `apps/platform/server/package.json`, `package-lock.json` y `apps/platform/server/.env.example` para SDK/configuración sin secretos.
- Tests focalizados bajo `apps/platform/server/src/routes/ale-bet/**/__tests__/` y `apps/platform/server/src/__tests__/integration/`.

## Migraciones

Ninguna prevista. El schema actual ya contiene estados, retry metadata, timestamps e índices suficientes. Una migración solo se reconsiderará si una prueba concreta demuestra que no puede satisfacerse un criterio sin persistencia adicional; no se usará para alterar el mapping semántico aprobado.

## Evidencia de implementación

| Cambio | Archivo/ruta | Evidencia |
|---|---|---|
| Checkpoint 0 resuelto y tareas detalladas; Builder autorizado solo para Slice 1 | `docs/features/SDD-01-GOOGLE-SHEETS-OUTBOUND.md` | Decisión autoritativa y checklist S1.1–S1.11 registrados |
| Slice 1 completado por Builder | `apps/platform/server/src/routes/ale-bet/stock-projection/` | TDD RED→GREEN→REFACTOR completado; no se habilitan slices posteriores |
| Transformación pura y orden empresarial | `stock-projection/snapshot.ts` | Shape exacto, mapping cerrado, cantidades absolutas, política cero y orden estable sin dependencias externas |
| Lectura PostgreSQL read-only | `stock-projection/snapshot-repository.ts` | Selects explícitos de `Producto`, `Lote`, `UbicacionStock` y `SaldoStock`; no lee `cajas`/`sueltos` ni escribe DB |
| Cobertura Slice 1 | `stock-projection/__tests__/snapshot.test.ts`; `__tests__/integration/stock-projection-snapshot.test.ts` | 13 casos puros y fixture Prisma aislado |
| Handoff independiente de Tester | Mismos módulos y tests de Slice 1 | Inspección directa confirmó separación DB/política pura, mapping cerrado, cantidades absolutas, orden, lotes cero y ausencia de Google, worker, outbox nuevo, frontend o migración; sin cambios a producción ni tests por parte de Tester |
| Review independiente 4R | Lineage `review-sdd01-slice1-code-20260908` | `APPROVED`, sin hallazgos; target exacto de cuatro archivos backend/test, riesgo alto, cuatro lentes requeridas |

## Evidencia de pruebas

| Criterio | Test/comando | Resultado |
|---|---|---|
| Inspección estática del schema y productores actuales | `rg` / `Get-Content` sobre rutas documentadas | El modelo y los gaps quedan registrados; no se ejecutaron tests en fase Planner. |
| RED unitario | `npm exec vitest run -- -c vitest.config.ts src/routes/ale-bet/stock-projection/__tests__/snapshot.test.ts` | Falló como se esperaba: no existía `../snapshot`; 1 archivo fallido, 0 tests recolectados. |
| GREEN unitario | Mismo comando focalizado | OK: 1 archivo, 13 tests pasados. |
| Integración Prisma focalizada | `npm run test:integration -- src/__tests__/integration/stock-projection-snapshot.test.ts` | Primer intento detectó fixture inválido por constraint de `sueltos`; corregido `unidadesPorCaja` sin cambiar la expectativa. Resultado final: 1 archivo, 1 test pasado contra `platform_test_automation`. |
| Typecheck focalizado | `npm exec tsc -- --noEmit --strict --target ES2020 --module CommonJS --moduleResolution node --esModuleInterop --skipLibCheck src/routes/ale-bet/stock-projection/snapshot.ts src/routes/ale-bet/stock-projection/snapshot-repository.ts` | OK, sin errores. |
| Typecheck completo servidor | `npm run typecheck` | No limpio por fallas fuera de Slice 1 ya presentes en el baseline/worktree: `test-desmarcar.ts`, `reset-estuches.ts`, `test-confirm.ts` y el script ajeno no versionado `verify-automation-runtime.ts`. No reportó errores en `stock-projection`. |
| Higiene del diff | `git diff --check` | Sin errores del Slice 1; solo avisos de conversión LF→CRLF en archivos frontend preexistentes y no tocados por Builder. |
| Reejecución independiente de tests puros | `npm exec vitest run -- -c vitest.config.ts src/routes/ale-bet/stock-projection/__tests__/snapshot.test.ts` | PASS: 1 archivo, 13 tests. Cubre mapping/fail-closed, cantidades independientes, catálogo/presentaciones, familias/variantes, orden de lotes, cero, saldos ausentes, visibilidad física e idempotencia. |
| Reejecución independiente de integración | `npm run test:integration -- src/__tests__/integration/stock-projection-snapshot.test.ts` | PASS: 1 archivo, 1 test contra el harness fijo `platform_test_automation`; objeto exacto con A/B por ubicación y una fila cero determinista tras llevar los saldos a cero. |
| Reejecución independiente de typecheck focalizado | `npm exec tsc -- --noEmit --strict --target ES2020 --module CommonJS --moduleResolution node --esModuleInterop --skipLibCheck src/routes/ale-bet/stock-projection/snapshot.ts src/routes/ale-bet/stock-projection/snapshot-repository.ts` | PASS sin errores. |
| Suite completa informativa | `npm run test` | Baseline no limpio fuera de alcance: 52 archivos y 669 tests pasaron; 18 archivos/22 tests fallaron en suites preexistentes de Depósito, auth, importación y otras rutas, además de archivos sin DB URL. El test focalizado de `stock-projection` permaneció PASS y Slice 1 no está integrado a esos módulos. |

## Evidencia de verificación

| Verificación | Evidencia | Resultado |
|---|---|---|
| Mapping de ubicaciones | Decisión explícita del mantenedor de 2026-09-08 | Aprobado: `DEPOSITO → PRODUCTO TERMINADO`; `ACONDICIONADO → SIN ACONDICIONAR`; sin cambios de schema/migración. |
| Receipt post-apply | `gentle-ai review validate --gate post-apply --lineage review-sdd01-slice1-code-20260908` | `allow`: el target y los artefactos content-bound coinciden. |
| Verify de Slice 1 — reejecución unitaria | `npm exec vitest run -- -c vitest.config.ts src/routes/ale-bet/stock-projection/__tests__/snapshot.test.ts` | PASS: 1 archivo, 13 tests. |
| Verify de Slice 1 — reejecución integración | `npm run test:integration -- src/__tests__/integration/stock-projection-snapshot.test.ts` | PASS: 1 archivo, 1 test contra `platform_test_automation`. |
| Verify de Slice 1 — typecheck focalizado | `npm exec tsc -- --noEmit --strict ... src/routes/ale-bet/stock-projection/snapshot.ts src/routes/ale-bet/stock-projection/snapshot-repository.ts` | PASS sin errores. |
| Verify de Slice 1 — inspección directa | Código staged + feature doc | PASS: mapping cerrado, TOTAL exclusivamente de `SaldoStock.cantidad`, independencia de ubicaciones, orden estable (familia → presentación → variante; lotes `createdAt ASC`, `id ASC`), política cero determinista, visibilidad física y repositorio read-only confirmados. CP1.1–CP1.4 aprobados. |

## Estado e historial

- Estado actual: `verificado` (Slice 1; slices 2–6 sin iniciar)
- Historial:
  - 2026-09-08 — Planner — inspección del repo actual y diseño condicionado; detenido antes de mappings/migraciones por contradicción de ubicaciones.
  - 2026-09-08 — Maintainer — aprobó el plan y resolvió Checkpoint 0 con `DEPOSITO → PRODUCTO TERMINADO` y `ACONDICIONADO → SIN ACONDICIONAR`.
  - 2026-09-08 — Tasks — descompuso SDD-01 en tareas y checkpoints; habilitó Builder únicamente para Slice 1.
  - 2026-09-08 — Builder — inició Slice 1 con alcance limitado a snapshot puro, orden empresarial, política cero y repositorio Prisma read-only.
  - 2026-09-08 — Builder — completó RED→GREEN→REFACTOR y dejó Slice 1 listo para handoff a Tester, manteniendo estado `en-construcción` y sin iniciar Slice 2.
  - 2026-09-08 — Tester — inspeccionó implementación y tests sin confiar en el handoff, reejecutó 13 pruebas puras, 1 integración Prisma aislada y typecheck focalizado; todo Slice 1 pasó y quedó `en-prueba` para Reviewer. No modificó producción ni tests y no inició Slice 2.
  - 2026-09-08 — Reviewer — revisó en modo read-only el target staged exacto bajo las cuatro lentes 4R, reejecutó la evidencia focalizada y emitió `APPROVED` sin hallazgos. El receipt post-apply quedó validado; Slice 1 está listo para Verify.
  - 2026-09-08 — Verify — inspeccionó el estado real del repo sin confiar en el handoff, contrastó código y tests contra los invariantes de Slice 1, reejecutó 13 pruebas puras, 1 integración y typecheck focalizado (todos PASS) y emitió `VERIFY: PASS`. Checkpoint 1 (CP1.1–CP1.4) aprobado; checkpoint commit de Slice 1 creado sin push. Slice 2 NO iniciado.

Estados válidos: `planificado` → `en-construcción` → `en-prueba` → `en-revisión` → `en-verificación` → `verificado` → `archivado`. Solo el archive SDD requerido puede pasar `verificado` a `archivado`; desde un estado activo: `bloqueado`.

## Bloqueos

- Ninguno para iniciar Verify de Slice 1.
- Los slices 2 a 6 permanecen fuera de alcance hasta superar el checkpoint anterior y recibir aprobación explícita.
