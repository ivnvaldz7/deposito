# Feature: SDD-01 — Google Sheets outbound de stock físico

> Antes de trabajar esta funcionalidad, leer este documento, `.agents/current.md` y la guía del rol aplicable.

## Alcance

- Proyectar exclusivamente desde PostgreSQL hacia una hoja nueva de Google Sheets un snapshot completo e idempotente del stock físico Ale-Bet por `Producto + Lote + UbicacionStock`.
- Reutilizar `StockProjectionOutbox`; no crear un segundo outbox.
- Publicar dos tablas de valores administrados, con encabezados `PRODUCTO | LOTE | TOTAL`, una para “PRODUCTO TERMINADO” y otra para “SIN ACONDICIONAR”, según el mapping autoritativo aprobado.
- Generar la proyección automática tras cada mutación física de stock confirmada.
- Ejecutar la escritura después del commit de negocio; una falla de Google no revierte pedidos, movimientos ni saldos.
- Conservar `StockProjectionOutbox` como infraestructura existente sin consumidor activo en el MVP actual.

## No objetivos

- No implementar Google Sheets → PostgreSQL, sincronización bidireccional, Apps Script como núcleo, fórmulas de stock ni deltas.
- No proyectar pedidos, clientes, remitos, movimientos históricos ni reservas.
- No modificar la hoja histórica, recrear el spreadsheet ni borrar formato.
- No tocar Depósito, WhatsApp, Railway/cloud ni rediseñar Automation, Facturación o la UI general.
- No agregar un botón de sincronización, F5 requerido ni polling del usuario.
- No implementar worker, polling, scheduler, retry/backoff, reconciliación de startup, dashboard de estado ni sincronización automática de otros writers físicos en el MVP actual.

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

- Justificación: integra stock, límite transaccional, credenciales y una dependencia externa; una cobertura incompleta puede asociar cantidades a una tabla incorrecta o devolver un fallo ambiguo después de confirmar el negocio.
- Riesgo alto requiere Reviewer independiente y Verify.

## Arquitectura final MVP

```text
Mutación física confirmada
→ transacción PostgreSQL
→ saldo físico + movimientos + señal de outbox
→ COMMIT
→ snapshot autoritativo completo
→ Google Sheets STOCK APP
```

- PostgreSQL y `SaldoStock` siguen siendo la única fuente de verdad; Google Sheets es una proyección outbound.
- `syncStockProjectionAfterCommit()` se ejecuta en la capa HTTP inmediatamente exterior a cada `await prisma.$transaction(...)` que modifica stock físico: apertura, ajuste, ingreso, transferencia, aprobación con transferencia, despacho y confirmación Automation.
- Google no participa en la transacción. Si configuración, autenticación, red o escritura fallan, el cambio de stock permanece confirmado y la API conserva la respuesta exitosa de PostgreSQL; solo se emite un log constante saneado.
- `GOOGLE_SHEETS_ENABLED=false` omite snapshot, credenciales, cliente y llamadas Google sin afectar la confirmación.
- El adapter escribe un snapshot absoluto e idempotente; un replay puede volver a sincronizar sin duplicar filas ni volver a descontar stock.
- `StockProjectionOutbox` se conserva y continúa recibiendo señales transaccionales de los writers ya instrumentados. No tiene worker consumidor en el MVP actual y no se desarrolla más salvo necesidad futura.
- Las sincronizaciones post-commit se serializan en el proceso para impedir que un snapshot anterior termine sobrescribiendo uno posterior. Remitos y cambios sin mutación física no disparan el helper directo.

## Diseño anterior reemplazado

**SUPERSEDED / DESCARTADO para el MVP actual:** el Slice 4 originalmente planificado con worker permanente, polling de `StockProjectionOutbox`, scheduler, retry/backoff, reconciliación de startup y locking de worker. También quedan fuera del alcance activo la sincronización automática de todos los writers y la UI/endpoint de observabilidad. Se preserva este antecedente únicamente como trazabilidad; no es un requisito de implementación vigente.

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

## Criterios de aceptación vigentes

