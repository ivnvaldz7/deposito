# Proposal: "Ventas por cliente" report screen (alebet-fact-02-frontend)

## Intent

Frontend-only delivery of the sales-per-client report for Ale-Bet roles `admin`/`facturacion`, consuming the already-shipped backend `GET /api/ale-bet/facturacion/ventas` (commit 5b55686, 25/25 tests). Today users can only browse per-order history; they need a per-client, per-period view of dispatched products.

## Scope

### In Scope
- Nav entry "Ventas por cliente" (icon BarChart2), path `/ale-bet/ventas`, predicate `canSeeVentas = admin || facturacion`; desktop sidebar **and** mobile bottom nav (decision made).
- Lazy `VentasPage` route in `modules/ale-bet/App.tsx` (before `*` catch-all).
- Typed API: `aleBetApi.facturacion.ventas({ clienteId, year, month? })` + contract types + `useVentas` query hook.
- Client combobox (TransportSelector pattern), [MES][AÑO] period control, monthly/annual rendering with mobile card mode, states, vitest suite.

### Out of Scope
- Prices, IVA, invoicing, charts, PDF/Excel/export, rankings, client comparisons.
- Historial del Vendedor untouched; no backend, Prisma, STOCK-02, stock/reservas/FEFO changes.
- No commits or pushes (user: NO commit, NO push).

## Requirements Summary (authoritative, from user)

| # | Requirement |
|---|---|
| 1 | Nav entry desktop + mobile bottom nav, roles `admin`/`facturacion` only; do not modify Historial predicate |
| 2 | Title "Ventas por cliente" + subtitle "Consultá los productos despachados por cliente y período."; current tokens (Inter, green primary, surface-container-high, fine borders, existing radii, minimal shadows; no legacy pale-green hardcodes); desktop container max ~1000px, usable from 375px |
| 3 | Predictive combobox "Buscar cliente..." (input + dropdown, client-side filter over `useClientes()` by nombre and CUIT, NOT native select); shows chosen client ("Veterinaria Centro / 30-xxxxxxxx-x"), changeable/clearable; empty state "Seleccioná un cliente para consultar sus ventas."; **no ventas call before selection** |
| 4 | Compact [MES][AÑO] control; default current month/year; MES = month + year selects, AÑO = year only; use `select.input-field` precedent (avoid broken native select visuals) |
| 5 | Three compact metrics: PEDIDOS DESPACHADOS, PRODUCTOS, UNIDADES (thousands separator, e.g. 1.426); no huge cards, no monetary metrics |
| 6 | Monthly: header CLIENTE + PERÍODO; table PRODUCTO \| SKU \| CAJAS \| SUELTOS \| UNIDADES; use backend cajas/sueltos/unidades verbatim (unidadesPorCaja is dynamic — never recompute client-side) |
| 7 | Annual: RESUMEN POR MES first (compact rows, e.g. "ENERO — 8 pedidos · 920 unidades", only months returned), then TOTAL ANUAL POR PRODUCTO (same columns) |
| 8 | Mobile: no forced horizontal scroll; products → compact cards ("7 cajas · 4 sueltos / 144 unidades"); summaries adapt |
| 9 | States: no-client empty state; loading skeleton; no sales → "No hay pedidos despachados para este período." (NOT an error); error → "No pudimos cargar el reporte. Intentá nuevamente."; never show raw backend errors |
| 10 | Typed API per `lib/api.ts` pattern (URLSearchParams like `historial.list`); types: monthly report, annual report, product aggregate, monthly summary; no `any`/`as unknown`/`@ts-ignore` |
| 11 | Vitest + @testing-library/react + jsdom: initial state, client search/selection, MES mode, AÑO mode, month change, year change, correct monthly/annual requests, render totals/products/months, empty no-sales, error; full-shape `vi.mock('../../lib/api')` incl. `facturacion.ventas`; fixtures in `ale-bet-mock-factories.ts` |
| 12 | Verify: `npm --workspace @platform/client run test`, `run typecheck`, `run build` — no `|| true` masking |

## Capabilities

### New Capabilities
- `ale-bet-ventas-por-cliente`: report screen requirements — nav visibility, combobox, period control, monthly/annual rendering, states, API contract typing (no ale-bet capability spec exists yet; only `productos-catalogo` is present).

### Modified Capabilities
- None.

## Approach

