# Design: "Ventas por cliente" report screen (alebet-fact-02-frontend)

## Technical Approach

Frontend-only delivery consuming the shipped backend `GET /ale-bet/facturacion/ventas` (commit 5b55686). Adds a typed `facturacion.ventas` API method + `useVentas` query hook, a new lazy route `/ale-bet/ventas` with sidebar/bottom-nav entry for `admin`/`facturacion`, and a `VentasPage` screen (client combobox → period control → metrics → monthly/annual report) reusing existing ale-bet patterns: `historial.list` URLSearchParams, `use-historial` hook shape, `TransportSelector` combobox, `select.input-field` selects, ClientesPage mobile/desktop dual rendering. All facts below verified against the repo on 2026-08-07.

## Architecture Decisions

| Decision | Options | Tradeoff | Decision |
|---|---|---|---|
| Page/test file names | `VentasPorClientePage.tsx` vs `VentasPage.tsx` | Repo names pages after the route segment (`HistorialPage`, `ClientesPage`) | `VentasPage.tsx` + `__tests__/VentasPage.test.tsx` (matches proposal/exploration; route is `ventas`) |
| Client combobox | Local component in page vs shared `components/ui/Combobox` | Shared component doesn't exist; extraction would refactor `PedidoDetailPage` (scope creep + risk) | Local `ClienteCombobox` inside `VentasPage.tsx`, copying TransportSelector (PedidoDetailPage:540) — single consumer today, ~100 lines |
| Bottom nav (R1) | Ventas-first displacement vs role-aware chain | Ventas-first: admin loses `stock`, facturacion loses `clientes` in bottom nav (both stay in sidebar) | Ventas-first displacement, per proposal default (accepted tradeoff; user confirmed at proposal) |
| Period control | Custom popover vs native selects | No month/year component exists; `ui/Select` is native underneath anyway | Native `<select className="input-field">` for month + year (HistorialPage precedent) + local `MESES` const; MES/AÑO toggle = two pill buttons |
| Metrics | Extract Dashboard `MetricCard` vs local copy | `MetricCard` is module-private in DashboardPage; extraction touches another page | Local compact copy: `GlassCard` + label/value/subtitle classes, value `text-[28px]` (Dashboard uses 48px — spec says no huge cards) |
| Client list | Filter `VALIDADO` only vs all | ClientesPage filters, HistorialPage doesn't; backend accepts any `clienteId` | All clients from `useClientes()` (HistorialPage precedent — report must match backend filter) |

## Data Flow

```
ClienteCombobox (useClientes) ──select──▶ state: cliente (Cliente | null)
[MES|AÑO] toggle + month/year selects ──▶ state: modo, mes (1-12), año
                        │
                        ▼
useVentas({ clienteId: cliente.id, year: año, month: modo === 'mensual' ? mes : undefined })
                        │  enabled: Boolean(clienteId) → no request before selection
                        ▼
aleBetApi.facturacion.ventas ──▶ GET /ale-bet/facturacion/ventas?clienteId&year&month?
                        │
                        ▼
ReporteVentas (modo discriminates) ──▶ metrics + monthly/annual sections
```

