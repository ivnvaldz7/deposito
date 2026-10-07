# Design: PDF export for "Ventas por cliente" report (alebet-fact-02-pdf)

## Technical Approach

Server-side PDF via existing `pdfkit ^0.16.0`, following the remito precedent: pure renderer `ventas-pdf.ts` (structural `VentasPdfDocument` interface, no pdfkit import, `RecordingDocument`-testable) + thin route. The route lives inside `facturacion.ts` (same router as the JSON report) and reuses the exported `agregarPorProducto` aggregation — the ONLY change to the shipped JSON handler is adding the `export` keyword (additive-only constraint: its body stays byte-identical, the 25 existing tests keep passing). Param validation and the `pedidos` query are duplicated in the PDF handler with identical messages/args (accepted tradeoff, see AD-3). Client: `apiClient.getBlob` + hidden-anchor download, button in VentasPage filters row. Path correction vs proposal: the ale-bet module lives at `server/src/routes/ale-bet/` (not `modules/`).

## Architecture Decisions

| # | Decision | Options | Choice / Rationale |
|---|---|---|---|
| AD-1 | Route location | Inside `facturacion.ts` vs new file | **Inside `facturacion.ts`** — shares router mount, report types, and `agregarPorProducto` directly; pdfkit code stays separated in `ventas-pdf.ts`. No index.ts wiring change. |
| AD-2 | Aggregation sharing | `export agregarPorProducto` vs extract shared module | **Additive `export` only.** Function body untouched → zero behavior risk; extract would rewrite tested code. |
| AD-3 | Validation + query reuse | Duplicate vs extract helpers | **Duplicate in the PDF handler** (identical messages, identical `findMany` args). Honoring "additive-only": the JSON handler is never edited. ~30 duplicated lines accepted; extraction to a shared `ventas-report.ts` is the flagged follow-up. |
| AD-4 | "Página X de Y" | `bufferPages: true` + `switchToPage` footer pass vs manual total tracking | **`bufferPages: true`.** Canonical PDFKit mechanism: render single-pass, then `doc.bufferedPageRange()` → `switchToPage(i)` → draw footer on each page, then `doc.end()`. Robust, ~4 lines; memory cost trivial at this scale. |
| AD-5 | Filename encoding | ASCII slug only vs RFC 5987 `filename*` | **ASCII slugified filename, plain `filename=`.** Slug is ASCII by construction, so `filename*`/UTF-8 percent-encoding is unnecessary (no precedent in repo). |
| AD-6 | Accent green | `#3D6852` / grey `#F3F4F6` vs alternatives | **Accent `#3D6852` only; soft tints grey `#F3F4F6`.** Verified: light-theme `--color-primary` token (index.css L126). User decision (interactive gate): table header / resumen strip backgrounds use soft GREY `#F3F4F6`, NOT the legacy `#E7EFEA` pale-green tint (forbidden in previous change). Rejected: `#a3d1b6` (dark-theme pale sage = "legacy pale green" the spec forbids) and `#00AE42` (metricas.ts full-background green, also prohibited). Grayscale-safe: dark sage → dark gray, `#F3F4F6` → near-white. |
| AD-7 | Async errors | try/catch vs rely on global handler | **try/catch in the handler** (`express-async-errors` absent; Express 4 does not forward rejections; `wrapAsyncErrors` exists only in tests). Catch → `if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor' })`. |
| AD-8 | Client filename | Client mini-slugify vs generic name | **Client-side mini-slugify** mirroring the server algorithm (3 lines, in VentasPage) so `a.download` matches the server's Content-Disposition (R5 end-to-end). Both sides tested. |

## Data Flow

