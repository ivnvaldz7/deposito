# Ale-Bet Ventas Por Cliente — Full Specification

## Purpose

Sales-per-client report for Ale-Bet `admin`/`facturacion`, backed by `GET /api/ale-bet/facturacion/ventas`.

## Requirements

### R1: Navigation Entry and Route

The system MUST add "Ventas por cliente" at `/ale-bet/ventas` in the desktop sidebar AND mobile bottom nav, only for roles `admin`/`facturacion`; route renders lazily before the `*` catch-all; "Historial" predicate unchanged.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Allowed roles | role admin or facturacion | sidebar renders | entry in sidebar and bottom nav |
| Vendedor blocked | role vendedor | sidebar renders | entry absent; historial unchanged |

### R2: Screen Layout

The system MUST render title "Ventas por cliente" and subtitle "Consultá los productos despachados por cliente y período." in a ~1000px max-width container usable at 375px without horizontal overflow.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Responsive | viewport 375px | screen renders | no horizontal scroll |

### R3: Client Combobox

The system MUST provide a predictive combobox (not native select) filtering `useClientes()` by `nombre` and `cuit`, with select/change/clear. No client → "Seleccioná un cliente para consultar sus ventas." and no ventas call. Null `cuit` shows `nombre` only.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Search and select | clients loaded | types nombre or CUIT, picks | chip "nombre / cuit" (nombre if cuit null) |
| Initial empty | no client | screen renders | message shown; ventas never called |

### R4: Period Control

The system MUST provide a compact [MES][AÑO] toggle defaulting to current month/year; MES shows month + year selects, AÑO year only; year clamped 2000-2100, month 1-12; app select styling.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Default MES | screen renders | MES active | current month/year selected |
| AÑO mode | MES active | switch to AÑO | month hidden; year range 2000-2100 |

### R5: Report Fetch

The system MUST call `aleBetApi.facturacion.ventas({ clienteId, year, month? })` — monthly when `month` present, annual when absent — only after client selection, re-firing on client/period change.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Monthly | MES + client | report loads | called with clienteId, year, month |
| Annual | AÑO + client | report loads | called without month |

### R6: Summary Metrics

The system MUST render compact metrics PEDIDOS DESPACHADOS / PRODUCTOS / UNIDADES with thousands separator ("1.426"); no monetary metrics.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Values | 8 pedidos, 3 productos, 1426 unidades | loads | "8", "3", "1.426"; no currency |

### R7: Monthly Report

The system MUST render client + period header and table PRODUCTO | SKU | CAJAS | SUELTOS | UNIDADES with backend values verbatim; never recompute cajas/sueltos client-side.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Verbatim rows | cajas 2, sueltos 5, unidades 25 | report loads | table shows 2, 5, 25 exactly |

### R8: Annual Report

The system MUST render RESUMEN POR MES ("ENERO — 8 pedidos · 920 unidades"; only months returned, ascending) then TOTAL ANUAL POR PRODUCTO with monthly table columns.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Months only | meses = months 1, 7 | report loads | Ene and Jul rows; annual totals below |

### R9: Mobile Rendering

The system MUST render products as compact cards ("7 cajas · 4 sueltos / 144 unidades") on small screens, no forced horizontal scroll; monthly and annual views adapt.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Cards | viewport 375px | report loads | products as cards; no horizontal scroll |

### R10: States

The system MUST show a skeleton while loading; "No hay pedidos despachados para este período." for zero sales (not an error); "No pudimos cargar el reporte. Intentá nuevamente." on failure; raw backend errors NEVER shown.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| No sales | all zeros | loads | neutral message; no error styling |
| Error | request rejects | fails | friendly message; no raw error text |

### R11: API Client Types

The system MUST add `ProductoAgregado`, `ResumenMes`, `ReporteVentasMensual`, `ReporteVentasAnual`, union `ReporteVentas` discriminated by `modo`, mirroring the server. No `any`/`as unknown`/`@ts-ignore`.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Discriminated | annual payload | typed as ReporteVentas | `modo === 'anual'` exposes `meses` |

### R12: Test Suite

The system MUST ship vitest + @testing-library/react + jsdom tests: no-client initial; search/select; MES/AÑO modes; month and year changes; monthly and annual requests; totals/products/months render; no-sales; error — full-shape `vi.mock('../../lib/api')` incl. `facturacion.ventas`, re-`mockResolvedValue` per test, fixtures in `ale-bet-mock-factories.ts`.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Green | full mock shape | `npm --workspace @platform/client run test` | all pass; no `|| true` masking |

## Non-Goals

Prices, invoicing, IVA, charts, exports, rankings, backend changes, STOCK-02, stock/reservas/FEFO, commits/pushes.
