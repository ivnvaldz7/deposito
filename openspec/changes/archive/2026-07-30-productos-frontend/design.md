# Design: Productos Frontend

## Technical Approach

Single page at `/deposito/productos` with lazy loading — follows every existing page in the module. Full catalog CRUD, state transitions, and two-step CSV/XLSX import for `encargado`; read-only table for other roles.

Follows existing deposito patterns: `useAuthStore` for role gating, `api` wrapper for HTTP, React Query for server state, `Dialog` component for create/edit forms, `Table` component for list view, `react-hook-form` + `zod` for form validation, and shared components from `inventory-shared/`.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|----------|---------|--------|-----------|
| Page structure | Single page vs separate pages | Single page | Matches DrogasPage/EstuchesPage pattern — list + dialogs for CRUD |
| Forms | Dialog vs inline vs route | Dialog | Existing pattern (EstuchesPage, FrascosPage, OrdenesPage). Conditional fields per category need a full form, not inline |
| Table | `<table>` vs CSS grid | `<table>` from `../components/ui/Table` | 6+ columns (estado, codigo, categoria, presentacion, mercados, actions). `Table` component handles this better than grid |
| Role gating | Component-level vs route guard | Component-level | Matches DrogasPage — `useAuthStore` check renders/hides action buttons without route duplication |
| Import flow | Separate page vs modal | Modal | Stays in context. Two-step wizard inside a single Dialog avoids navigation |

## Data Flow

```
ProductosPage mount
  ├─ useProductos() → GET /deposito/productos → table renders
  │
  ├─ Create: Dialog form → useCreateProducto() → POST /deposito/productos
  │                                              → invalidate list
  │
  ├─ Edit: Dialog form → useUpdateProducto() → PATCH /deposito/productos/:id
  │                                            → invalidate list
  │
  ├─ State: button click → useActivarProducto(id)
  │   activate/reactivate/desactivate → POST /deposito/productos/:id/activar
  │                                     (or reactivar/desactivar)
  │                                   → invalidate list
  │
  ├─ Delete: confirm → useDeleteProducto(id) → DELETE /deposito/productos/:id
  │                                            → invalidate list
  │
  └─ Import: upload → POST /deposito/productos/importaciones/dry-run
                      → preview table (per-row errors)
                      → confirm → POST /deposito/productos/importaciones/confirmar
                                 → invalidate list
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `.../queries/use-productos.ts` | Create | React Query hooks: list, create, update, delete, activate, reactivate, desactivate, import dry-run + confirm |
| `.../pages/ProductosPage.tsx` | Create | Main page: Table with columns, search, create/edit/import Dialogs, state action buttons |
| `.../components/EstadoProductoChip.tsx` | Create | State badge for `PENDIENTE_REVISION`/`ACTIVO`/`INACTIVO` (follows `EstadoChip.tsx` pattern) |
| `.../App.tsx` | Modify | Add lazy `const ProductosPage = lazy(...)` and `<Route path="productos" />` |
| `.../components/layout/Sidebar.tsx` | Modify | Add `{ path: '/deposito/productos', label: 'Productos', icon: Package }` to `navItems` |
| `.../pages/__tests__/ProductosPage.test.tsx` | Create | Component + query tests |

## Interfaces / Contracts

```typescript
// New types (use-productos.ts)
type EstadoProducto = 'PENDIENTE_REVISION' | 'ACTIVO' | 'INACTIVO'
type CategoriaProducto = 'droga' | 'estuche' | 'etiqueta' | 'frasco'

interface Producto {
  id: string
  codigo: string | null
  nombreBase: string
  volumen: string | null
  unidad: string | null
  variante: string | null
  categoria: CategoriaProducto
  nombreCompleto: string
  presentacion: string | null
  estado: EstadoProducto
  mercados: string[]
  createdAt: string
  updatedAt: string
}

// Create/Edit payload
interface ProductoFormData {
  nombreBase: string
  codigo?: string
  categoria: CategoriaProducto
  presentacion?: string | null
  mercados?: string[]
}

// Import
interface ImportDryRunResult {
  valida: Producto[]
  errores: { fila: number; error: string }[]
}

interface ImportConfirmResult {
  creados: number
  errores: { fila: number; error: string }[]
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (queries) | Hook mocks, mutation success/invalidation | MSW handlers, assert `invalidateQueries` called |
| Component | Loading → empty → table renders | `LoadingState`/`EmptyState`/table variants |
| Component | Permission gating | Render as `encargado` vs `solicitante` — assert button visibility |
| Component | Create form conditional fields | Pick `etiqueta` → markets field appears; pick `frasco` → hidden |
| Component | Import dry-run → error preview | Mock response with partial errors, assert rows shown |
| Component | Delete 409 | Mock 409 response, assert toast error "No se puede eliminar" |
| E2E | Full import flow (dry-run → confirm → list) | Requires actual backend — covered in integration suite |

## Threat Matrix

N/A — pure UI design. No routing changes (existing `App.tsx` router), no shell/subprocess invocation, no VCS/PR automation, no executable-file classification, no process integration boundaries.

## Migration / Rollout

No migration required. Feature is behind route addition — deploy enables the page; no existing data affected. Sidebar item and route can be deployed together in a single PR.

## Open Questions

- None. Backend contracts are deployed and approved.
