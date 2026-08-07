# Exploration: alebet-fact-02-frontend — "Ventas por cliente" screen

Read-only exploration for the frontend report screen backed by the already-committed backend `GET /api/ale-bet/facturacion/ventas` (commit 5b55686, 25 passing tests).

---

## 1. Sidebar navigation

File: `apps/platform/client/src/modules/ale-bet/components/Sidebar.tsx`

- Flat `NAV_ITEMS` array (no groups/sections exist):
  `dashboard` (LayoutDashboard), `pedidos` (ClipboardList), `productos` (Package), `clientes` (Users), `stock` (Box), `historial` (Clock), `transportistas` (Truck).
- Role gating via per-route predicates + `visibleItems(rol)` switch:

```tsx
const canSeeClientes = (rol: Rol) => rol === 'admin' || rol === 'facturacion'
const canSeeStock = (rol: Rol) => rol === 'admin' || rol === 'encargado'
const canSeeHistorial = (rol: Rol) => rol === 'admin' || rol === 'vendedor'   // DO NOT TOUCH
const canSeeTransportistas = (rol: Rol) => rol === 'admin' || rol === 'facturacion'
```

- `visibleItems` filters `NAV_ITEMS` with a `switch (item.path)`; default returns `true`. Desktop nav is `<aside>` + `NavItemLink`; mobile bottom nav (`bottomNavItems`) shows dashboard/pedidos/productos + **one** extra item (priority: stock → clientes → historial) + "Nuevo" FAB for admin/vendedor.
- There is NO "Facturación" group. Best fit: a flat entry between `clientes` and `stock` (or after `transportistas`), label **"Ventas por cliente"** (matches the screen title; `REPORTES` is too generic for a single screen), icon `BarChart2` (already used in deposito Sidebar for Métricas) or `Receipt` from lucide-react.
- Add: new `NAV_ITEMS` entry + `case '/ale-bet/ventas'` in `visibleItems` with `canSeeVentas = admin || facturacion`. Mobile bottom nav does NOT need it (facturacion/admin already get `clientes` there); extending `bottomNavItems` is optional scope.

## 2. Router

- Root: `apps/platform/client/src/router/index.tsx` — `AleBetModule` lazy under `/ale-bet/*` wrapped in `<ProtectedRoute app="ale-bet">`. Module-level RBAC only; no per-route role guards anywhere (server enforces 403).
- Inner routes: `apps/platform/client/src/modules/ale-bet/App.tsx` — every page is `lazy(() => import('./pages/X'))`, rendered inside `<Suspense fallback={<LoadingFallback />}>` (plain "Cargando..." text):

```tsx
<Route path="clientes" element={<ClientesPage />} />
<Route path="historial" element={<HistorialPage />} />
<Route path="*" element={<Navigate to="dashboard" replace />} />
```

- New route: add `const VentasPage = lazy(() => import('./pages/VentasPage'))` + `<Route path="ventas" element={<VentasPage />} />` before the `*` catch-all. Suggested path `/ale-bet/ventas` (no collision with `pedidos/:id`).

## 3. API client

- `aleBetApi` in `apps/platform/client/src/modules/ale-bet/lib/api.ts` (line 283), `const BASE = '/ale-bet'`. Existing namespaces: `dashboard`, `productos`, `clientes`, `pedidos`, `transportistas`, `remitos`, `stock`, `historial`. **No `facturacion` namespace yet.**
- Underlying wrapper `apiClient` in `apps/platform/client/src/lib/api-client.ts`: `BASE_URL = import.meta.env.VITE_API_URL || ''`; `buildApiUrl` prepends `/api`; Bearer token from `useAuthStore`; `credentials: 'include'`; on 401 retries once after `POST /auth/refresh`; throws `ApiError(status, message)` parsed from `{ message | error }`; 204 → `undefined`; `getBlob` for downloads.
- Query-param method pattern to copy — `historial.list` (api.ts:369):

