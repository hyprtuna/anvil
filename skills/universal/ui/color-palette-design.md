---
name: color-palette-design
user-invocable: false
description: 'Use when constructing a role-based colour palette — meets WCAG AA, derives a dark-mode variant. Pairs with style-selection and design-system-generation.'
tools: [Read, Write, Edit, Grep, Glob]
x-anvil:
  kind: atomic
  group: development
  trigger: [color palette, colour palette, design palette, wcag colors, dark mode palette, color system, pick colors, choose colors, palette for]
  language: universal
  tags: [ui, design, color, palette, wcag, accessibility]
  aliases: [palette, color-system, colour-palette]
---

> **Invoke via `Skill({skill: "anvil:color-palette-design"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# color-palette-design

**Pair with:** `style-selection` (defines mood), `design-system-generation` (consumes the output as tokens), `ux-reasoning-rules` (contrast rules §18).

## When to use

- You have a named style (from `style-selection`) but no colour values yet.
- You have an existing palette that fails contrast or doesn't cover all semantic roles.
- You need a dark-mode variant of an existing light-mode palette.
- Refactoring magic hex values out of components into a token system.

## Role-based structure

Every system defines at least these roles. Never skip one — "we don't need a warning colour" becomes "why is there yellow everywhere?" the moment a warning state ships.

| Role | Purpose | WCAG AA requirement |
|---|---|---|
| `primary` | Brand anchor. Headlines, key icons, active states. | ≥ 4.5:1 on background (text use); ≥ 3:1 (UI component) |
| `secondary` | Subordinate brand surface: chips, inactive tabs, secondary nav. | ≥ 3:1 (UI element) |
| `cta` | Call-to-action buttons. One colour. Must stand out from `primary`. | ≥ 4.5:1 for label text on button |
| `background` | Page / canvas. | Measured against text — not rated alone. |
| `surface` | Cards / panels on top of background. | ≥ 1.5:1 vs background for visual separation |
| `text-primary` | Body copy and headings. | ≥ 4.5:1 vs background (AA normal text) |
| `text-secondary` | Captions, helper text, placeholders. | ≥ 4.5:1 vs background |
| `border` | Subtle separators; state-bearing borders (focus, error). | ≥ 3:1 vs adjacent colour for state-bearing use |
| `success` | Positive state: confirmation, completion. | ≥ 4.5:1 for any label text on tinted background |
| `warning` | Advisory state: caution, pending action. | ≥ 4.5:1 |
| `error` | Destructive or failed state. | ≥ 4.5:1 |
| `info` | Neutral notification or help. | ≥ 4.5:1 |

**Contrast reference (WCAG 2.1 AA):**
- Normal text (< 18pt or < 14pt bold): 4.5:1
- Large text (≥ 18pt or ≥ 14pt bold): 3.0:1
- UI components and graphical objects: 3.0:1

Tool recommendation: verify with `culori`, `chroma-js`, or the Chrome DevTools contrast checker. Eyeballing is not sufficient.

## Construction process

Work through these steps in order. Skipping steps introduces inconsistency.

### Step 1 — Anchor the primary

Take the brand colour or pick a hue that matches the style mood (see `style-selection` palette mood). Note:
- **HSL triplet** — you will mutate S and L, never the H (except small adjustments for harmony).
- **Hue family** — warm (red/orange/yellow), cool (blue/green), neutral (low-saturation).

### Step 2 — Pick the CTA

CTA can equal primary but often works better as a complementary or split-complementary accent. Rules:
- CTA must be visually distinct from primary at first glance.
- CTA must meet 4.5:1 vs both `background` AND `surface` (it appears on both).
- One CTA colour. Two CTA colours create confusion about hierarchy.

### Step 3 — Derive the neutral ramp

Generate a 10-stop neutral scale from near-white (50) to near-black (950). Steps:
1. Start with pure HSL(0, 0%, L%) grey at each stop.
2. Shift hue by 2–6° toward the primary's hue family (warm primaries → slightly warm neutrals).
3. Pure grey next to a coloured primary looks dusty or sterile — the hue shift makes neutrals feel cohesive.
4. Name the stops: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950.

### Step 4 — Pick semantic colours

- **Success:** Green family. Rotate the hue 5–10° toward the primary's hue to harmonise. Don't fully override with the primary hue.
- **Warning:** Amber/yellow. Keep it clearly distinct from primary if primary is orange.
- **Error:** Red. ≥ hue 0–10°. Do not use magenta or hot pink as "error" — they read as brand, not danger.
- **Info:** Blue if primary is not blue; otherwise use a cool neutral blue or teal to differentiate from primary.

### Step 5 — Verify contrast

For every text/icon that will sit on a coloured surface:
1. Calculate contrast ratio (foreground vs. background).
2. Check against the requirement table above.
3. If failing: increase the lightness gap, not just saturation. Saturation alone does not reliably increase contrast.

### Step 6 — Derive dark mode

See the "Dark-mode derivation" section below.

## Dark-mode derivation

Dark mode is **not** inverted light mode. Inversion produces wrong hue shifts and eye-straining contrast. Follow this process:

1. **Keep the hue** of primary / CTA. Drop saturation by 10–20%. Increase lightness of primary if it was dark (target: >50% relative luminance in dark mode so it stays readable against a dark canvas).
2. **Choose a dark canvas** — not pure black. `#0a0a0c` or `#111114` or `#16161a` reads richer than `#000000`. Reserve pitch-black for full-bleed hero blocks.
3. **Surface layer** is a few luminance steps above canvas: canvas = `#0a0a0c`, surface = `#18181c`. No more than 3–4 luminance steps between canvas and surface. Overly bright cards in dark mode defeat the purpose.
4. **Text primary:** off-white `#e6e6ea` or `#f0f0f4`, not pure `#ffffff`. Pure white on dark background fatigues the eye in extended sessions.
5. **Borders in dark mode:** alpha-white (rgba(255,255,255,0.08–0.14)) rather than a new solid token. This inherits the surface hue naturally.
6. **Re-check every contrast pair.** Light-mode passes do not transfer automatically to dark mode.

