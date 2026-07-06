---
name: style-selection
user-invocable: false
description: 'Use when picking a named UI style family (Brutalist, Soft UI, Glassmorphism, Skeuomorphic, Neumorphism, Material, Flat, Memphis, Editorial, Minimalist) — guides toward fit; names which to avoid.'
tools: [Read, Write, Edit, Grep, Glob]
x-anvil:
  kind: atomic
  group: development
  trigger: [pick a style, choose a style, ui style, visual style, what style, style for, which style, ui aesthetic, design direction]
  language: universal
  tags: [ui, design, style, industry, selection]
  aliases: [style-picker, ui-style, visual-style]
---

> **Invoke via `Skill({skill: "anvil:style-selection"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# style-selection

**Pair with:** `ui-design` (audit output), `design-system-generation` (industry presets), `color-palette-design`, `typography-pairings`.

## When to use

- Starting a new UI from zero and the user gave no visual reference.
- The user named an industry but no visual direction ("a fintech dashboard", "a wellness booking app").
- The current design feels generic — "AI default" purple gradients, Inter-only, centered hero with 3 feature cards. A named style breaks out.
- The product exists but needs a redesign; you need a shared vocabulary for the direction.

## Decision flow

1. **What industry?** Use the industry → style mapping table below to get a shortlist (default + also-consider).
2. **What audience?** Consumer vs. enterprise vs. development shifts the shortlist (see audience modifiers).
3. **What is the primary job?** Data-dense reads (dashboards) → Flat / Swiss / Material. Emotional purchase (fashion) → Editorial / Soft UI. Utility (SaaS tools) → Minimalist / Flat.
4. **Confirm with the user.** Show 2-3 candidate names. Get explicit sign-off before building.

## Style families

Each style: keywords, best-fit industries, color mood, typography mood, typical effects, anti-pattern warnings, and accessibility notes.

### 1 · Brutalist

- **Keywords:** raw, monospace, hard borders, grid, high contrast, unpolished-on-purpose, confrontational.
- **Best for:** Developer tools, crypto-native, editorial experiments, agency portfolios, zines.
- **Colors:** monochrome + one saturated accent (hot pink / neon green / safety yellow). No gradients.
- **Typography:** monospace (JetBrains Mono, IBM Plex Mono) with a chunky display sans (Archivo Black, Space Grotesk). Extreme size contrast (8px body vs. 120px hero).
- **Effects:** hard 1–4px borders, square corners (0px radius), no shadows, abrupt hover states, sometimes intentionally "broken" layouts.
- **Avoid:** soft gradients, rounded corners >2px, drop shadows, smooth easing.
- **Accessibility:** high contrast is a natural fit; watch dark-text-on-neon legibility.

### 2 · Soft UI (Neumorphism Evolved)

- **Keywords:** soft shadows, subtle depth, calming, premium feel, organic shapes, spa-like.
- **Best for:** Wellness, beauty, lifestyle, premium personal finance, consumer subscription services.
- **Colors:** off-white backgrounds (#f0f0f3), muted pastels, single metallic accent (soft gold, rose gold).
- **Typography:** elegant serif display (Cormorant Garamond, Playfair Display) + humanist sans body (Montserrat, Nunito).
- **Effects:** 200–300ms transitions, soft convex/concave box-shadows (`box-shadow: 8px 8px 16px #d1d1d1, -8px -8px 16px #fff`), gentle hover lift.
- **Avoid:** dark mode as default, neon, harsh motion, extreme type contrast.
- **Accessibility note:** shadow-only affordance fails low-vision users. Always pair with a border or color signal for interactive states.

### 3 · Glassmorphism

- **Keywords:** frosted glass, layered depth, translucency, background blur, floating cards.
- **Best for:** OS-like apps (macOS-adjacent), creative tools, consumer products on rich imagery, hero sections.
- **Colors:** dark or heavily tinted base, white semi-transparent surfaces (alpha 10–20%).
- **Typography:** geometric sans (Inter, SF Pro, Manrope). Weight 500–700 for headings; avoid anything lighter than 400 body.
- **Effects:** `backdrop-filter: blur(24px)`, subtle glass borders (white alpha 10–15%), layered z-depth cards.
- **Avoid:** flat solid surfaces mixed in, black-on-white sections without the glass treatment.
- **Accessibility:** contrast through transparency is fragile — verify WCAG AA at the darkest and lightest background states. Not suitable as a primary system for WCAG AAA targets.

### 4 · Skeuomorphic (Light Touch)

- **Keywords:** subtle texture, real-world analogues, material metaphors, tactile feedback, no heavy chrome.
- **Best for:** Tools that mimic physical objects (note-taking apps, calculators, audio mixers, notebooks).
- **Colors:** warm off-whites, parchment tones, material-specific hues (wood grain browns, leather tans).
- **Typography:** humanist serif or slab for authenticity; body at comfortable size (17–18px).
- **Effects:** very subtle paper textures (1–2% opacity SVG grain), inset shadows on pressed states, gentle page-turn metaphors.
- **Warning:** a few textured cues only. Full skeuomorphism (leather stitching, wooden shelves) is dated and mobile-hostile. Limit to 1–2 metaphors per view.
- **Avoid:** full-chrome realism, shadow stacking, animated page curls.

