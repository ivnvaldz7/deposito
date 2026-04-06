# CLAUDE.md — Depósito

## Proyecto

Sistema de gestión operativa para depósitos de laboratorios veterinarios. Hub central: Acta Inteligente. Producto SaaS comercial.

## Stack

- **Frontend:** React 18+ / Vite / Zustand / TailwindCSS / shadcn/ui / cmdk / fuse.js
- **Backend:** Node.js / Express / Prisma / PostgreSQL / JWT / SSE
- **Deploy:** Vercel (frontend) + Railway (backend + DB)
- **Diseño:** Google Stitch → DESIGN.md / shadcn/ui

## Reglas estrictas

1. **Consultar documentación antes de escribir código.** Leer PRD.md, CONTEXT.md y DECISIONS.md antes de implementar cualquier feature.
2. **Un solo objetivo por sesión.** No expandir scope sin autorización explícita.
3. **TypeScript estricto.** No `any`, no `as unknown`. Tipar todo.
4. **Commits en español.** Mensajes descriptivos, convencionales (feat:, fix:, refactor:, docs:).
5. **Mobile-first.** Todo componente se diseña primero para mobile, después desktop.
6. **Trazabilidad total.** Ningún movimiento de stock sin origen registrado (acta o ajuste justificado).
7. **No over-engineering.** No agregar abstracciones, patterns ni features que no estén en el scope de la sesión actual.
8. **Engram.** Guardar memorias proactivamente después de decisiones importantes, bugs resueltos y patrones descubiertos. Al inicio de sesión, llamar `mem_context` para recuperar estado.

## Estructura del proyecto

```
deposito/
├── client/                 # Frontend React + Vite
│   ├── src/
│   │   ├── components/     # Componentes reutilizables
│   │   ├── features/       # Módulos por feature (drogas, actas, etc.)
│   │   ├── hooks/          # Custom hooks
│   │   ├── lib/            # Utilidades, API client, auth
│   │   ├── stores/         # Zustand stores
│   │   └── styles/         # Tailwind config, globals
│   └── ...
├── server/                 # Backend Node + Express
│   ├── src/
│   │   ├── routes/         # Endpoints por recurso
│   │   ├── middleware/     # Auth, validation, error handling
│   │   ├── services/       # Lógica de negocio
│   │   ├── lib/            # Utilidades, SSE manager
│   │   └── prisma/         # Schema y migraciones
│   └── ...
├── docs/                   # Documentación del proyecto
│   ├── PRD.md
│   ├── CONTEXT.md
│   ├── DECISIONS.md
│   └── DESIGN.md
├── CLAUDE.md               # Este archivo
└── README.md
```

## Fase actual: Fase 1 — MVP

Objetivo: Drogas + Acta Inteligente + Command Palette

Tareas pendientes:
- [ ] Setup proyecto (monorepo, Prisma, auth JWT)
- [ ] Design system en Google Stitch → exportar DESIGN.md
- [ ] Modo oscuro (dark/light toggle)
- [ ] CRUD de drogas (nombre + cantidad)
- [ ] Acta inteligente: crear acta → agregar items → distribuir a inventario
- [ ] Command palette (⌘K) con fuzzy search sobre drogas
- [ ] Dashboard con vista de stock de drogas
- [ ] Auth básico (login, registro de encargado)
- [ ] Tabla de movimientos (auditoría)
- [ ] Deploy a Vercel + Railway

## Convenciones de código

- Nombres de variables/funciones: camelCase en inglés
- Nombres de componentes: PascalCase en inglés
- Nombres de tablas DB: snake_case en español (actas, drogas, movimientos)
- Nombres de archivos: kebab-case
- Imports: absolutos desde src/ cuando sea posible
- Componentes: funcionales con hooks, nunca clases
- Estado global: Zustand. Estado local: useState/useReducer
- Formularios: react-hook-form + zod para validación
- API calls: fetch nativo envuelto en un client tipado
