# Feature: ALEBET-REMITO-PDF — Operational remito PDF redesign

> Before working on this feature, read this document, `.agents/current.md`, and the applicable role guide.

## Inputs verified

- User-provided UAT reference describes the physical Ale-Bet remito structure and confirms the headings `Ale-Bet`, `Laboratorios de Especialidades Veterinarias Ale Bet S.R.L.`, document letter `R`, and `REMITO`.
- The repository has no source image/PDF of the physical remito. A repository-wide media search found only unrelated Stitch screenshots and virtual-environment assets; the implementation must therefore follow the written UAT reference, not invent unverified visual/legal data.
- Runtime trace confirmed the client download path is `alebetApi.remitos.pdf(pedidoId)` in `apps/platform/client/src/modules/ale-bet/lib/api.ts`, which calls `GET /api/ale-bet/pedidos/:id/remito.pdf`. The actual Express handler is `apps/platform/server/src/routes/ale-bet/remitos.ts`.
- UAT root cause: the browser had reached stale backend process PID 2292, which had loaded the pre-change module containing the legacy inline PDF drawing and snapshot `JSON.stringify` calls. The current source handler was already wired to the presentation renderer; the running process had not reloaded that source.
- Remediation: reload/restart the backend process so the existing handler source is active. It preserves lookup, authorization, headers, and system number while delegating PDF drawing to `renderRemitoPdf` in `apps/platform/server/src/routes/ale-bet/remito-pdf.ts`; snapshot persistence remains unchanged.
- No repository configuration or documentation confirms Ale-Bet address, locality, phone, email, VAT condition, tax registration, or fiscal point-of-sale data. Only the company/brand names supplied in the UAT request are confirmed for the visual reference.

## Scope

- Redesign the PDF produced by the existing `GET /api/ale-bet/pedidos/:id/remito.pdf` endpoint only. Preserve the endpoint, authorization, workflow, remito issuance, invalidation, and current system numbering.
- Render an A4 portrait, white, print-safe operational remito with dark neutral rules and legible typography:
  - three-part header (institutional identity, `R`, remito number/date);
  - readable client block;
  - `CANTIDAD | DETALLE` goods table;
  - physical completion area for `BULTOS` and `PESO`;
  - transport name/address;
  - `RECIBÍ CONFORME` signature area.
- Render relevant fields from persisted remito snapshots, never their JSON serialization or technical metadata.
- Keep missing optional snapshot values visually empty (or omit their value), never render `null`, `undefined`, IDs, master-record status, timestamps, stock, reservation, SKU, or serialized objects.
- Render the current system remito number and date. This work does not decide fiscal/form numbering.
- Support both snapshot sources:
  - habitual transporter: the already-persisted `transporteNombre` / `transporteDireccion` and `transporteSnapshot`;
  - occasional transporter: the same persisted fields/snapshot shape, without needing a master `Transportista`.
- Generate a deterministic DEMO PDF under `output/pdf/alebet-remito-demo.pdf` for visual inspection, using non-production demo values and the real renderer.
- Add focused tests for PDF content/layout commands and snapshot stability, then run the affected server test suite, typecheck, and build.

## No objectives

- Do not alter Pedido workflow, roles, permissions, dispatch/remito authorization, idempotency, remito issuance/invalidation, or request/response contracts.
- Do not create endpoints, modify client UI, modify Prisma schema, create/edit migrations, or change `packages/db/src/generated`.
- Do not implement fiscal/legal requirements, official form numbering, a point of sale, CAI/CAE, tax registration, barcode, QR code, or invoice validity.
- Do not introduce Ale-Bet institutional/tax/contact values absent from reliable repository configuration/documentation. Do not treat the DEMO seed data as institutional data.
- Do not reconstruct `cajas + unidades`: existing `itemsSnapshot` rows persist only `productoId`, `nombre`, and total `cantidad`, so the historical snapshot does not safely contain `unidadesPorCaja`.
- Do not use the snapshot’s technical `id`, `activo`, `estado`, timestamps, or product ID as display content.
- Do not commit or push.

## Real data model and migration assessment

`packages/db/prisma/schema.prisma` currently persists all fields necessary for the requested operational document:

