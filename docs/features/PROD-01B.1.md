# Feature: PROD-01B.1 — Preparación productiva Windows

> Antes de trabajar esta funcionalidad, leer este documento, `.agents/current.md` y la guía del rol aplicable.

## Alcance

- Configuración productiva externa y versionar solamente su template.
- Scripts Windows seguros para inicio, estado, detención, backup y restore de prueba.
- Healthcheck de Express + PostgreSQL.
- Build productivo, auditoría de seeds y guía operativa local.

## No objetivos

- Crear o migrar `platform_prod`.
- Ejecutar seeds, backups o restores productivos.
- Configurar Task Scheduler, firewall, PostgreSQL en LAN, stock real o credenciales.

## Restricciones

- PostgreSQL permanece en localhost.
- Los scripts no contienen secretos ni matan procesos ajenos.
- Google Sheets no participa del healthcheck y su configuración actual no se modifica.
- Sin commit ni push durante esta preparación.

## Nivel de riesgo

`alto`

- Justificación: scripts de procesos y operaciones futuras de backup/restore.
- Riesgo alto requiere Reviewer independiente y Verify.

## Criterios de aceptación

- [x] Startup usa `Start-Process -PassThru`, PID real, valida artefactos/PID/puerto y falla sin matar procesos ajenos.
- [x] La configuración productiva y sus secretos reales permanecen fuera del repo; sólo se versiona el template.
- [x] Backup usa `pg_dump -Fc`, `PGPASSFILE`, retención y guards de DB.
- [x] Restore sólo admite una DB temporal explícitamente confirmada.
- [x] `/api/health` comprueba PostgreSQL sin filtrar errores sensibles.
- [x] `npm run build:prod` produce ambos artefactos.
- [x] Seeds auditados sin ejecución.

## Plan de implementación

- [x] Inspeccionar handoff y configuración efectiva sin revelar secretos.
- [x] Completar template, scripts y documentación.
- [x] Implementar y probar healthcheck.
- [x] Ejecutar review y verificación final sobre el árbol corregido.

## Evidencia de implementación

| Cambio | Archivo/ruta | Evidencia |
|---|---|---|
| Handoff parcial | `apps/platform/server/tsconfig.json` | Cambio previo de Qwen preservado para excluir utilidades no productivas del build. |
| Config externa | `config/production.env.example`, `.gitignore` | Sólo placeholders; `config/*.env` y credenciales reales quedan excluidos del versionado. |
| Operación Windows | `scripts/windows/*.ps1` | Startup con PID real/puerto/build/logs; backup y restore con targets cerrados, `PGPASSFILE` externo y validación de dump. |
| Healthcheck | `apps/platform/server/src/health.ts`, `apps/platform/server/src/index.ts` | `SELECT 1`; respuestas 200/503 sanitizadas, sin Google. |
| Runbook | `docs/operations/LOCAL-PRODUCTION.md` | Preparación, startup, logs, backup, restore temporal, LAN y acciones futuras/prohibidas. |

## Evidencia de pruebas

| Criterio | Test/comando | Resultado |
|---|---|---|
| Health unitario | `npm --workspace @platform/server run test -- --run src/__tests__/health.test.ts` | PASS — 1 archivo, 2 tests. |
| Health HTTP construido | Probes temporales contra DB de desarrollo y endpoint inalcanzable | PASS — 200/connected y 503/disconnected sanitizado. |
| Scripts Windows | Parser PowerShell + pruebas focalizadas de guards/contratos | PASS — 6 scripts; backup sólo `platform_prod`; restore sólo `platform_prod_restore_test`. |
| Build productivo | `npm run build:prod` | PASS — server y client generados. |
| Bundle LAN | Escaneo de endpoints localhost/loopback con puerto | PASS — ningún endpoint productivo hardcodeado. |

## Evidencia de verificación

| Verificación | Evidencia | Resultado |
|---|---|---|
| Reviewer independiente inicial | Diff y untracked completos | `CHANGES_REQUESTED`: llamada obsoleta a `-ExpectedDatabase`, falta ignore del env real y evidencia pendiente. |
| Correcciones post-review | Startup, `.gitignore`, evidencia | Aplicadas. |
| Re-review independiente | Árbol corregido, parser de 6 scripts, firma/guard de startup, ignore y evidencia | `APPROVED`, sin hallazgos bloqueantes ni regresiones. |
| Verify — healthcheck | Reejecución `npm --workspace @platform/server run test -- --run src/__tests__/health.test.ts` + inspección del handler | PASS — 1 archivo/2 tests; contrato 200/503 y respuesta sanitizada. |
| Verify — scripts y guards | Parser PowerShell sobre 6 scripts + llamadas focalizadas a guards | PASS — sintaxis válida; backup sólo `platform_prod`; restore sólo `platform_prod_restore_test`. No se ejecutaron backup ni restore. |
| Verify — build y LAN | `npm run build:prod`, artefactos y escaneo del bundle | PASS — build completo; `server/dist/index.js` y `client/dist/index.html` presentes; sin endpoint loopback con puerto; Express sirve SPA en `0.0.0.0:3000` mediante startup. |
| Verify — Google efectivo | Inspección sanitizada de `apps/platform/server/.env` | PASS informativo — enabled/spreadsheet/hoja/ruta presentes; hoja `STOCK APP`; credential file existe fuera del repo; no se imprimieron valores sensibles. |
| Verify — ausencia de DB productiva | Consulta read-only a `pg_database` desde la conexión de desarrollo | PASS — `platform_prod` no existe; no se creó, migró ni sembró ninguna DB. |
| Verify — alcance prohibido | Inspección de comandos y estado | PASS — sin seeds, backup, restore, Task Scheduler, firewall, commit ni push. |

## Estado e historial

- Estado actual: `verificado`
- Historial:
  - 2026-09-09 — Builder — retomado desde handoff parcial de Qwen.
  - 2026-09-09 — Tester — health, scripts, build, artefactos y LAN validados sin usar producción.
  - 2026-09-09 — Reviewer independiente — `CHANGES_REQUESTED`; tres correcciones acotadas solicitadas.
  - 2026-09-09 — Builder — correcciones post-review aplicadas; re-review solicitado.
  - 2026-09-09 — Reviewer independiente — re-review del árbol corregido: `APPROVED`, sin hallazgos bloqueantes ni regresiones.
  - 2026-09-09 — Verify independiente — reconcilió criterios, diff/untracked, scripts, secrets/config, seeds, health, build, LAN y prohibiciones; reejecutó evidencia focalizada y emitió `VERIFICADO`. `.agents/current.md` no se actualizó porque su snapshot histórico no describe esta preparación.

## Bloqueos

- La DB `platform_prod` no existe por decisión explícita; no bloquea la preparación estática.