```ts
historial: {
  list: (params?: { desde?: string; hasta?: string; estado?: string; clienteId?: string; vendedorId?: string }) => {
    const searchParams = new URLSearchParams()
    if (params?.desde) searchParams.set('desde', params.desde)
    // ...
    const qs = searchParams.toString()
    return apiClient.get<HistorialPedido[]>(`${BASE}/historial${qs ? `?${qs}` : ''}`)
  },
},
```

Suggested addition (typed, same shape):

```ts
// Facturación
facturacion: {
  ventas: (params: { clienteId: string; year: number; month?: number }) => {
    const searchParams = new URLSearchParams({ clienteId: params.clienteId, year: String(params.year) })
    if (params.month) searchParams.set('month', String(params.month))
    return apiClient.get<ReporteVentas>(`${BASE}/facturacion/ventas?${searchParams}`)
  },
},
```

Queries go in `apps/platform/client/src/modules/ale-bet/queries/` (e.g. `use-ventas.ts`, keys like `['ale-bet', 'facturacion', 'ventas', {clienteId, year, month}]`), following `use-historial.ts` / `use-clientes.ts`.

## 4. Client search / autocomplete

**No predictive combobox for clients exists.** Three existing patterns:

- `ClientesPage.tsx` — plain `<input className="input-field max-w-sm">` + **client-side** filter over the full list: `nombre.toLowerCase().includes(q) || contacto?.includes(q)` (line 229-234). Only `VALIDADO` clients shown.
- `HistorialPage.tsx` (lines 100-111) — **native** `<select className="input-field">` listing all clients from `useClientes()` (no estado filter).
- `NuevoPedidoPage.tsx` (lines 249, 324-336) — BottomSheet search, client-side filter on `` `${c.nombre} ${c.contacto ?? ''} ${c.referencia ?? ''}` ``; "recientes" list derived from active pedidos; selection via `ClienteCard`.

The closest **autocomplete** pattern is `TransportSelector` in `apps/platform/client/src/modules/ale-bet/pages/PedidoDetailPage.tsx` (line 540): custom input `role="combobox"` + `aria-expanded` + `aria-haspopup="listbox"`, clear (X) button, chevron, dropdown `absolute z-50 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-surface-container-high shadow-float` with items `hover:bg-surface-high`, selected item `bg-primary/10 text-primary font-semibold`, and a "No se encontraron resultados" empty row. No cmdk, no debounce, no server search. `CambiarClienteSheet` (PedidoDetailPage line 164, `ClienteOption` line 138) is the client variant.

Backend `apps/platform/server/src/routes/ale-bet/clientes.ts`: `GET /` requires only app access, returns **all** `activo: true` clients `orderBy: nombre` — **no `?q=` param, no CUIT search**. Client type (client-side, api.ts:47): `{ id, nombre, contacto, referencia, direccion, localidad, provincia, cuit, condicionIva, condicionVenta, estado: 'PENDIENTE_CLIENTE'|'VALIDADO', activo, createdAt, updatedAt }` — field is `nombre`, **no `razonSocial`**. No "Nombre / CUIT" display exists anywhere; ClienteCard shows `nombre` + `contacto ?? referencia` (CUIT only shown in the edit form).

**Recommendation**: reuse `useClientes()` + client-side filter (HistorialPage precedent), optionally excluding `PENDIENTE_CLIENTE`; include `cuit` in the filter string if wanted. A full combobox (TransportSelector pattern) is optional polish.

## 5. Backend contract EXACT

File: `apps/platform/server/src/routes/ale-bet/facturacion.ts` (mounted at `/facturacion` in `routes/ale-bet/index.ts` line 25). Tests: `routes/ale-bet/__tests__/facturacion.test.ts` (25 tests).

**Endpoint**: `GET /api/ale-bet/facturacion/ventas?clienteId=&year=&month?`