| Need | Existing persisted source |
|---|---|
| System remito number and date | `Remito.numero`, `Remito.fecha` |
| Client identity/contact/tax/sale data | immutable `Remito.clienteSnapshot` taken from `Pedido.cliente`; `Cliente` contains `nombre`, `direccion`, `localidad`, `provincia`, `cuit`, `condicionIva`, `condicionVenta` |
| Goods | immutable `Remito.itemsSnapshot`, currently `{ productoId, nombre, cantidad }[]` |
| Habitual and occasional transportation | immutable `Remito.transporteSnapshot` plus `Remito.transporteNombre` and `Remito.transporteDireccion` |
| Historical stability | snapshots are stored on `Remito`; PDF retrieval queries only the remito and order owner for authorization, not the live customer/product/transporter master data |

No Prisma change or migration is required for this redesign. The optional boxes-plus-units representation is deliberately excluded because `unidadesPorCaja` is not stored in the existing item snapshot; adding it would change historic snapshot semantics and requires a separate approved decision.

## Institutional data policy

Use only these UAT-confirmed visual identity strings:

- `Ale-Bet`
- `Laboratorios de Especialidades Veterinarias Ale Bet S.R.L.`

The address, locality, phone, email, VAT condition, CUIT, IIBB, and any fiscal status for Ale-Bet are **not configured/confirmed in the repository**. They must not be guessed or hard-coded. The header should reserve no fake values; it should display only confirmed identity text until a reliable institutional configuration is supplied. Client fiscal fields are rendered from the client snapshot when present.

## Constraints

- TypeScript strict: no `any`, `as unknown`, or `@ts-ignore`.
- Retain snapshots internally and use them as the sole display source. Master data must not be re-read to enrich a historical PDF.
- Use A4 portrait and safe print margins; no yellow-paper simulation.
- Preserve dirty-workspace changes unrelated to this feature.
- Follow strict TDD: RED test first, minimum GREEN renderer, then focused refactor.
- Use the PDF verification workflow: render the final DEMO PDF to PNG and inspect the rendered page before delivery.

## Risk level

`standard`

- Justification: this is a server document-rendering change over already-persisted immutable data. It does not change inventory, permissions, transactions, Prisma, or workflow, but printing customer information requires a focused independent review of data exposure and historical stability.

## Acceptance criteria

- [x] The existing PDF endpoint returns an A4 portrait operational remito that has a white background, safe margins, dark neutral rules, legible type, and no JSON blocks.
- [x] The header contains Ale-Bet identity, document letter `R`, `REMITO`, current system number, and date; it does not imply an unvalidated fiscal form/numbering scheme.
- [x] The PDF shows only confirmed institutional values. It does not invent Ale-Bet address, locality, phone, email, VAT condition, CUIT, IIBB, or tax registration.
- [x] The client block renders `Señor(es)`, address, locality/province when present, VAT condition, CUIT, and conditions of sale from `clienteSnapshot`; absent optional values are blank/omitted and never appear as `null`.
- [x] The goods table contains exactly the snapshot total quantity and product name in `CANTIDAD | DETALLE`; it contains no product ID, SKU, stock, reserved/available quantity, or technical item fields.
- [x] The footer contains blank physical lines for `BULTOS` and `PESO`, plus persisted transporter name/address and a usable `RECIBÍ CONFORME` signature/aclaration area.
- [x] Both habitual and occasional transporter snapshots render their name/address without their technical data.
- [x] No literal `{`, serialized JSON, CUID/UUID/internal IDs, technical status, or timestamps from snapshots are present in rendered document text.
- [x] A remito PDF remains tied to its stored client/transporter/item snapshots after master data changes.
- [x] An actual DEMO PDF is generated, rendered to PNG, and visually inspected for clipping, overlap, table alignment, footer/signature spacing, and A4 portrait layout.
- [x] Targeted server tests, server typecheck, server build, and `git diff --check` pass.

## TDD implementation plan

1. **RED — define presentation input and renderer tests**
   - Add a unit test that supplies realistic frozen client, transport, and item snapshots (including technical fields) and asserts the renderer writes only display fields.
   - Assert header/number/date, client name/address/CUIT/VAT/sale condition, goods, habitual transport, occasional transport, `BULTOS`, `PESO`, and `RECIBÍ CONFORME`.
   - Assert no text operation receives `{`, `productoId`, CUID/UUID, technical status, `createdAt`, `updatedAt`, stock/reservation labels, or `null`.
   - Assert optional client fields do not render a literal null-like value and that no boxes-plus-units claim is made from total quantity alone.