`month` presence switches mode server-side: omitted in AÑO mode, so the query key changes and React Query refetches automatically on client/mode/month/year change.

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/platform/client/src/modules/ale-bet/lib/api.ts` | Modify | Add 5 types (`ProductoAgregado`, `ResumenMes`, `ReporteVentasMensual`, `ReporteVentasAnual`, `ReporteVentas` union) + `facturacion: { ventas }` namespace (after `historial`) |
| `apps/platform/client/src/modules/ale-bet/queries/use-ventas.ts` | Create | `ventasKeys` + `useVentas` hook |
| `apps/platform/client/src/modules/ale-bet/queries/index.ts` | Modify | Barrel: `export { useVentas, ventasKeys } from './use-ventas'` |
| `apps/platform/client/src/modules/ale-bet/pages/VentasPage.tsx` | Create | Screen: `ClienteCombobox` (local), period control, metrics, monthly/annual rendering, states |
| `apps/platform/client/src/modules/ale-bet/App.tsx` | Modify | `const VentasPage = lazy(() => import('./pages/VentasPage'))` + `<Route path="ventas" element={<VentasPage />} />` after `transportistas`, before `*` catch-all |
| `apps/platform/client/src/modules/ale-bet/components/Sidebar.tsx` | Modify | `NAV_ITEMS` entry (after `clientes`), `canSeeVentas`, `visibleItems` case, `bottomNavItems` chain |
| `apps/platform/client/src/modules/ale-bet/pages/__tests__/VentasPage.test.tsx` | Create | Page suite (13 spec cases + extras) |
| `apps/platform/client/src/modules/ale-bet/components/__tests__/Sidebar.test.tsx` | Modify | R1 role scenarios (admin/facturacion vs vendedor) |
| `apps/platform/client/src/modules/ale-bet/pages/__tests__/fixtures/ale-bet-mock-factories.ts` | Modify | `createProductoAgregado`, `createReporteVentasMensual`, `createReporteVentasAnual` |

## Interfaces / Contracts

`api.ts` (mirrors server verbatim; exploration §10 confirmed):

```ts
export interface ProductoAgregado { productoId: string; nombre: string; sku: string; unidadesPorCaja: number; cajas: number; sueltos: number; unidades: number }
export interface ResumenMes { month: number; pedidosDespachados: number; productosDistintos: number; unidadesTotales: number; productos: ProductoAgregado[] }
export interface ReporteVentasMensual { modo: 'mensual'; clienteId: string; year: number; month: number; pedidosDespachados: number; productosDistintos: number; unidadesTotales: number; productos: ProductoAgregado[] }
export interface ReporteVentasAnual { modo: 'anual'; clienteId: string; year: number; pedidosDespachados: number; productosDistintos: number; unidadesTotales: number; productos: ProductoAgregado[]; meses: ResumenMes[] }
export type ReporteVentas = ReporteVentasMensual | ReporteVentasAnual

// aleBetApi (after historial, URLSearchParams per historial.list)
facturacion: {
  ventas: (params: { clienteId: string; year: number; month?: number }) => {
    const searchParams = new URLSearchParams({ clienteId: params.clienteId, year: String(params.year) })
    if (params.month) searchParams.set('month', String(params.month))
    return apiClient.get<ReporteVentas>(`${BASE}/facturacion/ventas?${searchParams}`)
  },
},
```

`queries/use-ventas.ts` (shape per `use-historial.ts`/`usePedidoDetalle`):

```ts
export const ventasKeys = {
  all: ['ale-bet', 'facturacion', 'ventas'] as const,
  list: (params: { clienteId: string; year: number; month?: number }) => [...ventasKeys.all, 'list', params] as const,
}
export function useVentas(params: { clienteId: string; year: number; month?: number }) {
  return useQuery({
    queryKey: ventasKeys.list(params),
    queryFn: () => aleBetApi.facturacion.ventas(params),
    enabled: Boolean(params.clienteId),
    placeholderData: (prev) => prev,
  })
}
```

## Component Structure (`VentasPage.tsx`)

**State**: `cliente: Cliente | null`, `modo: 'mensual' | 'anual'` (default `'mensual'`), `mes: number` (default `new Date().getMonth() + 1`), `año: number` (default `new Date().getFullYear()`). Derived args: `clienteId = cliente?.id ?? ''`, `month = modo === 'mensual' ? mes : undefined`.

**Layout**: `<div className="space-y-6">` root; header per repo convention: `<h1 className="text-[28px] font-bold tracking-tight text-on-surface">Ventas por cliente</h1>` + `<p className="font-body text-[13px] text-on-surface-variant">Consultá los productos despachados por cliente y período.</p>`; content wrapped in `mx-auto w-full max-w-[1000px] space-y-6`.

**ClienteCombobox** (local, TransportSelector copy): input `role="combobox" aria-expanded aria-haspopup="listbox" aria-controls` class `input-field`, placeholder "Buscar cliente..."; dropdown `absolute z-50 mt-2 w-full max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-surface-container-high shadow-float`, items `hover:bg-surface-high`, selected `bg-primary/10 text-primary font-semibold`, "No se encontraron resultados" empty row; clear (X) button; closes on outside click. Filter: `q = query.trim().toLowerCase()` over `useClientes()` data: `c.nombre.toLowerCase().includes(q) || c.cuit?.toLowerCase().includes(q)` (null-safe). Selected chip: `cliente.cuit ? \`${cliente.nombre} / ${cliente.cuit}\` : cliente.nombre`; typing after selection clears the selection.