Query params & validation (400 `{ error: string }`):
- `clienteId` — required, trimmed string. 400 `'El parámetro clienteId es requerido'`
- `year` — required, integer, `2000..2100`. 400 `'El parámetro year es requerido'` / `'El parámetro year debe ser un año válido (2000-2100)'`
- `month` — optional, integer `1..12`; presence switches mode. 400 `'El parámetro month debe ser un número entre 1 y 12'`

RBAC: `requireApp('ale-bet', ['admin', 'facturacion'])` → 401 without token, 403 for vendedor/armador/encargado_deposito/no-access.

A VENTA = `Pedido.estado === 'DESPACHADO'` with `despachadoAt` in `[desde, hasta)` (UTC range: month → `UTC(year, month-1, 1)` to `UTC(year, month, 1)`; year → `UTC(year, 0, 1)` to `UTC(year+1, 0, 1)`). Products aggregated via live `ItemPedido.producto` join (current `unidadesPorCaja`, not historical).

**Monthly response** (`modo: 'mensual'`):

```json
{ "modo": "mensual", "clienteId": "…", "year": 2026, "month": 7,
  "pedidosDespachados": 1, "productosDistintos": 1, "unidadesTotales": 25,
  "productos": [ { "productoId": "…", "nombre": "…", "sku": "…",
                   "unidadesPorCaja": 10, "cajas": 2, "sueltos": 5, "unidades": 25 } ] }
```

**Annual response** (`modo: 'anual'`): same top-level fields **without `month`**, plus `"meses": [ { "month": 1, "pedidosDespachados": …, "productosDistintos": …, "unidadesTotales": …, "productos": [ … ] } ]` — only months **with** sales, sorted ascending; `meses: []` when none. Product order is Map insertion order (unspecified). Empty period → all zeros + empty arrays (verified by tests).

Nothing differs from the documented contract.

## 6. Page / layout patterns

- Container: no max-width wrapper; `App.tsx` main is `<main className="flex-1 p-margin-desktop overflow-y-auto">`; pages root `<div className="space-y-6">`.
- Header convention (HistorialPage:66, ClientesPage:338): `<h1 className="text-[28px] font-bold tracking-tight text-on-surface">` + `<p className="font-body text-[13px] text-on-surface-variant">` subtitle; optional right-aligned action button (`rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary hover:bg-primary/20`).
- Summary metrics: `MetricCard` **local to** `DashboardPage.tsx` (line 52, NOT exported): `GlassCard` (`@/components/ui/GlassCard`, variants default/primary/warning/error) + `label: font-body text-[10px] uppercase tracking-[0.8px] text-outline`, `value: mt-4 text-[48px] font-bold leading-none ${valueClassName}` (e.g. `text-warning`, `text-success`, `text-on-surface`), `subtitle: max-w-[20ch] font-body text-[11px] text-on-surface-variant`. Grid: `grid gap-4 md:grid-cols-2 xl:grid-cols-4`. Reuse by extracting or copying the pattern.
- Tables: wrapper `<div className="bg-surface-container-high rounded-xl overflow-hidden">`, `<table className="w-full text-left font-body text-[12px]">`, thead `text-[10px] uppercase tracking-[0.8px] text-outline`, rows `border-b border-white/10 last:border-0`, cells `px-5 py-4` (HistorialPage:126-169).
- Responsive: ClientesPage — cards `space-y-3 md:hidden` + table `hidden md:block` (data-testids `clientes-mobile`/`clientes-table`); DashboardPage — `lg:grid grid-cols-[…]` rows with `lg:hidden` inline blocks.
- Loading: mostly `<p className="font-body text-sm text-on-surface-variant">Cargando X...</p>`; `Skeleton` (`@/components/ui/Skeleton`, variants text/circle/card) used in PedidosPage (`<Skeleton variant="card" className="h-44" />`) and PedidoDetailPage.
- Empty state: `<p className="px-5 py-8 text-center font-body text-[13px] text-on-surface-variant">No se encontraron pedidos.</p>` (HistorialPage:131-132).
- Errors: inline `<p className="font-body text-sm text-error">{error.message}</p>`; mutations use `toast.error(...)` from `@/lib/toast` (sonner wrapper, styled with theme tokens).
- Filter rows: `<div className="flex flex-wrap gap-4">` + `<label className="mb-1 block font-body text-[10px] uppercase tracking-[0.8px] text-outline">` (HistorialPage:80-124).