2. **RED — endpoint and historical-snapshot tests**
   - Cover PDF download authorization unchanged and feed it a persisted historical remito whose live masters are deliberately different.
   - Prove PDF presentation uses the stored snapshots/current remito fields, not live master data; retain the current remito read shape and access policy.
3. **GREEN — extract a small renderer and wire the existing endpoint**
   - Add a typed, pure/presentation-focused `renderRemitoPdf` module that accepts only the persisted remito display inputs and draws ruled A4 sections with PDFKit.
   - Replace all `JSON.stringify` calls in `remitos.ts` with the renderer; preserve headers, content disposition, lookup, and authorization.
   - Use `transporteNombre`/`transporteDireccion` as safe persisted fallback only when their snapshot fields are absent; never query the transport master while downloading.
4. **GREEN — create the manual demo**
   - Add a small non-production renderer script or a test-safe fixture entrypoint using the same renderer, write `output/pdf/alebet-remito-demo.pdf`, and keep the artifact untracked.
   - Render it with Poppler to `tmp/pdfs/alebet-remito-demo-1.png` and visually inspect A4 layout. Do not add the generated PDF/PNG to the commit.
5. **REFACTOR and verification**
   - Keep typed snapshot parsing narrow and defensive: accept legacy snapshot extra fields but whitelist only display keys.
   - Run targeted renderer/route tests, the existing Ale-Bet server suite, typecheck, build, and diff check. A reviewer validates no workflow/authorization/snapshot-storage behavior changed.

## Exact file plan

| Action | File |
|---|---|
| Modify | `apps/platform/server/src/routes/ale-bet/remitos.ts` — delegate PDF drawing to the renderer; preserve current route behavior and snapshots. |
| Add | `apps/platform/server/src/routes/ale-bet/remito-pdf.ts` — typed PDFKit renderer and snapshot display-field whitelist. |
| Add | `apps/platform/server/src/routes/ale-bet/__tests__/remito-pdf.test.ts` — renderer-level assertions for display content, absent technical/JSON text, transport variants, blanks, and historical snapshot rendering. |
| Modify | `apps/platform/server/src/__tests__/ale-bet.test.ts` — endpoint regression for unchanged PDF access and persisted snapshot input/route wiring, only if existing shared route mock is the least-duplicated test seam. |
| Add | `apps/platform/server/src/scripts/generate-alebet-remito-demo.ts` — development/UAT-only invocation of the real renderer with explicitly fake demo snapshot data. |
| Add, untracked output | `output/pdf/alebet-remito-demo.pdf` — manual UAT artifact only; do not stage. |
| Add, temporary | `tmp/pdfs/alebet-remito-demo-1.png` — visual QA intermediate only; do not stage. |
| Add | `docs/features/ALEBET-REMITO-PDF.md` — this plan and later implementation/test evidence. |

No client, Prisma schema, migration, seed, order workflow, permission, or shared-design-system file is in scope.

## Evidence of implementation

| Change | File/path | Evidence |
|---|---|---|
| Typed snapshot renderer | `apps/platform/server/src/routes/ale-bet/remito-pdf.ts` | Whitelists only client, goods, and transport display fields from immutable remito snapshots; it never serializes or reads master records. |
| Existing PDF endpoint wiring | `apps/platform/server/src/routes/ale-bet/remitos.ts` | Keeps the endpoint, remito lookup, authorization, headers, and current system number while delegating A4 rendering to the typed renderer. |
| Renderer and route regression coverage | `apps/platform/server/src/routes/ale-bet/__tests__/remito-pdf.test.ts`, `apps/platform/server/src/__tests__/ale-bet.test.ts` | Covers safe display fields, absent optional values, habitual and occasional transport, no technical JSON/IDs, and retrieval from persisted historical snapshots without master-data reads. |
| UAT demo generator | `apps/platform/server/src/scripts/generate-alebet-remito-demo.ts` | Generates the real renderer output at `output/pdf/alebet-remito-demo.pdf` using explicit non-production values. |

## Evidence of tests

