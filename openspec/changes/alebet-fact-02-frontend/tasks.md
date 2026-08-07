# Tasks: "Ventas por cliente" report screen (alebet-fact-02-frontend)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 800–950 (additions; near-zero deletions) |
| 400-line budget risk | High (guard threshold 400; user budget 800 — forecast sits at the boundary) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 foundation (~55) → PR 2 nav/route (~75) → PR 3 screen + tests (~700–770, within user's 800-line budget; optionally PR 3a page+fixtures / PR 3b tests for tighter slices) |
| Delivery strategy | auto-forecast |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

## Suggested Work Units

| Unit | Tasks | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|-------|------|-----------|----------------------|-----------------|-------------------|
| 1 | T1–T2 | Typed `facturacion.ventas` API + `useVentas` hook | PR 1 | `npm --workspace @platform/client run typecheck` | N/A — no UI yet; existing suite must stay green: `npm --workspace @platform/client run test` | Revert `api.ts` diff; delete `use-ventas.ts`; revert `queries/index.ts` |
| 2 | T6–T7 | Sidebar + bottom nav entry + lazy route | PR 2 | `npm --workspace @platform/client run test -- Sidebar.test.tsx` | `npm --workspace @platform/client run dev`: login admin/facturacion → entry in sidebar + bottom nav; vendedor → absent, historial unchanged | Revert `Sidebar.tsx`/`App.tsx` diffs + `Sidebar.test.tsx` |
| 3 | T3–T5 | VentasPage + fixtures + full suite | PR 3 | `npm --workspace @platform/client run test -- VentasPage.test.tsx` | `npm --workspace @platform/client run dev`: select client, MES/AÑO toggle, 375px viewport → cards, no horizontal scroll | Delete `VentasPage.tsx` + `VentasPage.test.tsx`; revert fixtures |

## Phase 1: Foundation — API contract and query hook

- [x] **T1 — Add ventas API types + method.** Objective: typed access to `GET /ale-bet/facturacion/ventas`. Files: `apps/platform/client/src/modules/ale-bet/lib/api.ts`. Key points: add `ProductoAgregado`, `ResumenMes`, `ReporteVentasMensual`, `ReporteVentasAnual`, union `ReporteVentas` (modo discriminator) mirroring server verbatim (design Interfaces); `facturacion: { ventas }` namespace after `historial`; URLSearchParams per `historial.list`; `month` set only when present (presence switches mode server-side). Verification: `npm --workspace @platform/client run typecheck`.
- [x] **T2 — Add useVentas hook + barrel.** Objective: React Query hook gated on client selection. Files: `apps/platform/client/src/modules/ale-bet/queries/use-ventas.ts` (new), `apps/platform/client/src/modules/ale-bet/queries/index.ts`. Key points: `ventasKeys.all`/`.list(params)`; `useQuery` with `enabled: Boolean(clienteId)` (no request before selection — design Data Flow), `placeholderData: (prev) => prev`; barrel `export { useVentas, ventasKeys }`. Verification: typecheck (behavior proven via T4 suite).

## Phase 2: Core — Screen (TDD: T3+T4 RED → T5 GREEN)

- [x] **T3 — Add ventas fixtures.** Objective: factory helpers with spec-example defaults. Files: `apps/platform/client/src/modules/ale-bet/pages/__tests__/fixtures/ale-bet-mock-factories.ts`. Key points: `createProductoAgregado` (2 cajas / 5 sueltos / 25 unidades, `unidadesPorCaja: 12`), `createReporteVentasMensual` (8 pedidos / 3 productos / 1426 unidades, 3 products), `createReporteVentasAnual` (12/3/960, 2 products, `meses`: Ene 8/920 + Jul) — defaults chosen so R6 "1.426", R7 "2/5/25", R8 "ENERO — 8 pedidos · 920 unidades", R9 "7 cajas · 4 sueltos / 144 unidades" assert directly (design Testing Strategy). Verification: consumed by T4.
- [x] **T4 — Write VentasPage test suite (RED).** Objective: R12 — the 13 required cases. Files: `apps/platform/client/src/modules/ale-bet/pages/__tests__/VentasPage.test.tsx` (new). Key points: full-shape `vi.mock('../../lib/api')` incl. `facturacion: { ventas: vi.fn() }` + `vi.mock('@/stores/auth-store')`; `beforeEach` `vi.clearAllMocks()` + re-`mockResolvedValue` per test (R6); `renderWithQueryClient` + `MemoryRouter` + `fireEvent`; cases: empty state / ventas never called before selection; search by nombre & CUIT + chip "Cliente B / 30-12345678-9"; null-cuit chip "Cliente A"; default current month/year; AÑO hides month + 101 year options (2000–2100); monthly call `{clienteId, year, month: 7}`; annual call without month; month change → `month: 8`; year change → `year: 2025`; metrics "8"/"3"/"1.426" + no currency; verbatim table row "2/5/25"; annual RESUMEN rows (never assert product order — Map insertion, R4); mobile card text; no-sales neutral message; friendly error, `queryByText(/backend boom/)` null. Verification: suite fails (RED) until T5.
- [x] **T5 — Implement VentasPage (GREEN).** Objective: full screen per design Component Structure. Files: `apps/platform/client/src/modules/ale-bet/pages/VentasPage.tsx` (new). Key points: local `ClienteCombobox` (TransportSelector copy — `role="combobox"`, aria-expanded/haspopup/controls, clear button, outside click, client-side filter `nombre` + `cuit` null-safe, chip `nombre / cuit`); MES/AÑO pill toggle + `select.input-field` month (1–12) / year (101 options 2000–2100) + module-private `MESES`; compact metrics (GlassCard copy, `text-[28px]`, PEDIDOS DESPACHADOS / PRODUCTOS / UNIDADES, `fmtUnidades` `Intl.NumberFormat('es-AR')`, no currency); monthly: CLIENTE + PERÍODO header, table PRODUCTO|SKU|CAJAS|SUELTOS|UNIDADES verbatim, `md:hidden` mobile cards `"7 cajas · 4 sueltos / 144 unidades"`; annual: RESUMEN POR MES (only `meses`, server order) then TOTAL ANUAL POR PRODUCTO; states matrix: no-client (no fetch) / skeleton / zero-sales neutral / friendly error (never `error.message`); theme tokens only (no pale-green hardcodes, no `--color-emerald-*`/`--color-obsidian-*`), never `timeStyle`. Verification: T4 suite green.

## Phase 3: Integration — Nav and route

- [x] **T6 — Sidebar + bottom nav entry.** Objective: R1 role gating. Files: `apps/platform/client/src/modules/ale-bet/components/Sidebar.tsx`, `apps/platform/client/src/modules/ale-bet/components/__tests__/Sidebar.test.tsx`. Key points: NAV_ITEMS entry "Ventas por cliente" (BarChart2, after `clientes`); `canSeeVentas = rol === 'admin' || rol === 'facturacion'`; `visibleItems` case `/ale-bet/ventas`; `bottomNavItems` chain ventas-first (displacement of stock/clientes accepted — R1); **`canSeeHistorial` untouched**. Tests (mockRol): admin/facturacion → link in sidebar + bottom nav, historial still present; vendedor → absent, historial unchanged. Verification: `npm --workspace @platform/client run test -- Sidebar.test.tsx`.
- [x] **T7 — Lazy route.** Objective: serve `/ale-bet/ventas`. Files: `apps/platform/client/src/modules/ale-bet/App.tsx`. Key points: `const VentasPage = lazy(() => import('./pages/VentasPage'))` + `<Route path="ventas" element={<VentasPage />} />` after `transportistas`, before `*` catch-all (must not shadow `pedidos/:id`). Verification: `npm --workspace @platform/client run build` + manual nav.

## Phase 4: Verification

- [ ] **T8 — Full gate.** Objective: proposal success criteria. Run `npm --workspace @platform/client run test`, `run typecheck`, `run build` — all pass, no `|| true` masking; confirm no `any`/`as unknown`/`@ts-ignore` in new code.

## Non-Goals

- No backend/server changes (`apps/platform/server/` untouched; contract already shipped at commit 5b55686).
- No stock, reservas, FEFO, or STOCK-02 work.
- No prices, IVA, invoicing, charts, rankings, client comparisons, PDF/Excel/export.
- No Historial del Vendedor changes (`canSeeHistorial` predicate and its tests untouched; no COMPLETADO-badge restyle).
- No commits, push, or PR creation in this run (user directive).