## 7. Design system

`apps/platform/client/src/index.css` — Tailwind v4 `@theme` (dark default) / `.light` overrides. Inter for heading/body/mono (`--font-heading/body/mono`).

| Token | Dark | Light |
|---|---|---|
| `--color-primary` | `#a3d1b6` (pale sage) | `#3d6852` |
| `--color-primary-container` | `#305b46` | `#bfeed2` |
| `--color-background` | `#0b0f0d` | `#f7faf5` |
| `--color-surface-container-high` | `#1a211d` | `#d6dbd3` |
| `--color-on-surface` | `#dfe8df` | `#191d19` |
| `--color-on-surface-variant` | `#a4ada6` | `#424a43` |
| `--color-outline` / `-variant` | `#6f7871` / `#414a44` | … |
| `--color-error` / `--color-success` / `--color-warning` | `#fa746f` / `#00ae42` / `#A06869` | … |
| radius / shadow | `0.5rem`-`1rem` / `--shadow-float` | — |

**Legacy pale-green to AVOID**: `HistorialPage.tsx` line 23 hardcodes `COMPLETADO: 'border border-[#AFC8BA] bg-[#E7EFEA] text-[#3F6F5A]'` — do not copy; use token classes. Also legacy compat tokens `--color-obsidian-*`, `--color-emerald-*`, `--color-surface-high/highest` are marked "BACKWARD COMPAT — keep until full migration".

Shared ui components (`apps/platform/client/src/components/ui/`): `Badge` (variants default/success/warning/warning-soft/error/info), `Button`, `Card`, `GlassCard`, `Input`, `Select` (label/error/options/value/onChange — **still a styled native `<select>`**, role combobox), `Skeleton`, `DatePicker` (custom calendar), `StatusBadge`. **No Combobox, Dialog, Modal, Tabs.** Ale-bet's own `BottomSheet` (`components/BottomSheet.tsx`, `desktop="modal"` mode) is used for modals. The `input-field` legacy class (index.css line 263, with a `select.input-field` chevron variant) is used throughout ale-bet pages.

## 8. Period controls

- **No month/year selector component exists.** `DatePicker` is day-granularity only. Spanish month names `MONTHS` (Enero…Diciembre) are **module-private** in `DatePicker.tsx`.
- Existing date formatting: `toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })` (DashboardPage `formatDashboardDate`), `toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })` (HistorialPage:163 — **crashes under jsdom; tests skip table assertions because of it — avoid `timeStyle`**).
- `useDebouncedValue` local hook (250 ms) exists in `PedidoDetailPage.tsx`/`NuevoPedidoPage.tsx`.
- Recommendation: month + year as `select.input-field` (HistorialPage precedent) or a small custom popover; Spanish labels via `new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(new Date(2000, m, 1))` — no existing helper, needs a local `MESES` const. Default year = current year; constrain `2000..2100` to mirror backend validation.

## 9. Tests

- Command: `npm --workspace @platform/client run test` (script `vitest run`; workspace name `@platform/client`).
- `apps/platform/client/vitest.config.ts`: `globals: true`, `environment: 'jsdom'`, `setupFiles: ['./src/test-setup.ts']`, `include: ['src/**/*.{test,spec}.{ts,tsx}']`, `css: true`, alias `@` → `src`, v8 coverage.
- Libs: vitest + `@testing-library/react` (tests use `fireEvent`, not user-event) + `react-router-dom` MemoryRouter + `@tanstack/react-query` (no MSW; API mocked at module level).
- Test utils `@/test-utils.tsx`: `renderWithQueryClient` (QueryClient with `retry: false`), `renderWithRouter`, `createMockUser` (defaults `ale-bet: { rol: 'admin' }`), re-exports RTL.
- Mock pattern (HistorialPage.test.tsx) — **full-shape factory; every namespace must be listed**:

