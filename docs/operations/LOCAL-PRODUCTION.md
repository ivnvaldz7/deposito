# Producción local Windows — ALE-BET

## Arquitectura

Una PC Windows ejecuta PostgreSQL sólo en `localhost:5432` y Express/Node en `0.0.0.0:3000`. Express sirve `apps/platform/client/dist`; las demás PCs acceden por navegador a `http://<NOMBRE_O_IP_LAN_DEL_SERVIDOR>:3000`. Google Sheets sigue siendo una integración post-COMMIT y no bloquea `/api/health`.

## Estado operativo (2026-09-15 — PROD-03 cerrado)

- Base `platform_prod` creada en PostgreSQL local, propiedad del rol limitado `platform_app`.
- Las 29 migraciones están aplicadas y los esquemas `platform`, `ale_bet` y `deposito` existen.
- Configuración real externa en `C:\AleBet\config\production.env`; secretos y `pgpass.conf` permanecen fuera del repo con ACL restringida.
- Build productivo, SPA y health con DB validados.
- Superadmin productivo creado vía `db:create-superadmin` con credenciales externas (PROD-01B.2).
- Login productivo verificado: autenticación local con JWT funcional; la contraseña inicial fue cambiada obligatoriamente en el primer ingreso.
- Backup real y tarea automática ejecutados con `backup-postgres.ps1`; dumps almacenados en `C:\AleBet\backups\` (fuera del repo).
- Restore de prueba sobre `platform_prod_restore_test` ejecutado y comparado; conteos idénticos a producción (29 migraciones, 1 usuario, 4 accesos, stock/pedidos en 0).
- DB temporal `platform_prod_restore_test` eliminada tras validación.
- El catálogo y el stock inicial productivos fueron cargados y conciliados en PROD-02. PROD-03 no consultó ni modificó stock, pedidos, catálogo, lotes ni Google Sheets.
- Hostname Windows actual: `DEPOSITO`. No se renombró la PC; es un nombre corto y operativo suficiente.
- URL amigable recomendada: `http://DEPOSITO:3000`.
- IPv4 observada: `192.168.0.120/24`, entregada por DHCP desde `192.168.0.1`. La IP histórica `192.168.0.123` ya no está asignada a este servidor.
- MAC Ethernet para una reserva DHCP: `10-BB-F3-63-F7-84`.
- La reserva DHCP está pendiente porque no se modificó el router.
- Las tareas `LOGISTICA - Server` y `LOGISTICA - Backup Diario` están registradas y fueron verificadas después de un reinicio real de Windows.
- El acceso desde otra PC está validado por IP. La resolución por hostname y la reserva DHCP son mejoras opcionales; no bloquean el uso diario.

El frontend productivo usa API same-origin; no requiere `VITE_API_URL=localhost`.

## Autoarranque y estado

```powershell
powershell.exe -NoProfile -File .\scripts\windows\start-prod.ps1 -StartupTimeoutSeconds 60
powershell.exe -NoProfile -File .\scripts\windows\status-prod.ps1
powershell.exe -NoProfile -File .\scripts\windows\stop-prod.ps1
```

Startup valida config externa, build, PID y puerto 3000. Inicia Node con `Start-Process -PassThru`, guarda su PID real y escribe stdout/stderr en logs separados. Nunca termina el proceso que ya ocupa el puerto.

`status-prod.ps1` conserva la validación estricta por propietario cuando Windows expone `CommandLine`. En tareas S4U, donde CIM puede ocultarlo, acepta únicamente una comprobación conjunta y de solo lectura: PID registrado, ese PID escuchando en el puerto 3000 y health exacto `status=ok`, `app=platform`, `db=connected`. Los scripts de arranque y detención no usan este fallback.

En este host, el primer arranque superó los 20 segundos predeterminados; usar 60 segundos evita un falso timeout durante el arranque en frío. La instancia validada escucha en `0.0.0.0:3000`, sirve la SPA y responde `200 {status: ok, db: connected}`.

Task Scheduler está configurado así:

