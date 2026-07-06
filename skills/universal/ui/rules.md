---
name: ui-anti-pattern-rules
user-invocable: false
description: 'Use when editing UI surfaces (TSX/JSX/Vue/HTML/CSS/SCSS/Svelte) — 15 anti-pattern rules covering color, typography, accessibility, layout.'
tools: []
paths: ['**/*.tsx', '**/*.jsx', '**/*.vue', '**/*.html', '**/*.css', '**/*.scss', '**/*.svelte']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: universal
---

# UI Anti-Pattern Rules

**Announce:** I'm using the ui-anti-pattern-rules skill to flag UI anti-patterns in this edit.

## Status

(emit on use — `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`)

## Rules

### 1. hardcoded-color

**Anti-pattern:** Using hardcoded hex (`#ff00ff`) or `rgb(...)` color values directly in component styles or CSS declarations.

**Why:** Hardcoded colors bypass the design token system, making theme changes (dark mode, brand recolour) require a manual grep-and-replace across dozens of files. They also create inconsistencies when the same semantic role is expressed differently in different places.

**Do instead:** Use CSS custom properties (`--color-*`) instead of hardcoded hex/rgb values. Define the token in one place (`:root { --color-primary: #ff00ff; }`) and reference it everywhere (`color: var(--color-primary)`).

---

### 2. inter-only-font

**Anti-pattern:** Declaring `font-family: Inter` without a system fallback stack (e.g., `system-ui, sans-serif, -apple-system`).

**Why:** If Inter is unavailable (network offline, user installed version mismatch, blocked CDN), the browser falls back to its default serif font, producing jarring layout shifts and illegible text before the custom font loads.

**Do instead:** Always include system fallback after Inter — `font-family: Inter, system-ui, -apple-system, sans-serif`. This guarantees readable typography even before the web font loads.

---

### 3. missing-reduced-motion

**Anti-pattern:** Defining CSS `@keyframes` or `animation:` declarations without a corresponding `@media (prefers-reduced-motion: reduce)` block that disables or slows the animation.

**Why:** Users with vestibular disorders, epilepsy, or motion sensitivity can experience nausea or seizures from rapid animations. The OS `prefers-reduced-motion` setting signals that the user has explicitly opted out of motion.

**Do instead:** Add `@media (prefers-reduced-motion: reduce)` for animations — either `animation: none` or a minimal fade variant. This is a WCAG 2.1 Level AA requirement (2.3.3).

---

### 4. low-contrast-text

**Anti-pattern:** Setting text color to a very light value (near white, `#eee`, `#ccc`, or similar high-value hex) without verifying the contrast ratio against the background.

**Why:** Low contrast text fails WCAG AA (4.5:1 for normal text, 3:1 for large text), making it unreadable for users with low vision, in bright sunlight, or on lower-quality displays.

**Do instead:** Verify against WCAG AA (4.5:1) before shipping — use a contrast checker (e.g., `npx contrast-ratio`) or the browser DevTools accessibility panel. Prefer semantic color tokens that encode contrast guarantees.

---

### 5. missing-alt-text

**Anti-pattern:** Rendering an `<img>` element without an `alt` attribute, leaving screen readers to announce the filename or nothing useful.

**Why:** Screen readers announce images to blind and low-vision users. Without alt text, a screen reader either skips the image (meaningless) or reads the raw filename (`hero-image-v3-FINAL.png` — unhelpful). This is a WCAG 1.1.1 Level A failure.

**Do instead:** Images must have alt text for accessibility. Decorative images that convey no information should use `alt=""` (empty string). Informative images need concise, meaningful descriptions.

---

### 6. inline-style

**Anti-pattern:** Using `style={{ color: 'red' }}` in JSX or `style="..."` on HTML elements to apply one-off styles inline rather than via a class or CSS module.

**Why:** Inline styles can't be overridden by CSS selectors (specificity is always 1000), don't support media queries or pseudo-selectors, can't be deduplicated or cached by the browser, and scatter styling decisions across template files.

**Do instead:** Prefer CSS classes or CSS modules over inline styles. Extract the style to a class (`.error { color: red; }`), a CSS module, or a design token. Reserve inline styles only for truly dynamic values that can't be expressed in CSS (e.g., a percentage derived from user input).

---

### 7. magic-number-spacing

**Anti-pattern:** Using arbitrary pixel values for spacing properties (margin, padding, gap, etc.) that aren't multiples of the design system's base unit (typically 4px).

**Why:** Inconsistent spacing values (e.g., `margin: 7px`, `padding: 13px`) accumulate into visual noise that makes the UI feel unpolished. They also make redesigns harder because the spacing system has no predictable rhythm.

**Do instead:** Use spacing scale (multiples of 4px) — prefer `4, 8, 12, 16, 20, 24, 32, 40, 48, 64` px or equivalent design tokens (`var(--space-2)` for 8px, etc.). If your base unit is 8px, all spacing should be multiples of 8.

---

### 8. missing-focus-indicator

**Anti-pattern:** Removing the CSS focus outline with `outline: none` or `outline: 0` on `:focus` selectors without providing a custom focus indicator.

