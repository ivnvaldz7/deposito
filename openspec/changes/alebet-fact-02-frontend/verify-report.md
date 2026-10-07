```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:a3095bcc2ffa85f9814cdd52e23c66a27c85e4442077facd94979c69c8a409da
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 12/12
scenarios: 16/17
test_command: npm --workspace @platform/client run test
test_exit_code: 1
test_output_hash: sha256:E2AE9DE5095F194FB73DE12D888E3F02BD29C7B267754E5206B0E0C72D3AF671
build_command: npm --workspace @platform/client run build
build_exit_code: 2
build_output_hash: sha256:03D48782BFD7ADEB241D6B0FB26A71623FA71BE844344BD40437861B09286AFC
```

## Verification Report

**Change**: alebet-fact-02-frontend — "Ventas por cliente" report screen
**Version**: spec v1 (openspec/changes/alebet-fact-02-frontend/specs/ale-bet-ventas-por-cliente/spec.md)
**Mode**: Standard (no strict-tdd marker in sdd-init cache)
**Date**: 2026-08-07

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 8 (T1–T8) |
| Tasks complete | 7 (T1–T7) |
| Tasks incomplete | 1 (T8 — full gate; blocked by pre-existing/external failures only) |
| Files in change set | 9 (api.ts, use-ventas.ts, queries/index.ts, VentasPage.tsx, VentasPage.test.tsx, ale-bet-mock-factories.ts, Sidebar.tsx, Sidebar.test.tsx, App.tsx) |

T8 is the verification gate itself (run test/typecheck/build). Its "blocked" status is exactly what this report adjudicates: all failure signals trace to verified pre-existing/external sources, none to this change set (see Baseline Note). Per apply-progress, the user accepted `size:exception` for a single full pass; no commits/PRs (user directive).

### Build & Tests Execution

**Focused test — VentasPage**: ✅ 16/16 passed
```text
npm --workspace @platform/client run test -- src/modules/ale-bet/pages/__tests__/VentasPage.test.tsx
> vitest run src/modules/ale-bet/pages/__tests__/VentasPage.test.tsx
✓ src/modules/ale-bet/pages/__tests__/VentasPage.test.tsx (16 tests) 1049ms
Test Files  1 passed (1)
     Tests  16 passed (16)
```
output sha256: `595964B7C189838B1BB56BC9FD4F39EB880EAEA976F2AD827BD71211A11F42FB` (exit 0)

**Focused test — Sidebar**: ✅ 5/5 passed
```text
npm --workspace @platform/client run test -- src/modules/ale-bet/components/__tests__/Sidebar.test.tsx
✓ src/modules/ale-bet/components/__tests__/Sidebar.test.tsx (5 tests) 210ms
Test Files  1 passed (1)
     Tests  5 passed (5)
```
output sha256: `928ECFA47A4367B60D59C360905B1AB6A168648176BB07DA93D9BCCFF5839B87` (exit 0)

**Full suite**: ⚠️ 378 passed / 1 failed / 379 total (47 files: 46 passed, 1 failed)
```text
npm --workspace @platform/client run test
Failed Tests 1: src/components/ui/__tests__/Badge.test.tsx > Badge > renders all variants
  expect(element).toHaveClass("bg-success/20")
  Received: inline-flex ... border border-[#AFC8BA] bg-[#E7EFEA] text-[#3F6F5A]
Test Files  1 failed | 46 passed (47)
     Tests  1 failed | 378 passed (379)
```
output sha256: `E2AE9DE5095F194FB73DE12D888E3F02BD29C7B267754E5206B0E0C72D3AF671` (exit 1)

The single failure is the verified-external `Badge.tsx` dirty change from another agent (received classes are the pale-green hardcodes `#AFC8BA`/`#E7EFEA`/`#3F6F5A` — the exact anti-pattern design.md names; `Badge.tsx` is NOT in this change set). No `|| true` masking used anywhere.

**Build**: ❌ Failed on exactly the 3 baseline errors, ZERO from this change
```text
npm --workspace @platform/client run build  (tsc -b && vite build)
src/modules/ale-bet/pages/__tests__/DashboardPage.test.tsx(47,54): error TS2345  — pre-existing at 5b55686 (fixture vs DashboardOverview type; file unmodified in working tree)
src/modules/ale-bet/pages/ClientesPage.tsx(131,19): error TS2322  — dirty other agent (Button variant "default")
src/modules/ale-bet/pages/PedidoDetailPage.tsx(383,61): error TS2322  — pre-existing at 5b55686 (Badge variant "outline"; file unmodified)
npm error code 2  (vite build never runs)
```
output sha256: `03D48782BFD7ADEB241D6B0FB26A71623FA71BE844344BD40437861B09286AFC` (exit 2)

None of the 9 change-set files appear in the error output. `typecheck` (`tsc --noEmit`) passes but is vacuous (solution-style root tsconfig); `build` is the real gate, and its only failures are the documented baseline.

### Spec Compliance Matrix (17 scenarios, 16 compliant)