- [ ] 1. El mapping aprobado usa exclusivamente códigos reales de `UbicacionStock` y falla cerrado si falta o se duplica una ubicación requerida.
- [ ] 2. Una función pura produce exactamente `{ productoTerminado, sinAcondicionar }` con filas `{ producto, lote, total }` a partir del estado autoritativo actual.
- [ ] 3. `TOTAL` es la cantidad absoluta de un único `Producto + Lote + Ubicación`; nunca suma ubicaciones ni publica deltas.
- [ ] 4. El orden agrupa por nombre/familia, ordena la presentación normalizada en mililitros y mantiene consecutivos los lotes del mismo producto por `Lote.createdAt`, con `id` como desempate estable.
- [ ] 5. Si hay lotes positivos para producto/ubicación, solo se publican esos lotes; los lotes cero no se borran de PostgreSQL.
- [ ] 6. Si todos los lotes del producto/ubicación están en cero, se publica una única fila cero: el lote activo más reciente por `createdAt`/`id`, o el lote más reciente total si ninguno está activo.
- [ ] 7. La repetición del snapshot produce los mismos valores, sin filas duplicadas ni mutaciones de stock.
- [ ] 8. Toda mutación física confirmada persiste stock, movimiento y outbox dentro de una transacción; solo después de su commit construye el snapshot y llama al adapter una vez.
- [ ] 9. El snapshot post-commit refleja el saldo definitivo (por ejemplo, `120 - 12 = 108`) y nunca el estado anterior.
- [ ] 10. `GOOGLE_SHEETS_ENABLED=false` confirma y descuenta normalmente sin construir snapshot ni instanciar Google.
- [ ] 11. Una falla de Google se captura fuera de la transacción, registra únicamente `[stock-projection] Google Sheets sync failed after physical stock mutation` y no altera la respuesta exitosa ni el estado persistido.
- [ ] 12. El replay idempotente de confirmación no vuelve a descontar ni crea otro movimiento; un segundo sync del snapshot absoluto es aceptable.
- [ ] 13. Emitir, anular o reemitir remitos no dispara el helper directo, no modifica stock y no crea otro movimiento físico.
- [ ] 14. Ajustes, ingresos, aperturas, transferencias y consumos/despachos conservan sus señales de `StockProjectionOutbox` y sincronizan Google automáticamente después de commit; remitos no sincronizan.
- [ ] 15. La escritura limpia y reemplaza únicamente valores de rangos administrados y conserva el formato manual.
- [ ] 16. El UAT final requiere una confirmación Automation manual autorizada; no se fabrica un pedido ni se modifica stock mediante script.

## Estrategia técnica vigente

- Snapshot: consultar productos activos, todos sus lotes y saldos de las dos ubicaciones aprobadas; tratar la ausencia de `SaldoStock` para un lote/ubicación como cantidad física cero, sin materializar datos.
- Orden: normalizar Unicode, espacios y mayúsculas; detectar una presentación `n ML` o `n L` en el nombre, convertirla a mililitros y ordenar por prefijo/familia, presentación, sufijo y nombre completo. Lotes: `createdAt ASC`, `id ASC`.
- Cero: para cada producto/ubicación, emitir todas las filas positivas; si no hay ninguna, elegir un solo lote priorizando `activo`, luego `createdAt DESC`, `id DESC`. Un producto sin lotes no puede producir una fila sin inventar un lote.
- Outbox: extraer un helper transaccional idempotente y llamarlo desde los servicios que mutan `SaldoStock` o cambian la selección de fila cero. Los eventos son señales de suciedad; el payload no contiene deltas ni cantidades.
- Sheets: crear solo la pestaña configurada si no existe; declarar rangos/columnas exclusivos para ambas tablas; usar `values.clear`/`values.batchUpdate` sobre esos rangos para eliminar valores obsoletos y escribir encabezados/filas completas sin tocar formato.
- Sync directo: después de cada commit de mutación física, construir un snapshot global actual y escribirlo una vez. `GOOGLE_SHEETS_ENABLED=false` retorna sin credenciales ni llamadas externas.
- Fallo externo: capturar el error exclusivamente alrededor del sync post-commit, no propagarlo como fallo de negocio y no incluir el mensaje original en logs. Serializar esos syncs en proceso para preservar el orden de los snapshots.
- Outbox inactivo: no consultar, consumir ni cambiar estados del outbox desde este flujo directo.

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

