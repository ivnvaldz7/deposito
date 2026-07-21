# Proposal: Shared Design System

## Intent

Unify colors, fonts, animations, and component primitives across all Platform modules (depósito, ale-bet, admin) so the app feels like one immersive experience. Currently 3 visual systems coexist — Platform has 5 anemic tokens, Depósito legacy has the full palette, and Ale-Bet uses inline `var(--color-*)` with its own naming.

## Scope

### In Scope
- Port complete token set from Depósito's `globals.css` into Platform's `@theme` (surface, primary, semantic, fonts, radius, shadows)
- Load Inter + Montserrat fonts in Platform's `index.html`
- Create shared `components/ui/` primitives: Button, Input, Badge, Card, Skeleton, Select
- CSS animation utilities for micro-interactions (fade, slide, hover scale, pulse variants)
- Migrate Ale-Bet module: replace inline `var(--color-*)` with Tailwind classes, unify Sidebar into shared AppLayout
- Migrate Admin module: wrap content in shared AppLayout
- Define light + dark palettes in `@theme` and wire existing `lib/theme.ts` toggle

### Out of Scope
- Animation libraries (framer-motion deferred)
- Storybook (deferred)
- Legacy apps (deposito/client, ale-bet/client, admin/client — being replaced)
- Per-module theming customization
- Route-based page transitions (deferred)
- Ripple effect on buttons

## Capabilities

Pure visual/component refactor — no new capabilities or spec-level behavior changes.

### New Capabilities
None

### Modified Capabilities
None

## Approach

1. **Tokens**: Use `@theme` with `@variant dark` for light/dark palettes. Port Depósito's `globals.css` tokens verbatim.
2. **Primitives**: Create shadcn/ui-style components in `apps/platform/client/src/components/ui/` using the new tokens.
3. **Animations**: Define Tailwind `@utility` for micro-interactions (fade-in, slide-up, scale-hover). Apply transitions at the component level.
4. **Migration**: Remove Ale-Bet's `styles.css` and rewrite components with Tailwind classes. Reuse existing `AppLayout` for Admin.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/platform/client/src/index.css` | Modified | Full token rewrite with light/dark palettes |
| `apps/platform/client/index.html` | Modified | Add Inter + Montserrat `<link>` |
| `apps/platform/client/src/components/ui/` | New | Shared component primitives |
| `apps/platform/client/src/modules/ale-bet/components/Sidebar.tsx` | Modified | Replace inline var() with Tailwind |
| `apps/platform/client/src/modules/ale-bet/` | Modified | Migrate all components to shared tokens |
| `apps/platform/client/src/modules/admin/App.tsx` | Modified | Wrap in shared AppLayout |
| `apps/platform/client/src/modules/deposito/` | Minor | Cleanup dead CSS classes |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Ale-Bet migration misses inline var() references | Med | Grep for `var(--color-` after migration, visual diff per component |
| Light theme undefined tokens cause blank screens | Low | Test both themes after every token change; light palette has fallbacks |

## Rollback Plan

1. Revert `index.css` and `index.html` to HEAD via `git checkout`
2. Revert any component file changes with `git checkout -- apps/platform/client/src/`

## Dependencies

None — monorepo internal refactor only.

## Success Criteria

- [ ] All modules use the same `@theme` color palette
- [ ] Inter + Montserrat render correctly in Platform
- [ ] `font-heading` and `font-body` classes work in all modules
- [ ] Ale-Bet has zero `var(--color-*)` inline references
- [ ] Admin renders inside shared AppLayout
- [ ] Light/dark toggle works with no visual glitches
- [ ] Tests pass: `npm run test --filter=@platform/server && npm run test --filter=@platform/client`
