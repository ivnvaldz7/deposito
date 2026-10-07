# Feature: graphify-pilot

> Antes de trabajar esta funcionalidad, leer este documento, `.agents/current.md` y la guía del rol aplicable.

## Alcance

Pilotear Graphify localmente y fuera de producción para evaluar si mejora la navegación del repositorio y reduce el contexto requerido por agentes.

- Verificar la documentación oficial y confirmar el método de instalación antes de ejecutar comandos.
- Trabajar exclusivamente desde una rama separada y registrar el estado inicial del repositorio.
- Instalar Graphify como herramienta local de piloto, sin agregarlo como dependencia productiva.
- Identificar los archivos y configuraciones que la instalación y la generación del grafo creen.
- Generar el grafo y registrar duración, tamaño y listado de artefactos.
- Consultar el impacto de `DepositoProducto`, `OrdenProduccion` y `Movimiento`.
- Contrastar cada resultado de impacto con el código fuente real.
- Revisar los artefactos generados para detectar secretos o valores sensibles.
- Proponer, con evidencia, qué artefactos se versionan y cuáles se ignoran.
- Revisar el diff antes de cualquier cambio potencial a `AGENTS.md`; no actualizarlo automáticamente.

## No objetivos

- Integrar Graphify como dependencia productiva o en runtime.
- Modificar código productivo, CI, `package.json`, Prisma, migraciones o tests.
- Integrar MCP, hooks, modo estricto o automatizaciones de Graphify.
- Convertir el grafo en fuente de verdad; el código y la documentación verificada siguen siéndolo.
- Hacer commit o push.

## Restricciones

- Preservar el workspace sucio y no eliminar, restaurar ni sobrescribir cambios ajenos.
- No trabajar sobre `master`.
- Usar únicamente el método de instalación corroborado en la documentación oficial vigente.
- No persistir secretos, URLs con credenciales, tokens ni contenido de archivos de entorno en artefactos del piloto.
- Mantener los cambios limitados a los artefactos locales necesarios para el piloto y a la evidencia de esta feature.
- El Builder no puede aprobar su propia instalación ni su interpretación de las consultas; requiere Reviewer independiente y Verify.
- Solo Verify puede actualizar `.agents/current.md`.

## Nivel de riesgo

`alto`

- Justificación: aunque no modifica producción, el piloto incorpora tooling/configuración de repositorio y puede generar artefactos que expongan información o alteren la navegación de agentes.
- Riesgo alto requiere Reviewer independiente y Verify.

## Criterios de aceptación

- [x] La documentación oficial, versión evaluada y método de instalación quedan registrados con URL, fecha y comando exacto.
- [x] El trabajo parte de una rama distinta de `master` y el estado inicial (rama, HEAD y cambios preexistentes) queda registrado.
- [x] Graphify se instala y ejecuta como piloto local, sin cambios en dependencias productivas ni en los archivos excluidos.
- [x] El grafo se genera y se registran su duración, tamaño y artefactos resultantes.
- [x] Hay consultas de impacto para `DepositoProducto`, `OrdenProduccion` y `Movimiento`, con resultados contrastados contra rutas y símbolos reales.
- [x] La inspección de artefactos no encuentra secretos ni datos sensibles; cualquier hallazgo bloquea el avance.
- [x] Existe una decisión fundamentada de versionado/ignore por cada artefacto generado.
- [x] `AGENTS.md` no se modifica automáticamente; si Graphify lo propone, el diff queda pendiente de revisión explícita.
- [x] Reviewer independiente y Verify emiten evidencia antes de declarar el piloto verificado.
- [x] No hay commit ni push.

## Plan de implementación