Slices 1–3 quedan como checkpoints históricos verificados. El alcance activo autorizado es exclusivamente el cierre simplificado Direct Automation Sync; el Slice 4 Worker está cancelado.

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

- [x] **S2.1 — Inventario de escritores.** Localizar todos los servicios vigentes que crean, actualizan o eliminan cantidad física de `SaldoStock`; registrar operación, transacción y cobertura actual de outbox.
- [x] **S2.2 — Helper transaccional.** Extraer o crear un helper para dejar `StockProjectionOutbox` en `PENDING` dentro de la misma transacción de stock, sin cantidades/deltas en el payload y sin segundo outbox.
- [x] **S2.3 — Instrumentación acotada.** Instrumentar únicamente los escritores físicos existentes: confirmación Automation, ajuste manual, apertura/saldo inicial, transferencia y cualquier otro escritor vigente encontrado. No crear workflows de despacho, vendedor o armador.
- [x] **S2.4 — Señales relevantes.** Evitar señal en ajustes sin cambio; asegurar señal cuando una transferencia cambia ubicaciones aunque el total global sea igual y cuando una creación/cambio de lote altere la fila cero determinista.
- [x] **S2.5 — Regresión de remitos.** Demostrar que emitir, anular o reemitir remitos no modifica `SaldoStock` ni crea outbox de stock.
- [x] **S2.6 — Tests transaccionales.** Probar commit conjunto, rollback conjunto, idempotencia y cobertura de cada escritor físico vigente.

### Checkpoint 2 — aceptación de productores

- [x] **CP2.1** Reviewer compara el inventario de escritores con llamadas al helper y confirma que no quedan mutadores físicos sin señal.
- [x] **CP2.2** Tester/Verify confirman rollback, ausencia de ruido, transferencia entre ubicaciones y regresión de remitos.
- [x] **CP2.3** Confirmar que no se agregó ningún workflow legacy.

### Slice 3 — adapter de Google Sheets y configuración

- [x] **S3.1 — Puerto y fake.** Definir `StockProjectionSheetAdapter` (interfaz) con `writeSnapshot` y un adapter fake en tests; la lógica de dominio no depende del SDK.
- [x] **S3.2 — Configuración.** `validateSheetConfig` lee `GOOGLE_SHEETS_ENABLED`, spreadsheet, sheetName y serviceAccountFile; `enabled=false` no requiere credenciales; `enabled=true` sin config → error claro y saneado.
- [x] **S3.3 — Adapter.** Instalar `googleapis`, implementar `GoogleSheetsAdapter` con Service Account; crear solo la pestaña configurada si falta; memoizar cliente HTTP.
- [x] **S3.4 — Rangos administrados.** Limpiar A3:C1002 (PRODUCTO TERMINADO) y E3:G1002 (SIN ACONDICIONAR), escritura en bloque `values.update` con `RAW`; headers en filas 1–2 (título + columnas). Sin requests de formato, dimensiones o borrado de hoja.
- [x] **S3.5 — Tests.** 17 tests: A–F contract tests con adapter fake; G–K tests de configuración y adapter Google mock (enabled=false → error, enabled+incompleta → error, creación de pestaña, no recreación, no formato, clear antes de write, rango clear exacto A3:C1002/E3:G1002).

### Checkpoint 3 — aceptación del adapter

- [x] **CP3.1** Reviewer inspecciona que ninguna request recree spreadsheet, borre hoja completa o modifique formato.
- [x] **CP3.2** Tester/Verify confirman configuración cerrada, credenciales externas, rangos exclusivos e idempotencia con fake.

### Cierre simplificado — Direct Stock Sync

