/**
 * ANV-0137 — Skill output / input template resolver.
 *
 * Skills used to embed structural prose (decision templates, plan headers,
 * code-review formats, …) directly in their `.md` bodies. That coupled
 * *behaviour* to *format*: users could not override prose without forking a
 * skill, and the same skill could not render differently per surface
 * (Claude Code vs OpenCode vs generic).
 *
 * This module extracts those templates into a first-class `templates/`
 * directory keyed by `{kind, surface}`. Skill bodies reference templates by
 * kind via `${TEMPLATE:<kind>}` substitution; the renderer (see
 * `src/skills/body.ts`) splices the resolved template content in at
 * render time.
 *
 * Resolution order (per kind):
 *   1. User override: `~/.anvil/templates/<kind>/<variant>.md`
 *   2. Bundled:       `<anvilRoot>/templates/<kind>/<variant>.md`
 *
 * Variant selection:
 *   - When `surface` is supplied (`claude-code`, `opencode`, …) the resolver
 *     tries `<surface>.md` (and `<surface>.json` for surface-specific
 *     payload variants) before falling back to `default.md`.
 *   - When `surface` is omitted the resolver only consults `default.md`.
 *
 * Lenient policy (mirrors ANV-0134): unknown kinds with no matching file
 * anywhere return `undefined`; the renderer then leaves the
 * `${TEMPLATE:foo}` reference verbatim in the body so authors can stage
 * migrations without breaking already-deployed skills.
 *
 * Pure module: file I/O is local synchronous reads (`readFileSync`,
 * `existsSync`). Safe to import from layer-0 callers. No imports outside
 * `node:fs` and `node:path`.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Active surface identifier passed by the renderer. Free-form to allow
 * future surfaces (codex, cursor, …) without an enum lock.
 */
export type TemplateSurface = string

/**
 * Context the resolver needs at render time. Both roots are optional —
 * when omitted the resolver simply skips that lookup tier.
 */
export interface TemplateResolutionContext {
  /**
   * Filesystem root of the installed Anvil bundle (the directory that
   * contains `templates/`, `skills/`, `agents/`). Bundled lookup tier.
   */
  anvilRoot?: string
  /**
   * Filesystem root for user-scoped overrides. Typically `~/.anvil`. The
   * resolver looks for `<userRoot>/templates/<kind>/<variant>.md` here.
   */
  userRoot?: string
  /**
   * Active surface — `claude-code`, `opencode`, …. When set, the resolver
   * prefers `<surface>.md` (or `.json`) over `default.md`.
   */
  surface?: TemplateSurface
}

/**
 * Outcome of a single template-kind resolution. Carries both the resolved
 * content and the diagnostic trail (which path won) so the doctor row can
 * report user-override usage without re-running resolution.
 */
export interface ResolvedTemplate {
  kind: string
  variant: string
  /** Absolute path of the file that won the lookup race. */
  sourcePath: string
  /** `bundled` or `user` — which lookup tier supplied the content. */
  tier: 'bundled' | 'user'
  /** UTF-8 content of the resolved file. */
  content: string
}

/**
 * Returns the resolved template for `kind` under `ctx`, or `undefined` when
 * no file matched. The caller decides what to do with `undefined` —
 * `renderSkillBody` leaves the `${TEMPLATE:<kind>}` reference verbatim.
 *
 * Unknown surface variants degrade silently to `default.md` so authors can
 * add `decisions/opencode.md` after the fact without touching skill bodies
 * that already use `${TEMPLATE:decisions}`.
 */
export function resolveTemplate(
  kind: string,
  ctx: TemplateResolutionContext,
): ResolvedTemplate | undefined {
  // Variant order: surface-specific first (when supplied), then default.
  const variants: string[] = []
  if (ctx.surface) {
    variants.push(`${ctx.surface}.md`, `${ctx.surface}.json`)
  }
  variants.push('default.md')

  // Tier order: user overrides win over bundled.
  const tiers: ReadonlyArray<{ tier: 'user' | 'bundled'; root?: string }> = [
    { tier: 'user', root: ctx.userRoot },
    { tier: 'bundled', root: ctx.anvilRoot },
  ]

  for (const tier of tiers) {
    if (!tier.root) continue
    for (const variant of variants) {
      const candidate = join(tier.root, 'templates', kind, variant)
      if (!existsSync(candidate)) continue
      let content: string
      try {
        content = readFileSync(candidate, 'utf-8')
      } catch {
        continue
      }
      return {
        kind,
        variant,
        sourcePath: candidate,
        tier: tier.tier,
        content,
      }
    }
  }
  return undefined
}

/**
 * Matches `${TEMPLATE:<kind>}` references in skill bodies. `<kind>` is
 * intentionally a forgiving identifier (lower-case letters, digits, hyphens)
 * so authors can name kinds like `code-review` or `decisions` without
 * escaping. Unknown kinds slip through this regex and surface as a lenient
 * pass-through in `substituteTemplateRefs`.
 */
const TEMPLATE_REF_PATTERN = /\$\{TEMPLATE:([a-z][a-z0-9-]*)\}/g

/**
 * Substitutes every `${TEMPLATE:<kind>}` reference in `body` with the
 * resolved template content. Unknown kinds (no bundled or user file) leave
 * the reference verbatim — strictly lenient, matching `substituteArtifactTokens`.
 *
 * Returns the rewritten body. Does not mutate inputs.
 */
export function substituteTemplateRefs(
  body: string,
  ctx: TemplateResolutionContext,
): string {
  return body.replace(TEMPLATE_REF_PATTERN, (match, kind: string) => {
    const resolved = resolveTemplate(kind, ctx)
    return resolved ? resolved.content : match
  })
}

/**
 * Returns the list of distinct template kinds referenced in `body`.
 * Used by the doctor linter and the loader/parity tests.
 */
export function findTemplateRefs(body: string): string[] {
  const out = new Set<string>()
  for (const match of body.matchAll(TEMPLATE_REF_PATTERN)) {
    out.add(match[1])
  }
  return [...out]
}

/**
 * Scans `<userRoot>/templates/` for user-override files and returns the
 * list of `(kind, variant)` pairs found. Used by the doctor row
 * `templates/user-overrides-loaded` to report which user templates are
 * in effect. Silent (returns `[]`) when the directory is missing.
 */
export function listUserTemplateOverrides(
  userRoot: string,
): Array<{ kind: string; variant: string }> {
  const root = join(userRoot, 'templates')
  if (!existsSync(root)) return []
  const out: Array<{ kind: string; variant: string }> = []
  let kinds: string[]
  try {
    kinds = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return out
  }
  for (const kind of kinds) {
    const kindDir = join(root, kind)
    let entries: string[]
    try {
      entries = readdirSync(kindDir, { withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => d.name)
    } catch {
      continue
    }
    for (const variant of entries) {
      out.push({ kind, variant })
    }
  }
  return out
}

/**
 * Heuristic match for embedded-template prose markers in skill bodies.
 * Used by the doctor linter (Phase 6) to surface skills that look like
 * they still embed a template but have not yet been migrated to the
 * `templates: [<kind>]` reference convention.
 *
 * Currently checks for the explicit HTML-comment marker
 * `<!-- template-prose -->` — authors can drop one above a block they
 * intend to extract later. This is intentionally narrow to avoid
 * false positives on normal skill prose.
 */
export const EMBEDDED_TEMPLATE_MARKER = '<!-- template-prose -->'

export function bodyContainsEmbeddedTemplateMarker(body: string): boolean {
  return body.includes(EMBEDDED_TEMPLATE_MARKER)
}
