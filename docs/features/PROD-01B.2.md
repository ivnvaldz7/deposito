# Feature: PROD-01B.2 — Creación y validación de producción local

> Antes de trabajar esta funcionalidad, leer este documento, `.agents/current.md` y la guía del rol aplicable.

## Alcance

- Crear exclusivamente la base local vacía `platform_prod` y aplicar migraciones.
- Preparar configuración productiva real externa y crear selectivamente el admin inicial.
- Validar build, runtime, health, frontend, Google, backup y restore temporal.
- Documentar evidencia operativa real sin secretos.

## No objetivos

- Cargar stock, pedidos o datos UAT.
- Ejecutar `db:seed-deposito` o `db:seed-ale-bet`.
- Exponer PostgreSQL, configurar Task Scheduler o hacer push; el commit queda reservado al checkpoint final expresamente autorizado.

## Restricciones

- Verificar `localhost/platform_prod` antes de cada escritura productiva.
- No tocar `platform`, `platform_test`, `platform_test_automation` ni `deposito`.
- Restore únicamente sobre `platform_prod_restore_test` y sin secretos en evidencia.

## Nivel de riesgo

`alto`

- Justificación: creación de DB, migraciones, usuario inicial y restore temporal.
- Riesgo alto requiere Reviewer independiente y Verify.

## Criterios de aceptación

- [x] `platform_prod` creada, migrada y sin datos operativos/UAT/stock.
- [x] Admin productivo único creado/activo con accesos correctos.
- [x] Runtime productivo, health DB y frontend local funcionan.
- [x] Backup custom real y restore temporal validados.
- [x] Config Google válida sin modificar la hoja.
- [x] Evidencia LAN y pendientes de firewall/Task Scheduler documentados.

## Plan de implementación

- [x] Precheck saneado de herramientas, config y targets.
- [x] Crear DB, migrar y auditar vacío operativo.
- [x] Crear admin selectivo y validar configuración Google.
- [x] Construir, arrancar y verificar health/frontend/LAN.
- [x] Ejecutar backup y restore temporal; reauditar producción vacía.
- [x] Actualizar runbook y entregar para review; el commit final requiere receipt y autorización explícita.

## Evidencia de implementación

| Cambio | Archivo/ruta | Evidencia |
|---|---|---|
| Inicio | `docs/features/PROD-01B.2.md` | Feature creada desde template antes de mutar infraestructura. |
| Config | `C:\AleBet\config\production.env` | Config productiva y pgpass externos, con ACL restringida y sin versionar. |
| Base | `platform_prod` | Rol `platform_app`; 29 migraciones aplicadas; esquemas esperados presentes. |
| Runtime | `scripts/windows/start-prod.ps1` | PID real 6128, escucha `0.0.0.0:3000`; timeout explícito de 60 s para arranque en frío. |
| Admin | `platform.PlatformUser` / `platform.AppAccess` | Un superadmin activo con cuatro accesos activos: Admin, Ale-Bet, Depósito y Portal. |
| Backup | `C:\AleBet\backups\platform_prod_2026-09-11_08-42-09.dump` | Dump custom real, no vacío y legible por `pg_restore`; permanece fuera del repo. |
| Restore | `platform_prod_restore_test` | Restore temporal ejecutado, comparado y eliminado; no se volvió a crear durante el cierre. |
| Runbook | `docs/operations/LOCAL-PRODUCTION.md` | Estado real, acceso LAN y pendientes operativos reconciliados sin secretos. |

## Evidencia de pruebas

| Criterio | Test/comando | Resultado |
|---|---|---|
| Build | `npm run build:prod` | PASS; outputs server y client presentes. |
| Health local | `GET http://localhost:3000/api/health` | PASS; HTTP 200, `ok/connected`. |
| Frontend | Navegador en `http://localhost:3000` | PASS; SPA redirige a `/login` y muestra formulario. |
| LAN desde servidor | `GET http://192.168.0.123:3000` y `/api/health` | PASS; HTTP 200. IP observada, sujeta a cambios por DHCP. |
| LAN desde otra PC | `GET http://192.168.0.123:3000` y `/api/health` | PASS; SPA y health remoto confirmados. |
| Datos | Conteos SQL finales | PASS; operaciones, stock y aliases en cero; 1 usuario productivo corresponde al superadmin inicial. |
| Admin | Consulta SQL read-only | PASS; 1 usuario activo superadmin y 4 accesos activos con roles esperados. |
| Login local | Sesión y auditoría productivas | PASS; 1 sesión persistida y 1 evento `LOGIN_SUCCESS`. |
| Backup | Existencia + `pg_restore --list` | PASS; dump custom legible de 119835 bytes. |
| Comparación | Conteos del dump vs. `platform_prod` | PASS; 29 migraciones, 1 usuario, 4 accesos y tablas de stock/pedidos/aliases en 0 en ambos. |
| Cleanup | Consulta read-only a `pg_database` | PASS; `platform_prod_restore_test` no existe. |
| Google | Validación de configuración sin escritura | PASS; variables presentes, sin placeholders y credencial externa existente. |

## Evidencia de verificación

| Verificación | Evidencia | Resultado |
|---|---|---|
| Persistencia del trabajo previo | `git diff` y archivos externos | PASS; runbook, feature, dump y estado productivo presentes. |
| Salud final | PID ownership + health local/LAN + SQL read-only | PASS; PID 4512, HTTP 200 `ok/connected`, 29 migraciones. |
| Smoke LAN remoto | Navegador desde otra PC de la red | PASS; SPA y `/api/health` accesibles mediante la IP LAN observada. |
| Producción vacía | Conteos actuales y snapshot del dump | PASS; productos, lotes, saldos, movimientos, pedidos, items y aliases en 0. |
| Alcance prohibido | Inspección de estado | PASS; sin carga de stock, Task Scheduler, regla de firewall, commit ni push. |

## Estado e historial

- Estado actual: `verificado`
- Historial:
  - 2026-09-09 — Builder — inicio controlado desde checkpoint `8ae6ce5e`.
  - 2026-09-11 — Builder — admin, login, backup, restore, comparación, cleanup, Google y LAN completados.
  - 2026-09-11 — Verify — evidencia persistida reconciliada con runtime, dump y consultas read-only; producción vacía verificada.
  - 2026-09-11 — Operación — smoke LAN remoto validado desde otra PC; SPA y health accesibles en la IP observada.

## Bloqueos

- Ninguno para el cierre de producción vacía. Task Scheduler, una eventual regla de firewall sólo si hace falta y la carga de stock pertenecen a pasos posteriores explícitos.