- [x] **DAS.1 — Helper directo.** Construir el snapshot autoritativo actual y escribirlo mediante `StockProjectionSheetAdapter`; salir sin trabajo cuando Google está deshabilitado.
- [x] **DAS.2 — Hook post-commit.** Ejecutar el helper inmediatamente después de que finaliza con éxito cada transacción de mutación física.
- [x] **DAS.3 — Fail-open externo.** Capturar fallas de Google, emitir un log constante saneado y preservar respuesta/estado de negocio.
- [x] **DAS.4 — Tests focalizados.** Cubrir enabled, disabled, falla, snapshot `108` post-commit, replay sin doble descuento y remitos sin sync.
- [ ] **DAS.5 — Review/Verify independiente.** Revisar límite transaccional, seguridad del log, alcance exclusivo y evidencia focalizada.
- [ ] **DAS.6 — UAT manual autorizado.** Confirmar manualmente un pedido de prueba en Automation y contrastar PostgreSQL con `STOCK APP`.

### Slice 4 — worker, retry y reconciliación

**CANCELLED / OUT OF SCOPE FOR MVP.** No implementar worker, polling, scheduler, retry engine, backoff, startup reconciliation, locking, consumidor automático de outbox ni observabilidad asociada. Una necesidad futura requerirá una nueva decisión y alcance explícitos.

## Archivos previstos por slices

- `apps/platform/server/src/routes/ale-bet/stock-projection/snapshot.ts` y tests unitarios.
- `apps/platform/server/src/routes/ale-bet/stock-projection/snapshot-repository.ts` y test de integración.
- `apps/platform/server/src/routes/ale-bet/stock-projection/outbox.ts`.
- `apps/platform/server/src/routes/ale-bet/stock-projection/google-sheets-adapter.ts` y tests con fake/mock.
- `apps/platform/server/src/routes/ale-bet/stock-projection/direct-sync.ts` y tests.
- `apps/platform/server/src/routes/ale-bet/inventory-service.ts`.
- `apps/platform/server/src/routes/ale-bet/product-stock-admin-service.ts`.
- `apps/platform/server/src/routes/ale-bet/reservas-service.ts`.
- `apps/platform/server/src/routes/ale-bet/automation/automation-service.ts` solo si se centraliza el productor existente, sin cambiar comportamiento funcional.
- `apps/platform/server/src/routes/ale-bet/automation.ts` e `index.ts` para el wiring post-commit inyectable.
- `apps/platform/server/package.json`, `package-lock.json` y `apps/platform/server/.env.example` para SDK/configuración sin secretos.
- Tests focalizados bajo `apps/platform/server/src/routes/ale-bet/**/__tests__/` y `apps/platform/server/src/__tests__/integration/`.

## Migraciones

Ninguna prevista. El schema actual ya contiene estados, retry metadata, timestamps e índices suficientes. Una migración solo se reconsiderará si una prueba concreta demuestra que no puede satisfacerse un criterio sin persistencia adicional; no se usará para alterar el mapping semántico aprobado.

## Evidencia de implementación