### 5 · Neumorphism (Neomorphism)

- **Keywords:** extruded/embossed, soft, monochromatic, tactile, floating.
- **Best for:** Niche — settings panels, audio controls, wearable app UIs. Rarely appropriate as a full system.
- **Warning:** widely criticised for poor affordance and accessibility. Interactive vs. non-interactive states look identical. If you must use it, limit to one tactile surface (e.g., a volume knob) within a stronger base system.
- **Avoid for:** primary navigation, data-dense screens, anything needing high contrast.

### 6 · Material Design (Google-Origin)

- **Keywords:** elevation, cards, bold primary color, responsive animation, grid-based, FAB.
- **Best for:** Android apps, cross-platform tools (Flutter), internal dashboards where Google's vocabulary is familiar.
- **Colors:** primary + secondary from the MD3 tonal palette. Surfaces at distinct elevation levels.
- **Typography:** Roboto or brand sans. MD3 type scale (Display → Label sm).
- **Effects:** ripple on tap, elevation state transitions (dp to dp), predictable motion curves.
- **Avoid:** mixing Material concepts with Glassmorphism or Soft UI — they have incompatible shadow models.
- **Note:** MD3 (Material You) allows custom color theming via `DynamicColorScheme`. Prefer it over MD2.

### 7 · Flat Design

- **Keywords:** no shadows, solid fills, bold colors, icon-driven, simple shapes.
- **Best for:** Marketing sites, icons, information design, internal tools, government / public sector.
- **Colors:** bold, saturated. Limited palette (3–4 colors + neutrals). No gradients in the base system.
- **Typography:** sans-serif, high contrast. Hierarchy through size and weight, not color alone.
- **Effects:** instant state changes or short linear transitions (100ms). No depth illusions.
- **Avoid:** visual affordance problems — interactive elements must be explicitly marked with color, label, or icon.
- **Accessibility:** naturally high contrast; watch that interactive and decorative elements are visually distinguished.

### 8 · Memphis

- **Keywords:** 80s/90s retro, geometric shapes, thick stripes, squiggles, bold primaries + black, maximalist, playful.
- **Best for:** Gen-Z consumer brands, food & beverage, entertainment, streetwear, toy-category apps.
- **Colors:** primary triad (red, yellow, blue) + black + white + maybe one neon accent. Clashing is intentional.
- **Typography:** geometric slab or display sans (Neue Haas Grotesk Display, Cabinet Grotesk). Mixed weights.
- **Effects:** decorative SVG shapes (triangles, circles, squiggles) as background elements; bold borders; no shadows.
- **Avoid for:** healthcare, finance, enterprise — it signals "fun" not "trust". Also: adult luxury or premium brands.
- **Note:** easy to become parody. Anchor the maximalism with a strong grid underneath.

### 9 · Editorial / Swiss Grid

- **Keywords:** strict grid, flush-left, sans-serif, limited palette, typographic hierarchy as the design.
- **Best for:** Dashboards, enterprise SaaS, documentation sites, design systems, publications.
- **Colors:** one primary (often red, yellow, or pure blue) + neutral. White space is the hero.
- **Typography:** Helvetica Neue, Inter, Söhne, Untitled Sans. Strict weight hierarchy (400/600/700 only).
- **Effects:** pixel-precise alignment, no decorative flourishes, motion only for state changes (not decoration).
- **Avoid:** decorative elements, gradients, competing focal points.
- **Accessibility:** naturally the most accessible style family — high contrast, clear hierarchy.

### 10 · Minimalist

