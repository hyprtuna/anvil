/**
 * ANV-0141 — Architecture category doctor checks.
 *
 * Extracted from `doctor.ts` (previously inline push helpers).
 * Keeps `function pushXyzCheck(checks: Check[])` signatures intact.
 * The dispatcher in `doctor.ts` re-exports these via named re-exports.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Local mirror of the Check interface from doctor.ts (same shape).
interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

// Plan 40 Phase E — Slug-namespace integrity (non-blocking lint).
// ---------------------------------------------------------------------------

/**
 * Approved agent doer-suffixes (Plan 40 D-01 hard rule 3). Compound suffixes
 * (`-architect`, `-builder`, ...) require a hyphen separator OR a slug equal
 * to the bare form (e.g., `orchestrator`). Generic English doer-suffixes
 * `-er`/`-or` match by character ending.
 */
const APPROVED_AGENT_SUFFIXES = [
  '-orchestrator',
  '-architect',
  '-simplifier',
  '-surfacer',
  '-validator',
  '-resolver',
  '-reviewer',
  '-explorer',
  '-analyzer',
  '-selector',
  '-verifier',
  '-builder',
  '-hunter',
  '-worker',
  '-er',
  '-or',
] as const

function endsInApprovedSuffix(slug: string): string | null {
  for (const sfx of APPROVED_AGENT_SUFFIXES) {
    if (sfx === '-er' || sfx === '-or') continue
    const bare = sfx.slice(1)
    if (slug.endsWith(sfx) || slug === bare) return sfx
  }
  if (slug.endsWith('er')) return '-er'
  if (slug.endsWith('or')) return '-or'
  return null
}

/**
 * Walk `root` recursively, collecting all `.md` files except CLAUDE.md / AGENTS.md.
 * Exported so other doctor-checks modules and doctor.ts can reuse the traversal.
 */
export function walkSlugFiles(root: string): string[] {
  const out: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    let names: string[] = []
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (name === 'CLAUDE.md' || name === 'AGENTS.md') continue
      // ANV-0181 convention: entries beginning with `_` (e.g. `_addenda/`,
      // `_*.md`) are excluded from the user bundle and not standalone
      // skills/agents. Mirrors `src/core/audit/surfaces.ts:542` and
      // `tests/unit/naming/walk.ts`.
      if (name.startsWith('_')) continue
      const full = join(dir, name)
      let stat: { isDirectory: boolean; isFile: boolean }
      try {
        const s = statSync(full)
        stat = { isDirectory: s.isDirectory(), isFile: s.isFile() }
      } catch {
        continue
      }
      if (stat.isDirectory) stack.push(full)
      else if (stat.isFile && name.endsWith('.md')) out.push(full)
    }
  }
  return out
}

/**
 * Extract the slug from a `.md` file path (strip directory and extension).
 * Exported so other doctor-checks modules can reuse this helper.
 */
export function slugFromMdPath(path: string): string {
  const base = path.split('/').pop() ?? path
  return base.replace(/\.md$/, '')
}

/**
 * Plan 40 Phase E (initial) — runs the 3 hard invariants of the slug-namespace
 * audit at runtime: (1) no agent/skill collisions, (2) no skill ends in an
 * approved doer-suffix, (3) every agent ends in one.
 *
 * Plan 41 Phase E (escalation, v0.10.4 D-04) — promoted from warn to fail.
 * v0.10.3 dogfood produced zero violation reports; the row now blocks doctor
 * on real violations to prevent regression. Pass/fail/skip discipline.
 */