| Cambio | Archivo/ruta | Evidencia |
|---|---|---|
| Checkpoint 0 resuelto y tareas históricas detalladas | `docs/features/SDD-01-GOOGLE-SHEETS-OUTBOUND.md` | Decisión autoritativa y checklist S1.1–S1.11 registrados |
| Slice 1 completado por Builder | `apps/platform/server/src/routes/ale-bet/stock-projection/` | TDD RED→GREEN→REFACTOR completado dentro del alcance entonces autorizado |
| Transformación pura y orden empresarial | `stock-projection/snapshot.ts` | Shape exacto, mapping cerrado, cantidades absolutas, política cero y orden estable sin dependencias externas |
| Lectura PostgreSQL read-only | `stock-projection/snapshot-repository.ts` | Selects explícitos de `Producto`, `Lote`, `UbicacionStock` y `SaldoStock`; no lee `cajas`/`sueltos` ni escribe DB |
| Cobertura Slice 1 | `stock-projection/__tests__/snapshot.test.ts`; `__tests__/integration/stock-projection-snapshot.test.ts` | 13 casos puros y fixture Prisma aislado |
| Handoff independiente de Tester | Mismos módulos y tests de Slice 1 | Inspección directa confirmó separación DB/política pura, mapping cerrado, cantidades absolutas, orden, lotes cero y ausencia de Google, worker, outbox nuevo, frontend o migración; sin cambios a producción ni tests por parte de Tester |
| Review independiente 4R | Lineage `review-sdd01-slice1-code-20260908` | `APPROVED`, sin hallazgos; target exacto de cuatro archivos backend/test, riesgo alto, cuatro lentes requeridas |
| Slice 2 completado por Builder | `apps/platform/server/src/routes/ale-bet/stock-projection/outbox.ts`; instrumentación en `product-stock-admin-service.ts`, `inventory-service.ts`, `reservas-service.ts`; tests en `__tests__/integration/stock-projection-outbox.test.ts` | Inventario exhaustivo de writers, helper `markStockProjectionDirty` con upsert idempotente, instrumentación de 3 writers (ajuste manual/apertura, transferencia, consumo), Automation/reconcile-legacy con `skipOutbox: true`, 8 tests de integración PASS, regresión de remitos verificada |
| Review Slice 2 — lectura independiente | Inventario writers + schema + migración + idempotency + transaccionalidad + skipOutbox safety | `APPROVED`: unique constraint verificada en migración real, nullable semantics segura, idempotencia semántica confirmada (REPLAY + upsert), transaccionalidad (mismo tx), skipOutbox seguro (solo callers con evento propio usan skip), Automation un solo evento, sanitization exclusión segura, log reescritura reutilizada, 5 tests de riesgo A–E agregados |
| Verify Slice 2 — reejecución suites | `npm run test:integration -- stock-projection-outbox.test.ts + stock-projection-snapshot.test.ts + automation-slice1.test.ts` | PASS: 32/32 (13 Slice 2 + 19 regresión). CP2.1–CP2.3 aprobados. Checkpoint commit creado sin push. Slice 3 NO iniciado. |
| Slice 3 — adapter + config | `sheet-adapter.ts`, `google-sheets-adapter.ts`, `__tests__/google-sheets-adapter.test.ts`, `.env.example`, `.gitignore` | Puerto `StockProjectionSheetAdapter` (interfaz), adapter Google con Service Account, `validateSheetConfig`, `googleapis` instalado, 17 tests (12 contract + 5 integration mock) PASS, service-account.json excluido de git |
| Direct Automation Sync | `stock-projection/direct-sync.ts`, `automation.ts`, `index.ts`, tests unitarios/integración | Helper directo post-commit, disabled sin trabajo, falla externa fail-open con log saneado, snapshot post-commit `120 - 12 = 108`, replay sin doble descuento y remitos sin sync |

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
| Slice 2 — outbox producers | `npm run test:integration -- src/__tests__/integration/stock-projection-outbox.test.ts` | PASS: 8 tests cubriendo ajuste manual (con/sin cambio), apertura, transferencia (éxito/fallo), remitos (regresión) y snapshot post-ajuste/transferencia |
| Slice 2 — regresión Slice 1 + Automation | `npm run test:integration -- src/__tests__/integration/stock-projection-snapshot.test.ts src/__tests__/integration/automation-slice1.test.ts` | PASS: 19 tests (1 Slice 1 + 18 Automation) |
| Slice 3 — adapter tests | `npm exec vitest run -- -c vitest.config.ts src/routes/ale-bet/stock-projection/__tests__/google-sheets-adapter.test.ts` | PASS: 1 archivo, 17 tests (validateSheetConfig, fake contract A–F, Google Sheets mocked G–K + clear range exacto) |
| Direct sync — unit + regresión stock projection | Vitest focalizado: `snapshot.test.ts`, `google-sheets-adapter.test.ts`, `direct-sync.test.ts` | PASS: 3 archivos, 32/32 tests. |
| Direct sync — integración Automation/outbox/snapshot | Integration focalizada: `direct-automation-sync.test.ts`, `automation-slice1.test.ts`, `stock-projection-snapshot.test.ts`, `stock-projection-outbox.test.ts` | PASS: 4 archivos, 37/37 tests contra `platform_test_automation`. |
| Direct sync — typecheck focalizado | TypeScript estricto sobre `direct-sync.ts`, `automation.ts`, `index.ts` y ambos tests nuevos | PASS sin errores; el typecheck global conserva únicamente fallas históricas/temporales ajenas registradas. |

