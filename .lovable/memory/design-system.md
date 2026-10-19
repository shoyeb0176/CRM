---
name: Design system (Inuberry design kit)
description: The brand/design kit every UI change must follow — colours, type, geometry, components, do/don't. Source image docs/design/inuberry-design-kit.webp
type: design
---
Source of truth: `docs/design/inuberry-design-kit.webp` (brand system / CRM operations, v1.0, 2026). Tokens live in `src/styles.css`; use the tokens, never raw hex.

- Colours: forest #0C231A (foreground, sidebar), orange #EE7104 (primary — accent only: one main action, active state, focus), background #F1F8F1, secondary #E4E9E5, muted fg #5A6761, accent #DFE7E0, sidebar accent #1E3329, destructive #D40C1A, white #FFFFFF. Semantic: success green, warning amber, error red, info dark green. Chart palette: orange, forest, sage green, mustard, dark forest.
- Type: display = condensed uppercase (Anton) for wordmark/big titles only (text-xl+); body = Inter ("structured, neutral, product-first"); mono (JetBrains Mono) for labels, codes, numbers, IDs (e.g. `MOD_08 · INV_8842.PDF`), small uppercase tracking-widest eyebrow labels. Small headings use `font-heading` (Inter semibold).
- Geometry: radius 0px, border 1px, shadow none. Base spacing unit 4px (4/8/12/16/24/32/48/64); 12-col grid.
- States: default (white, border) → hover (muted fill) → focus (orange outline) → selected (orange fill) → disabled (muted, low contrast).
- Buttons: primary dark forest fill ("Start free trial"), outline ("Request demo"), orange fill for the single key CTA ("Start free" / "New invoice"), plain "Log in", text button with "›". Inputs 34px, buttons 42px, 1px border.
- Cards: flat bordered boxes; KPI = mono label + large number + small delta; dark forest cards for dashboard/chart highlights; status pills are outlined boxes (paid/active/pending/error).
- Icons: one consistent line-icon set (lucide), labelled with mono module codes.
- Do: strong grid alignment, orange as accent, high contrast, restrained borders. Don't: gradients, rounded cards, random colours, mixed icon styles.