export function pushSlugNamespaceCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
  skillsRootOverride?: string,
  agentsRootOverride?: string,
): void {
  const skillsRoot = skillsRootOverride ?? join(cwd, 'skills')
  const agentsRoot = agentsRootOverride ?? join(cwd, 'agents')
  if (!inProject || !existsSync(skillsRoot) || !existsSync(agentsRoot)) {
    checks.push({
      name: 'Slug-namespace integrity',
      status: 'skip',
      detail: skipDetail,
    })
    return
  }

  const skillSlugs = new Set(walkSlugFiles(skillsRoot).map(slugFromMdPath))
  const agentSlugs = new Set(walkSlugFiles(agentsRoot).map(slugFromMdPath))

  const violations: string[] = []

  // Rule 1: no collisions.
  const collisions = [...agentSlugs].filter((s) => skillSlugs.has(s))
  if (collisions.length > 0) {
    violations.push(`collisions: ${collisions.join(', ')}`)
  }

  // Rule 2: no skill ends in approved doer-suffix.
  const skillViolators = [...skillSlugs]
    .filter((s) => endsInApprovedSuffix(s) !== null)
    .sort()
  if (skillViolators.length > 0) {
    const preview = skillViolators.slice(0, 3).join(', ')
    const more =
      skillViolators.length > 3 ? ` (+${skillViolators.length - 3} more)` : ''
    violations.push(`skill doer-suffix: ${preview}${more}`)
  }

  // Rule 3: every agent ends in approved doer-suffix.
  const agentViolators = [...agentSlugs]
    .filter((s) => endsInApprovedSuffix(s) === null)
    .sort()
  if (agentViolators.length > 0) {
    violations.push(`agent missing suffix: ${agentViolators.join(', ')}`)
  }

  if (violations.length === 0) {
    checks.push({
      name: 'Slug-namespace integrity',
      status: 'pass',
      detail: `${skillSlugs.size} skills + ${agentSlugs.size} agents — 3-shape grammar holds`,
    })
    return
  }

  checks.push({
    name: 'Slug-namespace integrity',
    status: 'fail',
    detail: violations.join('; '),
  })
}

// ANV-0221: pushModelIdAllowlistCheck removed — the src/+presets/ invariant is
// fully covered by tests/unit/core/models/concrete-id-allowlist.test.ts:70,
// which walks src/ AND presets/ with the same regex and allowlist. The legacy
// inline src/presets *fail* check and the models.ts registry entry are both
// deleted. We do NOT re-add that fail check here.
//
// ANV-0221 follow-up — restore the USER-CONFIG advisory the unit test cannot
// cover: a unit test can't read a user's `~/.anvil/models.json`, so the
// user-facing WARN that fired when a user pinned concrete model IDs (instead of
// provider-neutral aliases like `cheap`/`balanced`/`best`) was silently lost.
// The check below restores it, scoped to the user-config path only, warn-only.
// ---------------------------------------------------------------------------

/**
 * Concrete provider model IDs look like `claude-<tier>-<version>` (e.g. the
 * versioned haiku/sonnet/opus IDs). We match the family + a version digit so
 * short aliases (`cheap`/`balanced`/`best`, `haiku`/`sonnet`/`opus` without a
 * trailing version) are NOT treated as concrete pins.
 */
const CONCRETE_MODEL_ID_RE = /^claude-(?:haiku|sonnet|opus)-\d/

/**
 * Pure detector: walk a parsed user `models.json` object and collect concrete
 * provider model IDs that appear in model-bearing fields. Returns the de-duped,
 * sorted list of offending concrete IDs.
 *
 * Scanned fields (the places a user pins a model):
 *   - `defaults.default` and per-entity `defaults.*` values that are strings
 *   - `tiers.<name>.model`
 *   - `agents.<name>.model`
 *   - `overrides.<name>` (string value or `{ model }` object)
 *
 * Deliberately EXEMPT: `model_aliases` values. That block exists precisely to
 * map a short alias to the one concrete provider ID — pinning a concrete ID
 * there is correct, not a smell. (This mirrors the src/ allowlist exempting
 * `aliases.ts`.)
 *
 * Exported for unit testing.
 */