## Evidencia de verificación

| Verificación | Evidencia | Resultado |
|---|---|---|
| Mapping de ubicaciones | Decisión explícita del mantenedor de 2026-09-08 | Aprobado: `DEPOSITO → PRODUCTO TERMINADO`; `ACONDICIONADO → SIN ACONDICIONAR`; sin cambios de schema/migración. |
| Receipt post-apply | `gentle-ai review validate --gate post-apply --lineage review-sdd01-slice1-code-20260908` | `allow`: el target y los artefactos content-bound coinciden. |
| Verify de Slice 1 — reejecución unitaria | `npm exec vitest run -- -c vitest.config.ts src/routes/ale-bet/stock-projection/__tests__/snapshot.test.ts` | PASS: 1 archivo, 13 tests. |
| Verify de Slice 1 — reejecución integración | `npm run test:integration -- src/__tests__/integration/stock-projection-snapshot.test.ts` | PASS: 1 archivo, 1 test contra `platform_test_automation`. |
| Verify de Slice 1 — typecheck focalizado | `npm exec tsc -- --noEmit --strict ... src/routes/ale-bet/stock-projection/snapshot.ts src/routes/ale-bet/stock-projection/snapshot-repository.ts` | PASS sin errores. |
| Verify de Slice 1 — inspección directa | Código staged + feature doc | PASS: mapping cerrado, TOTAL exclusivamente de `SaldoStock.cantidad`, independencia de ubicaciones, orden estable (familia → presentación → variante; lotes `createdAt ASC`, `id ASC`), política cero determinista, visibilidad física y repositorio read-only confirmados. CP1.1–CP1.4 aprobados. |
| Verify final de Slice 3 — tests focalizados | `npm exec vitest run -- -c vitest.config.ts src/routes/ale-bet/stock-projection/__tests__/google-sheets-adapter.test.ts` | PASS: 1 archivo, 16/16 tests. |
| Verify final de Slice 3 — typecheck productivo focalizado | `npm exec tsc -- --noEmit --strict --target ES2020 --module CommonJS --moduleResolution node --esModuleInterop --skipLibCheck src/routes/ale-bet/stock-projection/sheet-adapter.ts src/routes/ale-bet/stock-projection/google-sheets-adapter.ts` | PASS sin errores. |
| Verify final de Slice 3 — rangos y política TypeScript | Inspección directa de adapter, tests y diff real | BLOCKED: `buildClearRange()` genera `A3:C1003`/`E3:G1003`, fuera de los rangos declarados `A3:C1000`/`E3:G1000`; el test nuevo contiene `as any`, prohibido por la política estricta. No se inició Slice 4 ni se creó checkpoint. |
| Re-Verify focalizado de Slice 3 — rango y tests | Inspección directa + suite focalizada | PASS: fórmula `DATA_START_ROW + MAX_DATA_ROWS - 1`, rangos exactos `A3:C1002`/`E3:G1002` (1000 filas) y 17/17 tests. El test afirma presencia de 1002 y ausencia de 1003/1000. |
| Re-Verify focalizado de Slice 3 — TypeScript | Typecheck estricto sobre puerto, adapter y test | BLOCKED: producción PASS, pero el test falla con TS2352 porque el cast del módulo `googleapis` a `{ __mocks: ... }` no tiene solapamiento suficiente. Se eliminó `as any`, pero el reemplazo todavía no constituye tipado válido bajo TypeScript estricto. |
| Re-Verify final mínimo de Slice 3 | Inspección de `vi.hoisted`; 17 tests focalizados; typecheck estricto incluyendo el test | PASS: los mocks compartidos por `vi.hoisted()` son los usados por `vi.mock()` y las aserciones; sin casts/supresiones evasivas ni TS2352. Rangos definitivos `A3:C1002`/`E3:G1002`, 1000 filas por tabla. CP3.1–CP3.2 aprobados. |

## Estado e historial

