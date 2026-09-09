# Producción local Windows — ALE-BET

## Arquitectura

Una PC Windows ejecuta PostgreSQL sólo en `localhost:5432` y Express/Node en `0.0.0.0:3000`. Express sirve `apps/platform/client/dist`; las demás PCs acceden por navegador a `http://<NOMBRE_O_IP_LAN_DEL_SERVIDOR>:3000`. Google Sheets sigue siendo una integración post-COMMIT y no bloquea `/api/health`.

## Preparación (sin crear todavía `platform_prod`)

1. Ejecutar `npm run build:prod` desde el repo.
2. Crear fuera del repo `C:\AleBet\config\production.env` a partir de `config\production.env.example`.
3. Guardar credenciales Google y `pgpass.conf` dentro de `C:\AleBet\secrets\`, con permisos restringidos al usuario del servicio.
4. Crear `C:\AleBet\logs\` y `C:\AleBet\backups\`, o configurar las rutas equivalentes.

El frontend productivo usa API same-origin; no requiere `VITE_API_URL=localhost`.

## Startup manual y estado

```powershell
powershell.exe -NoProfile -File .\scripts\windows\start-prod.ps1
powershell.exe -NoProfile -File .\scripts\windows\status-prod.ps1
powershell.exe -NoProfile -File .\scripts\windows\stop-prod.ps1
```

Startup valida config externa, build, PID y puerto 3000. Inicia Node con `Start-Process -PassThru`, guarda su PID real y escribe stdout/stderr en logs separados. Nunca termina el proceso que ya ocupa el puerto.

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

Ninguno de estos comandos se ejecuta durante PROD-01B.1.

## Automatización futura

- Task Scheduler “At startup”: `powershell.exe -NoProfile -File <REPO>\scripts\windows\start-prod.ps1`.
- Task Scheduler diario: `powershell.exe -NoProfile -File <REPO>\scripts\windows\backup-postgres.ps1`.
- Firewall futuro: permitir TCP 3000 sólo para el perfil/red privada y luego verificar la URL LAN.

No registrar todavía las tareas ni crear reglas de firewall.

## Todavía prohibido

No crear `platform_prod`, ejecutar migraciones/seeds, cargar stock real, ejecutar backup/restore, exponer PostgreSQL a LAN ni copiar secretos al repo durante PROD-01B.1.
