# Design: Shared Design System

## Technical Approach

Port Depósito's full token set into Platform's `@theme`, create shared UI primitives in `src/components/ui/`, and migrate Ale-Bet + Admin modules to use them. Dark-mode-first base with TailwindCSS 4 `@variant` for light overrides. No new workspaces — use existing patterns.

## Architecture Decisions

### Decision: Where to put shared primitives

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `packages/ui` (external workspace) | + isolation, – build config, – tree-shaking overhead | ❌ |
| `src/modules/shared/` | + module isolation, – longer imports, – not discoverable | ❌ |
| `src/components/ui/` | + already exists at `src/components/` pattern (guards, notifications), + flat imports, + no new workspace | ✅ |

**Rationale**: The repo already has `src/components/` with cross-module components (guards, notifications). A `ui/` subdirectory follows the same pattern. Only 6 components — a new workspace is overkill.

### Decision: Token file structure

Single `index.css` — one `@theme` block, well-commented sections (surfaces, primary, semantic, fonts, radius, shadows), kept under 200 lines. The existing file is only 63 lines — replacing in-place avoids import churn.

### Decision: Light/dark strategy

| Aspect | Choice |
|--------|--------|
| Custom variant | `@custom-variant light (&:where(.light, .light *))` |
| Base (no class) | Dark mode — port Depósito's globals.css as-is |
| Light override | `@variant light { ... }` in `@theme` block |
| Theme toggle | Update `lib/theme.ts`: toggle `.light` class on `<html>` instead of `data-theme` |

**Rationale**: App is dark-mode-first (Depósito globals.css has `color-scheme: dark`, dark base values). Making dark the default avoids adding a class to every page. The `.light` class flips to light palette. `@variant light` inside `@theme` resolves colors at build time with zero runtime overhead.

### Decision: Animation approach

CSS-only `@utility` definitions in index.css for fade-in, slide-up, pulse. Transition defaults on interactive elements via Tailwind classes. No framer-motion (deferred per proposal).

## Data Flow

```
index.html (@font-face preconnect)
       │
       ▼
  index.css (@theme + @variant light + @utility)
       │
       ▼
  src/components/ui/ (Button, Input, Badge, Card, Skeleton, Select)
       │
       ▼
  Ale-Bet modules ──► Tailwind classes (no more var(--color-*))
  Admin module    ──► AppLayout wrapper + shared tokens
  Depósito module ──► Minor dead-CSS cleanup
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/platform/client/src/index.css` | Rewrite | Full `@theme`: surfaces, primary, semantic, fonts, radius, shadow. `@variant light` for light palette. `@utility` animations. Remove legacy `.input-field`/`.btn-primary` classes |
| `apps/platform/client/index.html` | Modify | Add `<link rel="preconnect">` to Google Fonts, load Inter 400..700 + Montserrat 500..800 |
| `apps/platform/client/src/lib/theme.ts` | Rewrite | Toggle `.light` class on `<html>` instead of `data-theme`. Keep localStorage persistence |
| `apps/platform/client/src/components/ui/Button.tsx` | Create | Primary, secondary, ghost, outline; sm/md/lg; loading spinner |
| `apps/platform/client/src/components/ui/Input.tsx` | Create | Label, error state, icon slot, placeholder |
| `apps/platform/client/src/components/ui/Badge.tsx` | Create | Variants: default, success, warning, error, info |
| `apps/platform/client/src/components/ui/Card.tsx` | Create | Header/body/footer composable slots |
| `apps/platform/client/src/components/ui/Skeleton.tsx` | Create | Variants: text, circle, card; configurable width/height |
| `apps/platform/client/src/components/ui/Select.tsx` | Create | Native `<select>` with label, error, placeholder |
| `apps/platform/client/src/modules/ale-bet/components/Sidebar.tsx` | Rewrite | Replace all `var(--color-*)` + hardcoded hex values with Tailwind classes |
| `apps/platform/client/src/modules/ale-bet/App.tsx` | Modify | Wrap in AppLayout, remove outer flex container |
| `apps/platform/client/src/modules/ale-bet/pages/*.tsx` | Modify | All 6 pages: replace `var(--color-*)` with Tailwind classes |
| `apps/platform/client/src/modules/admin/App.tsx` | Modify | Wrap content in shared `AppLayout` + Topbar with "Volver a apps" |
| `apps/platform/client/src/modules/deposito/lib/theme.ts` | Modify | Align toggle mechanism (`.light` class + `data-theme` backward compat) |

## Interfaces / Contracts

```typescript
// Component props
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  className?: string
}

interface InputProps {
  label?: string
  error?: string
  icon?: React.ReactNode
  placeholder?: string
  value: string
  onChange: (value: string) => void
  type?: string
  disabled?: boolean
}

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  children: React.ReactNode
  className?: string
}

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

interface SkeletonProps {
  variant?: 'text' | 'circle' | 'card'
  className?: string
  width?: string | number
  height?: string | number
}

interface SelectProps {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Button renders variants, sizes, loading | Vitest + @testing-library/react: render & behavior |
| Unit | Input shows label, error state, handles onChange | Vitest + @testing-library/react |
| Unit | Badge renders correct variant styles | Vitest + snapshot |
| Unit | Theme toggle adds/removes `.light` class | Test `lib/theme.ts` setTheme + applyTheme |
| Unit | Card/Skeleton/Select render without crash | Smoke render tests |
| Integration | Ale-Bet pages render in AppLayout | Existing page tests, check no test regressions |
| Integration | Admin module renders in AppLayout | Existing route guard tests pass |
| E2E | Light/dark toggle no visual glitches | Manual — both themes on all modules |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Pure CSS/component refactor.

## Migration / Rollout

No migration required. This is a visual refactor — no data, API, or route changes. Theme toggle is backward-compatible (`.light` class replaces `data-theme` silently). Rollback: `git checkout` affected files.

## Open Questions

- [ ] Should we keep `data-theme` backward compat for the Depósito module or migrate it to `.light` class immediately?
  → **Resolution**: Migrate immediately. Single toggle mechanism across all modules. Depósito's theme.ts will be rewritten in this change.
