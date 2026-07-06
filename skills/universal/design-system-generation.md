---
name: design-system-generation
user-invocable: false
description: 'Use when generating an opinionated design system with industry-specific presets — colours, typography, spacing, components.'
tools: [Read, Write, Edit, Grep, Glob]
x-anvil:
  kind: composite
  group: development
  trigger: [design system, design tokens, style guide, brand]
  language: universal
  tags: [ui, design, tokens]
  aliases: [generate design system, create style guide]
  composition: {chains: [{after: ui-design}]}
---

> **Invoke via `Skill({skill: "anvil:design-system-generation"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

## Purpose

Generate a complete, production-ready design system customized to the project's industry vertical. Output structured design tokens as CSS custom properties (or JSON/JS if requested), covering colors, typography, spacing, border radius, shadows, and breakpoints.

Detect or ask for the industry vertical, select the matching preset, incorporate any existing brand assets, then produce token files and component usage examples.

---

## Industry Presets

| Industry   | Palette                        | Typography                        | Character                    |
|------------|--------------------------------|-----------------------------------|------------------------------|
| SaaS       | Blue primary, neutral grays    | Inter/system, clean               | Professional, minimal        |
| Fintech    | Navy/green, trust tones        | Conservative, serif accent        | Trustworthy, stable          |
| Healthcare | Teal/white, calming            | High-contrast, accessible         | Calm, professional           |
| E-commerce | Warm accent, conversion-focused| Bold headings, readable body      | Energetic, action-oriented   |
| Media      | Dark mode default, vivid accent| Large headings, immersive         | Content-first, dramatic      |
| Education  | Warm pastels, friendly         | Rounded, approachable             | Welcoming, readable          |

---

## Design Token Categories

### Colors

Produce a full 50–900 scale for each role:

- **Primary** — main brand color (buttons, links, active states)
- **Secondary** — supporting brand color (badges, highlights)
- **Accent** — call-to-action contrast color
- **Neutral** — grays for text, borders, backgrounds
- **Semantic** — `success`, `warning`, `error`, `info` with 3-stop scales

### Typography

- **Font stack**: body font, heading font, monospace font (always include system fallbacks)
- **Size scale** (rem, based on 16 px root): 12 px · 14 px · 16 px · 18 px · 20 px · 24 px · 30 px · 36 px · 48 px
- **Weight scale**: 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- **Line height**: tight (1.25), snug (1.375), normal (1.5), relaxed (1.625)
- **Letter spacing**: tight (−0.025em), normal (0em), wide (0.025em), wider (0.05em)

### Spacing

4 px base grid. Token scale:

| Token     | Value   |
|-----------|---------|
| `space-1` | 0.25 rem (4 px)  |
| `space-2` | 0.5 rem  (8 px)  |
| `space-3` | 0.75 rem (12 px) |
| `space-4` | 1 rem    (16 px) |
| `space-6` | 1.5 rem  (24 px) |
| `space-8` | 2 rem    (32 px) |
| `space-12`| 3 rem    (48 px) |
| `space-16`| 4 rem    (64 px) |
| `space-24`| 6 rem    (96 px) |

### Border Radius

`none` · `sm` (0.25 rem) · `md` (0.375 rem) · `lg` (0.5 rem) · `xl` (0.75 rem) · `2xl` (1 rem) · `full` (9999 px)

### Shadows

| Token       | Value                                      |
|-------------|--------------------------------------------|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)`              |
| `shadow-md` | `0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)` |
| `shadow-lg` | `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)` |

### Breakpoints

`xs` 320 px · `sm` 640 px · `md` 768 px · `lg` 1024 px · `xl` 1280 px · `2xl` 1440 px

---

## Output Format

Emit tokens as CSS custom properties on `:root` (or `[data-theme]` for multi-theme). Example structure:

```css
:root {
  /* Colors */
  --color-primary-50: #eff6ff;
  --color-primary-500: #3b82f6;
  --color-primary-900: #1e3a5f;

  --color-neutral-50: #f9fafb;
  --color-neutral-500: #6b7280;
  --color-neutral-900: #111827;

  --color-success-500: #22c55e;
  --color-warning-500: #f59e0b;
  --color-error-500: #ef4444;
  --color-info-500: #3b82f6;

  /* Typography */
  --font-body: 'Inter', system-ui, sans-serif;
  --font-heading: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;
  --text-4xl: 2.25rem;
  --text-5xl: 3rem;

  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-4: 1rem;
  --space-8: 2rem;
  --space-16: 4rem;

  /* Border radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1);
}
```

If the project uses Tailwind, also emit a `tailwind.config.ts` `theme.extend` block. If it uses Style Dictionary, emit a `tokens.json`. Always ask which format is preferred when context is ambiguous.

---

## Process

1. **Detect industry** — scan `package.json`, `README`, existing CSS, or ask the user directly.
2. **Select preset** — choose the matching row from the Industry Presets table above.
3. **Incorporate existing brand assets** — read any existing color variables, logo files, or brand guidelines (use `Read`, `Grep`, `Glob`).
4. **Generate token file** — write `src/styles/tokens.css` (or equivalent path) with the full `:root` block.
5. **Create component examples** — produce 2–3 small component snippets (button, card, input) that consume the new tokens, so the user can verify the system looks correct.

---

## Anti-Patterns to Avoid

- **No purple gradients** unless the brand explicitly requires them — they age quickly and clash with most palettes.
- **No Inter-only** without `system-ui, sans-serif` fallback — always include a system font stack.
- **No low-contrast hero text** — heading text on colored backgrounds must meet WCAG AA (4.5:1 for normal text, 3:1 for large).
- **No decorative-only animations** without `@media (prefers-reduced-motion: reduce)` guard.
- **No fixed `px` font sizes** — use `rem` so the system respects user browser preferences.
- **No magic numbers** — every value in a component must trace back to a token; inline `color: #3b82f6` is a code smell.

## Inputs from sibling skills

The industry-preset matrix below draws on:

- [`style-selection`](./ui/style-selection.md) for the named visual style.
- [`color-palette-design`](./ui/color-palette-design.md) for the role-based palette.
- [`typography-pairings`](./ui/typography-pairings.md) for display/body pairings.

Run those three first for bespoke systems; use the built-in industry presets below as a fallback.