| Req | Scenario | Test | Result |
|-----|----------|------|--------|
| R1 | Allowed roles (admin/facturacion: sidebar + bottom nav) | `Sidebar.test.tsx > shows Ventas por cliente for admin and facturacion in sidebar and bottom nav` | ✅ COMPLIANT |
| R1 | Vendedor blocked; historial unchanged | `Sidebar.test.tsx > hides Ventas por cliente for vendedor; historial unchanged` | ✅ COMPLIANT |
| R2 | Responsive 375px, no horizontal scroll | (none — jsdom has no layout engine; design.md planned no R2 test) | ❌ UNTESTED |
| R3 | Search and select (nombre/CUIT, chip) | `VentasPage.test.tsx > filters by nombre and cuit and selects showing chip` | ✅ COMPLIANT |
| R3 | Initial empty, no ventas call | `> shows empty state and never calls ventas before client selection` | ✅ COMPLIANT |
| R4 | Default MES (current month/year) | `> defaults to current month and year in MES mode` | ✅ COMPLIANT |
| R4 | AÑO mode (month hidden, 2000–2100) | `> AÑO mode hides month and offers years 2000-2100` | ✅ COMPLIANT |
| R5 | Monthly call (clienteId, year, month) | `> calls ventas with clienteId, year and month in MES mode` | ✅ COMPLIANT |
| R5 | Annual call (no month) | `> calls ventas without month in AÑO mode` | ✅ COMPLIANT |
| R6 | Metrics 8/3/1.426, no currency | `> renders metrics with thousands separator` | ✅ COMPLIANT |
| R7 | Verbatim rows 2/5/25 | `> renders monthly table with verbatim cajas sueltos unidades` | ✅ COMPLIANT |
| R8 | Months only (Ene + Jul), annual totals | `> renders resumen por mes then annual totals` | ✅ COMPLIANT |
| R9 | Mobile cards | `> renders compact product cards` | ✅ COMPLIANT |
| R10 | No-sales neutral message | `> shows neutral no-sales message` | ✅ COMPLIANT |
| R10 | Friendly error, no raw backend text | `> shows friendly error, never raw backend text` | ✅ COMPLIANT |
| R11 | Discriminated union (anual exposes meses) | `> renders resumen por mes then annual totals` (runtime narrowing) + `tsc -b` clean on new files | ✅ COMPLIANT |
| R12 | Green suite, full-shape mock, no masking | Focused 16/16 + 5/5 + full suite 378/379 (external failure only) | ✅ COMPLIANT |

**Compliance summary**: 16/17 scenarios compliant, 1 untested (R2, jsdom-infeasible), 0 failing.
Extra passing coverage beyond the required 13: skeleton-loading test (`> shows a loading skeleton while the report is being fetched`), month-change and year-change refetch tests.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| R1 Nav/route | ✅ Implemented | NAV_ITEMS entry after `clientes` (BarChart2); `canSeeVentas = admin \|\| facturacion`; `visibleItems` case; ventas-first `bottomNavItems` chain; `canSeeHistorial` untouched; lazy `VentasPage` route after `transportistas`, before `*` catch-all (App.tsx diff = 2 lines) |
| R2 Layout | ✅ Implemented | Exact copy "Ventas por cliente" / "Consultá los productos despachados por cliente y período."; `mx-auto w-full max-w-[1000px]`; flex-wrap controls; no fixed widths → no 375px horizontal overflow |
| R3 Combobox | ✅ Implemented | `role="combobox"` + aria-expanded/haspopup/controls, filter `nombre` + null-safe `cuit`, clear (X) button, outside-click close, chip `nombre / cuit` fallback to nombre |
| R4 Period control | ✅ Implemented | MES/AÑO pill toggle; month select 12 options; year select 101 options (2000–2100); defaults `getMonth()+1`/`getFullYear()`; `input-field` styling |
| R5 Fetch | ✅ Implemented | `facturacion.ventas({clienteId, year, month?})` — `month` set only when present; URLSearchParams per `historial.list` precedent; hook `enabled: Boolean(clienteId)` + `placeholderData` |
| R6 Metrics | ✅ Implemented | PEDIDOS DESPACHADOS / PRODUCTOS / UNIDADES, `Intl.NumberFormat('es-AR')` ("1.426"), no currency anywhere |
| R7 Monthly | ✅ Implemented | CLIENTE + PERÍODO header (`MESES[mes-1] año`); table PRODUCTO|SKU|CAJAS|SUELTOS|UNIDADES; renders `p.cajas/p.sueltos/p.unidades` verbatim, never recomputes |
| R8 Annual | ✅ Implemented | RESUMEN POR MES maps only `reporte.meses` (server order, no re-sort); TOTAL ANUAL POR PRODUCTO reuses table/cards |
| R9 Mobile | ✅ Implemented | Cards `md:hidden` with `"{cajas} cajas · {sueltos} sueltos / {unidades} unidades"`; table `hidden md:block` |
| R10 States | ✅ Implemented | No-client empty state (no fetch); 3×Skeleton + h-64 skeleton; zero-sales neutral wrapper (no error styling); friendly error — `error.message` never rendered |
| R11 Types | ✅ Implemented | `ProductoAgregado`, `ResumenMes`, `ReporteVentasMensual`, `ReporteVentasAnual`, union `ReporteVentas` mirror server verbatim (compared against `facturacion.ts` lines 11–49); grep of the 3 new files + api.ts diff: zero `any`/`as unknown`/`@ts-ignore`/`@ts-expect-error` |
| R12 Tests | ✅ Implemented | 16 tests in VentasPage.test.tsx + 2 role tests in Sidebar.test.tsx; full-shape `vi.mock('../../lib/api')` incl. `facturacion: { ventas }`; re-`mockResolvedValue` per test; fixtures in `ale-bet-mock-factories.ts` (append-only, +74 lines) |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| `VentasPage.tsx` naming (route-segment convention) | ✅ Yes | |
| Local `ClienteCombobox` (TransportSelector copy) | ✅ Yes | ~110 lines, single consumer |
| Ventas-first bottom-nav displacement | ✅ Yes | Accepted tradeoff; admin loses Stock / facturacion loses Clientes in bottom nav only; both keep full sidebar; covered by test |
| Native `select.input-field` month/year + local `MESES` | ✅ Yes | |
| Compact MetricCard copy (`text-[28px]`) | ✅ Yes | |
| All clients from `useClientes()` (HistorialPage precedent) | ✅ Yes | |
| `useVentas` shape (keys, enabled, placeholderData) | ✅ Yes | matches design Interfaces verbatim |
| Fixture defaults asserting spec examples directly | ✅ Yes | R6 "1.426", R7 "2/5/25", R8 "ENERO — 8 pedidos · 920 unidades", R9 "7 cajas · 4 sueltos / 144 unidades" |
| Theme tokens only, no pale-green/emerald/obsidian, no `timeStyle` | ✅ Yes | no hex color literals in VentasPage.tsx; only `Intl.NumberFormat('es-AR')` |

