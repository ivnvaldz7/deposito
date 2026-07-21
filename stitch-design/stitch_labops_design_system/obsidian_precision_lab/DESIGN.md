---
name: Obsidian Precision Lab
colors:
  surface: '#0b0f0d'
  surface-dim: '#0b0f0d'
  surface-bright: '#262e29'
  surface-container-lowest: '#000000'
  surface-container-low: '#0f1511'
  surface-container: '#151b17'
  surface-container-high: '#1a211d'
  surface-container-highest: '#1f2822'
  on-surface: '#dfe8df'
  on-surface-variant: '#a4ada6'
  inverse-surface: '#f7faf5'
  inverse-on-surface: '#525652'
  outline: '#6f7871'
  outline-variant: '#414a44'
  surface-tint: '#a3d1b6'
  primary: '#a3d1b6'
  on-primary: '#1d4834'
  primary-container: '#305b46'
  on-primary-container: '#bfeed2'
  inverse-primary: '#3d6852'
  secondary: '#b4ccbd'
  on-secondary: '#2f453a'
  secondary-container: '#2a4035'
  on-secondary-container: '#adc5b6'
  tertiary: '#d2fbff'
  on-tertiary: '#296469'
  tertiary-container: '#b5f0f5'
  on-tertiary-container: '#1f5c60'
  error: '#fa746f'
  on-error: '#490006'
  error-container: '#871f21'
  on-error-container: '#ff9993'
  primary-fixed: '#beedd2'
  primary-fixed-dim: '#b1dfc4'
  on-primary-fixed: '#1c4733'
  on-primary-fixed-variant: '#3a644e'
  secondary-fixed: '#cfe8d9'
  secondary-fixed-dim: '#c1dacb'
  on-secondary-fixed: '#2e4439'
  on-secondary-fixed-variant: '#4a6054'
  tertiary-fixed: '#b5f0f5'
  tertiary-fixed-dim: '#a7e1e7'
  on-tertiary-fixed: '#00494e'
  on-tertiary-fixed-variant: '#2b666a'
  primary-dim: '#96c3a9'
  secondary-dim: '#a6beb0'
  tertiary-dim: '#a7e1e7'
  error-dim: '#c54d4a'
  background: '#0b0f0d'
  on-background: '#dfe8df'
  surface-variant: '#1f2822'
typography:
  display:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  h1:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
  h1-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  h2:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  h3:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  mono:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.5'
    letterSpacing: -0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 0.25rem
  sm: 0.5rem
  md: 1rem
  lg: 1.5rem
  xl: 2.5rem
  gutter: 1rem
  margin-mobile: 1rem
  margin-desktop: 2rem
---

## Brand & Style
The brand personality is rooted in clinical precision and unwavering reliability. This design system serves a high-performance Veterinary Laboratory environment, where clarity is paramount and every pixel must feel intentional. 

The visual direction, "Precision Lab," utilizes a sophisticated **Modern-Glassmorphic** approach optimized for dark-mode environments. It leverages professional, muted forest and sage accents against deep obsidian surfaces to guide the user's eye toward critical diagnostic data and actions. The aesthetic is technical and immersive, evoking the feeling of a modern laboratory interface—clean, authoritative, and efficient.

## Colors
This design system utilizes a tiered Obsidian palette to create depth in a dark-mode-first environment, moving from high-vibrancy accents to more grounded, tonal professional shades.

- **Primary (Sage Forest):** A refined green (`#558069`) reserved for clinical success states, main CTA buttons, and active diagnostic indicators.
- **Surface (Obsidian):** Five levels of depth from deep background surfaces to slightly elevated UI containers.
- **Semantics:** Tonal variations for Secondary and Tertiary roles ensure a balanced, multi-category interface without visual noise.

## Typography
The typography system balances the technical, geometric character of **Space Grotesk** for headings with the high-utility legibility of **Inter** for data-heavy body content.

Headings should be used sparingly to define hierarchy, utilizing the distinct personality of Space Grotesk to mark section transitions. Labels utilize a slightly increased letter-spacing and uppercase styling to denote technical categories. For numerical data or specimen IDs, use the `mono` variant of Inter to ensure character distinction.

## Layout & Spacing
The design system employs a **12-column fluid grid** for desktop and a **4-column grid** for mobile. 

The rhythm is strictly based on a 4px baseline, ensuring all components align perfectly on a technical scale. Layouts should prioritize high data density without feeling cluttered. Content "containers" (Cards) should use `md` (1rem) padding as a standard, scaling to `lg` for hero sections.

## Elevation & Depth
Depth is created through **Tonal Layering** and **Glassmorphism**, rather than traditional heavy shadows.

- **Level 0 (Background):** Base dark surface.
- **Level 1 (Cards/Sidebar):** Elevated surfaces with a subtle 1px border.
- **Level 2 (Modals/Popovers):** Higher elevation with a subtle backdrop-blur (12px) and a `shadow-float` to ensure separation from the background.
- **Focus State:** Elements requiring immediate attention utilize a Primary-tinted outer glow.

## Shapes
In line with the updated "Precision Lab" aesthetic, shapes have transitioned to a **Rounded** (8px / 0.5rem) standard. This adds a layer of modern approachability and softness to the high-density technical interface, making long sessions in the lab software less visually taxing.

Buttons, input fields, and standard cards share this 0.5rem radius. Large layout containers or modals may use `rounded-lg` (16px) to soften high-density interfaces.

## Components

### Cards & Surfaces
Deep-surface cards use the defined container tiers. When a card is "Focused" or contains an "Active Test," it gains a **1px Primary (#558069) border**.

### Buttons & Inputs
- **Primary:** Solid Forest Green with high-contrast text. Apply `scale-hover` utility (1.02x) on interaction.
- **Inputs:** Elevated background, 0.5rem radius. On focus, the border transitions to the Primary shade with a subtle `fade-in` glow.

### Badges (Status)
High-contrast badges use a desaturated background of the semantic color with a high-vibrancy text/icon label.

### Ingresos Wizard (Multi-step)
Use a horizontal pipeline. Completed steps: Primary color circle with checkmark. Current step: Primary ring with pulsing center. Pending: Muted neutral outline.

### Audit Data Tables
Tables must be "Audit-grade": compact, utilizing alternating zebra-striping. Column headers use the `label-sm` typography. Hovering over a row triggers a subtle `slide-up` translate (-2px) to highlight the data under cursor.