**Period control**: MES/AÑO pill toggle (`inline-flex rounded-full border border-white/10 bg-surface-container-high p-0.5`; active button `rounded-lg bg-primary/10 text-primary font-semibold`, inactive `text-on-surface-variant hover:text-on-surface`); month `<select className="input-field">` with 12 options (values 1-12, labels `MESES[i]`), year `<select className="input-field">` with 101 options `Array.from({ length: 101 }, (_, i) => 2000 + i)` (clamp 2000-2100 mirroring backend). AÑO mode hides the month select. Local `const MESES = ['Enero', ..., 'Diciembre']` (module-private).

**Render matrix**:

| Condition | Output |
|---|---|
| `!cliente` | Empty state `py-16 text-center`: "Seleccioná un cliente para consultar sus ventas." (no fetch — hook gated) |
| `isLoading` (no cached data) | 3 × `<Skeleton variant="card" className="h-28" />` in metrics grid + `<Skeleton variant="card" className="h-64" />` |
| `isError` | `<p className="font-body text-sm text-error">No pudimos cargar el reporte. Intentá nuevamente.</p>` — never `error.message` |
| data, all zeros (`pedidosDespachados === 0 && productos.length === 0`; annual: `meses.length === 0`) | Neutral (not error): "No hay pedidos despachados para este período." in `bg-surface-container-high rounded-xl` wrapper |
| data with sales | Metrics + report sections |

**Metrics** (data-testid `ventas-metrics`): `grid gap-4 grid-cols-1 sm:grid-cols-3`; compact MetricCard copy: `GlassCard` + label `font-body text-[10px] uppercase tracking-[0.8px] text-outline` ("PEDIDOS DESPACHADOS" / "PRODUCTOS" / "UNIDADES"), value `mt-4 text-[28px] font-bold leading-none text-on-surface` (neutral — no monetary/warning semantics), values `pedidosDespachados`, `productosDistintos`, `unidadesTotales`.

**Monthly section** (data-testid `ventas-mensual`): header row CLIENTE + PERÍODO (period = `${MESES[mes - 1]} ${año}`, e.g. "Agosto 2026"); table wrapper `bg-surface-container-high rounded-xl overflow-hidden`, `<table className="w-full text-left font-body text-[12px]" data-testid="ventas-table">` hidden `md:block`; thead `text-[10px] uppercase tracking-[0.8px] text-outline`: PRODUCTO | SKU | CAJAS | SUELTOS | UNIDADES; rows `border-b border-white/10 last:border-0`, cells `px-5 py-4`; cajas/sueltos/unidades rendered verbatim (never recompute). Mobile cards (data-testid `ventas-mobile`) `space-y-3 md:hidden`: product name + SKU + `"${cajas} cajas · ${sueltos} sueltos / ${unidades} unidades"` (e.g. "7 cajas · 4 sueltos / 144 unidades").

**Annual section**: RESUMEN POR MES — compact rows in `bg-surface-container-high rounded-xl` (only when `meses.length > 0`): `${MESES[m.month - 1].toUpperCase()} — ${m.pedidosDespachados} pedidos · ${fmtUnidades(m.unidadesTotales)} unidades` (server order, ascending; render verbatim, do not re-sort or re-derive). Then TOTAL ANUAL POR PRODUCTO — same table/card markup as monthly (same columns), fed from annual `productos`.

## Formatting

