# Proposal: Productos Frontend

## Intent

Backend for the product catalog (MVP-01) is implemented and approved. The frontend at `/deposito/productos` is needed to expose product CRUD, state transitions, and CSV/XLSX import to encargados and operators.

## Scope

### In Scope
- ProductosPage: table with search/filter, state badge, code, category, presentation, market chips
- Create product form (encargado only, conditional fields by category)
- Edit modal (pending: all fields; active/inactive: name + presentation only)
- State actions: activate, reactivate, deactivate, delete (pending only)
- Two-step import: file upload → dry-run preview → confirm
- Route + sidebar nav item + React Query hooks + tests

### Out of Scope
- Backend changes (already done)
- Stock/ingresos UI (separate feature)
- Ale-Bet integration

## Capabilities

### New Capabilities
- `productos-catalogo`: Product catalog page, CRUD operations, state lifecycle, two-step CSV/XLSX import for the deposito module

### Modified Capabilities
- None — no existing spec changes

## Approach

Follow existing deposito patterns: DrogasPage (table layout, search), EstadoChip (state badges), inventory-states (LoadingState/ErrorState/EmptyState), PageHeader, Zustand auth for role gating, React Query hooks (pattern from `use-drogas.ts`). new shadcn/ui Dialog for create/edit. exceljs-based import via existing API contracts.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/platform/client/src/modules/deposito/App.tsx` | Modified | Add `/productos` route |
| `apps/platform/client/src/modules/deposito/components/layout/Sidebar.tsx` | Modified | Add "Productos" nav item |
| `apps/platform/client/src/modules/deposito/pages/ProductosPage.tsx` | New | Main page with table, create/edit, import |
| `apps/platform/client/src/modules/deposito/queries/use-productos.ts` | New | React Query hooks for catalog CRUD + import |
| `apps/platform/client/src/modules/deposito/pages/__tests__/ProductosPage.test.tsx` | New | Tests for states, conditional fields, dry-run flow |
| `apps/platform/client/src/modules/deposito/queries/index.ts` | Modified | Export new hooks |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Backend API contract mismatch | Low | Backend already deployed and tested; align using existing `api.ts` client |
| Import file handling edge cases | Low | Dry-run step catches errors before confirm; reuse existing `exceljs` |

## Rollback Plan

Revert `App.tsx` route addition and `Sidebar.tsx` nav item. Remove `ProductosPage.tsx`, `use-productos.ts`, and test file. Deploy. No data impact — backend unaffected.

## Dependencies

- Backend endpoints `GET/POST/PATCH /api/deposito/productos`, `POST .../activar|reactivar|desactivar`, `DELETE .../:id`, `POST .../importaciones/dry-run|confirmar` — already deployed and approved
- `exceljs` — already in client dependencies

## Success Criteria

- [ ] Productos page renders with table; search/filter works
- [ ] Encargado can create, edit, activate, deactivate, delete, and import products
- [ ] Non-encargado roles see read-only view
- [ ] Two-step import dry-run shows errors per row; confirm creates pending products
- [ ] All tests pass (component + conditional field logic + import flow)