- [x] Builder: registrar estado inicial, crear/cambiar a una rama de piloto y conservar evidencia de cambios preexistentes.
- [x] Builder: consultar documentación oficial, confirmar instalación y documentar versión, comando, archivos esperados y configuración generada.
- [x] Builder: instalar y generar el grafo local; medir tiempo transcurrido, tamaño total y rutas creadas.
- [x] Builder: ejecutar las tres consultas de impacto y guardar resultados reproducibles sin incluir secretos.
- [x] Tester: repetir las consultas y contrastar sus resultados con el código fuente real; comprobar que los archivos excluidos no fueron modificados.
- [x] Reviewer: revisar configuración, diffs, alcance de artefactos, posible exposición de secretos y propuesta de versionado/ignore.
- [x] Verify: reconciliar evidencia, confirmar que Graphify sigue siendo auxiliar, actualizar `current.md` solo si corresponde y fijar el estado final.

## Evidencia de implementación

| Cambio | Archivo/ruta | Evidencia |
|---|---|---|
| Estado inicial y rama de piloto | `codex/graphify-pilot` | 2026-07-29: `HEAD d49d0e7`; cambios preexistentes preservados: `AGENTS.md`, `.agents/`, `docs/features/`, `empty_evidence.json`, `empty_review.json`. |
| Documentación oficial y método de instalación | Fuentes oficiales | Verificado 2026-07-29: [CLI](https://graphify.com/docs/cli) y [repositorio](https://github.com/Graphify-Labs/graphify). El paquete oficial PyPI es `graphifyy` y expone el binario `graphify`; la documentación recomienda `uv tool install graphifyy`, con `pipx install graphifyy` y `pip install graphifyy` como alternativas. Python 3.12.10 disponible; `uv` y `pipx` no disponibles. Para no instalar tooling global ni dependencias de producción, el piloto usará `python -m venv .graphify-pilot-venv` y `.graphify-pilot-venv\\Scripts\\python -m pip install graphifyy==0.9.29`. No se ejecutará `graphify install`, que registra skills/configuración de asistentes. Artefactos esperados del grafo: `graphify-out/graph.json`, `graphify-out/graph.html` y `graphify-out/GRAPH_REPORT.md`; el entorno virtual será local y temporal del piloto. |
| Instalación local y generación del grafo | `.graphify-pilot-venv`, `graphify-out/` | `python -m venv .graphify-pilot-venv` y `.graphify-pilot-venv\\Scripts\\python -m pip install graphifyy==0.9.29` completaron en 46.198 s. `graphify --version` devolvió `graphify 0.9.29`. El intento completo `graphify .` falló en 6.926 s (exit 1) porque 47 entradas no-code requerían API key. La ayuda oficial/local documenta `extract <path> --code-only` para omitir extracción semántica; autorizado el segundo intento: `graphify extract . --code-only` completó en 22.137 s (exit 0), sin API key y con 325 archivos de código. |
| Artefactos y configuración detectados | `.graphify-pilot-venv`, `graphify-out/` | Entorno aislado: 167,347,936 bytes (159.60 MiB). Grafo generado: 5,794 nodos, 8,615 aristas y 221 comunidades. `graphify-out/` ocupa 6,734,753 bytes (6.423 MiB): `graph.json` (5,913,439), `.graphify_analysis.json` (459,170), `manifest.json` (69,932), `.graphify_root`, `cache/ast/`, `cache/stat-index.json` y `cache/last_query_stamp`. Los JSON preexistentes `empty_evidence.json` y `empty_review.json` produjeron cero nodos y quedaron fuera del grafo. No se generaron `graph.html` ni `GRAPH_REPORT.md`; no se ejecutaron `graphify install`, hooks, MCP ni configuraciones de asistentes. |
| Consultas de impacto | `graphify-out/graph.json` | `explain` y `query` localizaron `DepositoProducto` en el cliente Prisma generado (grado 1), `OrdenProduccion` en `use-ordenes.ts:9` (reexportado e importado por `OrdenesPage`), y `Movimiento` en `use-movimientos.ts:4` (reexportado e importador de `api`). `path OrdenProduccion Movimiento` devolvió 2 saltos mediante el barrel `queries/index.ts`; ambos extremos fueron ambiguos. `path DepositoProducto Movimiento` devolvió 9 saltos, incluyendo aristas inferidas a través del runtime generado, por lo que no se toma como relación de dominio. `affected` no encontró impacto único para los dos tipos de cliente. Contraste de código: el esquema real define `Movimiento` en `schema.prisma:403`, `OrdenProduccion` en `:473` y `DepositoProducto` en `:518`; la relación dominio real es `OrdenProduccion.producto → DepositoProducto` (`:490`) y `DepositoProducto.ordenes` (`:535`). |
| Decisión de versionado/ignore | Propuesta provisional, pendiente de Reviewer/Verify | No se modifica `.gitignore`. Propuesta: ignorar `.graphify-pilot-venv/` (entorno local de 159.60 MiB) y todo `graphify-out/` (`graph.json`, análisis, manifest, root marker y cache), por ser salida derivada, representar contenido fuente y no ser fuente de verdad. El escaneo de patrones de tokens, claves privadas, claves AWS/GitHub/OpenAI y URLs con credenciales sobre `graphify-out/` obtuvo 0 coincidencias, sin leer `.env`; requiere revisión independiente. |

## Evidencia de pruebas

| Criterio | Test/comando | Resultado |
|---|---|---|
| Medición de generación | `.graphify-pilot-venv\\Scripts\\graphify.exe extract . --code-only` | Éxito, exit 0, 22.137 s. Limitación explícita: omite 38 docs y 9 imágenes; además, 7 `.sql` no aportaron nodos por faltar el extra `tree_sitter_sql`. Este piloto no valida indexación de documentación, SQL ni otros no-code. `graphify benchmark graphify-out/graph.json`: corpus ~386,266 tokens, coste medio estimado de consulta ~11,135 tokens, reducción estimada 34.7x. |
| Impacto de `DepositoProducto` | `explain`, `query`, `affected`, `path` | El match favorece el tipo generado, no el modelo Prisma; `affected` no devolvió nodos. Resultado útil como alerta de desambiguación, no como fuente de relación de dominio. |
| Impacto de `OrdenProduccion` | `explain`, `query`, `affected`, `path` | Expone el tipo y consumo client-side; la ruta corta a `Movimiento` pasa por reexports, no prueba acoplamiento de dominio. |
| Impacto de `Movimiento` | `explain`, `query`, `affected`, `path` | Expone el tipo y el hook client-side; `affected` no resolvió un nodo único. |
| Ausencia de secretos | Escaneo acotado de artefactos generados | 0 coincidencias para patrones de claves privadas, AWS, GitHub, OpenAI, tokens y URLs con credenciales; no se leyó ningún `.env`. Resultado preliminar, requiere Reviewer independiente. |
| Exclusión de cambios no permitidos | `git status` y `git diff --check` | Pendiente de Tester/Reviewer. |

### Ejecución independiente del Tester

Fecha: 2026-07-29. Se ejecutó sin leer archivos `.env` ni modificar código, CI, manifests, Prisma, migraciones, tests, `.gitignore` o `AGENTS.md`.

| Verificación | Comando/evidencia independiente | Resultado |
|---|---|---|
| Binario y aislamiento | `.graphify-pilot-venv\\Scripts\\graphify.exe --version` | `graphify 0.9.29`. El binario se ejecuta desde el entorno virtual local; no hay cambio rastreado en manifests de paquetes. |
| Alcance Git | `git status --short --branch`; `git diff --name-status`; `git diff --check` | Rama `codex/graphify-pilot`. El único diff rastreado es `AGENTS.md`, ya declarado como preexistente al piloto; no se le atribuye al piloto. Permanecen no rastreados preexistentes `.agents/`, `docs/features/`, `empty_evidence.json` y `empty_review.json`, junto a los artefactos del piloto `.graphify-pilot-venv/` y `graphify-out/`. Sin errores de whitespace. Git no puede probar por sí solo la autoría de un cambio preexistente. |
| Grafo generado | Parseo de `graphify-out/graph.json` y medición recursiva | 5,794 nodos, 8,615 enlaces y 221 comunidades; `graphify-out/` contiene 24 archivos, 3 directorios y 6,734,753 bytes (6.423 MiB). Es utilizable para navegación AST de código, pero no para inferir dominio sin contraste. |
| Contaminación del corpus | Inspección de `source_file` en nodos | 5 nodos pertenecen a `.graphify-pilot-venv/Scripts/Activate.ps1`. El modo `--code-only` omitió material no-code, pero al generar sobre `.` incluyó ese script creado previamente. Es ruido de tooling, no un modelo del dominio; regenerar debe excluir `.graphify-pilot-venv/`. |
| Impacto: `DepositoProducto` | `explain`, `query`, `affected`, `path` | `explain` resolvió `packages/db/src/generated/client/index.d.ts:L120` (grado 1), no el modelo Prisma. `query` devolvió nodos de `turbo.json` no relacionados; `affected` no devolvió nodos. La ruta a `Movimiento` tuvo 9 saltos por runtime generado y aristas inferidas, con match ambiguo. No identifica la relación de dominio. |
| Impacto: `OrdenProduccion` | `explain`, `query`, `affected`, `path` | `explain` resolvió el tipo de cliente `use-ordenes.ts:L9`, sus reexports y `OrdenesPage`; `query` devolvió `turbo.json`; `affected` informó match no único. La ruta a `Movimiento` tiene 2 saltos por `queries/index.ts`, por lo que sólo prueba un barrel de frontend, no acoplamiento de dominio. |
| Impacto: `Movimiento` | `explain`, `query`, `affected`, `path` | `explain` resolvió el tipo de cliente `use-movimientos.ts:L4` y su reexport; `query` devolvió `turbo.json`; `affected` informó match no único. No identifica el modelo Prisma ni el uso de servidor. |
| Contraste con fuente | `packages/db/prisma/schema.prisma:403-540`; `apps/platform/server/src/deposito/routes/ordenes.ts:41-140`; `apps/platform/server/src/deposito/routes/movimientos.ts:12-60` | La fuente declara `Movimiento` en `:403`, `OrdenProduccion` en `:473` y `DepositoProducto` en `:518`. La relación real es `OrdenProduccion.producto` → `DepositoProducto` (`:490`) y `DepositoProducto.ordenes` (`:535`). `ordenes.ts` valida `depositoProducto` y crea `ordenProduccion`; `movimientos.ts` consulta `prisma.movimiento`. Ninguna de esas relaciones se recuperó de forma confiable con las consultas por nombre. |
| Secretos en salida | `rg -a -l --pcre2 <patrón> graphify-out` para claves privadas, AWS, GitHub, OpenAI y URLs con credenciales; se registraron sólo conteos/nombres, nunca valores | 0 coincidencias en cinco patrones genéricos. Resultado no concluyente: patrones pueden omitir formatos desconocidos y el grafo/manifest replica metadatos y estructura fuente. No se leyó ningún `.env`. |

Conclusión de Tester: el piloto cumple la ejecución local y la navegación AST básica, pero las consultas de símbolos homónimos no son una fuente confiable de relaciones de dominio. La propuesta de ignorar el entorno y toda salida derivada sigue siendo razonable; Reviewer debe evaluar la contaminación de 5 nodos del venv y la insuficiencia de desambiguación antes de integración.

### Revisión independiente

Fecha: 2026-07-29. Alcance limitado al diff, a los artefactos del piloto, a la evidencia del Builder/Tester y al contraste puntual con la fuente.

| Área revisada | Evidencia independiente | Dictamen |
|---|---|---|
| Método oficial | La [referencia oficial de CLI](https://graphify.com/docs/cli) identifica `graphifyy` como paquete PyPI que expone `graphify`; distingue la instalación del binario de `graphify install`, que registra skills de asistentes. La versión local es `0.9.29`, instalada dentro de `.graphify-pilot-venv` con `pip`, sin manifest de npm. | Conforme: el aislamiento local es apropiado para el piloto. `graphify install` no fue necesario ni ejecutado. |
| Alcance excluido | `git diff --name-status` sólo muestra `AGENTS.md`, declarado preexistente en la evidencia inicial; no hay diffs en `.gitignore`, manifests, CI, Prisma, migraciones ni tests. En la raíz sólo aparecen `.graphify-pilot-venv` y `graphify-out` como artefactos Graphify; no se detectaron configuración de proyecto, MCP, hooks, modo estricto, skills ni integración de Graphify. No hubo commit ni push; `HEAD` sigue en `codex/graphify-pilot` sobre `d49d0e7`. | Conforme, con límite de atribución: Git no puede probar quién originó el cambio preexistente en `AGENTS.md`; no se le atribuye al piloto ni se revisa/aprueba como actualización automática. |
| Grafo y corpus | `graphify-out/graph.json` contiene 5,794 nodos y 8,615 aristas. Hay 316 archivos fuente únicos; no hay nodos `.sql` ni de documentación. Sí hay 5 nodos de `.graphify-pilot-venv/Scripts/Activate.ps1`, por lo que `--code-only` excluyó documentación/SQL pero no excluyó el entorno virtual creado antes de generar. | No bloqueante para este piloto, pero una regeneración futura debe excluir explícitamente `.graphify-pilot-venv/`; el resultado actual no representa un mapa limpio de todo el repositorio. |
| Consultas y contraste | Los tres nombres resolvieron preferentemente tipos generados o hooks del cliente. Las rutas `OrdenProduccion` → `Movimiento` y `DepositoProducto` → `Movimiento` transitan reexports o aristas inferidas. La fuente confirma modelos Prisma en `schema.prisma:403`, `:473` y `:518`, y la relación de dominio `OrdenProduccion.producto` → `DepositoProducto` en `:490` / `:535`, que las consultas no recuperan de forma fiable. | Aporta navegación AST y evidencia de desambiguación requerida, pero no sirve para inferir dominio ni sustituir fuente. Es suficiente para continuar evaluándolo como piloto local, no para integrarlo. |
| Secretos | El escaneo acotado de `graphify-out/` no halló coincidencias en cinco patrones genéricos; se revisaron sólo conteos/rutas. No se leyó ningún `.env`. | No hay hallazgo bloqueante, pero **0 coincidencias no prueba ausencia de secretos**: formatos no cubiertos o metadatos derivados pueden escapar a esos patrones. No se afirma que los `.env` hayan sido inspeccionados. |
| Versionado e ignore | `.graphify-pilot-venv/` mide 159.60 MiB y `graphify-out/` 6.423 MiB; ambos son derivados locales y pueden replicar estructura o metadatos fuente. `.gitignore` no presenta diff. | Mantener ambos fuera de versión. Propuesta para una aprobación futura: ignorar `.graphify-pilot-venv/` y `graphify-out/` completos. No modificar `.gitignore` hasta autorización explícita. |

**Dictamen del Reviewer: `apto-para-verificar`.** No hay bloqueante para que Verify reconcilie el piloto. La decisión de integración permanece pendiente: el valor demostrado es navegación de código, no relaciones de dominio, y cualquier regeneración debe excluir el entorno virtual.

`skill_resolution: none`

## Evidencia de verificación

| Verificación | Evidencia | Resultado |
|---|---|---|
| Alcance y no objetivos respetados | Diff y estado de Git | Pendiente |
| Documentación/método oficial corroborados | URL, versión, fecha y comando | Pendiente |
| Consultas coherentes con código real | Contraste independiente por símbolo | Pendiente |
| Secretos no expuestos | Revisión independiente de artefactos | Pendiente |
| Versionado/ignore decidido | Tabla de artefactos y justificación | Pendiente |
| Actualización de contexto | Decisión exclusiva de Verify sobre `current.md` | Pendiente |

## Verificación final (independiente)

Estado transitorio establecido: `en-verificación`. Fecha: 2026-07-29.

| Criterio | Evidencia reconciliada | Resultado |
|---|---|---|
| Rama y estado inicial | Rama `codex/graphify-pilot`; `HEAD` y `origin/master` continúan en `d49d0e7`; no se creó commit. El workspace previo sigue preservado. | Conforme |
| Método oficial y aislamiento | La [CLI oficial](https://graphify.com/docs/cli) confirma que `graphifyy` expone `graphify` y distingue la instalación del binario de `graphify install`. La versión local es `0.9.29` en `.graphify-pilot-venv`; no se ejecutó `graphify install`. | Conforme |
| Grafo, tiempos y tamaño | `graphify extract . --code-only` produjo `graphify-out/` en 22.137 s; contiene 5,794 nodos y 8,615 enlaces y ocupa 6,734,753 bytes. El entorno aislado ocupa 167,347,936 bytes. El intento completo quedó explícitamente bloqueado por API key para entradas no-code. | Conforme, con alcance de código solamente |
| Consultas y contraste | Las consultas para `DepositoProducto`, `OrdenProduccion` y `Movimiento` encuentran principalmente tipos generados o hooks. La fuente en `packages/db/prisma/schema.prisma:403,473,518,490,535` confirma el modelo y la relación real, que el grafo no desambigua de forma fiable. | Conforme como navegación AST; no apto para inferir dominio |
| Secretos | Escaneo acotado de cinco patrones sobre `graphify-out/`: 0 coincidencias; ningún `.env` fue leído. Esta evidencia no demuestra ausencia universal de secretos. | Sin hallazgo bloqueante; no versionar salida |
| Alcance protegido | Sin diffs en `package.json`, `package-lock.json`, CI, Prisma, migraciones, tests ni `.gitignore`. `AGENTS.md` conserva un diff declarado preexistente y no fue modificado ni aprobado por este piloto. | Conforme |
| Versionado / ignore | No versionar `.graphify-pilot-venv/` ni `graphify-out/`. No modificar `.gitignore` durante este piloto. Una integración futura y explícita deberá agregar reglas de ignore adecuadas y un mecanismo de exclusión para el entorno virtual. | Decisión final del piloto |

**Estado final de Verify: `verificado`.** Graphify permanece como auxiliar local no versionado; el código y la documentación verificada siguen siendo la fuente de verdad. La decisión de integración queda pendiente.

## Estado e historial

- Estado actual: `verificado`
- Historial:
  - 2026-07-29 — Planner — plan de piloto local creado; instalación y evidencia pendientes.
  - 2026-07-29 — Builder — documentación oficial y precondiciones de instalación verificadas; inicio y estado previo registrados.
  - 2026-07-29 — Builder — `graphifyy==0.9.29` instalado de forma aislada; `graphify .` no pudo generar el grafo sin una API key para los documentos/media detectados. No se aplicó la alternativa `--code-only` porque exigiría un nuevo plan aprobado.
  - 2026-07-29 — Builder — con autorización explícita, `graphify extract . --code-only` generó un grafo local sin API key; consultas y contraste mostraron valor para navegación de tipos cliente, pero desambiguación insuficiente para inferir relaciones de dominio.
  - 2026-07-29 — Tester — validó versión, alcance Git, tamaño/metadatos, consultas y contraste con fuente. No detectó secretos con patrones genéricos. Detectó 5 nodos de `.graphify-pilot-venv/Scripts/Activate.ps1` dentro del corpus; se requiere revisión independiente antes de cualquier integración.
  - 2026-07-29 — Reviewer — confirmó el método oficial, el aislamiento y la ausencia de integración/configuración de Graphify en el proyecto. Dictamen `apto-para-verificar`: la salida sólo es apta para navegación de código y debe regenerarse excluyendo el entorno virtual antes de cualquier decisión de integración.
  - 2026-07-29 — Verify — estado transitorio `en-verificación`; evidencia reconciliada de rama, método oficial, salida, consultas, alcance y secretos. Estado final `verificado`; no versionar `.graphify-pilot-venv/` ni `graphify-out/`, y no modificar `.gitignore` en este piloto.

Estados válidos: `planificado` → `en-construcción` → `en-prueba` → `en-revisión` → `en-verificación` → `verificado` → `archivado`. Solo el archive SDD requerido puede pasar `verificado` a `archivado`; desde un estado activo: `bloqueado`.

## Bloqueos

- Ninguno para el Builder. Limitación pendiente de evaluación: el modo `--code-only` no valida docs/SQL/no-code y sus matches de símbolos homónimos pueden resolver a tipos generados o cliente. Tester, Reviewer y Verify deben decidir si ese alcance aporta valor suficiente sin backend autorizado.