- `const fmtUnidades = new Intl.NumberFormat('es-AR')` module-level — thousands separator ("1.426"). Safe under jsdom.
- **NEVER** `toLocaleString`/`toLocaleDateString` with `timeStyle` (jsdom crash precedent, HistorialPage:163 — tests there skip table assertions because of it).
- Month names from local `MESES` const (not Intl month-long formatting — deterministic and testable).
- PERÍODO: monthly `${MESES[mes - 1]} ${año}` ("Agosto 2026"); annual `String(año)` ("2026").

## Design Tokens

Theme tokens only: `bg-surface-container-high`, `border-white/10`, `text-outline`, `text-on-surface`, `text-on-surface-variant`, `text-error`, `text-primary`, `bg-primary/10`, `bg-surface-high`, `shadow-float`, `input-field`, `rounded-xl`, `p-margin-desktop`. NO legacy pale-green hardcodes (`#AFC8BA`/`#E7EFEA` — HistorialPage COMPLETADO badge is the anti-pattern to avoid), no saturated orange, no `--color-emerald-*`/`--color-obsidian-*` compat tokens.

## Testing Strategy

Full-shape mock (HistorialPage.test.tsx pattern — every namespace listed):

```tsx
vi.mock('../../lib/api', () => ({
  aleBetApi: {
    dashboard: vi.fn(),
    productos: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), lotes: { list: vi.fn(), create: vi.fn() } },
    clientes: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    pedidos: { list: vi.fn(), create: vi.fn(), aprobar: vi.fn(), tomar: vi.fn(), completarItem: vi.fn(), cancelar: vi.fn() },
    stock: { get: vi.fn(), movimientos: vi.fn() },
    historial: { list: vi.fn(), exportDownload: vi.fn() },
    facturacion: { ventas: vi.fn() },
  },
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }))
```

`beforeEach`: `vi.clearAllMocks()` + `useAuthStore` mockReturnValue `{ user: createMockUser(), token: 'token' }`; **re-`mockResolvedValue` in every test** (clearAllMocks wipes implementations); `clientes.list` → `createClienteList()` in every test that selects. Fixtures: `createProductoAgregado` (default: `{ productoId: 'prod-1', nombre: 'Producto A', sku: 'SKU-001', unidadesPorCaja: 12, cajas: 2, sueltos: 5, unidades: 25 }`), `createReporteVentasMensual` (default: `modo: 'mensual'`, `clienteId: 'cliente-1'`, `year: 2026`, `month: 7`, `pedidosDespachados: 8`, `productosDistintos: 3`, `unidadesTotales: 1426`, 3 products — the two named above plus a third rounding totals to 1426), `createReporteVentasAnual` (default: `modo: 'anual'`, `year: 2026`, totals 12/3/960, 2 products, `meses: [{ month: 1, pedidosDespachados: 8, unidadesTotales: 920, ... }, { month: 7, ... }]`). Fixture defaults chosen so spec examples assert directly (R6 "1.426", R7 "2/5/25", R8 "ENERO — 8 pedidos · 920 unidades", R9 "7 cajas · 4 sueltos / 144 unidades").

### Spec-case → test mapping (13 required + extras)