- Estado actual: `en-revisión` (Slice 1 → VERIFIED; Slice 2 → VERIFIED; Slice 3 → VERIFIED; Direct Automation Sync → IN REVIEW / READY FOR VERIFY; Slice 4 Worker → CANCELLED / OUT OF SCOPE FOR MVP)
- Historial:
  - 2026-09-08 — Planner — inspección del repo actual y diseño condicionado; detenido antes de mappings/migraciones por contradicción de ubicaciones.
  - 2026-09-08 — Maintainer — aprobó el plan y resolvió Checkpoint 0 con `DEPOSITO → PRODUCTO TERMINADO` y `ACONDICIONADO → SIN ACONDICIONAR`.
  - 2026-09-08 — Tasks — descompuso SDD-01 en tareas y checkpoints; habilitó Builder únicamente para Slice 1.
  - 2026-09-08 — Builder — inició Slice 1 con alcance limitado a snapshot puro, orden empresarial, política cero y repositorio Prisma read-only.
  - 2026-09-08 — Builder — completó RED→GREEN→REFACTOR y dejó Slice 1 listo para handoff a Tester, manteniendo estado `en-construcción` y sin iniciar Slice 2.
  - 2026-09-08 — Tester — inspeccionó implementación y tests sin confiar en el handoff, reejecutó 13 pruebas puras, 1 integración Prisma aislada y typecheck focalizado; todo Slice 1 pasó y quedó `en-prueba` para Reviewer. No modificó producción ni tests y no inició Slice 2.
  - 2026-09-08 — Reviewer — revisó en modo read-only el target staged exacto bajo las cuatro lentes 4R, reejecutó la evidencia focalizada y emitió `APPROVED` sin hallazgos. El receipt post-apply quedó validado; Slice 1 está listo para Verify.
  - 2026-09-08 — Verify — inspeccionó el estado real del repo sin confiar en el handoff, contrastó código y tests contra los invariantes de Slice 1, reejecutó 13 pruebas puras, 1 integración y typecheck focalizado (todos PASS) y emitió `VERIFY: PASS`. Checkpoint 1 (CP1.1–CP1.4) aprobado; checkpoint commit de Slice 1 creado sin push. Slice 2 NO iniciado.
  - 2026-09-08 — Builder — completó Slice 2: inventario exhaustivo de writers de SaldoStock, helper `markStockProjectionDirty` creado, instrumentación de `adjustManagedStock`, `transferInternal` y `consumeActiveReservations`, Automation y reconcile-legacy actualizados con `skipOutbox: true`, tests de integración para todos los casos (8/8 PASS), regresión de remitos verificada. Slice 2 listo para Review/Verify.
  - 2026-09-08 — Reviewer — revisión read-only: verificó inventario exhaustivo de writers (grep $executeRaw, saldoStock.*, callers), unique constraint en migración real (`CREATE UNIQUE INDEX ... ("productId","causeType","causeId")` con columnas NOT NULL), nullable semantics segura, idempotencia semántica (idempotencyKey estable por operación, REPLAY/no-duplicate, 409 en key reuse), transaccionalidad (todos los `markStockProjectionDirty` usan el mismo `tx`), skipOutbox safety (solo automation+reconcile usan skip y crean su propio evento), Automation exactamente un efecto lógico (createMany skipDuplicates), remitos sin outbox (regresión), logistica-sanitization-service seguro sin instrumentar (solo CLI manual DEMO/TEST, fingerprint-gated). Agregó 5 tests de riesgo A–E (distinct events, retry no duplicate, consume default/skip, forced-fail rollback). Emite `APPROVED`.
  - 2026-09-08 — Verify — reejecutó 13 tests Slice 2 + 19 regresión (32/32 PASS), inspeccionó diff backend acotado (42 líneas), verificó CP2.1–CP2.3. Emite `VERIFY: PASS`. Checkpoint commit de Slice 2 creado sin push. Slice 3 NO iniciado.
  - 2026-09-08 — Builder — completó Slice 3: `sheet-adapter.ts` (puerto + fake), `google-sheets-adapter.ts` (implementación Google con Service Account), `validateSheetConfig`, `googleapis` instalado, `.env.example` actualizado, `.gitignore` protege service-account.json, 16 tests PASS (contract A–F + Google Sheets mocked E–G–K). Slice 3 listo para Review/Verify.
  - 2026-09-08 — Reviewer — arquitectura del adapter aprobada sin hallazgos técnicos; dictamen bloqueado exclusivamente por cinco archivos frontend ajenos presentes en el working tree.
  - 2026-09-08 — Verify — preservó los cinco frontend y los scripts UAT fuera de staging, reejecutó 16/16 tests y typecheck productivo focalizado (PASS), pero detectó que el clear efectivo excede los rangos documentados y que el test nuevo usa `as any`. Emite `VERIFY: BLOCKED`; no stage, commit ni push; Slice 4 NO iniciado.
  - 2026-09-08 — Builder — fix post-verify: corrigió off-by-one en `buildClearRange` (`DATA_START_ROW + MAX_DATA_ROWS - 1` → A3:C1002 / E3:G1002), eliminó `as any` del test usando interfaz local tipada, agregó test de rango exacto. 17/17 PASS. Pendiente de re-Verify.
  - 2026-09-08 — Verify — re-Verify focalizado confirmó rango exacto de 1000 filas y 17/17 tests; producción typecheck PASS. El typecheck estricto incluyendo el test falla con TS2352 en el cast del módulo mock, por lo que el reemplazo de `as any` no es todavía tipado válido. Emite `VERIFY: BLOCKED`; no stage, commit ni push; Slice 4 NO iniciado.
  - 2026-09-08 — Builder — reemplazó el cast incompatible del mock por referencias compartidas mediante `vi.hoisted()`, sin modificar producción; 17/17 tests PASS y typecheck incluyendo el test PASS.
  - 2026-09-08 — Verify — re-Verify final mínimo confirmó `vi.hoisted()` sin casts evasivos, ausencia de TS2352, 17/17 tests, typecheck estricto PASS y rangos definitivos `A3:C1002`/`E3:G1002` (1000 filas por tabla). Emite `VERIFY: PASS`; Checkpoint 3 aprobado. Slice 4 NO iniciado.
  - 2026-09-08 — Pre-commit — staged diff limitado a ocho archivos de Slice 3, sin frontend, UAT, credenciales ni Slice 4. El gate nativo no encontró un receipt content-bound de Slice 3; el lineage previo de Slice 1 devolvió `scope-changed`, `allowed: false`, `action: explicit-maintainer-action`. Checkpoint bloqueado sin commit ni push.
  - 2026-09-08 — Maintainer — autorizó explícitamente crear un receipt content-bound nuevo para el staged content actual de Slice 3, sin bypass ni reutilización del receipt de Slice 1. Lineage asignada: `review-sdd01-slice3-code-20260908`.
  - 2026-09-08 — Smoke real — configuración, autenticación, acceso, escritura, comparación e idempotencia PASS contra `platform` y la solapa `STOCK APP`; 35 filas Producto Terminado y 36 Sin Acondicionar.
  - 2026-09-08 — Maintainer — reemplazó el Slice 4 por la arquitectura MVP directa Automation confirm → COMMIT → snapshot → Google; worker/polling/retry/reconciliation cancelados y outbox conservado sin consumidor.
  - 2026-09-08 — Builder/Tester — implementó helper y hook post-commit fail-open; RED por módulos ausentes, GREEN 32/32 unitarios y 37/37 integración, typecheck focalizado PASS. Direct Automation Sync queda `en-revisión`, sin commit/push y pendiente de UAT manual autorizado.

Estados válidos: `planificado` → `en-construcción` → `en-prueba` → `en-revisión` → `en-verificación` → `verificado` → `archivado`. Solo el archive SDD requerido puede pasar `verificado` a `archivado`; desde un estado activo: `bloqueado`.

## Bloqueos

- Ninguno técnico en implementación/tests de Direct Automation Sync; pendiente Reviewer independiente, Verify final y UAT manual autorizado.
- Slice 4 Worker está cancelado y fuera del MVP; no debe iniciarse sin una nueva decisión explícita.