export function collectUserConfigConcreteModelIds(raw: unknown): string[] {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return []
  const cfg = raw as Record<string, unknown>
  const found = new Set<string>()

  const consider = (v: unknown): void => {
    if (typeof v === 'string' && CONCRETE_MODEL_ID_RE.test(v)) found.add(v)
  }

  // defaults.* (default model + any string-valued defaults)
  const defaults = cfg.defaults
  if (
    defaults !== null &&
    typeof defaults === 'object' &&
    !Array.isArray(defaults)
  ) {
    for (const v of Object.values(defaults as Record<string, unknown>)) {
      consider(v)
    }
  }

  // tiers.<name>.model
  const tiers = cfg.tiers
  if (tiers !== null && typeof tiers === 'object' && !Array.isArray(tiers)) {
    for (const t of Object.values(tiers as Record<string, unknown>)) {
      if (t !== null && typeof t === 'object' && !Array.isArray(t)) {
        consider((t as Record<string, unknown>).model)
      }
    }
  }

  // agents.<name>.model
  const agents = cfg.agents
  if (agents !== null && typeof agents === 'object' && !Array.isArray(agents)) {
    for (const a of Object.values(agents as Record<string, unknown>)) {
      if (a !== null && typeof a === 'object' && !Array.isArray(a)) {
        consider((a as Record<string, unknown>).model)
      }
    }
  }

  // overrides.<name> — string value or { model } object
  const overrides = cfg.overrides
  if (
    overrides !== null &&
    typeof overrides === 'object' &&
    !Array.isArray(overrides)
  ) {
    for (const o of Object.values(overrides as Record<string, unknown>)) {
      if (typeof o === 'string') {
        consider(o)
      } else if (o !== null && typeof o === 'object' && !Array.isArray(o)) {
        consider((o as Record<string, unknown>).model)
      }
    }
  }

  // NOTE: model_aliases values are intentionally NOT scanned — concrete IDs
  // there are the correct resolution target, not a smell.

  return [...found].sort()
}

/**
 * ANV-0221 follow-up — WARN (never fail) when the user's resolved model config
 * (`~/.anvil/models.json`) declares concrete provider model IDs instead of
 * provider-neutral aliases (`cheap`/`balanced`/`best`). Concrete IDs in user
 * config defeat provider portability and require a hand-edit on every model
 * bump.
 *
 * Scope: USER-CONFIG only (`~/.anvil/models.json`). The src/+presets fail
 * invariant is covered by the concrete-id-allowlist unit test — not re-added.
 *
 * Severity: warn-only. Absent / unparseable / alias-clean configs emit a
 * `skip`/`pass` row respectively and never block doctor.
 *
 * @param anvilHome  Absolute path to the user's `~/.anvil` directory.
 */
export function pushUserModelAliasAdvisoryCheck(
  checks: Check[],
  anvilHome: string,
): void {
  const name = 'User model config uses aliases (~/.anvil/models.json)'
  const modelsPath = join(anvilHome, 'models.json')

  if (!existsSync(modelsPath)) {
    checks.push({
      name,
      status: 'skip',
      detail: 'no ~/.anvil/models.json — using built-in defaults',
      expectedAbsence: true,
    })
    return
  }

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(modelsPath, 'utf-8'))
  } catch {
    // Malformed user config is surfaced by other doctor rows (models.json
    // reference validation). Here we only care about the alias advisory, so a
    // parse failure is a skip — not a warn we'd double-report.
    checks.push({
      name,
      status: 'skip',
      detail:
        'unparseable ~/.anvil/models.json — see models.json reference row',
    })
    return
  }

  const offenders = collectUserConfigConcreteModelIds(raw)
  if (offenders.length === 0) {
    checks.push({
      name,
      status: 'pass',
      detail: 'no concrete model IDs pinned — using provider-neutral aliases',
    })
    return
  }

  const preview = offenders.slice(0, 3).join(', ')
  const more = offenders.length > 3 ? ` (+${offenders.length - 3} more)` : ''
  checks.push({
    name,
    status: 'warn',
    detail: `concrete model ID(s) pinned in ~/.anvil/models.json: ${preview}${more} — prefer provider-neutral aliases (cheap/balanced/best) so provider swaps need no config edit`,
  })
}
