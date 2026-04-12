# Design System: The Kinetic Monolith

## 1. Overview & Creative North Star
**Creative North Star: "Industrial Precision"**
This design system moves beyond the generic "SaaS dashboard" aesthetic to create a digital cockpit for **Depósito**. It treats warehouse management not as a series of forms, but as a high-stakes engineering environment. The "Tactical Monolith" style combines the weight and authority of heavy machinery with the surgical precision of modern telemetry.

We break the "template" look by rejecting the standard grid in favor of **intentional density**. We use massive, editorial-scale typography for key warehouse metrics juxtaposed against micro-scale technical data. The interface should feel like it was carved from a single block of obsidian—heavy, permanent, and impeccably organized.

---

## 2. Colors: The Obsidian & Emerald Palette
The color strategy is rooted in "Deep Vision" dark mode. The primary hue, `#00AE42` (Electric Emerald), is used sparingly but with high impact to signify action and success within a monochromatic dark green environment.

### Surface Hierarchy & Nesting
To achieve the "Monolith" feel, we abandon traditional borders.
- **The "No-Line" Rule:** 1px solid borders are strictly prohibited for sectioning. Boundaries must be defined through background color shifts.
- **Tonal Layering:**
- **Base Layer:** `surface` (#101510) for the main application background.
- **Sidebar:** `surface_container_lowest` (#0a0f0b) to create a deep, recessed "anchor" for navigation.
- **Content Cards:** `surface_container_low` (#181d18) sitting on the base layer.
- **Active Elements:** `surface_container_high` (#262b27) for hovered states or elevated data points.

### The Glass & Gradient Rule
For floating elements like modals or tooltips, use **Glassmorphism**:
- Background: `surface_container_highest` (#313631) at 80% opacity.
- Effect: `backdrop-blur: 12px`.
- CTA Polish: Use a subtle linear gradient on primary buttons: `linear-gradient(180deg, #54e16d 0%, #00AE42 100%)`. This adds "soul" to the action without breaking the flat industrial aesthetic.

---

## 3. Typography: Technical Authority
We use a dual-font system: **Montserrat** for headings and UI elements, **Inter** for data and body text.

- **Montserrat** (Google Fonts): Geometric sans-serif with strong personality. Used for navigation, buttons, section titles, display metrics, and all UI chrome. Designed by Julieta Ulanovsky, inspired by Buenos Aires' Montserrat neighborhood — native to the product's origin.
- **Inter** (Google Fonts): Precision workhorse. Used for data tables, stock quantities, lot numbers, timestamps, form inputs, and body paragraphs. Optimized for small sizes and numeric legibility.

### Scale
- **Display Scale:** Montserrat `display-lg` (3.5rem, weight 700) for high-level warehouse capacity or throughput. It should feel massive and undeniable.
- **Headlines:** Montserrat `headline-sm` (weight 600) for section titles.
- **Body & Descriptions:** Inter `body-md` (weight 400) for readable content.
- **The Technical Label:** Inter `label-sm` (0.6875rem, weight 500) with 5% letter-spacing for metadata, SKU numbers, and timestamps.
- **Buttons & Nav:** Montserrat `label-lg` (weight 600) for interactive elements.
- **Data Tables:** Inter `body-sm` (weight 400) for table cells, Inter `label-md` (weight 600) for table headers.

### Rule
Never use more than three font sizes on a single screen to maintain the "Monolith" stability. Montserrat owns the structure, Inter owns the data.

---

## 4. Elevation & Depth
Depth is not achieved through light, but through **material density**.

- **The Layering Principle:** Stack `surface_container` tiers to create hierarchy. A `surface_container_highest` element on top of a `surface_container_low` element creates a natural "lift" that feels structural rather than optical.
- **Ambient Shadows:** Shadows are reserved for floating overlays only.
- Color: `#000000` at 15% opacity.
- Spread: Large blur (24px+) with 0px spread to mimic soft, ambient occlusion in a dark space.
- **The Ghost Border:** If high-density data requires visual separation, use the "Ghost Border"—the `outline_variant` (#3d4a3c) at **15% opacity**. It should be barely felt, only perceived.

---

## 5. Components: Functional Units

### Buttons (Tactical Actions)
- **Primary:** `primary_container` (#00ae42) background with `on_primary_container` (#00380f) text. 4px radius.
- **Secondary:** `secondary_container` (#195424) background. Low contrast, high utility.
- **States:** On hover, use a subtle 10% white overlay rather than a color change to maintain the emerald hue's integrity.

### Input Fields
- **Style:** No borders. Use `surface_container_highest` (#313631) as the background fill.
- **Focus:** A 2px solid `primary` (#54e16d) glow on the *bottom edge only* to maintain the industrial "underscored" look.

### Cards & Data Lists
- **Rule:** Forbid divider lines. Use `spacing-8` (1.75rem) of vertical white space to separate items.
- **Density:** Use the spacing scale `1.5` (0.3rem) for tight data clusters within warehouse rows to maximize information density without clutter.

### The "Telemetry" Chip
- Used for status (e.g., "In Transit", "Stock Low").
- **Success:** `#00AE42` text on a 10% opacity green background.
- **Warning:** `#FF9800` text on a 10% opacity orange background.
- **Design:** Keep these small (`label-sm`) and rectangular (4px radius).

---

## 6. Do's and Don'ts

### Do
- **Do** use `spacing-24` (5.5rem) for massive margins between major functional sections to create an editorial feel.
- **Do** align all text to a strict vertical axis to emphasize the "precision" of the warehouse system.
- **Do** use `surface_bright` (#353b35) for subtle hover highlights on list items.

### Don't
- **Don't** use standard #000000 black. Always use the `surface` (#101510) obsidian tint.
- **Don't** use rounded corners larger than `DEFAULT` (4px/0.25rem). Roundness is for consumer apps; precision is for Depósito.
- **Don't** use icons with varying stroke weights. Use a consistent 1.5px stroke to match the technical Inter typeface.
- **Don't** use bright white text. Use `on_surface_variant` (#bccbb8) for secondary text to reduce eye strain in high-use dark mode environments.