```
VentasPage (Exportar PDF click)
  └─ aleBetApi.facturacion.ventasPdf({clienteId, year, month?})
       └─ apiClient.getBlob('/ale-bet/facturacion/ventas/pdf?…')
            └─ GET /api/ale-bet/facturacion/ventas/pdf   [requireApp('ale-bet', ['admin','facturacion'])]
                 ├─ validate params (same 400s as JSON route)
                 ├─ prisma.pedido.findMany (DESPACHADO, despachadoAt range)   ← duplicated query
                 ├─ pedidos.length === 0 → 400 { error: 'No hay ventas para el período seleccionado' }
                 ├─ prisma.cliente.findUnique({id, select:{nombre,cuit}}) → null → 400 { error: 'Cliente no encontrado' }
                 ├─ agregarPorProducto(items) (+ meses breakdown when anual)
                 ├─ build VentasPdfInput (generado = Intl.DateTimeFormat('es-AR', explicit options))
                 ├─ new PDFDocument({size:'A4', margin:0, bufferPages:true})
                 ├─ headers: Content-Type: application/pdf; Content-Disposition: attachment; filename="ventas-{slug}.pdf"
                 ├─ doc.pipe(res) → renderVentasPdf(doc, input) → footer pass → doc.end()
```

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/platform/server/src/routes/ale-bet/facturacion.ts` | Modify | `export` on `agregarPorProducto` (only body change: none); add `GET /ventas/pdf` handler |
| `apps/platform/server/src/routes/ale-bet/ventas-pdf.ts` | Create | Pure renderer (structural interface, no pdfkit import) |
| `apps/platform/server/src/routes/ale-bet/slugify.ts` | Create | `slugify(value)` filename sanitizer |
| `apps/platform/server/src/routes/ale-bet/__tests__/facturacion-pdf.test.ts` | Create | Endpoint tests (supertest, `vi.mock('@platform/db')`, role tokens, `wrapAsyncErrors`) |
| `apps/platform/server/src/routes/ale-bet/__tests__/ventas-pdf.test.ts` | Create | Renderer tests with `RecordingDocument` |
| `apps/platform/server/src/routes/ale-bet/__tests__/slugify.test.ts` | Create | Filename unit tests |
| `apps/platform/server/src/scripts/generate-alebet-ventas-pdf-demo.ts` | Create | Demo generation (mirrors `generate-alebet-remito-demo.ts`) |
| `apps/platform/client/src/modules/ale-bet/lib/api.ts` | Modify | `facturacion.ventasPdf(params)` → `getBlob` |
| `apps/platform/client/src/modules/ale-bet/pages/VentasPage.tsx` | Modify | Export button (FileDown), state machine, hidden-anchor download, mini-slugify |
| `apps/platform/client/src/modules/ale-bet/pages/__tests__/VentasPage.test.tsx` | Modify | Add `ventasPdf` + `@/lib/toast` mocks; button state/download/error tests |

`api-client.ts` NOT modified (deviation from proposal's affected-areas table: `getBlob` already returns `Blob`; download name is set via `a.download`).

## Interfaces / Contracts

### `ventas-pdf.ts`

```ts
export type VentasPdfTextOptions = {
  width?: number
  align?: 'left' | 'center' | 'right'
  ellipsis?: boolean
  characterSpacing?: number      // PDFKit text() supports it; section-title tracking
}

export interface VentasPdfDocument {
  fontSize(size: number): this
  font(name: string): this
  fillColor(color: string): this
  lineWidth(width: number): this
  text(value: string, x?: number, y?: number, options?: VentasPdfTextOptions): this
  rect(x: number, y: number, width: number, height: number): this
  fill(color?: string): this            // soft backgrounds (resumen strip, table header)
  moveTo(x: number, y: number): this
  lineTo(x: number, y: number): this
  stroke(): this
  addPage(): this
  bufferedPageRange(): { start: number; count: number }
  switchToPage(index: number): this
}

export type VentasPdfInput = {
  modo: 'mensual' | 'anual'
  year: number
  month: number | null
  clienteNombre: string
  cuit?: string
  generado: string                      // pre-formatted es-AR label (route-side Intl)
  resumen: { pedidosDespachados: number; productosDistintos: number; unidadesTotales: number }
  productos: Array<{ nombre: string; sku: string; unidadesPorCaja: number; cajas: number; sueltos: number; unidades: number }>
  meses?: Array<{ month: number; pedidosDespachados: number; productosDistintos: number; unidadesTotales: number }>
}

