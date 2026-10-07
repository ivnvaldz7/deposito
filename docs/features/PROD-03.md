# PROD-03 — Cierre operativo Windows / LAN

## Alcance

- Validar acceso LAN por hostname e IP sin cambiar código de la aplicación.
- Configurar el autoarranque productivo mediante `scripts/windows/start-prod.ps1`.
- Configurar el backup diario mediante `scripts/windows/backup-postgres.ps1`.
- Verificar arranque, health, conectividad, backup y exposición de PostgreSQL.
- Corregir el diagnóstico de estado bajo S4U sin relajar los guards destructivos de start/stop.
- Cerrar calidad reproducible de Logística: lint real, build, typecheck y tests focalizados.
- Actualizar el runbook `docs/operations/LOCAL-PRODUCTION.md` con evidencia real y pendientes manuales.

## No objetivos

- Cambiar stock, catálogo, lotes, pedidos o conversiones/acondicionamiento.
- Agregar features, migraciones o una PWA.
- Modificar Google, salvo comprobación de estado.
- Renombrar la PC o modificar el router sin autorización explícita.

## Restricciones

- Trabajar sobre `platform_prod` únicamente para el backup.
- Mantener PostgreSQL sin exposición a la LAN.
- Mantener dumps fuera del repositorio, en formato custom, con `PGPASSFILE` y retención de 30 días.
- Usar exclusivamente los scripts Windows existentes y no crear mecanismos paralelos.

## Nivel de riesgo

`alto`

- Justificación: integración con procesos Windows/S4U y actualización compatible del toolchain. No cambia esquema ni datos productivos.

## Criterios de aceptación

- [x] Hostname e IP actual identificados.
- [x] Acceso LAN desde otra PC comprobado por IP; hostname registrado como pendiente con fallback ordenado.
- [x] Reserva DHCP documentada como hecha o pendiente.
- [x] Tarea `LOGISTICA - Server` configurada al inicio de Windows con reintentos y sin mecanismo paralelo.
- [x] Tarea `LOGISTICA - Backup Diario` configurada diariamente a las 16:10 y para ejecutar luego de un inicio omitido.
- [x] Backup automático probado: dump nuevo, no vacío, formato custom y target `platform_prod`.
- [x] Reboot test real comprobado: tarea iniciada nueve segundos después del boot, resultado `0`, listener y health sanos.
- [x] TCP 3000 accesible y PostgreSQL 5432 loopback-only.
- [x] Runbook operativo actualizado sin secretos.
- [x] `status-prod.ps1` informa estado sano cuando S4U oculta `CommandLine`, exigiendo simultáneamente PID registrado, listener 3000 y health exacto.
- [x] Lint, typecheck, build productivo y suites focalizadas de Logística aprobados.

## Plan de implementación

- [x] Inspeccionar estado actual, scripts, hostname, red, runtime, firewall y tareas existentes.
- [x] Configurar o corregir las dos tareas programadas con los scripts existentes.
- [x] Ejecutar verificaciones locales, remotas disponibles y prueba de backup.
- [x] Reconciliar el reboot real del 2026-09-15 con Task Scheduler, proceso, puerto y health.
- [x] Reparar el falso negativo de `status-prod.ps1` y mantener start/stop con validación estricta de propiedad.
- [x] Activar lint real y estabilizar los tests focalizados con el toolchain actualizado.
- [x] Registrar evidencia y pendientes manuales en el runbook.

## Evidencia

- Hostname: `DEPOSITO`; no se renombró la PC.
- IPv4: `192.168.0.120/24`, DHCP habilitado desde `192.168.0.1`; MAC `10-BB-F3-63-F7-84`.
- Reserva DHCP: pendiente. La IP histórica `192.168.0.123` no coincide con la concesión actual.
- `LOGISTICA - Server`: registrada con trigger de boot, S4U, working directory del repo, `IgnoreNew`, seis reintentos cada minuto y timeout de 60 segundos para health. **Run** terminó con código `0`.
- Runtime posterior a **Run**: Node propietario en `0.0.0.0:3000`; SPA HTTP 200; health HTTP 200 y `db=connected` por loopback, `DEPOSITO` y `192.168.0.120` desde el servidor.
- `LOGISTICA - Backup Diario`: registrada diariamente a las 16:10, S4U, `StartWhenAvailable=true`, `IgnoreNew`, tres reintentos cada cinco minutos y retención de 30 días.
- Backup posterior al reboot: **PASS**; tarea con código `0`, archivo `platform_prod_2026-09-15_07-43-40.dump`, 130.683 bytes.
- PostgreSQL: listeners exclusivamente en `127.0.0.1:5432` y `[::1]:5432`.
- Firewall: sin cambios; la regla existente de `node.exe` permite TCP de entrada en perfil Público.
- Validación desde otra PC: **PASS por IP** en `http://192.168.0.120:3000`, confirmada por el usuario el 2026-09-14. `http://DEPOSITO:3000` no resolvió en esa estación; queda como mejora de resolución de nombre. El fallback operativo es la IP actual, con reserva DHCP pendiente.
- Reboot test: **PASS**. Windows inició a las `07:35:48`; `LOGISTICA - Server` corrió a las `07:35:57` con resultado `0`. El PID registrado escucha en `0.0.0.0:3000` y health devuelve `status=ok`, `app=platform`, `db=connected`.
- Cierre de datos: `prod-02b-initial-stock.ts --verify` confirmó 49 productos, 51 lotes, 46 saldos positivos, total general 32.436, sin negativos ni duplicados y conciliación `PASS`; verificación de solo lectura.
- Calidad Logística: lint **PASS**; typecheck **PASS**; build productivo **PASS**; core 7 archivos/58 tests; cliente Logística 21/214; servidor Logística 24/249, todos aprobados.
- Dependencias: 0 vulnerabilidades críticas. Quedan registradas una alerta sin parche npm para `xlsx`, limitada a la importación histórica de Depósito, alertas de tooling de Prisma y el aviso transitivo `ExcelJS/uuid`; no se forzaron downgrades incompatibles dentro de este cierre.
- Alcance protegido: no se modificó stock, catálogo, lotes, pedidos, migraciones ni Google Sheets.

## Estado e historial

- Estado actual: `verificado`
- 2026-09-14 — Configuración — tareas de servidor y backup registradas y probadas con resultado `0`.
- 2026-09-14 — UAT LAN — acceso desde otra PC validado por `http://192.168.0.120:3000`; hostname pendiente con fallback documentado.
- 2026-09-14 — Seguridad — contraseña inicial rotada en el primer ingreso y eliminado el log local que contenía el payload sensible.
- 2026-09-15 — Reboot — autoarranque y backup posteriores al inicio de Windows verificados; health y DB sanos.
- 2026-09-15 — Calidad — falso negativo S4U corregido, lint activado y 521 tests focalizados aprobados.
- Mejoras no bloqueantes: reserva DHCP y resolución de `DEPOSITO` desde clientes; el fallback por IP es operativo.
