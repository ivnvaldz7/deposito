# Tasks: Ale-Bet Ventas PDF Export (alebet-fact-02-pdf)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1.150–1.300 total: T1 ~50 · T2 ~230 · T3 ~145 · T4 ~140 · T5 ~375 · T6 ~100 · T7 ~200 · T8 ~30 |
| 400-line budget risk | High (exceeds the approved 800-line budget too) |
| Chained PRs recommended | No for this execution (single batch, no PRs, size:exception approved); ~1.200 lines would otherwise chain server-core → client |
| Suggested split | Not applicable — one apply batch |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Tasks | Focused test command | Runtime harness | Rollback boundary |
|------|-------|----------------------|-----------------|-------------------|
| 1 | T1–T4 (slugify + renderer) | `npx vitest run src/routes/ale-bet/__tests__/slugify.test.ts src/routes/ale-bet/__tests__/ventas-pdf.test.ts` (from apps/platform/server) | N/A — RecordingDocument harness; real-PDF visual deferred to T6 | delete slugify.ts, ventas-pdf.ts + both test files |
| 2 | T5 (endpoint) | `npx vitest run src/routes/ale-bet/__tests__/facturacion-pdf.test.ts` | N/A — supertest + mockDb | revert facturacion.ts (export + handler); delete test file |
| 3 | T6–T7 (demo + client) | `npx vitest run src/modules/ale-bet/pages/__tests__/VentasPage.test.tsx` (from apps/platform/client) | `npx tsx src/scripts/generate-alebet-ventas-pdf-demo.ts` → output/pdf/ | delete demo + PDFs; revert api.ts, VentasPage.tsx + test |

Dependency order: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 (renderer + slugify before endpoint; client after endpoint).

> Strict TDD (RED → GREEN → REFACTOR): write the failing test first, then implementation. FORBIDDEN in renderer/UI: precio, subtotal, importe, moneda, IVA, bultos, peso, días de venta, rankings, proyecciones, porcentajes. No second PDF lib, no remito changes, no ventas JSON shape changes.

## Phase 1 — Foundation

- [x] 1.1 (T1) Create `server/src/routes/ale-bet/slugify.ts`: `slugify(value)` = NFD strip diacritics → lowercase → `[^a-z0-9]+`→`-` → trim dashes.
- [x] 1.2 (T1) RED→GREEN `__tests__/slugify.test.ts`: `Ñandú→nandu`, `Veterinaria Oeste S.A.→veterinaria-oeste-s-a`, dash collapse/trim, empty-safe (R5).

## Phase 2 — Core renderer

- [x] 2.1 (T2) Create `server/src/routes/ale-bet/ventas-pdf.ts`: `VentasPdfDocument`/`VentasPdfInput`/`renderVentasPdf`, constants (595.28×841.89, MARGIN 50, ROW_HEIGHT 20, CONTENT_BOTTOM 786), chrome (ALE-BET/LOGÍSTICA, GENERADO/PERÍODO, title 22pt, green rule), CLIENTE (+CUIT if present), RESUMEN strip grey `#F3F4F6` with `Intl.NumberFormat('es-AR')`, DETALLE table (mensual). No pdfkit import.
- [x] 2.2 (T2) RED→GREEN `__tests__/ventas-pdf.test.ts` (RecordingDocument records text/x/y/addPage): R2 title, CLIENTE, RESUMEN "1.426", verbatim cajas/sueltos/unidades; CUIT absent → nombre only; R5 integers "5".
- [x] 2.3 (T3) Anual path in renderer: PERÍODO "AÑO 2026", EVOLUCIÓN MENSUAL table (MES|PEDIDOS|PRODUCTOS|UNIDADES, `MESES` labels, server order) + TOTAL ANUAL POR PRODUCTO.
- [x] 2.4 (T3) RED→GREEN: Ene+Jul ascending rows; `meses=[]` → no EVOLUCIÓN section; R4 scanned text lacks `$`, precio, IVA, productoId/clienteId, technical tokens.
- [x] 2.5 (T4) Pagination: `bufferPages:true`; row-split guard `y+ROW_HEIGHT > 786` → `addPage()` + repeat chrome/section title/table header; footer pass via `bufferedPageRange`/`switchToPage`: "Ale-Bet · Logística" left, "Página X de Y" right, on every page.
- [x] 2.6 (T4) RED→GREEN: 50+ products → `addPage > 0`, repeated table headers, all text x ≥ MARGIN; few products → single page (R6).

