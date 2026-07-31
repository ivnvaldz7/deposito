# Tasks: Productos Frontend

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 400–600 |
| 400-line budget risk | High (user opted into 800-line budget) |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | All tasks (single PR, within 800-line budget) | PR 1 | `pnpm --filter client exec vitest run deposito/pages/__tests__/ProductosPage.test.tsx` | Run app, navigate to `/deposito/productos` | Revert App.tsx + Sidebar.tsx; remove new files |

## Phase 1: Foundation (queries + types + chip)

- [x] 1.1 Create `queries/use-productos.ts` with `Producto`, `EstadoProducto`, `CategoriaProducto` types and React Query hooks: `useProductos()`, `useCreateProducto()`, `useUpdateProducto()`, `useDeleteProducto()`, `useActivarProducto()`, `useReactivarProducto()`, `useDesactivarProducto()`, `useImportDryRun()`, `useImportConfirmar()`
- [x] 1.2 Export new hooks from `queries/index.ts`
- [x] 1.3 Create `components/EstadoProductoChip.tsx` following `EstadoChip.tsx` pattern for `PENDIENTE_REVISION`/`ACTIVO`/`INACTIVO`

## Phase 2: Page implementation

- [x] 2.1 Create `pages/ProductosPage.tsx` with: `PageHeader`, search bar, table (columns: estado chip, código, categoría, presentación, mercados chips, acciones buttons)
- [x] 2.2 Add create product `Dialog` with `react-hook-form` + `zod`; conditional fields per category (etiqueta/estuche → presentación + mercados, frasco → presentación only, droga/MP → metadata only)
- [x] 2.3 Add edit product `Dialog`; field mutability by estado (PENDIENTE_REVISION: all editable; ACTIVO/INACTIVO: name + presentación only)
- [x] 2.4 Add state action buttons (Activar/Reactivar/Desactivar) with confirmation dialog; show only for `encargado`
- [x] 2.5 Add delete action with confirmation dialog; handle 409 with toast "No se puede eliminar un producto activo"
- [x] 2.6 Add two-step import `Dialog`: file upload (CSV/XLSX) → dry-run preview table (per-row errors) → confirm

## Phase 3: Routing and navigation

- [x] 3.1 Add lazy route for `ProductosPage` in `App.tsx`: `const ProductosPage = lazy(() => import('../pages/ProductosPage'))` + `<Route path="productos" element={<ProductosPage />} />`
- [x] 3.2 Add `{ path: '/deposito/productos', label: 'Productos', icon: Package }` nav item in `Sidebar.tsx` (between Dashboard and Drogas)

## Phase 4: Testing

- [x] 4.1 Write tests: page renders `LoadingState` → `EmptyState` ("No hay productos en el catálogo") → table with data
- [x] 4.2 Write tests: role gating — `encargado` sees action buttons, `solicitante`/`operador` see read-only table
- [x] 4.3 Write tests: create form conditional fields — selecting `etiqueta` shows markets, `frasco` hides markets, `droga` hides both
- [x] 4.4 Write tests: import dry-run shows per-row errors for invalid rows and valid preview for good rows
- [x] 4.5 Write tests: delete returns 409 → toast "No se puede eliminar un producto activo"
- [x] 4.6 Write tests: state transitions — Activar etiqueta with 2 markets creates zero inventory, Desactivar/Reactivar toggle state
