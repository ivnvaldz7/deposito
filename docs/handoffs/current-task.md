# Handoff — Estado actual del proyecto

**Fecha:** 05/04/2026
**Estado general:** activo
**Auditoría:** cerrada

---

## Estado del proyecto

**Fase actual:** Fase 1 completada + Fase 2 completada

### Fase 1 — Completada ✅
- [x] Setup monorepo (`client` + `server` + Prisma + TailwindCSS + shadcn/ui)
- [x] Auth JWT (login, middleware, roles, bootstrap inicial controlado)
- [x] CRUD Drogas
- [x] Actas / Ingresos (flujo 3 pasos, distribución parcial/total)
- [x] Command Palette
- [x] Dashboard
- [x] Movimientos con filtros
- [ ] Deploy Vercel + Railway

### Fase 2 — Completada ✅
- [x] CRUD Estuches con mercados
- [x] CRUD Etiquetas con mercados
- [x] CRUD Frascos
- [x] Dashboard extendido a 4 categorías
- [x] Command Palette extendido a 4 categorías
- [x] Flujo de ingresos extendido a 4 categorías
- [x] Panel de insumos pendientes
- [x] Vinculación pendiente recibido → ingreso pre-cargado

---

## Auditoría

La auditoría general quedó cerrada y los hallazgos críticos originales fueron resueltos.

### Hallazgos cerrados ✅
- Registro protegido: `POST /api/auth/register` ahora requiere autenticación + rol `encargado`
- `JWT_SECRET` fail-fast: el server no arranca sin secreto válido
- Distribución transaccional: actas rechazan `estuche`/`etiqueta` sin mercado y productos inexistentes
- Frascos inexistentes en distribución: rechazados correctamente
- Seeds idempotentes: ya no borran ni pisan stock operativo
- `lint` frontend: errores originales corregidos

### Re-auditoría aplicada ✅
- Accesibilidad estructural del frontend:
  - `label/htmlFor` en formularios relevantes
  - `aria-label` en botones con solo ícono
  - labels ocultos (`sr-only`) en inputs inline sensibles
- Limpieza de tablas:
  - se retiraron `role` redundantes sobre elementos semánticos nativos
- Code splitting:
  - `client/vite.config.ts` ahora separa `react`, `fuse.js` y `cmdk` en chunks dedicados

---

## Refactor en progreso

Hay un refactor activo sobre los módulos de inventario para reducir duplicación sin cambiar lógica de negocio.

### Ya realizado ✅
- Extracción frontend compartida en `client/src/features/inventory/shared/`:
  - `mercados.ts`
  - `mercado-chip.tsx`
  - `mercado-filter.tsx`
  - `stock-chip.tsx`
  - `inventory-states.tsx`
  - `inline-number-editor.tsx`
- Estuches y etiquetas ya consumen componentes compartidos
- Drogas y frascos ya consumen estados/edición inline compartidos
- Backend:
  - lógica duplicada de `estuches.ts` y `etiquetas.ts` extraída a `server/src/routes/shared/mercado-inventory-helpers.ts`

### Aún no iniciado / pendiente
- decidir si conviene seguir con una segunda etapa de refactor backend/frontend o frenar acá
- no avanzar a una abstracción genérica total de los 4 módulos sin justificar costo/beneficio

---

## Pendientes restantes

### Prioridad alta
1. Agregar tests de regresión para `actas`
2. Revisar la política de sesión/token del frontend (`localStorage` sigue siendo deuda)
3. Bloquear o definir explícitamente el comportamiento de alta de items sobre actas ya `completada`

### Prioridad media
1. Evaluar si llevar el frontend a `0 warnings` además de `0 errors`
2. Revisar si el refactor de inventario se corta en el punto actual o sigue una fase más
3. Documentar la capa de routing entre Claude Chat / Claude Code / Codex en `docs/`

### Prioridad baja
1. Deploy
2. Logging estructurado
3. Rate limiting / hardening productivo

---

## Checks recientes

- `npm --prefix client run lint` ✅
- `npm --prefix client run build` ✅
- `npm --prefix server run build` ✅

---

## Archivos sensibles

- `server/prisma/schema.prisma` — cambios requieren migración
- `server/src/middleware/auth.ts` — core de seguridad
- `client/src/stores/auth-store.ts` — manejo de tokens
- `client/src/App.tsx` — routing principal