## Phase 3 — Integration

- [x] 3.1 (T5) `facturacion.ts`: add `export` to `agregarPorProducto` (body byte-identical); add `GET /ventas/pdf` (requireApp admin/facturacion): copy JSON route's 400 messages, DESPACHADO findMany (duplicated args), no-sales → 400 `{error:'No hay ventas…'}`, `cliente.findUnique` null → 400, anual meses aggregation, `Intl.DateTimeFormat('es-AR')` generado, `PDFDocument({size:'A4', margin:0, bufferPages:true})` piped to res, headers `application/pdf` + `attachment; filename="ventas-{slug}-{AAAA}[-{MM}].pdf"`, try/catch → 500 (AD-7).
- [x] 3.2 (T5) RED→GREEN `__tests__/facturacion-pdf.test.ts` (hoisted mockDb incl. `cliente.findUnique`, role tokens, wrapAsyncErrors): R1 mensual 200 + content-type + disposition; anual 200; vendedor/armador/encargado_deposito 403, no bytes; no-sales 400; month=13 / missing year 400; unknown cliente 400; R5 filename header.
- [x] 3.3 (T6) Create `server/src/scripts/generate-alebet-ventas-pdf-demo.ts` (remito-demo pattern): mensual fixture (Veterinaria Ñandú S.A., CUIT, 4 productos: long name, `sueltos:0` (20×24), `cajas:0`, unidadesPorCaja 6/10/12/24, 2.024 uds, 8 pedidos) + anual (Oeste S.A., 5 productos, meses Ene/Feb/May/Jul/Sep/Dic, consistent aggregates); fixed `generado: '07 de agosto de 2026'`.
- [x] 3.4 (T6) Run `npx tsx src/scripts/generate-alebet-ventas-pdf-demo.ts` from apps/platform/server; confirm `output/pdf/alebet-ventas-pdf-demo-{mensual,anual}.pdf`.
- [x] 3.5 (T7) `client/src/modules/ale-bet/lib/api.ts`: `facturacion.ventasPdf({clienteId, year, month?})` → `apiClient.getBlob('/ale-bet/facturacion/ventas/pdf?…')`.
- [x] 3.6 (T7) `VentasPage.tsx`: "Exportar PDF" button (FileDown icon): disabled (no cliente/loading/empty/generating); "Generando PDF…" + ignore repeat clicks; hidden-anchor download with mini-slugify `a.download` (AD-8); toast success "PDF generado correctamente." / error "No pudimos generar el PDF." (raw errors never shown).
- [x] 3.7 (T7) RED→GREEN extend `VentasPage.test.tsx` (mock `ventasPdf` + `@/lib/toast`, stub `URL.createObjectURL`): R7 disabled states, generating label + click ignored, success (`a.download` = `ventas-cliente-a-2026-07.pdf` + toast), rejection → error toast.

## Phase 4 — Verification

- [x] 4.1 (T8) Full pass: server + client suites green (no `|| true` masking), typecheck strict (no any/as unknown/@ts-ignore), ventas JSON tests untouched; visual review of both PDFs (A4, margins, hierarchy, footer, grayscale, accent `#3D6852`, grey `#F3F4F6`).

## Risks

- Estimate (~1.200) exceeds the 800-line budget: covered by approved size:exception; reviewer focus on T5/T7.
- PDFKit `characterSpacing` under `@types/pdfkit ^0.13`: fallback plain uppercase (cosmetic, design open question).
- `export` keyword on `agregarPorProducto`: additive; existing facturacion.test.ts must stay green.
