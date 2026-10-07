# Proposal: PDF export for "Ventas por cliente" report (alebet-fact-02-pdf)

## Intent

Admin/facturacion users of `/ale-bet/ventas` need an archive-ready A4 PDF of the ventas report (print/save/email/share), generated server-side exclusively from the already-loaded ventas contract. Today the report exists only as a screen.

## Scope

### In Scope
- Button "Exportar PDF" on VentasPage (FileDown icon): disabled without cliente/loading/sales; "Generando PDF…"; success feedback; error "No pudimos generar el PDF."
- Endpoint `GET /api/ale-bet/facturacion/ventas/pdf?clienteId=&year=&month=`: `requireApp('ale-bet', ['admin','facturacion'])`; `application/pdf`; `Content-Disposition: attachment`; no sales → coherent 400 `{error}`.
- Pure renderer `ventas-pdf.ts` (pdfkit; remito-pdf.ts pattern): A4 portrait, 16–20mm margins, repeated headers, rows never split, footer "Ale-Bet · Logística" + "Página X de Y" on all pages.
- Structure A–F: text-only header (no logo asset — verified), title "REPORTE DE VENTAS POR CLIENTE", GENERADO/PERÍODO metadata; CLIENTE (+CUIT only if present); RESUMEN strip; DETALLE table PRODUCTO|SKU|U/CAJA|CAJAS|SUELTOS|UNIDADES; annual adds EVOLUCIÓN MENSUAL + TOTAL ANUAL. Data only from the ventas contract — no precio/subtotal/IVA/bultos/peso/rankings/porcentajes. Safe fonts, green accent only, grayscale-safe.
- Filename slugify helper (new): `ventas-{cliente}-{AAAA}-{MM}.pdf` / `ventas-{cliente}-{AAAA}.pdf`; Spanish thousands (1.426); labels "AGOSTO 2026"/"AÑO 2026".
- Minimal `facturacion.ts` refactor: export `agregarPorProducto` (or minimal shared helper) so PDF reuses exact report logic; report if risky.
- Tests: server (content-type, disposition, RBAC 200/403, content incl./excl., annual months) + frontend (button states, download, error); visual validation of ≥2 PDFs.

### Out of Scope
Excel; charts; JSON endpoint changes; stock/reservas/pedidos; new metrics; client-side PDF lib; Remito changes; fiscal content (prices, IVA, signatures, QR); commits/push.

## Capabilities

### New Capabilities
- `ale-bet-ventas-pdf`: server-side PDF export — endpoint, renderer, filename rules, A4 format/typography/pagination contract, button behavior.

### Modified Capabilities
- None.

## Approach

Reuse pdfkit + pure-renderer pattern (structural interface, RecordingDocument tests) + `getBlob`/hidden-anchor download. New route handles async errors explicitly (Express 4 — try/catch or `wrapAsyncErrors`). Additive export of `agregarPorProducto`; ventas tests stay green.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/platform/server/src/modules/ale-bet/facturacion.ts` | Modified | export aggregation; new PDF route |
| `apps/platform/server/src/modules/ale-bet/pdf/ventas-pdf.ts` | New | pure renderer |
| `apps/platform/server/src/modules/ale-bet/lib/slugify.ts` | New | filename sanitizer |
| `apps/platform/server/src/modules/ale-bet/__tests__/` | New | endpoint + renderer tests |
| `apps/platform/client/src/modules/ale-bet/pages/VentasPage.tsx` | Modified | export button + download |
| `apps/platform/client/src/lib/api-client.ts` | Modified | getBlob filename param |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Express 4 async rejection → 500 | Low | try/catch or wrapAsyncErrors |
| `agregarPorProducto` export touches shared code | Low | additive; ventas tests stay green |
| Filename encoding (accents/ñ/spaces) | Low | slugify normalization + tests |
| jsdom `timeStyle` crash precedent | Low | explicit `Intl.DateTimeFormat('es-AR')` options |
| Pagination at 50+ products | Med | row-split guard, repeated headers, visual validation |

## Rollback Plan

Remove button, route, renderer, slugify, tests; revert additive export. No migrations; ventas JSON endpoint untouched.

## Dependencies

- `pdfkit ^0.16.0` already in `apps/platform/server`.
- Shipped ventas endpoint (contract unchanged).

## Success Criteria

- [ ] Server tests: mensual + anual → `application/pdf` + `Content-Disposition`; admin/facturacion 200; other roles 403; content incl./excl. checks; annual monthly summary
- [ ] Frontend: disabled/enabled/loading/download/error pass
- [ ] ≥2 PDFs visually validated (margins, hierarchy, tables, footer, grayscale)
- [ ] typecheck + build green; ventas JSON untouched; no commit/push

## Assumptions to confirm (question round)

CUIT only if present (null → omit); text-only header (no logo asset — verified); no-sales → button disabled + 400.
