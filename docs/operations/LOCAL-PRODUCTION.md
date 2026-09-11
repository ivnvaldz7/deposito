# Producción local Windows — ALE-BET

## Arquitectura

Una PC Windows ejecuta PostgreSQL sólo en `localhost:5432` y Express/Node en `0.0.0.0:3000`. Express sirve `apps/platform/client/dist`; las demás PCs acceden por navegador a `http://<NOMBRE_O_IP_LAN_DEL_SERVIDOR>:3000`. Google Sheets sigue siendo una integración post-COMMIT y no bloquea `/api/health`.

## Estado validado (2026-09-11 — PROD-01B.2)

- Base `platform_prod` creada en PostgreSQL local, propiedad del rol limitado `platform_app`.
- Las 29 migraciones están aplicadas y los esquemas `platform`, `ale_bet` y `deposito` existen.
- Configuración real externa en `C:\AleBet\config\production.env`; secretos y `pgpass.conf` permanecen fuera del repo con ACL restringida.
- Build productivo, SPA y health con DB validados.
- Superadmin productivo creado vía `db:create-superadmin` con credenciales externas (PROD-01B.2).
- Login productivo verificado: autenticación local con JWT funcional.
- Backup real ejecutado con `backup-postgres.ps1`; dump almacenado en `C:\AleBet\backups\` (fuera del repo).
- Restore de prueba sobre `platform_prod_restore_test` ejecutado y comparado; conteos idénticos a producción (29 migraciones, 1 usuario, 4 accesos, stock/pedidos en 0).
- DB temporal `platform_prod_restore_test` eliminada tras validación.
- Producción vacía: sin stock, pedidos, movimientos, saldos ni lotes. La carga inicial de stock pertenece a PROD-02.

El frontend productivo usa API same-origin; no requiere `VITE_API_URL=localhost`.

## Startup manual y estado

```powershell
powershell.exe -NoProfile -File .\scripts\windows\start-prod.ps1 -StartupTimeoutSeconds 60
powershell.exe -NoProfile -File .\scripts\windows\status-prod.ps1
powershell.exe -NoProfile -File .\scripts\windows\stop-prod.ps1
```

Startup valida config externa, build, PID y puerto 3000. Inicia Node con `Start-Process -PassThru`, guarda su PID real y escribe stdout/stderr en logs separados. Nunca termina el proceso que ya ocupa el puerto.

En este host, el primer arranque superó los 20 segundos predeterminados; usar 60 segundos evita un falso timeout durante el arranque en frío. La instancia validada escucha en `0.0.0.0:3000`, sirve la SPA y responde `200 {status: ok, db: connected}`.

## Backup

`PGPASSFILE` debe apuntar a un archivo externo compatible con PostgreSQL. El script no solicita ni imprime passwords.

```powershell
powershell.exe -NoProfile -File .\scripts\windows\backup-postgres.ps1
```

Sólo admite por defecto `platform_prod`, ejecuta `pg_dump -Fc` y elimina dumps de más de 30 días.

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
- LAN observada durante PROD-01B.2: `http://192.168.0.123:3000`. La dirección puede cambiar por DHCP y no está hardcodeada en el sistema.
- Desde el propio servidor, SPA y health responden por la IP LAN.
- Smoke desde otra PC de la red validado: la SPA abre y `http://192.168.0.123:3000/api/health` responde correctamente.
- Windows clasifica actualmente Ethernet como red Pública. El acceso remoto funciona sin crear una regla nueva; evaluar una regla TCP 3000 sólo si deja de ser suficiente la configuración existente. Nunca abrir 5432 ni 5177.

El callback Google configurado sigue apuntando a `localhost:3000`; un acceso remoto por LAN puede requerir registrar una URL autorizada adicional antes de usar OAuth desde otra PC.

## Automatización futura

- Task Scheduler “At startup”: `powershell.exe -NoProfile -File <REPO>\scripts\windows\start-prod.ps1`.
- Task Scheduler diario: `powershell.exe -NoProfile -File <REPO>\scripts\windows\backup-postgres.ps1`.
- Firewall futuro: permitir TCP 3000 sólo para el perfil/red privada y luego verificar la URL LAN.

No registrar todavía las tareas ni crear reglas de firewall.

## Pendiente y todavía prohibido

- PROD-02: carga inicial de stock (planillas, lotes, sincronización).
- Task Scheduler y una eventual regla de firewall TCP 3000, sólo si realmente hace falta, quedan para un paso explícito posterior.
- No cargar stock, pedidos ni datos UAT; no ejecutar seeds; no exponer PostgreSQL; no copiar secretos al repo.
