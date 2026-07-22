# AGENTS.md — Plataforma

## Proyecto

Sistema SaaS de gestión operativa para depósitos de laboratorios veterinarios.
Monorepo Turborepo con npm workspaces.

## Stack

- **Frontend:** React 19 + Vite 8 + TailwindCSS 4 + Zustand 5 + react-router-dom 7 + shadcn/ui
- **Backend:** Express 4 + TypeScript strict + Prisma 7 + PostgreSQL (multi-schema)
- **Auth:** Google OAuth + JWT (access 15min + refresh 7d httpOnly)
- **Testing:** Vitest + Supertest + @testing-library/react
- **Monorepo:** Turborepo ^2.5 + npm workspaces

## Documentación

Leer antes de escribir código:
- `docs/PRD.md` — qué construimos y para quién
- `docs/CONTEXT.md` — reglas de negocio y dominio
- `docs/ARCHITECTURE.md` — cómo está armado el sistema
- `docs/GLOSSARY.md` — vocabulario del dominio

## Workflow de Desarrollo — SDD + TDD OBLIGATORIO

Todo cambio debe pasar por el ciclo SDD:

```
sdd-propose → sdd-spec → sdd-design → sdd-tasks → sdd-apply → sdd-verify → sdd-archive
```

Strict TDD mode habilitado: primero el test fallido (RED), luego la implementación (GREEN), después refactor.

## Archivos Clave

| Módulo | Server | Client |
|--------|--------|--------|
| Depósito | `apps/platform/server/src/deposito/routes/` | `apps/platform/client/src/modules/deposito/` |
| Ale-Bet | `apps/platform/server/src/routes/ale-bet/` | `apps/platform/client/src/modules/ale-bet/` |
| Admin | `apps/platform/server/src/routes/admin/` | `apps/platform/client/src/modules/admin/` |
| Auth | `apps/platform/server/src/routes/auth/` | `apps/platform/client/src/modules/auth/` |
| Core | `packages/platform-core/src/auth/` | — |
| DB | `packages/db/prisma/schema.prisma` | — |

## Comandos

```bash
# Development
npm run dev                        # Turbo: platform/server + platform/client en paralelo

# Testing
npm run test --filter=@platform/server    # Tests backend
npm run test --filter=@platform/client    # Tests frontend

# Type checking
npm run typecheck --filter=@platform/server
npm run typecheck --filter=@platform/client

# Build
npm run build                      # Turbo build todos los workspaces
```

## Reglas

1. **Conventional commits**: `type(scope): descripción` — type en (feat|fix|chore|docs|refactor|test)
2. **TypeScript estricto**: no `any`, no `as unknown`, no `@ts-ignore`
3. **SDD obligatorio**: todo feature nuevo arranca con `sdd-propose`
4. **TDD obligatorio**: el test se escribe antes que la implementación
5. **Consultar documentación** antes de escribir código
6. **No expandir scope** sin autorización explícita
7. **No Co-Authored-By** ni atribuciones AI en commits