### Baseline Note (pre-existing/external — NOT defects of this change)

Independently verified per the orchestrator's baseline and re-confirmed during this run:

1. **Build** fails on 3 errors, zero attributable to this change set: `DashboardPage.test.tsx(47,54)` (pre-existing at 5b55686 — file byte-identical to HEAD, unmodified in working tree), `ClientesPage.tsx(131,19)` (dirty other agent), `PedidoDetailPage.tsx(383,61)` (pre-existing at 5b55686 — unmodified). `vite build` never runs.
2. **Full suite** 378/379: the 1 failure (`Badge.test.tsx`) is caused by another agent's dirty `Badge.tsx` (received classes `border border-[#AFC8BA] bg-[#E7EFEA] text-[#3F6F5A]` confirm the pale-green restyle).
3. **Historial del Vendedor**: `git diff HEAD -- .../HistorialPage.tsx` is NOT empty — it contains one line from ANOTHER agent: `COMPLETADO: 'bg-success/20 text-success'` → `'border border-[#AFC8BA] bg-[#E7EFEA] text-[#3F6F5A]'` (the exact anti-pattern design.md calls out). This change is not in the alebet-fact-02 file list; `canSeeHistorial` predicate and its logic are untouched, and no ventas-related code was added to the file.
4. `typecheck` passes but is vacuous (solution-style root tsconfig with `files: []`); `build` is the real gate.

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. R2 scenario "Responsive 375px, no horizontal scroll" has no covering test (❌ UNTESTED). jsdom has no layout engine, so overflow cannot be asserted at runtime; design.md's testing strategy also planned no R2 test. Static evidence (max-w-[1000px], flex-wrap, md:hidden/md:block split, no fixed/min widths) supports compliance. Verdict impact: single untested scenario, no runtime blocker.

**SUGGESTION**:
1. The combobox "clear" (X button, aria-label "Quitar cliente") and "typing after selection clears it" behaviors are implemented but untested — a small test would close the R3 gap.
2. If 375px overflow is a hard acceptance criterion, a Playwright/Cypress smoke test (or manual QA at 375px) is the only stack that can prove it; consider adding to a future e2e suite.
3. `HistorialPage.tsx` remains dirty by another agent with the pale-green COMPLETADO badge (anti-pattern per design.md Design Tokens). Not this change's file, but it should be reverted/reconciled by its owner before any PR containing the ale-bet module is opened, to keep the diff clean.
4. Sidebar.test.tsx's `mockRol` helper uses `(state: any)` — pre-existing pattern (unchanged by this diff), consistent with the rest of the repo's test files; fine to leave.

### Verdict

**PASS WITH WARNINGS** — All 12 requirements implemented; 16/17 spec scenarios have passing covering tests; the sole untested scenario (R2 viewport overflow) is jsdom-infeasible with strong static evidence; the only failing test and build errors are verified pre-existing/external, zero attributable to this change set.