| Campo | Valor |
|---|---|
| Tarea | `LOGISTICA - Server` |
| Trigger | Al iniciar Windows (`At startup`) |
| Usuario | `DEPOSITO\Deposito`, inicio S4U sin guardar contraseña |
| Acción | `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "<REPO>\scripts\windows\start-prod.ps1" -ConfigPath "C:\AleBet\config\production.env" -StartupTimeoutSeconds 60` |
| Working directory | Raíz absoluta del repositorio |
| Instancias múltiples | `IgnoreNew`; los guards existentes de PID y puerto siguen activos |
| Recuperación | 6 reintentos, uno por minuto |
| Ejecución omitida | `StartWhenAvailable=true` |

Reboot test del 2026-09-15: **PASS**. Windows inició a las `07:35:48`; la tarea corrió a las `07:35:57` con código `0`. El proceso quedó escuchando en `0.0.0.0:3000` y health respondió HTTP 200 con `db=connected`.

## Backup

`PGPASSFILE` debe apuntar a un archivo externo compatible con PostgreSQL. El script no solicita ni imprime passwords.

```powershell
powershell.exe -NoProfile -File .\scripts\windows\backup-postgres.ps1
```

Sólo admite por defecto `platform_prod`, ejecuta `pg_dump -Fc` y elimina dumps de más de 30 días.

Task Scheduler está configurado así:

| Campo | Valor |
|---|---|
| Tarea | `LOGISTICA - Backup Diario` |
| Trigger | Diario a las `16:10` |
| Usuario | `DEPOSITO\Deposito`, inicio S4U sin guardar contraseña |
| Acción | Script existente con config externa, `pg_dump.exe` de PostgreSQL 16 y `RetentionDays=30` |
| Destino | `C:\AleBet\backups\`, fuera del repositorio |
| Instancias múltiples | `IgnoreNew` |
| Recuperación | 3 reintentos, uno cada 5 minutos |
| Ejecución omitida | `StartWhenAvailable=true` |

Si la PC está apagada a las 16:10, la tarea no la enciende. Cuando Windows y Task Scheduler vuelven a estar disponibles, la ejecución omitida queda habilitada para iniciarse cuanto antes. El siguiente horario diario continúa siendo 16:10.

Prueba automática más reciente: **PASS**. Después del reboot, la tarea terminó con código `0` y creó `platform_prod_2026-09-15_07-43-40.dump`, de 130.683 bytes. La validación previa de formato custom, target `platform_prod` y ausencia de secretos continúa vigente.

## Restore de prueba

Crear previamente una DB vacía llamada exactamente `platform_prod_restore_test`. Después:

```powershell
powershell.exe -NoProfile -File .\scripts\windows\restore-postgres-test.ps1 -BackupFile C:\AleBet\backups\platform_prod_YYYY-MM-DD_HH-mm-ss.dump -ConfirmTemporaryTarget
```

El guard rechaza `platform_prod`, `platform`, `platform_test`, `platform_test_automation` y `deposito`. Antes de conectar al destino valida que el archivo sea un dump custom legible por `pg_restore`; el restore limpia únicamente la DB temporal validada.

## Seeds auditados

| Comando | Efecto | Recomendación para `platform_prod` |
|---|---|---|
| `db:seed-deposito` | Hace upsert de `DepositoProducto`, `InventarioDroga`, `InventarioFrasco`, `InventarioEtiqueta` e `InventarioEstuche` desde CSV versionados con cantidades históricas. Es reejecutable, pero sobrescribe cantidades y no usa una transacción global. | **NO USAR**: contiene datos reales/históricos, no demo, pero puede reemplazar stock operativo sin movimientos de trazabilidad. |
| `db:seed-ale-bet` | Crea `Producto` y `Lote` desde CSV históricos; salta registros existentes y usa `cajas`/`sueltos` legacy. No crea `SaldoStock`, `MovimientoStock` ni outbox. | **NO USAR**: es reejecutable frente al mismo estado, pero no inicializa el modelo administrado de stock requerido en producción y una falla puede dejar carga parcial. |
| `db:create-superadmin` | Crea `PlatformUser` con `AppAccess`, o eleva/reactiva un usuario existente por email; en el caso existente no reconcilia accesos ni password. | **USAR SELECTIVAMENTE** una sola vez, con `ADMIN_EMAIL`/`ADMIN_PASSWORD` externos y verificación explícita del target. |

Los dos seeds permanecen prohibidos. `db:create-superadmin` sólo se ejecuta durante PROD-01B.2 con credenciales productivas externas y target `platform_prod` revalidado.

## Acceso local y LAN

- Local: `http://localhost:3000`.
- Nombre amigable recomendado: `http://DEPOSITO:3000`.
- LAN observada en PROD-03: `http://192.168.0.120:3000`. La dirección viene por DHCP y no está hardcodeada en el sistema.
- Desde el propio servidor, SPA y health responden con HTTP 200 por `DEPOSITO` y por `192.168.0.120`; health informa `db=connected`.
- Desde otra PC, `http://192.168.0.120:3000` quedó validado. `http://DEPOSITO:3000` no resolvió en esa estación; hasta configurar la resolución de nombre, usar la IP como fallback.
- Windows clasifica actualmente Ethernet como red Pública. El acceso remoto funciona sin crear una regla nueva; evaluar una regla TCP 3000 sólo si deja de ser suficiente la configuración existente. Nunca abrir 5432 ni 5177.
- La regla existente de entrada para `node.exe` permite TCP en el perfil Público. PROD-03 no cambió el firewall. PostgreSQL continúa escuchando sólo en `127.0.0.1:5432` y `[::1]:5432`.