## Palette patterns by style family

| Style | Primary hue guidance | Background | Accent behaviour |
|---|---|---|---|
| Brutalist | Any saturated (hot pink #ff2d55, safety yellow #ffe000) | Off-white (#f5f5f0) or pure black | One accent, nothing else coloured |
| Soft UI | Muted pastel (rose, sage, lavender — low saturation) | Warm off-white (#f0f0f3) | Single metallic accent (soft gold ~#c9a96e) |
| Glassmorphism | Cool (blue #2563eb / violet #7c3aed) | Tinted dark (#0f172a with colour cast) | Frosted-white surface (rgba alpha 10–20%) |
| Minimalist / Editorial | Deep (forest #166534, burgundy #881337, navy #1e3a8a) | Off-white (#f8f7f4) | Single editorial accent — used sparingly |
| Material Design | Saturated primary from MD3 colour roles | Pure white (light) / #1c1b1f (dark) | Secondary role + tertiary role per MD3 |
| Flat Design | Bold saturated primary, secondary from complementary | Pure white or bold solid colour | Limited — 2-3 colours maximum |
| Memphis | Primary triad (red, yellow, blue) + black | White | Clashing is intentional — bold borders |
| Swiss / Editorial | One strong primary (often red or blue) | Pure white | Neutral dominates; primary used sparingly |
| Skeuomorphic | Warm material hues (wood, parchment, leather) | Textured off-white | Avoid — textures carry the depth |

## Anti-patterns

1. **Relying on `opacity` alone to convey disabled state.** Lower-contrast-via-alpha often fails WCAG; use an explicit `text-disabled` token with a defined lightness step.
2. **Hue-based signalling only.** Colour-blind users (8% of males) need a second cue — icon, label, pattern, or shape.
3. **More than 4 semantic states visible on one screen.** Error + warning + success + info + CTA simultaneously reads like a Christmas tree. Design content sequencing to reduce simultaneous semantic load.
4. **Colours outside the token set leaking into components.** Enforce with lint (e.g., stylelint `color-no-hex` scoped to component files). Every colour in a component should trace back to a CSS custom property or design token.
5. **Pure pitch-black (#000) dark mode canvas.** Use near-black; reserve `#000` for hero-block overlays.
6. **Semantic colours too close to the primary.** If your error red has the same hue as your primary brand red, states will be ambiguous. Ensure at least 20° hue separation between semantic colours and the primary.
7. **Not testing both modes in device-representative conditions.** A palette that looks fine in Chrome DevTools dark mode may fail under actual OLED deep-black rendering.

## Output format

Emit the palette as a table the next step (`design-system-generation`) can turn into tokens:

```
role           light-hex   dark-hex   contrast-vs-bg-light  contrast-vs-bg-dark
primary        #2563eb     #60a5fa    8.6:1                 5.2:1
secondary      #7c3aed     #a78bfa    5.9:1                 4.6:1
cta            #0f766e     #2dd4bf    6.1:1                 7.0:1
background     #ffffff     #0a0a0c    —                     —
surface        #f5f5f7     #18181c    1.1:1                 1.8:1
text-primary   #111114     #e6e6ea    17.9:1                15.2:1
text-secondary #4b5563     #a1a1aa    7.4:1                 7.1:1
border         #e5e7eb     rgba(255,255,255,0.10)   1.2:1  —
success        #16a34a     #22c55e    4.7:1                 5.5:1
warning        #d97706     #fbbf24    4.6:1                 10.8:1
error          #dc2626     #f87171    5.4:1                 5.3:1
info           #2563eb     #60a5fa    8.6:1                 5.2:1
```

Follow the table with a brief human-readable note on any roles that required adjustment for WCAG compliance.

## Palette review checklist

Before handing off the palette:

- [ ] Every `text-*` token ≥ 4.5:1 on its container (light and dark).
- [ ] `cta` ≥ 4.5:1 for label text, on both `background` and `surface`.
- [ ] `border` for state-bearing use (focus ring, error border) ≥ 3:1.
- [ ] `success`, `warning`, `error`, `info` each ≥ 4.5:1 for label text.
- [ ] No semantic colour shares a hue within 20° of the `primary` (unless intentional + documented).
- [ ] Disabled state uses explicit token, not raw `opacity: 0.5`.
- [ ] Dark mode palette re-verified independently (not assumed from light-mode pass).

## See also

- `style-selection` — choose the visual style first; it constrains the palette mood and background treatment.
- `design-system-generation` — consumes this palette output as design tokens.
- `ui-design` — pillar 3 (colour) verifies the finished system against these ratios.
- `ux-reasoning-rules` — rules §6 (visual hierarchy via colour), §18 (focus ring contrast), §25 (single-source tokens).
