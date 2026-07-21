# Tasks: Shared Design System

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,800+ |
| 1000-line budget risk | High |
| Chained PRs recommended | Yes |
| Delivery strategy | auto-forecast |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
1000-line budget risk: High

### Batch 1 (Completed) — Foundation + Components + Preview

- ✅ Design tokens in `index.css` with full palette
- ✅ Fonts (Inter + Montserrat) in `index.html`
- ✅ `lib/theme.ts` with `.light` class toggle
- ✅ `lib/utils.ts` with `cn()` utility
- ✅ 6 UI primitives (Button, Input, Badge, Card, Skeleton, Select)
- ✅ Design Preview page at `/design-preview`

## Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Foundation (tokens, fonts, theme toggle) | PR 1 | `npm run test --filter=@platform/client -- src/lib/theme*` | Toggle light/dark, verify `.light` class on `<html>` | `git checkout -- apps/platform/client/src/index.css apps/platform/client/index.html apps/platform/client/src/lib/` |
| 2 | UI Primitives (6 components) | Same PR | `npm run test --filter=@platform/client -- src/components/ui/` | Render each variant in browser | `git checkout -- apps/platform/client/src/components/ui/` |
| 3 | Logística (Ale-Bet) migration | PR 1 | `npm run test --filter=@platform/client -- src/modules/ale-bet/` | Navigate all Logística pages, check Stitch design applied | `git checkout -- apps/platform/client/src/modules/ale-bet/` |
| 4 | Portal (app-selector) migration | PR 2 | `npm run test --filter=@platform/client -- src/components/ src/modules/platform/` | App selector shows Stitch design, all routes work | `git checkout -- apps/platform/client/src/App.tsx apps/platform/client/src/components/` |
| 5 | Admin migration + Testing | PR 3 | `npm run test --filter=@platform/client` | Admin renders in AppLayout, full suite passes | `git checkout -- apps/platform/client/src/modules/admin/` |

## Phase 1: Foundation — Tokens, Fonts & Theme

- [x] 1.1 Rewrite `src/index.css` with full `@theme`: surfaces, primary, secondary, semantic (success/warning/error/info), fonts, radius, shadows, `.light` class for light palette, `@utility` animations
- [x] 1.2 Add Inter + Montserrat font preconnect/links in `index.html`
- [x] 1.3 Create `src/lib/theme.ts`: toggle `.light` class on `<html>`, localStorage persistence
- [x] 1.4 Rewrite `modules/deposito/lib/theme.ts` to use `.light` class (remove `data-theme`)

## Phase 2: Shared Component Primitives

- [x] 2.1 Create `src/components/ui/Button.tsx` (variants: primary/secondary/ghost/outline, sizes: sm/md/lg, loading spinner)
- [x] 2.2 Create `src/components/ui/Input.tsx` (label, error, icon slot, value/onChange)
- [x] 2.3 Create `src/components/ui/Badge.tsx` (variants: default/success/warning/error/info)
- [x] 2.4 Create `src/components/ui/Card.tsx` (header/body/footer slots, padding: none/sm/md/lg)
- [x] 2.5 Create `src/components/ui/Skeleton.tsx` (variants: text/circle/card, configurable w/h)
- [x] 2.6 Create `src/components/ui/Select.tsx` (native select, label, error, placeholder)
- [x] 2.7 Create `src/lib/utils.ts` with `cn()` utility using clsx + tailwind-merge
- [x] 2.8 Create `src/modules/design-preview/DesignPreviewPage.tsx` — full token and component showcase
- [x] 2.9 Add `/design-preview` public route in router

## Phase 3: Module Migration — Logística (Ale-Bet)

- [x] 3.1 Rewrite `modules/ale-bet/components/Sidebar.tsx`: replace all `var(--color-*)` + hex with Tailwind classes, Stitch glassmorphic nav
- [x] 3.2 Modify `modules/ale-bet/App.tsx`: wrap in AppLayout, remove outer flex + Sidebar
- [x] 3.3 Migrate all 6 pages (DashboardPage, ClientesPage, PedidosPage, HistorialPage, ProductosPage, StockPage): replace `var(--color-*)` with Tailwind classes
- [x] 3.4 Remove `modules/ale-bet/styles.css` if present (no-op if absent)
- [x] 3.5 Update page layouts for Stitch design: glassmorphic cards, status badges, compact tables

## Phase 4: Module Migration — Portal (App Selector)

- [ ] 4.1 Apply Stitch design to app selector page (glassmorphic app cards, sage accents)
- [ ] 4.2 Update `src/App.tsx` layout to use Stitch style (dark surfaces, Space Grotesk headings)
- [ ] 4.3 Apply shared tokens to global shell components (Topbar, loading states)
- [ ] 4.4 Verify all module routes still work through app selector

## Phase 5: Module Migration — Admin

- [ ] 5.1 Modify `modules/admin/App.tsx`: wrap content in shared AppLayout, add Topbar with "Volver a apps"
- [ ] 5.2 Apply Stitch design tokens to admin pages

## Phase 6: Testing

- [ ] 6.1 Write unit tests for Button (variants, sizes, loading state)
- [ ] 6.2 Write unit tests for Input (label, error, onChange)
- [ ] 6.3 Write unit tests for Badge (variant rendering)
- [ ] 6.4 Write unit tests for Skeleton (text/circle/card variants)
- [ ] 6.5 Write unit tests for Card (slots, padding options)
- [ ] 6.6 Write unit tests for Select (options, label, error)
- [ ] 6.7 Run full suite: `npm run test --filter=@platform/server && npm run test --filter=@platform/client`