- **Keywords:** white space, typographic hierarchy, single accent, restraint, "nothing to remove."
- **Best for:** Publications, agencies, portfolios, premium SaaS landing pages, high-end e-commerce.
- **Colors:** black / off-white base (#111 / #f9f9f9), one editorial accent (deep red, forest green, navy).
- **Typography:** strong serif + clean sans pairing (Tiempos + Söhne, Fraunces + Inter, Canela + Untitled Sans). Generous size contrast.
- **Effects:** generous whitespace (section padding 96–120px), slow fades (400–600ms), no gratuitous shadows. Motion is editorial — one big transition, not many micro-animations.
- **Avoid:** cramming the page, adding color "because it looks boring."
- **Note:** Minimalist ≠ lazy. Every element must earn its place. This style punishes "almost finished" implementations visibly.

---

## Industry → style mapping

| Industry | Default style | Also consider | Avoid |
|---|---|---|---|
| SaaS (horizontal / general) | Minimalist, Flat | Swiss / Editorial | Cyberpunk, Memphis |
| SaaS (development tools) | Brutalist, Swiss / Editorial | Glassmorphism | Soft UI, Skeuomorphic |
| Fintech | Minimalist, Swiss | Material | Brutalist, Memphis, Glassmorphism |
| Healthcare | Minimalist, Flat | Soft UI | Brutalist, Memphis, Neumorphism |
| Wellness / Beauty | Soft UI | Minimalist | Brutalist, Glassmorphism |
| E-commerce (luxury / fashion) | Editorial, Minimalist | Glassmorphism | Brutalist, Memphis |
| E-commerce (mass market) | Flat, Material | Brutalist (for brand differentiation) | Skeuomorphic |
| Gaming / Crypto | Brutalist | Glassmorphism | Soft UI, Minimalist |
| Education / EdTech | Flat, Material | Soft UI | Brutalist, Neumorphism |
| Developer Tools | Brutalist, Swiss / Editorial | Flat | Soft UI, Memphis |
| Editorial / Media | Editorial, Minimalist | Swiss | Neumorphism, Skeuomorphic |
| Gov / Public sector | Flat, Swiss | Material | Glassmorphism, Brutalist |
| Mental health / meditation | Soft UI | Minimalist | Brutalist, Memphis |
| Audio / Music tools | Skeuomorphic (controls only) | Flat | Memphis |
| Gen-Z consumer brand | Memphis | Brutalist | Corporate Minimalist |

## Audience modifiers

Apply after the industry table:

| Audience | Modifier |
|---|---|
| Developer / technical | +Brutalist, +Swiss. −Soft UI, −Skeuomorphic |
| Enterprise / B2B | +Flat, +Material, +Swiss. −Brutalist, −Memphis |
| Consumer / B2C | +Soft UI, +Editorial. Wider range acceptable |
| Luxury / premium | +Minimalist, +Editorial, +Glassmorphism (sparingly). −Flat, −Memphis |
| Accessibility-first | +Flat, +Swiss, +Material. −Glassmorphism, −Neumorphism |

## Landing-page section patterns

Use with any style. Pattern = the sequencing and shape of sections.

| Pattern | Section sequence | Best with |
|---|---|---|
| Hero-centric + social proof | Hero → logos → features → testimonials → CTA | Consumer B2C SaaS, consumer apps |
| Features grid | Hero → 4–6 features → CTA | Dev tools, API-first products |
| Story-driven | Hero → narrative sections → single CTA at end | Agencies, editorial, premium brands |
| Product-first | Screenshots on fold → short copy → CTA → features below fold | Dashboards, visual products |
| Pricing-first | Hero → pricing → FAQ → CTA | Transparent SaaS, self-serve tools |
| Dashboard showcase | Stats strip → product screenshot → integration logos → pricing | Analytics, B2B horizontal SaaS |

## Universal anti-patterns

These apply regardless of style family. Flag if any are present.

1. **Purple → pink gradient backgrounds.** AI-default. Unless the brand is literally a festival or lo-fi music app, don't.
2. **Inter-only typography.** "Just use Inter" looks generic. Pair it with a contrasting display face.
3. **Uniform corner radius everywhere (12–16px on every element).** Mix: hero cards can be 16–24px; inline chips 4px; buttons match the style (0px for Brutalist, 8–12px for Soft UI).
4. **Centered hero + 3 feature cards.** The universal SaaS template. Maximum genericness.
5. **Saturated gradient CTA buttons.** A solid single colour with a careful hover state reads more premium.
6. **Drop shadow on everything.** Shadows should be scarce and intentional; overuse reduces perceived quality.
7. **Dark mode as the only mode.** Dark-first is fine; dark-only is usually laziness unless the product is inherently dark-context (media player, IDE).
8. **No empty / error / loading states.** The three states every component skips. Each is a product moment.
9. **Hover-only interactions on touch platforms.** Tap-equivalents required for every hover-state affordance.
10. **Motion without `prefers-reduced-motion` support.** One line of CSS; no excuse.
11. **Stock image hero with overlaid text at low contrast.** Especially dark images with dark overlay + white text that fails AA.
12. **Identical primary and secondary button styles.** If secondary looks the same as primary, the hierarchy is broken.

## Output format

When this skill resolves a style, emit:

```
Style family: [name]
Rationale: [1-2 sentences linking industry, audience, and product job]
Palette mood: [1 sentence — feed to color-palette-design]
Typography mood: [1 sentence — feed to typography-pairings]
Avoid list: [2-3 specifics]
```

## See also

- `color-palette-design` — how to choose the colour ramp that fits the style.
- `typography-pairings` — concrete display/body pairings per industry and mood.
- `ux-reasoning-rules` — 25 high-leverage UX rules; apply as a checklist after building.
- `ui-design` — 6-pillar audit (run after the system is built).
- `design-system-generation` — produces the tokens + component primitives for the chosen style.