export function renderVentasPdf(document: VentasPdfDocument, input: VentasPdfInput): void
```

- `MESES = ['ENERO',…,'DICIEMBRE']` lives in the renderer (single source of truth for month labels: PERÍODO label `'AGOSTO 2026'` / `'AÑO 2026'`, EVOLUCIÓN row labels).
- Numbers formatted in-renderer via module-level `const fmt = new Intl.NumberFormat('es-AR')` (mirrors client `fmtUnidades`; Node ships full ICU).

### `slugify.ts`

```ts
export function slugify(value: string): string {
  return value
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // accents/ñ → base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')                        // spaces/./&/<>:"/\|?* → '-'
    .replace(/^-+|-+$/g, '')                            // trim dashes
}
```
`'Ñandú' → 'nandu'`, `'Veterinaria Oeste S.A.' → 'veterinaria-oeste-s-a'` (R5). Route builds `ventas-{slugify(cliente.nombre)}-{year}[-{MM padStart(2,'0')}].pdf`.

### Route (added to `facturacion.ts`)

`router.get('/ventas/pdf', requireApp('ale-bet', ALLOWED_ROLES), async (req, res) => { … })` — validation block copies the JSON route's exact messages (`clienteId requerido`, `year requerido`, `año válido (2000-2100)`, `month … 1 y 12`); then query, no-sales 400, cliente 400, aggregation, PDF stream, all inside one try/catch.

## Layout & Pagination

Constants: `PAGE_WIDTH 595.28`, `PAGE_HEIGHT 841.89`, `MARGIN 50` (~17.6mm, within 16–20mm), `CONTENT_WIDTH 495.28`, `ROW_HEIGHT 20` (single-line rows, `ellipsis: true` on nombre), `TABLE_HEADER_HEIGHT 22`, `CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN - 6` (786), footer zone inside the bottom margin band.

Palette: near-black `#1A1A1A`, greys `#6B7280` (labels) / `#9CA3AF` (rules), accent `#3D6852`, soft tints grey `#F3F4F6`. Typography (Helvetica family): title 22pt Bold; cliente nombre 15pt Bold; section subtitles 10pt Bold uppercase `#3D6852` with `characterSpacing: 1` (tracking approx; if PDFKit types reject it, fall back to plain uppercase — low risk); body 9pt; table 8.5pt; metadata/labels 7–7.5pt grey.

Page-1 flow (single draw function, y-tracked):
1. **Header (A)**: brand `ALE-BET` (11pt Bold) / `LOGÍSTICA` (7.5pt grey) at left; `GENERADO` + `PERÍODO` label/value pairs right-aligned; title `REPORTE DE VENTAS POR CLIENTE` (22pt, centered); thin green rule (lineWidth 1.2, `#3D6852`).
2. **CLIENTE (B)**: section label `CLIENTE`; nombre 15pt; `CUIT {cuit}` 9pt grey only if present.
3. **RESUMEN (C)**: soft `#F3F4F6` rect, 3 columns — `PEDIDOS DESPACHADOS` / `PRODUCTOS` / `UNIDADES` (7pt grey labels, 18pt Bold values, `fmt.format`), thin vertical separators.
4. **Mensual (D)**: `DETALLE DE PRODUCTOS` section + table `PRODUCTO | SKU | U/CAJA | CAJAS | SUELTOS | UNIDADES` (numbers right-aligned).
   **Anual (E+F)**: `EVOLUCIÓN MENSUAL` table `MES | PEDIDOS | PRODUCTOS | UNIDADES` (only `meses`, ascending — server order, never re-sorted) then `TOTAL ANUAL POR PRODUCTO` (same 6 columns as D).

Pagination algorithm:
```
drawPageChrome()  // brand + title + rule (+ section title + table header for body pages)
y = header bottom
for each row:
  if y + ROW_HEIGHT > CONTENT_BOTTOM:        // row-split guard: check BEFORE drawing
    addPage(); redraw chrome + current section title + table header; y = header bottom
  draw single-line row; y += ROW_HEIGHT
// section transitions: if remaining < title+header+2 rows → page break first
// footer pass (after render, before doc.end()):
range = doc.bufferedPageRange()
for i in range: switchToPage(i); rule at PAGE_HEIGHT-MARGIN+8;
  left 'Ale-Bet · Logística' (8pt grey); right `Página ${i+1} de ${range.count}` (8pt grey)
```
Rows never split: fixed 20pt single-line rows + guard before draw. Continuation pages repeat the full header (brand/title/rule) + section title + table header.

