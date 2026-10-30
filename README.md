# Plataforma de operaciones para depósitos

Aplicación web para administrar la operación de un depósito de productos veterinarios y farmacéuticos. Centraliza inventario, ingresos de materiales, órdenes de producción, pedidos comerciales, trazabilidad y administración de accesos.

> Este repositorio está preparado para demostración técnica. No incluye credenciales, datos productivos ni configuraciones locales.

## Qué resuelve

- **Depósito:** inventario por lote, fechas de vencimiento, actas de ingreso, órdenes de producción, movimientos y reportes.
- **Comercial (Ale-Bet):** productos, clientes, pedidos, preparación, despacho y stock por presentación.
- **Trazabilidad:** cada movimiento de inventario conserva su origen y los lotes se gestionan con reglas FIFO o FEFO según el dominio.
- **Operación:** búsqueda, filtros, notificaciones en tiempo real y controles de permisos por módulo y rol.

## Stack

| Capa | Tecnologías |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, Zustand |
| Backend | Node.js, Express 4, TypeScript |
| Datos | PostgreSQL, Prisma 7, esquemas `platform`, `deposito` y `ale_bet` |
| Calidad | Vitest, Testing Library, ESLint, Turbo |

## Arquitectura

```text
React SPA ──HTTP/SSE──> Express API ──Prisma──> PostgreSQL
   client                    server          platform / deposito / ale_bet
```

El monorepo usa npm workspaces y Turborepo:

```text
apps/platform/client   # interfaz React
apps/platform/server   # API Express
packages/db            # esquema Prisma y cliente de base de datos
packages/platform-core # autenticación, permisos y contratos compartidos
```

## Ejecutarlo localmente

### Requisitos

- Node.js 22 o superior
- Docker Desktop (para PostgreSQL) o una instancia de PostgreSQL disponible
- Credenciales de Google OAuth, si se desea probar el flujo de autenticación completo

### Puesta en marcha

```bash
git clone https://github.com/ivnvaldz7/deposito.git
cd deposito
npm install

# Base de datos local en el puerto 5433
docker compose up -d postgres

# Configuración local: completar solo con valores de desarrollo
cp apps/platform/server/.env.example apps/platform/server/.env

# En apps/platform/server/.env configurar como mínimo:
# PLATFORM_DATABASE_URL=postgresql://deposito:deposito@localhost:5433/deposito
# PLATFORM_JWT_SECRET=una-clave-local-de-al-menos-32-caracteres

# Migraciones en la base local (PowerShell)
$env:PLATFORM_DATABASE_URL = 'postgresql://deposito:deposito@localhost:5433/deposito'
npm run db:migrate

# Cliente y API en desarrollo
npm run dev:turbo
```

La interfaz queda disponible en `http://localhost:5176`; Vite redirige las llamadas `/api` a la API local en `http://localhost:3000`.

`npm run dev` queda reservado para el entorno UAT aislado del repositorio, que usa los puertos `5177` y `3102` junto con su propia base de pruebas.

## Verificación

```bash
npm run typecheck
npm run lint
npm run build
npm --workspace @platform/client run test
npm --workspace @platform/server run test
```

## Seguridad y datos

- Los archivos `.env`, claves, cuentas de servicio, builds y directorios de ejecución están excluidos del repositorio.
- Para una demostración, usar una base local y usuarios de prueba; nunca conectar una copia pública a datos productivos.
- La autenticación utiliza Google OAuth y tokens JWT, con permisos granulares por aplicación.

## Alcance del proyecto

El foco está puesto en sistemas operativos internos donde importan la consistencia del stock, los flujos de trabajo y la trazabilidad. Entre los casos destacados se incluyen la asignación de stock por lote, transferencias entre presentaciones, impresión de etiquetas de ingreso y accesibilidad de diálogos operativos mediante teclado.

