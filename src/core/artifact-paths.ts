import { join } from 'node:path'

/**
 * ANV-0134 — symbolic artefact-path tokens.
 *
 * Skill and agent prose used to hardcode literal repo-relative paths
 * (e.g. `.anvil/plans/`, `docs/anvil/releases/`, `.anvil/background-results.md`).
 * Moving or renaming those directories forced a sweep through every skill body.
 * This module replaces those literals with a small symbolic vocabulary that
 * `substituteArtifactTokens` rewrites at body-render time, so the canonical
 * path lives in exactly one place (this file).
 *
 * Builds on the `${CLAUDE_SKILL_DIR}` precedent introduced in ANV-0108.
 *
 * Pure module: no I/O, no imports outside `node:path`. Safe to import from
 * layer-0 callers (resolver tests pin the contract).
 */

// ─── Token vocabulary ───────────────────────────────────────────────────

/**
 * The canonical set of artefact-path tokens. Skill and agent bodies use the
 * `${TOKEN}` form; the substitution helper rewrites them at render time.
 *
 * To add a token: extend the list here, extend `defaultRelativePaths` in
 * `resolveArtifactPath`, and migrate any literal paths in skill/agent bodies.
 */
export const ARTIFACT_TOKENS = [
  'ANVIL_ROOT',
  'ANVIL_PLANS_DIR',
  'ANVIL_RELEASES_DIR',
  'ANVIL_TICKETS_DIR',
  'ANVIL_AUDITS_DIR',
  'ANVIL_FEATURES_DIR',
  'ANVIL_SPECS_DIR',
  'ANVIL_RESEARCH_DIR',
  'ANVIL_BACKGROUND_RESULTS',
  'BACKLOG_FILE',
  'ROADMAP_FILE',
] as const

export type ArtifactToken = (typeof ARTIFACT_TOKENS)[number]

/**
 * Install scopes recognised by the resolver. Anvil's own `Scope` enum is
 * `project | global`; the resolver expands this with `bundled` to cover the
 * shipped-with-Anvil source tree (used by adapter manifest emitters that read
 * the bundled `skills/` and `agents/` directories at install time).
 */
export type ArtifactScope = 'project' | 'user' | 'bundled'

export interface ArtifactPathContext {
  /**
   * Filesystem root of the installed Anvil bundle (the directory that
   * contains `skills/`, `agents/`, `dist/`). Used for `bundled` scope.
   */
  anvilRoot: string
  /**
   * Filesystem root of the consumer's project (the directory that holds
   * `.anvil/` and `docs/anvil/`). Used for `project` scope.
   */
  projectRoot: string
  /**
   * User-home root (the directory that holds the user-scope `.anvil/` and
   * `.claude/` trees). Used for `user` scope.
   */
  userRoot?: string
  scope: ArtifactScope
}

/**
 * Per-token relative paths. Keys MUST match `ARTIFACT_TOKENS` exactly.
 * The relative path is appended to the scope-specific root chosen by
 * `resolveArtifactPath`. Centralising the layout here is the whole point of
 * ANV-0134 — moving `.anvil/plans/` elsewhere is a one-line edit.
 */
const RELATIVE_PATHS: Record<ArtifactToken, string> = {
  ANVIL_ROOT: '.anvil',
  ANVIL_PLANS_DIR: '.anvil/plans',
  ANVIL_RELEASES_DIR: 'docs/anvil/releases',
  ANVIL_TICKETS_DIR: '.anvil/tickets',
  ANVIL_AUDITS_DIR: '.anvil/audits',
  ANVIL_FEATURES_DIR: '.anvil/specs/features',
  ANVIL_SPECS_DIR: '.anvil/specs',
  ANVIL_RESEARCH_DIR: '.anvil/research',
  ANVIL_BACKGROUND_RESULTS: '.anvil/background-results.md',
  BACKLOG_FILE: 'docs/anvil/backlog.md',
  ROADMAP_FILE: 'docs/roadmap.md',
}