## Testing Strategy

| Layer | File | Covers (spec scenarios) |
|---|---|---|
| Server endpoint | `__tests__/facturacion-pdf.test.ts` (own hoisted `mockDb` incl. `cliente.findUnique`; supertest + role tokens + `wrapAsyncErrors`) | R1: mensual 200 + `application/pdf` + `attachment` disposition; anual 200; vendedor/armador/encargado_deposito 403 with no bytes; no-sales 400 `{error}`; month=13 / missing year → 400. R5: filename `ventas-veterinaria-oeste-s-a-2026-08.pdf` in header. Cliente unknown → 400 |
| Renderer | `__tests__/ventas-pdf.test.ts` — `RecordingDocument` extends remito pattern, records text + x/y coords + `addPage` count | R2: title/CLIENTE/RESUMEN `1.426`/verbatim rows; CUIT absent → nombre only. R3: EVOLUCIÓN Ene+Jul ascending; `meses=[]` → no EVOLUCIÓN section. R4: scanned text lacks `$`, `precio`, `IVA`, ids, technical tokens. R5: `1.426`, `5`, no decimals. R6: 50+ products → `addPage` > 0 per overflow, repeated table headers, all text x ≥ MARGIN; few products → single page |
| Unit | `__tests__/slugify.test.ts` | R5: `Ñandú → nandu`, `Veterinaria Oeste S.A. → veterinaria-oeste-s-a`, dashes collapsed/trimmed, empty-safe |
| Client | `VentasPage.test.tsx` (extend: `ventasPdf: vi.fn()` in api mock, `vi.mock('@/lib/toast')`, stub `URL.createObjectURL` via `Object.defineProperty` — PedidoDetailPage precedent) | R7: disabled (no cliente / loading / empty report); click → `Generando PDF…` + second click ignored; success → `createObjectURL` + `a.download` = `ventas-cliente-a-2026-07.pdf` + toast.success; rejection → toast.error `No pudimos generar el PDF.` |
| Visual (R8) | Demo script, human review | ≥2 PDFs: mensual + anual — margins, hierarchy, tables, footer, grayscale-safe |

## Demo Generation (`src/scripts/generate-alebet-ventas-pdf-demo.ts`)

Mirror `generate-alebet-remito-demo.ts`: two `PDFDocument` instances piped to `output/pdf/` (repo root, via `resolve(process.cwd(), '../../../output/pdf/…')`); run `npx tsx src/scripts/generate-alebet-ventas-pdf-demo.ts` from `apps/platform/server`. Fixed `generado: '07 de agosto de 2026'` for determinism. Fixtures (hardcoded, exercising R5/R6):
- **Mensual** `alebet-ventas-pdf-demo-mensual.pdf`: cliente `Veterinaria Ñandú S.A.` + CUIT; 4 productos — long name (ellipsis check), one with `sueltos: 0` (20×24), one `cajas: 0`, varied `unidadesPorCaja` (6/10/12/24), total 2.024 unidades; 8 pedidos.
- **Anual** `alebet-ventas-pdf-demo-anual.pdf`: cliente `Veterinaria Oeste S.A.`; 5 productos; meses Ene/Feb/May/Jul/Sep/Dic with distinct per-month values; annual aggregates consistent with meses.

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. The new Express GET route's safety surface is RBAC (`requireApp`) + strict param validation + coherent 400s, already specified as RED tests in R1/R5 and the endpoint test file. (The demo script is a manually run tsx fixture generator, same class as the existing remito demo.)

## Migration / Rollout

No migration, no feature flag, no DB change. Rollback boundary: revert the 10 files in the File Changes table (delete 6 new files; strip the button/state from `VentasPage.tsx`, `ventasPdf` from `api.ts`, `export` keyword from `facturacion.ts`; restore test mocks). The JSON `/ventas` handler is never edited, so it is outside the rollback blast radius.

## Open Questions

- [ ] PDFKit `text()` `characterSpacing` support under `@types/pdfkit ^0.13` — fallback: plain uppercase section titles (cosmetic only).
- [ ] Exact success toast copy: default `'PDF generado correctamente.'` unless product wants different wording.