| Spec | Test name | Mock shape / assertions |
|---|---|---|
| R1 allowed | `shows Ventas por cliente for admin and facturacion in sidebar and bottom nav` (Sidebar.test.tsx) | `mockRol('admin')` / `('facturacion')` selector-mock; link `/ale-bet/ventas` present in desktop nav and bottom nav; historial still present |
| R1 vendedor | `hides Ventas por cliente for vendedor; historial unchanged` | `mockRol('vendedor')`; ventas link absent, historial present |
| R3 initial | `shows empty state and never calls ventas before client selection` | `clientes.list` resolves; `ventas` mock NOT called; "Seleccioná un cliente para consultar sus ventas." visible |
| R3 search/select | `filters by nombre and cuit and selects showing chip` | type CUIT `30-12345678-9` (cliente-2 override) → dropdown row; click → chip "Cliente B / 30-12345678-9"; `ventas` called once with `{ clienteId: 'cliente-2', year: 2026, month: 7 }` |
| R3 null cuit | `shows nombre only when cuit is null` | select `createCliente()` (cuit null) → chip "Cliente A", no "/" |
| R4 default | `defaults to current month and year in MES mode` | month select value `String(new Date().getMonth() + 1)`, year value `String(new Date().getFullYear())` |
| R4 AÑO | `AÑO mode hides month and offers years 2000-2100` | click AÑO → month select gone; year options 101, first `2000`, last `2100` |
| R5 monthly | `calls ventas with clienteId, year and month in MES mode` | after select: `toHaveBeenCalledWith({ clienteId: 'cliente-1', year: 2026, month: 7 })` |
| R5 annual | `calls ventas without month in AÑO mode` | AÑO + select → `toHaveBeenCalledWith({ clienteId: 'cliente-1', year: 2026 })` (no month key) |
| month change | `changing month refetches with the new month` | `fireEvent.change` month select to `8` → called with `month: 8` |
| year change | `changing year refetches with the new year` | change year select to `2025` → called with `year: 2025` |
| R6 metrics | `renders metrics with thousands separator` | monthly fixture → "8", "3", "1.426"; no "$"/currency in document |
| R7 verbatim | `renders monthly table with verbatim cajas sueltos unidades` | row shows "Producto A", "SKU-001", "2", "5", "25" |
| R8 annual | `renders resumen por mes then annual totals` | "ENERO — 8 pedidos · 920 unidades" and "JULIO — …" rows (only 2); annual product totals below; **never assert product row order** (Map insertion order) |
| R9 mobile | `renders compact product cards` | card text "7 cajas · 4 sueltos / 144 unidades" present. jsdom caveat: table and cards both render in DOM (`hidden md:block` / `md:hidden` are CSS-only) — assert markup presence, not visibility |
| R10 no-sales | `shows neutral no-sales message` | monthly fixture all-zeros → "No hay pedidos despachados para este período."; no error color class |
| R10 error | `shows friendly error, never raw backend text` | `ventas` rejects `new Error('backend boom')` → "No pudimos cargar el reporte. Intentá nuevamente."; `queryByText(/backend boom/)` null |

Use `fireEvent` (repo convention, not user-event); render via `renderWithQueryClient` + `MemoryRouter`.

## Threat Matrix

N/A — no shell/subprocess/VCS/PR automation, executable-file classification, or process-integration boundary. The client-side React route (`/ale-bet/ventas`) is declarative navigation, not a routing/execution boundary. No security-relevant rows apply; no RED tests beyond the functional suite above.

## Migration / Rollout

No migration. Backend already shipped; this is additive frontend only. Rollback = revert the change set (remove page/route/nav/api/hook/fixtures). No feature flag (nav predicate gates visibility by role).

## Open Questions

- R1 resolved by default: ventas-first bottom-nav displacement accepted (admin/facturacion lose `stock`/`clientes` in bottom nav; both remain in sidebar). No blocker.
- Review budget: page (~350 lines) + tests (~300) + fixtures (~80) likely exceed the 400-line PR budget — sdd-tasks MUST forecast and recommend chained PR slices.

## Risks

| Risk | Mitigation |
|---|---|
| R1 bottom-nav displacement (admin loses stock, facturacion loses clientes in bottom nav) | Accepted default; both roles keep full sidebar; Sidebar.test.tsx covers both roles |
| `cuit` null | `formatClienteChip` helper + explicit test |
| No shared combobox/period components | Copy TransportSelector + `select.input-field`; local `MESES`; documented decision — duplicated ~100 lines |
| Full-shape mock maintenance (`vi.clearAllMocks()` wipes implementations) | Re-`mockResolvedValue` per test (HistorialPage precedent); new page test mock must include `facturacion` namespace; existing tests unaffected |
| `timeStyle` jsdom crash | Only `Intl.NumberFormat('es-AR')` for numbers; no `timeStyle` anywhere in page/tests |
| Product order unspecified (Map insertion order) | Never assert product order in tests |
| 400-line review budget | Forecast in sdd-tasks; chained PR if high |