El ingreso productivo actual es local, con email, contraseña y JWT; por eso el uso diario desde la LAN no depende de Google OAuth. El callback Google continúa apuntando a `localhost:3000` y sólo deberá ampliarse si más adelante se decide ofrecer ese método de acceso desde otras PCs.

### Reserva DHCP

Estado: **pendiente**. Procedimiento en el router, sin tocar código:

1. Abrir la administración del gateway `192.168.0.1` con una cuenta autorizada.
2. Entrar a LAN/DHCP y luego a *Address Reservation*, *Static Lease* o equivalente.
3. Registrar la MAC `10-BB-F3-63-F7-84` con la IP elegida.
4. Preferir reservar la IP actual `192.168.0.120` para evitar otro cambio. Si se requiere volver a `192.168.0.123`, comprobar primero en el router que esté libre y fuera de conflicto antes de reservarla.
5. Aplicar, reiniciar o renovar la concesión del servidor y confirmar con `ipconfig` que la IP esperada quedó asignada.
6. Probar desde otra PC las URLs por hostname y por IP. No hardcodear ninguna IP en la aplicación.

Si `DEPOSITO` no resuelve desde la otra PC, aplicar en orden: confirmar nombre de PC/NetBIOS y perfil de red; crear la reserva DHCP; usar una entrada en el archivo `hosts` de esa estación como fallback; configurar DNS local sólo si ya existe esa infraestructura.

### Acceso fácil en Chrome o Edge

- En la PC servidor, abrir y marcar `http://localhost:3000` como `LOGÍSTICA`.
- En las demás PCs, mientras el hostname no resuelva, marcar `http://192.168.0.120:3000` como `LOGÍSTICA`.
- Como alternativa, usar la opción del navegador para crear un acceso directo o instalar el sitio como aplicación cuando esté disponible. Esto no requiere ni implica implementar una PWA.

### Repetición del reboot test

1. Reiniciar Windows con las tareas ya registradas.
2. No ejecutar manualmente `start-prod.ps1` ni usar **Run** sobre la tarea del servidor.
3. Confirmar que `LOGISTICA - Server` tenga una ejecución posterior al boot y resultado `0`.
4. Confirmar proceso Node propietario, listener `0.0.0.0:3000` y `http://127.0.0.1:3000/api/health` con HTTP 200 y `db=connected`.
5. Desde otra PC probar `http://DEPOSITO:3000` y `http://192.168.0.120:3000` (o la IP definitiva reservada).

Este procedimiento ya fue aprobado el 2026-09-15 y queda como control de regresión. No crear reglas adicionales de firewall mientras el acceso TCP 3000 existente continúe funcionando.

## Pendiente y todavía prohibido

- Resolver opcionalmente el hostname desde otras PCs; el acceso por IP ya está validado.
- Crear la reserva DHCP autorizada en el router.
- Una eventual regla TCP 3000 más específica sólo se evalúa si el acceso LAN deja de funcionar; PROD-03 no cambió firewall.
- No cargar stock, pedidos ni datos UAT; no ejecutar seeds; no exponer PostgreSQL; no copiar secretos al repo.
