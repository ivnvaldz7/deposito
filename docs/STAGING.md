# Staging y Pruebas Reales

La app puede correrse como una sola aplicación Node: Express sirve la API en `/api/*` y también el build estático de React.

## Estado Actual

Este setup ya fue verificado localmente con Docker Postgres.

| Check | Resultado |
|-------|-----------|
| `docker compose up -d postgres` | OK, container `deposito-postgres` healthy |
| `npm run db:setup:staging` | OK, migraciones + usuarios staging |
| `npm run build:prod` | OK |
| `npm run start:prod` | OK |
| `POST /api/auth/login` con `admin@example.com` | OK, devuelve JWT |

## Para Continuar Desde Otra PC

1. Clonar o actualizar el repo:
   ```bash
   git pull
   npm install
   ```
2. Abrir Docker Desktop.
3. Levantar Postgres:
   ```bash
   docker compose up -d postgres
   ```
4. Crear `apps/platform/server/.env` con las variables de esta guía.
5. Preparar base + usuarios:
   ```bash
   npm run db:setup:staging
   ```
6. Build + start:
   ```bash
   npm run build:prod
   npm run start:prod
   ```
7. Abrir:
   ```txt
   http://localhost:3000
   ```

## Quick Path

1. Configurar variables de entorno en `apps/platform/server/.env` o en el host.
2. Preparar la base:
   ```bash
   npm run db:setup:staging
   ```
3. Construir la app:
   ```bash
   npm run build:prod
   ```
4. Arrancar producción local:
   ```bash
   npm run start:prod
   ```
5. Abrir:
   ```txt
   http://localhost:3000
   ```

## PostgreSQL Local Con Docker

El repo incluye `docker-compose.yml` para levantar una base local aislada en el puerto `5433`.

1. Abrir Docker Desktop.
2. Levantar Postgres:
   ```bash
   docker compose up -d postgres
   ```
3. Usar esta URL:
   ```env
   PLATFORM_DATABASE_URL="postgresql://deposito:deposito@localhost:5433/deposito"
   ```
4. Preparar schema y usuarios:
   ```bash
   npm run db:setup:staging
   ```

## Variables Necesarias

| Variable | Uso |
|----------|-----|
| `PLATFORM_DATABASE_URL` | URL PostgreSQL usada por Prisma |
| `PLATFORM_JWT_SECRET` | Firma de access tokens |
| `REFRESH_TOKEN_SECRET` | Firma de refresh tokens |
| `ADMIN_EMAIL` | Email del superadmin staging |
| `ADMIN_PASSWORD` | Password del superadmin y fallback para usuarios staging |
| `STAGING_USER_PASSWORD` | Password compartida para usuarios de prueba |
| `FRONTEND_URL` | URL pública si el frontend vive separado o usás tunnel |
| `BOOTSTRAP_ADMIN_EMAIL` | Email para crear superadmin vía `/api/bootstrap` |
| `BOOTSTRAP_KEY` | Key opcional para proteger `/api/bootstrap` |

## `.env` Local Recomendado

Crear `apps/platform/server/.env`:

```env
PORT=3000

PLATFORM_DATABASE_URL="postgresql://deposito:deposito@localhost:5433/deposito"

PLATFORM_JWT_SECRET="local-staging-access-secret-change-me"
REFRESH_TOKEN_SECRET="local-staging-refresh-secret-change-me"

ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="Admin123456!"
STAGING_USER_PASSWORD="Demo123456!"

FRONTEND_URL="http://localhost:3000"
```

Para una demo pública, reemplazar los secretos y passwords por valores fuertes.

## Usuarios De Prueba

Todos usan `STAGING_USER_PASSWORD`. Si no existe, usan `ADMIN_PASSWORD`.

| Email | Acceso |
|-------|--------|
| `ADMIN_EMAIL` o `admin@example.com` | Platform admin + todos los módulos |
| `encargado@deposito.com` | Depósito encargado |
| `solicitante@deposito.com` | Depósito solicitante |
| `observador@deposito.com` | Depósito observador |
| `admin@ale-bet.com` | Ale-Bet admin |
| `vendedor@ale-bet.com` | Ale-Bet vendedor |
| `armador@ale-bet.com` | Ale-Bet armador |
| `observador@ale-bet.com` | Ale-Bet observador |

Password por defecto local:

```txt
Demo123456!
```

## Opción Costo Cero

Para probar desde otra ubicación sin deploy pago:

1. Correr la app en una PC host.
2. Exponer `http://localhost:3000` con Cloudflare Tunnel.
3. Entrar desde cualquier PC usando la URL pública del tunnel.

## Build Scripts

| Script | Uso |
|--------|-----|
| `npm run build:prod` | Compila `@platform/db`, `@platform/core`, `@platform/server` y genera el build estático Vite |
| `npm run start:prod` | Arranca `apps/platform/server/dist/index.js` y sirve API + frontend |
| `npm run db:setup:staging` | Aplica migraciones y crea usuarios staging |
| `npm run db:seed:staging-users` | Re-crea/actualiza usuarios staging sin tocar el resto |

## Deuda Conocida

- `npm run build` estricto todavía falla por errores TypeScript existentes en varias pantallas del cliente.
- `npm run build:prod` usa `vite build` para empaquetar frontend y no bloquea staging por esa deuda.
- Esto es intencional para poder probar producto real mientras se corrige la deuda UI/TS.
- No ocultar esta deuda antes de vender; convertirla en tareas de cierre.

## Notas De Packaging

- `@platform/db` apunta a `dist/index.js` en producción.
- El build de `@platform/db` copia `src/generated` a `dist/generated` porque Prisma client generado es requerido por runtime.
- Docker Postgres 18 monta el volumen en `/var/lib/postgresql`, no en `/var/lib/postgresql/data`.

## Checklist QA

- [ ] Login con superadmin funciona.
- [ ] Login con usuario de Depósito entra solo a Depósito.
- [ ] Login con usuario de Ale-Bet entra solo a Ale-Bet.
- [ ] Usuario sin acceso activo termina en `/no-access`.
- [ ] Admin puede crear/editar/deshabilitar usuarios.
- [ ] Roles de Depósito bloquean acciones no permitidas.
- [ ] Roles de Ale-Bet bloquean acciones no permitidas.
- [ ] Rutas internas sobreviven refresh del navegador.
- [ ] Mobile no rompe login ni navegación principal.
- [ ] Estados vacíos, loading y errores son entendibles.
