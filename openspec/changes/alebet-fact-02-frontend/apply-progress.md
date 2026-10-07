# SDD Apply-Progress — alebet-fact-02-frontend (2026-08-07)

Mode: Standard (no strict-tdd marker in sdd-init cache). Openspec artifact store. Single full pass (user accepted size:exception). NO commits, NO push, NO PRs.

## Per-task status

| Task | Status | Files changed | Focused test result |
|---|---|---|---|
| T1 Typed API + `facturacion.ventas` | done | `apps/platform/client/src/modules/ale-bet/lib/api.ts` (additive: 5 report types + `facturacion` namespace after `historial`; URLSearchParams clienteId+year always, month only when truthy) | n/a (types) |
| T2 `useVentas` hook + barrel | done (post-review fix R4-001) | `queries/use-ventas.ts` (new: `ventasKeys`, `useVentas` gated on `clienteId`; `placeholderData` REMOVED in review correction — see Correction log), `queries/index.ts` | n/a |
| T3 Ventas fixtures | done | `pages/__tests__/fixtures/ale-bet-mock-factories.ts` (append-only: `createProductoAgregado`, `createReporteVentasMensual` 8/3/1426, `createReporteVentasAnual` 12/3/960 with 2 meses) | n/a |
| T4 VentasPage test suite | done | `pages/__tests__/VentasPage.test.tsx` (new, 17 tests after R4-001 regression test) | 17/17 PASS |
| T5 VentasPage implementation | done | `pages/VentasPage.tsx` (new: combobox, MES/AÑO, metrics, monthly/annual, mobile cards, 5 states) | covered by T4 |
| T6 Sidebar + bottom-nav entry | done | `components/Sidebar.tsx` (NAV_ITEMS "Ventas por cliente" BarChart2, `canSeeVentas = admin\|\|facturacion`, ventas-first bottom-nav chain), `components/__tests__/Sidebar.test.tsx` (+2 role-gating tests) | 5/5 PASS |
| T7 Lazy route | done | `modules/ale-bet/App.tsx` (`ventas` route after transportistas, before `*`) | n/a |
| T8 Full gate (suite + typecheck + build) | blocked (pre-existing/external failures) | — | see Verification |

## Corrección de review (R4-001, 2026-08-07)

- **Finding**: CRITICAL (review-resilience) — `placeholderData: (prev) => prev` en `use-ventas.ts` podía emparejar una nueva selección de cliente con el reporte anterior durante refetch.
- **Fix**: eliminado `placeholderData`; el flujo queda `isLoading → skeleton` en cada cambio de key (cliente/período). Contrato del hook intacto.
- **Regression test**: "never pairs a new client selection with the previous report while refetching" (helper `deferred<T>`, RED→GREEN probado).
- **Resultado**: suite VentasPage 17/17 PASS; validador read-only `validated: true`; review nativa `review-90aade2b644c1381` **APPROVED** (correction budget 200; usados ~54 líneas); `gentle-ai review validate --gate pre-commit` → **allow**. Receipt: `.git/gentle-ai/review-transactions/v2/review-90aade2b644c1381/review-receipt.json`.

## Verification results

| Command | Result |
|---|---|
| `npm --workspace @platform/client run test -- src/modules/ale-bet/pages/__tests__/VentasPage.test.tsx` | PASS 17/17 |
| `npm --workspace @platform/client run test -- src/modules/ale-bet/components/__tests__/Sidebar.test.tsx` | PASS 5/5 |
| `npm --workspace @platform/client run test` (full suite) | 378/379 PASS; 1 failure `Badge.test.tsx` — dirty other agent (`Badge.tsx` style-only diff), not in change set |
| `npm --workspace @platform/client run typecheck` (`tsc --noEmit`) | PASS (vacuous: root tsconfig solution-style `files: []`; real gate is `build`) |
| `npm --workspace @platform/client run build` (`tsc -b && vite build`) | FAILS on 3 pre-existing/external errors, ZERO from this change set: (1) `DashboardPage.test.tsx(47,54)` — fixture `createDashboardOverview()` lacks fields required by HEAD type; broken at 5b55686 itself (verified byte-identical HEAD vs working tree); (2) `ClientesPage.tsx(131,19)` — dirty other agent (Button variant "default" not in union); (3) `PedidoDetailPage.tsx(383,61)` — pre-existing at HEAD (`<Badge variant="outline">` vs Badge union without outline). Vite build never runs. |

Independent fresh-context validation (2026-08-07) confirmed: errors attributable to ALEBET-FACT-02 change set: NONE. No `any`/`as unknown`/`@ts-ignore` in new code.

## Gotchas recorded

- jsdom maps native `<select>` to role "combobox" → never `getByRole('combobox')` for selects; use placeholder/aria-label.
- jsdom ignores responsive CSS (`md:hidden`) → mobile cards and table both in DOM; scope with `within()` + `findByTestId`.
- Multiple `render()` in one test accumulate in the same document → explicit `cleanup()` per iteration.
- `createClienteList()` shared fixture: Cliente B has `cuit: null` — CUIT-filter tests need a local list.
- `facturacion` role never had Historial (`canSeeHistorial = admin||vendedor`) — "historial present" assertion valid only for admin.
- `canSeeHistorial` predicate and `HistorialPage.tsx` are off-limits (dirty, other agent).

## Deviations from design

None — implementation matches design.md. Bottom-nav displacement accepted (R1): admin loses Stock, facturacion loses Clientes in bottom nav only; both keep full sidebar. Historial del Vendedor untouched.

## Rollback boundary

Frontend-only. Revert: api.ts additions, use-ventas.ts, queries/index.ts barrel line, fixtures additions, VentasPage.tsx, VentasPage.test.tsx, Sidebar.tsx diff, Sidebar.test.tsx additions, App.tsx diff.
