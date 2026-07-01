# Arquitectura — Plataforma

## 1. Estructura del Monorepo

```
deposito/
├── apps/
│   ├── platform/             ← App unificada (TODA la lógica actual)
│   │   ├── server/           ← Express API + Prisma
│   │   └── client/           ← React SPA (Vite + Tailwind + Zustand)
│   ├── deposito/client/      ← Frontend legacy (pendiente de refactor)
│   ├── admin/client/         ← Frontend legacy (pendiente de refactor)
│   └── ale-bet/client/       ← Frontend legacy (pendiente de refactor)
├── packages/
│   ├── db/                   ← Prisma schema unificado + generated client
│   └── platform-core/        ← Auth compartido (JWT, password, middleware)
├── docs/                     ← Documentación del producto
├── .atl/                     ← Skill registry (AI)
├── turbo.json                ← Turborepo config
└── package.json              ← npm workspaces + scripts
```

## 2. Relación entre Componentes

```
┌─────────────────────────────────────────────────────┐
│                   platform/client                    │
│  React SPA (Vite + Zustand + shadcn/ui)             │
│  Rutas: /deposito/*, /ale-bet/*, /admin/*, /auth/*  │
└──────────────┬──────────────────────────────────────┘
               │ HTTP (fetch)
               ▼
┌─────────────────────────────────────────────────────┐
│                   platform/server                    │
│  Express 4 + TypeScript strict                       │
│  ├── /api/auth/*           ← Google OAuth + JWT     │
│  ├── /api/deposito/*       ← Inventario, actas      │
│  ├── /api/ale-bet/*        ← Pedidos, clientes      │
│  ├── /api/admin/*          ← Usuarios, permisos     │
│  └── /api/bootstrap        ← Superadmin inicial     │
└──────┬──────────┬───────────────────────────────────┘
       │          │
       ▼          ▼
┌──────────┐ ┌──────────────┐
│platform- │ │     db       │
│  core    │ │  Prisma 7    │
│(JWT,     │ │  PostgreSQL  │
│ bcrypt,  │ │  multiSchema │
│ types)   │ └──────────────┘
└──────────┘
```

## 3. Base de Datos — Multi-schema

Tres schemas PostgreSQL dentro de una misma base de datos:

| Schema | Contenido | Modelos |
|--------|-----------|---------|
| `platform` | Usuarios globales y accesos | PlatformUser, AppAccess |
| `deposito` | Inventario farmacéutico | Acta, ActaItem, InventarioDroga, InventarioEstuche, InventarioEtiqueta, InventarioFrasco, Movimiento, InsumoPendiente, OrdenProduccion, DepositoProducto, User |
| `ale_bet` | Pedidos y logística | Producto, Lote, Cliente, Pedido, ItemPedido, MovimientoStock |

## 4. Autenticación

```
1. Usuario → Google OAuth consent
2. Google → callback con authorization code
3. Server → code por tokens de Google
4. Server → busca/crea PlatformUser por email
5. Server → genera JWT (15min) + refresh token (7d, httpOnly)
6. Frontend → almacena JWT en Zustand
7. Refresh → POST /api/auth/refresh con cookie
```

## 5. Middleware Chain

```
Solicitud → cors → verifyToken → requireApp(app, roles?) → Handler
                                 → requirePlatformAdmin → Handler
```

## 6. Stack Decisions

| Decisión | Opción | Motivo |
|----------|--------|--------|
| Monorepo | Turborepo + npm workspaces | Escalabilidad, sharing de tipos, builds paralelos |
| Frontend | React 19 + Vite 8 | Ecosistema maduro, HMR rápido, Tailwind 4 nativo |
| Backend | Express 4 | Simplicidad, madurez, control total |
| ORM | Prisma 7 + multiSchema | Type-safe, migrations, schemas separados |
| Auth | Google OAuth + JWT | Sin gestión de passwords, seguridad, refresh tokens |
| Estado | Zustand 5 | Liviano, sin boilerplate, TypeScript nativo |
| Testing | Vitest + Testing Library | Rápido, compatible con Vite, buena DX |
| Tiempo real | SSE | Simple, unidireccional, sin infraestructura extra |

## 7. Testing Strategy

| Capa | Herramienta | Cobertura |
|------|-------------|-----------|
| Unit (models, utils) | Vitest | Lógica pura, helpers, validaciones |
| Integration (API) | Vitest + Supertest | Endpoints, middleware, flujos completos |
| Component (UI) | Vitest + Testing Library | Componentes, stores, routing |
| E2E | Pendiente | Playwright (futuro) |
