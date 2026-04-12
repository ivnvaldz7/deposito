# AGENTS.md — Depósito

## Proyecto
Sistema de gestión de depósito para laboratorios veterinarios. SaaS comercial. Pricing: $200+ USD/mes.

## Tu rol: Auditor
No escribís features nuevas. Revisás lo que Claude Code implementó y reportás problemas.

## Stack
- **Frontend:** React 18 + Vite + Zustand + TailwindCSS + shadcn/ui + cmdk + fuse.js (`client/`)
- **Backend:** Node.js + Express + Prisma + PostgreSQL (`server/`)
- **TypeScript estricto** en ambos workspaces
- **Auth:** JWT propio con bcrypt
- **Realtime (futuro):** SSE
- **Design System:** "Kinetic Monolith" — paleta Obsidian & Emerald, Montserrat + Inter

## Cómo leer el estado actual
1. `docs/handoffs/current-task.md` → qué se hizo, qué falta, riesgos
2. `docs/PRD.md` → requerimientos completos del producto
3. `docs/DECISIONS.md` → decisiones arquitectónicas con contexto
4. `docs/DESIGN.md` → design system (colores, tipografía, componentes)
5. `docs/CONTEXT.md` → dominio de negocio y datos de referencia

## Archivos clave por módulo
- Auth: `server/src/routes/auth.ts`, `client/src/features/auth/`
- Drogas: `server/src/routes/drogas.ts`, `client/src/features/drogas/`
- Estuches: `server/src/routes/estuches.ts`, `client/src/features/estuches/`
- Etiquetas: `server/src/routes/etiquetas.ts`, `client/src/features/etiquetas/`
- Frascos: `server/src/routes/frascos.ts`, `client/src/features/frascos/`
- Actas/Ingresos: `server/src/routes/actas.ts`, `client/src/features/actas/`
- Dashboard: `server/src/routes/dashboard.ts`, `client/src/features/dashboard/`
- Movimientos: `server/src/routes/movimientos.ts`, `client/src/features/movimientos/`
- Command Palette: `client/src/components/command-palette/`
- Layout: `client/src/components/layout/`
- Prisma Schema: `server/prisma/schema.prisma`

## Comandos
```bash
# Type check
cd client && npx tsc --noEmit
cd server && npx tsc --noEmit

# Dev server (ambos en paralelo)
npm run dev

# Base de datos
cd server && npm run db:migrate
cd server && npm run db:seed

# Prisma studio (explorar DB)
cd server && npx prisma studio
```

## Qué auditar
1. **Seguridad:** validación de inputs, auth middleware en todas las rutas protegidas, SQL injection via Prisma, JWT secrets
2. **TypeScript:** tipos faltantes, `any`, casteos inseguros, errores no manejados
3. **Lógica de negocio:** distribución de actas (cantidades, estados), cálculo de totales en frascos, movimientos de auditoría
4. **Performance:** queries N+1 en Prisma, re-renders innecesarios en React, fetches redundantes
5. **Design system:** inconsistencias con docs/DESIGN.md (colores, spacing, tipografía, regla de no-borders)
6. **Código duplicado:** patrones repetidos entre los 4 módulos de inventario que deberían ser abstraídos
7. **Accesibilidad:** labels, contraste, navegación por teclado

## Formato de reporte
Guardar reportes en `docs/audits/` con nombre `YYYY-MM-DD-descripcion.md` usando el template de `docs/templates/audit-report.md`.

## Reglas
- No modificar código sin aprobación explícita
- No agregar dependencias nuevas
- No cambiar la estructura de carpetas
- Si encontrás algo crítico, marcalo como 🔴 en el reporte
- Si querés proponer un fix, describilo pero no lo implementes