/**
 * Returns true when `token` is a known artefact token.
 * Used by the doctor row and the architecture guard to validate references.
 */
export function isArtifactToken(token: string): token is ArtifactToken {
  return (ARTIFACT_TOKENS as readonly string[]).includes(token)
}

/**
 * Resolves a single token to an absolute path under the appropriate scope root.
 *
 * - `project` scope joins the relative path under `ctx.projectRoot` — this is
 *   the canonical case for in-flight planning artefacts.
 * - `user` scope joins under `ctx.userRoot` (falls back to `projectRoot` if
 *   `userRoot` is omitted) — used by user-scope installs.
 * - `bundled` scope joins under `ctx.anvilRoot` — used by adapter manifest
 *   emitters that need to reference assets shipped inside the Anvil package.
 *
 * Throws on unknown tokens rather than silently returning the literal — the
 * caller (skill loader / doctor) is responsible for treating that as an
 * actionable validation error.
 */
export function resolveArtifactPath(
  token: string,
  ctx: ArtifactPathContext,
): string {
  if (!isArtifactToken(token)) {
    throw new Error(
      `Unknown artefact token: \${${token}}. Known tokens: ${ARTIFACT_TOKENS.join(', ')}`,
    )
  }
  const rel = RELATIVE_PATHS[token]
  const root = scopeRoot(ctx)
  return join(root, rel)
}

function scopeRoot(ctx: ArtifactPathContext): string {
  switch (ctx.scope) {
    case 'project':
      return ctx.projectRoot
    case 'user':
      return ctx.userRoot ?? ctx.projectRoot
    case 'bundled':
      return ctx.anvilRoot
  }
}

// ─── Substitution helper ─────────────────────────────────────────────────

/**
 * Matches `${TOKEN}` references where TOKEN is one of the known artefact
 * tokens. The match is intentionally narrow: it ignores literal `$TOKEN`
 * (no braces) and rejects token-like strings outside the known vocabulary
 * by erroring through `resolveArtifactPath`.
 *
 * The regex character class restricts TOKEN to UPPER_SNAKE_CASE, which is
 * the convention for all artefact tokens. Unknown matches surface as a
 * thrown error so the doctor row can spot typos like `${ANVIL_PLAN_DIR}`.
 */
const TOKEN_PATTERN = /\$\{([A-Z][A-Z0-9_]*)\}/g

/**
 * Substitutes every `${TOKEN}` reference in `body` with the resolved path.
 *
 * Strategy: lenient. Unknown tokens are left in-place verbatim — substitution
 * is opt-in per ANV-0134 and we should never break existing skill bodies that
 * use a `${SOMETHING}` placeholder for non-path purposes (`${SLUG}`,
 * `${VERSION}`). The architecture guard separately enforces that no literal
 * `.anvil/...` path remains.
 */
export function substituteArtifactTokens(
  body: string,
  ctx: ArtifactPathContext,
): string {
  return body.replace(TOKEN_PATTERN, (match, tokenName: string) => {
    if (!isArtifactToken(tokenName)) {
      // Unknown token — leave untouched. Other substitution mechanisms
      // (e.g. ${CLAUDE_SKILL_DIR}, ${SLUG}) may legitimately use the same
      // shape. The architecture guard catches genuine hardcoded paths.
      return match
    }
    return resolveArtifactPath(tokenName, ctx)
  })
}

/**
 * Returns the list of artefact tokens referenced in `body`. Useful for the
 * doctor row that wants to report which tokens a skill body consumes.
 */
export function findArtifactTokens(body: string): ArtifactToken[] {
  const out = new Set<ArtifactToken>()
  for (const match of body.matchAll(TOKEN_PATTERN)) {
    const name = match[1]
    if (isArtifactToken(name)) out.add(name)
  }
  return [...out]
}
