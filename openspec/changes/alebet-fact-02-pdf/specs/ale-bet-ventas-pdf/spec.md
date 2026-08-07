# Ale-Bet Ventas PDF — Full Specification

## Purpose

Server-side, archive-ready A4 PDF export of the sales-per-client report for `admin`/`facturacion`, generated exclusively from the ventas contract, plus its "Exportar PDF" button on VentasPage.

## Requirements

### R1: Export Endpoint

The system MUST expose `GET /api/ale-bet/facturacion/ventas/pdf?clienteId=&year=&month=` guarded by `requireApp('ale-bet', ['admin','facturacion'])`; `month` present → mensual, absent → anual. Success MUST respond `application/pdf` with `Content-Disposition: attachment`; zero sales MUST respond coherent 400 `{error}`; missing/invalid params MUST respond 400 like the JSON endpoint.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Mensual export | admin, month present | GET pdf | 200 PDF + attachment disposition |
| Anual export | facturacion, no month | GET pdf | 200 annual PDF |
| Forbidden role | vendedor / armador / encargado_deposito | GET pdf | 403, no PDF bytes |
| No sales | period without dispatched orders | GET pdf | 400 `{error}`; no empty PDF |
| Invalid params | month=13 or year missing | GET pdf | 400 `{error}` |

### R2: Mensual Content

Mensual PDF MUST render: text-only header (no logo asset); title "REPORTE DE VENTAS POR CLIENTE"; GENERADO metadata (Spanish-locale date); PERÍODO "AGOSTO 2026"; CLIENTE section (nombre; CUIT only if present); RESUMEN strip PEDIDOS DESPACHADOS / PRODUCTOS / UNIDADES; DETALLE DE PRODUCTOS table PRODUCTO|SKU|U/CAJA|CAJAS|SUELTOS|UNIDADES with contract values verbatim.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Full report | mensual: 3 productos, 1426 unidades | render | title, CLIENTE, RESUMEN "1.426", rows show verbatim cajas/sueltos/unidades |
| CUIT absent | cliente.cuit null | render | CLIENTE shows nombre only |

### R3: Anual Content

Anual PDF MUST render mensual elements (PERÍODO "AÑO 2026") plus EVOLUCIÓN MENSUAL table MES|PEDIDOS|PRODUCTOS|UNIDADES (only returned months, ascending) and TOTAL ANUAL POR PRODUCTO table (annual aggregates, same columns).

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Months summary | meses = months 1, 7 | render | EVOLUCIÓN rows Ene + Jul ascending; annual table below |
| No months | meses = [] | render | no EVOLUCIÓN section; annual table only |

### R4: Forbidden Content

PDF MUST NOT contain precio, subtotal, importe, moneda, IVA, bultos, peso, días de venta, rankings, proyecciones, porcentajes, QR, firmas, campos fiscales, URLs internas, localhost, tokens, technical IDs, or endpoints; no currency symbols.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| No fiscal data | prices exist in DB | extracted text scanned | forbidden tokens absent |
| No technical ids | payload has productoId/clienteId | extracted text scanned | ids absent; only nombre/sku/quantities shown |

### R5: Filename and Formats

Filenames MUST be slugified `ventas-{cliente}-{AAAA}-{MM}.pdf` (mensual) / `ventas-{cliente}-{AAAA}.pdf` (anual), normalizing spaces, accents, invalid chars. Numbers MUST use Spanish thousands separator ("1.426"); cajas/sueltos integers; generation date Spanish locale, never raw ISO.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Mensual filename | "Veterinaria Oeste S.A.", 2026-08 | download | ventas-veterinaria-oeste-s-a-2026-08.pdf |
| Anual filename | "Ñandú", 2026 | download | ventas-nandu-2026.pdf |
| Number format | unidades 1426, cajas 5 | render | "1.426" and "5"; no decimals |

### R6: Page Format and Pagination

PDF MUST be A4 portrait, white background, 16–20mm margins on every page; hierarchy: title 20–24pt, cliente 14–16pt, section subtitles 9–11pt uppercase, body 8.5–10pt, table 8–9pt; green institutional accent only (no full dark-green background, no orange, no legacy pale green); grayscale-safe. Footer "Ale-Bet · Logística" (left) + "Página X de Y" (right) MUST be on every page; table headers MUST repeat after breaks; product rows MUST never split.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Multi-page | 50+ products | render | >1 page; footer + repeated header per page; no split rows |
| Single page | few products | render | 1 page with margins on all sides |

### R7: Export Button

VentasPage MUST show "Exportar PDF" (FileDown icon): disabled with no cliente / loading / no sales; enabled with a loaded report; "Generando PDF…" while generating; success brief feedback + download; error "No pudimos generar el PDF." (raw errors never shown).

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Disabled states | no cliente / loading / no sales | inspect button | disabled |
| Generating | report loaded | click Exportar PDF | label "Generando PDF…"; repeated clicks ignored |
| Success | blob resolves | download done | PDF downloaded; brief feedback |
| Error | blob rejects | generation fails | "No pudimos generar el PDF." |

### R8: Test Suite

Server tests MUST cover content-type, disposition, RBAC 200/403, content incl./excl., annual months, renderer robustness at many products, filename slugify; frontend tests button states/download/error; ≥ 2 PDFs visually validated (margins, hierarchy, tables, footer, grayscale).

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Green | full test list | server + client suites | all pass, no `|| true` masking |
| Visual | mensual + anual PDFs | human review | A4, margins, hierarchy, footer, grayscale-safe |

## Non-Goals

Excel; charts; JSON endpoint changes; new metrics; stock/reservas/pedidos; client-side PDF lib; Remito changes; fiscal content (prices, IVA, signatures, QR); commits/pushes.