| Criterion | Test/command | Result |
|---|---|---|
| RED renderer test | `npm --workspace @platform/server run test -- src/routes/ale-bet/__tests__/remito-pdf.test.ts` before the renderer existed | PASS — failed as expected with `Cannot find module '../remito-pdf'`. |
| GREEN/refactor renderer tests | `npm --workspace @platform/server run test -- src/routes/ale-bet/__tests__/remito-pdf.test.ts` | PASS — 3/3. |
| Existing endpoint safety net and route regression | `npm --workspace @platform/server run test -- src/__tests__/ale-bet.test.ts` | PASS — baseline 22/22; final 23/23. |
| Footer divider regression (RED → GREEN) | The renderer coordinate test failed before the fix because the quantity-detail divider ended at `799.89`, then passed after it was constrained to the footer boundary at `677.89` | PASS — the vertical table rule now ends before footer labels. |
| Focused remito suite | `npm --workspace @platform/server run test -- src/__tests__/ale-bet.test.ts src/routes/ale-bet/__tests__/remito-pdf.test.ts` | PASS — 27/27 (24 endpoint + 3 renderer). |
| Server static checks | `npm --workspace @platform/server run typecheck` and `npm --workspace @platform/server run build` | PASS. |
| Manual visual QA | `npm --workspace @platform/server exec tsx src/scripts/generate-alebet-remito-demo.ts`, then PyMuPDF page rendering | PASS — A4 portrait single page inspected at `tmp/pdfs/alebet-remito-demo-1.png`; no clipping, overlap, or broken table/footer alignment observed. |
| Workspace diff hygiene | `git diff --check` | Existing unrelated trailing whitespace remains in `apps/platform/client/src/index.css` and `packages/db/src/generated/client/index.d.ts`; scoped Ale-Bet remito diff is clean. |
| Independent tester rerun | `npm --workspace @platform/server run test -- src/__tests__/ale-bet.test.ts src/routes/ale-bet/__tests__/dashboard.test.ts src/routes/ale-bet/__tests__/historial.test.ts src/routes/ale-bet/__tests__/order-workflow.test.ts src/routes/ale-bet/__tests__/remito-pdf.test.ts src/routes/ale-bet/__tests__/reservas-service.test.ts src/routes/ale-bet/__tests__/stock.test.ts src/routes/ale-bet/__tests__/unidades-por-caja.test.ts src/seed/__tests__/seed-ale-bet-data.test.ts` | Historical PASS — 9 files, 82 tests; the focused remito/route count was 25 before the footer-divider regression was added. Current focused evidence is 27/27. |
| Independent static checks | `npm --workspace @platform/server run typecheck`; `npm --workspace @platform/server run build` | PASS. |
| Independent PDF inspection | DEMO regenerated with the real renderer; PyMuPDF confirmed one A4 portrait page (595.28 x 841.89 pt), extracted text contains all required display fields and no JSON/technical fields, and `tmp/pdfs/alebet-remito-demo-1.png` was visually inspected | PASS — white print-safe layout, aligned table/footer/signature, no clipping or overlap. `pdftoppm` is unavailable in this environment, so PyMuPDF was used as the rendering fallback. |
| Scoped diff hygiene rerun | `git diff --check -- apps/platform/server/src/routes/ale-bet/remitos.ts apps/platform/server/src/__tests__/ale-bet.test.ts docs/features/ALEBET-REMITO-PDF.md` plus trailing-whitespace scan of added remito files | PASS. |

## Evidence of verification