```tsx
vi.mock('../../lib/api', () => ({
  aleBetApi: {
    dashboard: vi.fn(),
    productos: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), lotes: { list: vi.fn(), create: vi.fn() } },
    clientes: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    pedidos: { list: vi.fn(), create: vi.fn(), aprobar: vi.fn(), tomar: vi.fn(), completarItem: vi.fn(), cancelar: vi.fn() },
    stock: { get: vi.fn(), movimientos: vi.fn() },
    historial: { list: vi.fn(), exportDownload: vi.fn() },
  },
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }))
// beforeEach: vi.clearAllMocks(); (useAuthStore as ...).mockReturnValue({ user: createMockUser(), token: 'token' })
```

- Role-based tests mock the auth store with a selector implementation (`Sidebar.test.tsx` `mockRol`): `(useAuthStore as …).mockImplementation((selector) => selector({ user: createMockUser({ apps: { 'ale-bet': { rol, activo: true } } }), token: 'token', logout }))`.
- Fixtures: `src/modules/ale-bet/pages/__tests__/fixtures/ale-bet-mock-factories.ts` (`createCliente`, `createClienteList`, `createHistorialPedido`, …) — new `createReporteVentasMensual/Anual` factories belong here.

## 10. Types location

- All client types live in `apps/platform/client/src/modules/ale-bet/lib/api.ts` (types at top, input types from line 217). **No facturacion/ventas types exist client-side** (grep confirms).
- New types to add there, mirroring the server contract verbatim:

```ts
export interface ProductoAgregado { productoId: string; nombre: string; sku: string; unidadesPorCaja: number; cajas: number; sueltos: number; unidades: number }
export interface ResumenMes { month: number; pedidosDespachados: number; productosDistintos: number; unidadesTotales: number; productos: ProductoAgregado[] }
export interface ReporteVentasMensual { modo: 'mensual'; clienteId: string; year: number; month: number; pedidosDespachados: number; productosDistintos: number; unidadesTotales: number; productos: ProductoAgregado[] }
export interface ReporteVentasAnual { modo: 'anual'; clienteId: string; year: number; pedidosDespachados: number; productosDistintos: number; unidadesTotales: number; productos: ProductoAgregado[]; meses: ResumenMes[] }
export type ReporteVentas = ReporteVentasMensual | ReporteVentasAnual
```

Client-side helpers already available: `calcularCajasSueltos` (`lib/estados.ts`) — not needed, server precomputes cajas/sueltos.

---

## Risks / gotchas

1. **No combobox component**: native `<select>` (HistorialPage) or build the custom combobox (TransportSelector pattern, ~100 lines). Native selects are the existing convention, and `ui/Select` is still native underneath.
2. **Full-shape `vi.mock('../../lib/api')`**: the new `facturacion: { ventas: vi.fn() }` namespace must be added to every NEW page-test mock; existing tests are unaffected (they never reference it) but `vi.clearAllMocks()` wipes implementations — always re-`mockResolvedValue` in each test.
3. **Client list is client-side-filtered**: no server search endpoint; fetch all via `useClientes()` (precedent: HistorialPage). Optionally filter out `PENDIENTE_CLIENTE`.
4. **`MetricCard` is not exported** — extract or inline in the new page.
5. **`timeStyle` jsdom crash** in HistorialPage — don't reuse that date-formatting call in the new page or its tests.
6. **Mobile bottom nav** won't show the new entry unless `bottomNavItems` is extended (out of scope by default).
7. **Product ordering in the response is Map insertion order** — don't assert a specific order without server-side sorting.
8. **unidadesPorCaja is the live product value**, not historical — a product whose caja size changed will show recomputed cajas/sueltos for old sales.
9. Route `pedidos/:id` must not shadow the new route; add before `*` catch-all.