**Why:** The browser's default focus ring is the primary visual cue for keyboard navigation. Removing it without a replacement makes the UI completely inaccessible to users who navigate with a keyboard, a switch, or another non-pointer device. This is a WCAG 2.4.7 Level AA failure.

**Do instead:** Removing focus outline breaks keyboard accessibility — replace it with a custom `:focus-visible` style (e.g., `outline: 2px solid var(--color-focus); outline-offset: 2px`). Never simply remove the outline without a substitute.

---

### 9. deep-nesting

**Anti-pattern:** Writing CSS selectors with four or more descendant levels (e.g., `.card .body .header .title { }` or `a > b > c > d { }`).

**Why:** Deeply nested selectors are fragile — they break when the DOM structure changes even slightly. High specificity from nesting also causes unpredictable override behaviour and makes it harder to reuse components.

**Do instead:** Deeply nested selectors increase specificity and reduce maintainability — flatten to 1–2 levels using BEM, CSS modules, or utility classes. If the selector needs to be that specific, consider whether the component boundary is drawn correctly.

---

### 10. important-overuse

**Anti-pattern:** Using `!important` on two or more declarations in the same file, indicating a specificity conflict that's being patched with escalating overrides.

**Why:** `!important` is a sign that the normal cascade has broken down. Each `!important` requires a stronger `!important` to override it, leading to a specificity war where the file becomes unmaintainable and the effective style rules are opaque.

**Do instead:** Multiple `!important` indicates specificity wars — refactor selectors to reduce specificity rather than escalating overrides. Typical causes: global selectors leaking into components, or third-party styles polluting the cascade.

---

### 11. fixed-width-container

**Anti-pattern:** Setting `width: 800px` (or any fixed pixel value above 320px) on a container element that should adapt to the viewport.

**Why:** Fixed-width containers clip or overflow on mobile viewports and on resizable windows. They prevent the layout from being responsive and force horizontal scrolling.

**Do instead:** Use `max-width` instead of `width` for responsive containers — `max-width: 800px; width: 100%` allows the container to shrink on small viewports while capping the width on large ones.

---

### 12. missing-label

**Anti-pattern:** Rendering an `<input>` element without an associated `<label>`, `aria-label`, or `aria-labelledby` attribute.

**Why:** Form inputs without labels are inaccessible to screen readers, which can't announce the purpose of the field. They also prevent the click-on-label → focus-input interaction that improves usability on touch and pointer devices. This is a WCAG 1.3.1 / 3.3.2 Level A failure.

**Do instead:** Form inputs must have associated labels — use a visible `<label for="...">`, an `aria-label` for icon-only inputs, or `aria-labelledby` for labels rendered elsewhere. Never rely on `placeholder` alone as an accessible label.

---

### 13. z-index-war

**Anti-pattern:** Assigning `z-index` values above 100, signaling that the stacking context has grown beyond the design system's scale and developers are using escalating values to win stacking conflicts.

**Why:** Uncontrolled z-index values (999, 9999, 99999) make stacking behaviour unpredictable and debugging difficult. Once the values are high enough, new overlays can't be layered above them without guessing an even higher number.

**Do instead:** Use a z-index scale (1–10) to prevent z-index wars — define named layers (`--z-dropdown: 1; --z-modal: 2; --z-toast: 3`) in a central config and reference them as tokens. All stacking decisions are then in one place.

---

### 14. non-semantic-div

**Anti-pattern:** Using more than five consecutive `<div>` elements where semantic HTML elements (`<section>`, `<article>`, `<nav>`, `<aside>`, `<main>`, `<header>`, `<footer>`) would be more appropriate.

**Why:** Div-soup loses the semantic structure that screen readers, search engines, and browser reader-mode rely on to understand page sections. It also makes CSS selectors longer and the markup harder to scan.

**Do instead:** Use semantic HTML elements (section, article, nav, aside, main) to convey document structure. Reserve `<div>` for layout containers that genuinely have no semantic role.

---

### 15. no-skip-nav

**Anti-pattern:** Including `<nav>` or `<header>` elements in an HTML page without a "skip to main content" link at the top of the page.

**Why:** Keyboard and switch users must tab through every navigation link on every page load unless there's a skip link. On a site with 20 nav items, that's 20 extra keystrokes per page visit. This is a WCAG 2.4.1 Level A failure.

**Do instead:** Add a skip navigation link for keyboard users — `<a href="#main" class="sr-only focus:not-sr-only">Skip to content</a>` as the very first focusable element. Use CSS to show it only on focus so it doesn't appear for mouse users.

---

## Why

Design systems exist to enforce consistency, accessibility, and maintainability at scale. Each rule above protects a different dimension of that promise: color tokens prevent brand drift, focus indicators protect keyboard users, semantic HTML preserves document structure, spacing scales ensure visual rhythm. Individually, any single violation is a minor issue. Collectively, accumulated anti-patterns compound into UIs that are inaccessible, unmaintainable, and visually inconsistent. Treating these rules as non-negotiable defaults — rather than optional polish — is what separates a production-grade UI codebase from a prototype.

## Done — status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