| Verification | Evidence | Result |
|---|---|---|
| Snapshot schema/migration assessment | Prisma schema inspection | PASS — current fields cover the requested baseline; no migration required. |
| Physical reference availability | Repository media/document search | PASS — no physical original found in repository; written UAT reference is the only verified source. |
| Independent Verify rerun | `npm --workspace @platform/server run test -- src/__tests__/ale-bet.test.ts src/routes/ale-bet/__tests__/remito-pdf.test.ts` | Historical PASS — 2 files, 25 tests before the footer-divider regression. Current focused evidence is 27/27. |
| Current DEMO document inspection | Regenerated `output/pdf/alebet-remito-demo.pdf`; PyMuPDF confirmed one A4 portrait page (595.28 x 841.89 pt) and rendered `tmp/pdfs/alebet-remito-demo-1.png` for visual inspection | PASS — white single-page document; the CANTIDAD/DETALLE divider ends at the merchandise-footer boundary and does not cross `DIRECCIÓN / TRANSPORTE:`. |
| Institutional/legal policy | Renderer source and generated DEMO inspection | PASS — header uses only `Ale-Bet` and `Laboratorios de Especialidades Veterinarias Ale Bet S.R.L.`; no unconfirmed address, locality, phone, email, Ale-Bet VAT/CUIT/IIBB, fiscal registration, point of sale, or fiscal-form claim appears. |
| Output-artifact hygiene | `git status --short` and staged-path inspection | PASS — `output/` and `tmp/` remain untracked; no generated PDF/PNG is staged. |
| Diff hygiene boundary | `git diff --check` and scoped remito check | PASS for the remito scope. Global check remains non-zero only due pre-existing unrelated whitespace in `apps/platform/client/src/index.css` and `packages/db/src/generated/client/index.d.ts`; it is not a remito blocker. |
| Independent final runtime trace | Client `alebetApi.remitos.pdf(pedidoId)` → `GET /api/ale-bet/pedidos/:id/remito.pdf` → `remitos.ts` → `renderRemitoPdf` | PASS — source inspection confirms this is the browser route; it no longer contains any snapshot `JSON.stringify` calls. |
| Independent real HTTP download | Authenticated, read-only GET against the running local service on an existing DEMO pedido with a vigente remito | PASS — HTTP 200, `application/pdf`, and `inline; filename="R-20260805-940C59DE.pdf"`; saved artifact text contains client, CUIT, transport, goods, remito number/date, blank BULTOS/PESO and receipt area, and contains none of `"id":`, `createdAt`, `updatedAt`, `productoId`, `{`, or `}`. |
| Independent final focused checks | `npm --workspace @platform/server run test -- src/__tests__/ale-bet.test.ts src/routes/ale-bet/__tests__/remito-pdf.test.ts`; `npm --workspace @platform/server run typecheck` | PASS — 27/27 tests and server typecheck exit 0. |
| Independent final visual inspection | Runtime PDF rendering plus `output/pdf/alebet-remito-http-demo.pdf` / `tmp/pdfs/alebet-remito-http-demo-1.png` | PASS — one A4 portrait, white page; header/table/footer are aligned, the quantity divider ends at the footer boundary, and the footer/signature division does not overlap transport fields. |

## State and history

- Current state: `verificado`
- History:
  - 2026-08-05 — Planner — created after inspecting the remito route, snapshot schema, tests, project documents, and repository media/configuration.
  - 2026-08-05 — Builder — implemented the typed A4 renderer, endpoint wiring, focused tests, and visually inspected deterministic DEMO PDF.
  - 2026-08-05 — Tester — independently reran focused and Ale-Bet suites (82 tests), server typecheck/build, scoped diff hygiene, regenerated and visually inspected the A4 DEMO PDF. No functional blocker found; ready for independent review.
  - 2026-08-05 — Verify — independently reran the focused remito/route tests (25/25), regenerated and rendered the current DEMO PDF, inspected the A4 output and extracted text, reconfirmed the confirmed-company-string policy and artifact hygiene. No feature blocker found.
  - 2026-08-05 — Builder corrective pass — added a coordinate-level RED/GREEN regression for the CANTIDAD/DETALLE divider, constrained that rule to the merchandise body, reran the focused route/renderer suite (27/27) and server typecheck, then regenerated and visually inspected the DEMO PDF. No workflow, authorization, persistence, or snapshot content changed.
  - 2026-08-05 — Verify final runtime pass — traced the browser download path to the exact Express GET handler, downloaded a real authenticated PDF from the reloaded running service, inspected extracted content and A4/footer layout, and reran the focused endpoint-plus-renderer suite (27/27) and server typecheck. The UAT PDF came from stale PID 2292 loaded before the source change; current `remitos.ts` already imports and calls the renderer used by the real endpoint. No remaining feature blocker.
  - 2026-08-05 — Verify visual adjustment pass — independently reran the 27 focused route/renderer tests and server typecheck, inspected the regenerated A4 DEMO and current HTTP PDF text, and confirmed the larger safe margin, centered textual masthead, uppercase bold client labels, clean optional values, and absence of a directly usable Ale-Bet logo asset. PASS; no JSON or technical identifiers are rendered.

Valid states: `planificado` → `en-construcción` → `en-prueba` → `en-revisión` → `en-verificación` → `verificado` → `archivado`. Only the required SDD archive can change `verificado` to `archivado`; from any active state: `bloqueado`.

## Blockers

- None for the requested operational PDF redesign.
- Institutional/legal details beyond the two UAT-confirmed company identity strings are intentionally unresolved and must remain absent until a reliable source is supplied.