- **Nav/route**: `NAV_ITEMS` entry + `case '/ale-bet/ventas'` + `canSeeVentas` in `Sidebar.tsx`; extend `bottomNavItems` priority chain (see risk R1); lazy `VentasPage` + `<Route path="ventas">` before `*`.
- **API client** (`lib/api.ts`): mirror server interfaces verbatim — `ProductoAgregado`, `ResumenMes`, `ReporteVentasMensual`, `ReporteVentasAnual`, union `ReporteVentas`; `facturacion.ventas` builds `URLSearchParams` (month omitted in AÑO mode — month presence switches mode server-side). Query hook `queries/use-ventas.ts` (`ventasKeys`, `enabled: !!clienteId`).
- **Combobox**: copy TransportSelector pattern (input `role="combobox"`, aria-expanded/listbox, clear button, dropdown, "no results" row); filter `useClientes()` client-side by `nombre` + `cuit`; selected chip shows `nombre / cuit` (fallback if `cuit` null, see R2).
- **Period**: local Spanish `MESES` const (module-private in DatePicker — not exported); `select.input-field` for month/year; year range 2000–2100 mirroring backend validation; default = current month/year.
- **Rendering**: metrics via GlassCard pattern (MetricCard is DashboardPage-local — copy, compact sizing); tables with existing wrapper/thead/row classes; monthly: CLIENTE + PERÍODO header + product table; annual: per-month summary rows (only `meses` returned) + annual product table; mobile `md:hidden` cards + `hidden md:block` table (ClientesPage precedent); avoid `timeStyle` (jsdom crash precedent).
- **States**: no client → empty state (no fetch); loading → Skeleton; zero sales → neutral empty message; error → fixed friendly message (ApiError.message never surfaced verbatim).
- **Tests**: full-shape `vi.mock('../../lib/api')` including `facturacion: { ventas: vi.fn() }`; new `createReporteVentasMensual`/`createReporteVentasAnual` fixtures; 11 cases per requirement 11.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/platform/client/src/modules/ale-bet/components/Sidebar.tsx` | Modified | NAV_ITEMS entry, `canSeeVentas`, visibleItems case, bottomNavItems chain |
| `apps/platform/client/src/modules/ale-bet/App.tsx` | Modified | lazy import + `<Route path="ventas">` |
| `apps/platform/client/src/modules/ale-bet/lib/api.ts` | Modified | 5 types + `facturacion.ventas` namespace |
| `apps/platform/client/src/modules/ale-bet/queries/use-ventas.ts` | New | query hook + keys |
| `apps/platform/client/src/modules/ale-bet/pages/VentasPage.tsx` | New | screen (combobox, period, metrics, tables, mobile cards, states) |
| `apps/platform/client/src/modules/ale-bet/pages/__tests__/VentasPage.test.tsx` | New | page test suite |
| `apps/platform/client/src/modules/ale-bet/pages/__tests__/fixtures/ale-bet-mock-factories.ts` | Modified | `createReporteVentasMensual` / `createReporteVentasAnual` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **R1 — Bottom nav single extra slot**: chain is stock → clientes → historial (one extra item). Ventas-first chain makes admin lose stock and facturacion lose clientes in bottom nav (both remain in sidebar). Open question: accept displacement or role-aware chain | Med | Default: ventas first in chain; confirm with user during design |
| **R2 — `cuit` null**: display falls back to nombre only | Low | format helper; test both shapes |
| **R3 — Combobox/period components don't exist**: no shared Combobox, month/year selector, or Spanish months helper | Med | TransportSelector copy + `select.input-field`; local MESES const |
| **R4 — Product order unspecified** (Map insertion order server-side) | Low | never assert order in tests; keep server order |
| **R5 — Review budget 800 lines**: page + tests likely approach it | Med | sdd-tasks auto-forecast; chained PR slices if forecast high |
| **R6 — Existing tests unaffected but full-shape mock required**: new namespace must be added to new page tests; `vi.clearAllMocks()` wipes implementations | Low | re-`mockResolvedValue` per test (HistorialPage precedent) |

**No BLOCKER**: backend contract verified against `facturacion.ts` — query params, modes, RBAC, and response shapes match the exploration exactly; client types map 1:1. The only contract nuance (month presence switches mode) is handled by omitting `month` in AÑO mode.

## Rollback Plan

Revert the change set (frontend only, no migrations): remove `VentasPage` + route + nav entry + `facturacion.ventas` + `use-ventas` + test file, restore fixtures. Backend untouched, so no data risk.

## Dependencies

- Backend `GET /ale-bet/facturacion/ventas` shipped (commit 5b55686).
- `useClientes()` list endpoint (no server-side search — client-side filter).
- No new npm dependencies.

## Success Criteria

- [ ] All 11 test cases pass via `npm --workspace @platform/client run test` (no `|| true`)
- [ ] `npm --workspace @platform/client run typecheck` and `run build` pass
- [ ] Report renders monthly and annual data from the live endpoint; cajas/sueltos shown verbatim, never recomputed client-side
- [ ] Nav entry visible only to `admin`/`facturacion` (desktop + mobile bottom nav); Historial del Vendedor unchanged
- [ ] No request fired before a client is selected; no raw backend error text shown
