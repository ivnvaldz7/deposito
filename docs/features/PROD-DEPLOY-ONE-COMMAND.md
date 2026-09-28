# PROD — Deploy de una orden

> Procedimiento único para compilar y reiniciar el runtime productivo Windows de ALE-BET sin migrar ni tocar datos.

## Alcance

- Endurecer la detención del proceso propio con espera gradual, revalidación de ownership y verificación del puerto.
- Crear `scripts/windows/deploy-prod.ps1` para preflight, build, stop/start vía la tarea existente, health, PID, listener y resultado de tarea.
- Mantener todos los secretos y la configuración productiva fuera del repositorio.
- Registrar evidencia de lanzamiento mínima para poder validar el proceso cuando S4U oculta `CommandLine` a la sesión interactiva.

## No objetivos

- Migraciones, seeds, resets, `db push`, backups/restores o cambios de datos.
- Crear otra tarea programada, otra instancia de servidor, commit o push.
- Ejecutar un despliegue durante esta implementación.

## Restricciones

- El build debe terminar antes de detener el proceso actual.
- Solo terminar un proceso cuya identidad sea `node.exe` y cuyo argumento sea el `entryPath` exacto.
- El PID file se elimina únicamente después de confirmar que el proceso murió.
- Si S4U oculta `CommandLine`, aceptar ownership solo con el owner proof del mismo PID, entryPath/ejecutable y hora de inicio del proceso vivo.
- No reportar éxito sin health 200/db conectado, un único listener IPv4 `0.0.0.0:3000` y LastTaskResult 0.

## Nivel de riesgo

`alto`

- Justificación: coordinación de procesos Windows y parada/arranque productivo.
- Requiere revisión independiente y Verify antes de considerar el flujo listo para uso productivo.

## Criterios de aceptación

- [x] `stop-prod.ps1` espera 30 s, revalida ownership antes del force-kill y comprueba puerto libre.
- [x] `deploy-prod.ps1` valida configuración y target `platform_prod`, compila antes de detener y valida estabilidad final.
- [x] S4U con `CommandLine` oculto tiene validación acotada por evidencia de lanzamiento enlazada al proceso vivo.
- [x] Un proceso desconocido nunca se termina.
- [x] Los errores identifican etapa, PID y rutas de logs sin imprimir secretos.
- [ ] Revisión independiente y Verify con evidencia completa; el despliegue productivo queda fuera de esta verificación.

## Plan de implementación

- [x] Inspeccionar scripts, runbook y estado operativo sin detener el servidor.
- [x] Implementar guards y orquestación.
- [x] Ejecutar pruebas simuladas y parseo PowerShell.
- [ ] Revisión independiente y Verify.

## Evidencia de implementación

| Cambio | Archivo/ruta | Evidencia |
|---|---|---|
| Stop con ownership / timeout / puerto | `scripts/windows/stop-prod.ps1`, `scripts/windows/prod-common.ps1` | Cambios locales; no ejecutados contra el runtime productivo. |
| Orquestación de release | `scripts/windows/deploy-prod.ps1` | Build precede `schtasks /End`; health y validaciones antes de imprimir OK. |
| Evidencia S4U | `scripts/windows/start-prod.ps1` | `platform.pid.owner.json` registra únicamente PID, node.exe, entryPath y hora de inicio; no contiene secretos. |
| Cobertura simulada | `scripts/windows/tests/prod-deploy.Tests.ps1` | Casos de ownership, stale PID, demora, force-kill, health, tarea programada y listeners. |

## Evidencia de pruebas

| Criterio | Test/comando | Resultado |
|---|---|---|
| Guards y orquestación simulada | `Invoke-Pester -Script .\scripts\windows\tests\prod-deploy.Tests.ps1` | PASS — 15 tests; procesos lentos, ownership, S4U proof, PID stale, task, build-before-stop, health tardío/ausente y listener único. |
| Sintaxis PowerShell | `Parser::ParseFile` sobre common, start, stop, deploy y tests | PASS — 5 archivos sin errores sintácticos. |
| Sin despliegue durante el trabajo | Revisión del proceso de trabajo | PASS — no se invocaron `deploy-prod.ps1`, `/End`, `/Run` ni `stop-prod.ps1`. |

## Evidencia de verificación

| Verificación | Evidencia | Resultado |
|---|---|---|
| Runtime antes del cambio | Tarea Ready, LastTaskResult 0, health HTTP 200/db connected, listener único en 0.0.0.0:3000 | Observado; sin interrupción. |
| Ownership S4U legacy | PID file 13936; `node.exe`; listener único; health sano; tarea con acción `start-prod.ps1`, policy `IgnoreNew`, LastTaskResult 0 | Evidencia observada; deploy no ejecutado. |

## Estado e historial

- Estado actual: `en-revisión`
- Historial:
  - 2026-09-23 — Implementación — flujo de deploy seguro de una orden; simulaciones aprobadas, pendiente revisión independiente.

Estados válidos: `planificado` → `en-construcción` → `en-prueba` → `en-revisión` → `en-verificación` → `verificado` → `archivado`. Solo el archive SDD requerido puede pasar `verificado` a `archivado`; desde cualquier estado activo: `bloqueado`.

## Bloqueos

- Pendiente revisión independiente y Verify antes de declarar READY para uso productivo.
