/**
 * ANV-0036 — Deterministic skill-behaviour validation for `anvil doctor`.
 *
 * Pure TypeScript checks (no subprocess, no network, no LLM):
 *   1. Skill catalog counts: total, valid frontmatter, invalid frontmatter.
 *   2. Duplicate slug detection across skills / agents / commands.
 *   3. Description budget: warn >1,536 chars per entry; fail if aggregate >8,192 chars.
 *   4. Description-shape lint: warn if description does NOT start with a
 *      CSO-accepted triggering-condition prefix.
 *   5. Asset-file existence (ANV-0086): warn if any path declared in `scripts:`,
 *      `references:`, or `assets:` frontmatter arrays resolves to a missing file.
 *
 * All functions are exported as named exports for unit-test injection via
 * synthetic in-memory fixtures — no dependency on the live skills/ tree.
 *
 * Out of scope (ANV-0045): `--live` flag, LLM-based premature-tool-use detection,
 * skill-trigger fixture files.
 */

import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Per-entry description length that earns a warn row. */
export const SKILL_DESC_PER_ENTRY_WARN = 1536

/**
 * Aggregate description length threshold for a fail row.
 * Used as a floor; the actual threshold scales with skill count
 * (see `checkSkillDescriptionBudget`).
 */
export const SKILL_DESC_AGGREGATE_FAIL = 8192

/**
 * Per-skill budget used to scale the aggregate threshold.
 * Allows the threshold to grow proportionally with the corpus size so a large
 * but well-maintained skill set doesn't false-fail.
 */
export const SKILL_DESC_AGGREGATE_PER_SKILL = 200

/**
 * Line-count threshold above which a subdir-form SKILL.md that lacks a sibling
 * `references/` directory earns a doctor warning.  (ANV-0061)
 */
export const SUBDIR_SKILL_LINE_WARN = 200

/**
 * Accepted CSO triggering-condition prefixes for skill descriptions.
 * Mirrors the accepted-prefix set from Plan 39 Phase B / cso-discipline check.
 */
export const CSO_ACCEPTED_SHAPE_RE =
  /^(Use (?:when|before|after|to|for) |Run when |Invoked? (?:when|before) |Activate when |Triggered when |Triggers on |MUST consult|When |Applies when |For )/

// ─── Skill input shape (minimal — doctor needs only these fields) ─────────────

/**
 * Minimal representation of a skill entry that the validation functions need.
 * Callers may pass live `Skill` objects (which satisfy this shape) or synthetic
 * fixtures in unit tests.
 */
export interface SkillValidationInput {
  /** Skill slug / name from frontmatter. */
  name: string
  /** Skill description from frontmatter. Empty string when frontmatter is invalid. */
  description: string
  /** Absolute path to the source file. Optional — used for asset-file checks. */
  sourcePath?: string
  /** Whether the frontmatter parsed successfully. Invalid skills are skipped in budget / shape checks. */
  frontmatterValid: boolean
  /** Explicit list of paths declared in `scripts:` frontmatter field (ANV-0086). */
  scripts?: string[]
  /** Explicit list of paths declared in `references:` frontmatter field. */
  references?: string[]
  /** Explicit list of paths declared in `assets:` frontmatter field (ANV-0086). */
  assets?: string[]
  /** Skill body content — scanned for ${CLAUDE_SKILL_DIR} path patterns. */
  body?: string
}

// ─── 1. Skill catalog counts ─────────────────────────────────────────────────

export interface SkillCatalogCountResult {
  total: number
  valid: number
  invalid: number
}

/**
 * Returns a count breakdown of the skill catalog.
 * Does not mutate the input array.
 */
export function checkSkillCatalogCounts(
  skills: SkillValidationInput[],
): SkillCatalogCountResult {
  const valid = skills.filter((s) => s.frontmatterValid).length
  return {
    total: skills.length,
    valid,
    invalid: skills.length - valid,
  }
}

// ─── 2. Duplicate slug detection ─────────────────────────────────────────────

export interface SlugSurfaces {
  skillSlugs: string[]
  agentSlugs: string[]
  commandSlugs: string[]
}

export interface DuplicateSlugResult {
  /** Slugs that appear in more than one surface. */
  duplicates: string[]
  status: 'pass' | 'fail'
}

/**
 * Detects slug collisions across skills, agents, and commands.
 * A slug that appears in any two (or more) surfaces is a collision.
 */
export function checkSkillDuplicateSlugs(
  surfaces: SlugSurfaces,
): DuplicateSlugResult {
  // Build a map: slug → set of surfaces it appears in.
  const occurrences = new Map<string, Set<string>>()

  const addSlugs = (slugs: string[], surface: string): void => {
    for (const slug of slugs) {
      const existing = occurrences.get(slug) ?? new Set<string>()
      existing.add(surface)
      occurrences.set(slug, existing)
    }
  }

  addSlugs(surfaces.skillSlugs, 'skill')
  addSlugs(surfaces.agentSlugs, 'agent')
  addSlugs(surfaces.commandSlugs, 'command')

  const duplicates = [...occurrences.entries()]
    .filter(([, surfaces]) => surfaces.size > 1)
    .map(([slug]) => slug)
    .sort()

  return {
    duplicates,
    status: duplicates.length === 0 ? 'pass' : 'fail',
  }
}

// ─── 3. Description budget ───────────────────────────────────────────────────

export interface DescriptionBudgetResult {
  /** Skills whose description exceeds the per-entry warn threshold. */
  overPerEntry: Array<{ name: string; length: number }>
  /** Whether the aggregate of all descriptions exceeds the fail threshold. */
  aggregateOver: boolean
  /** Total aggregate character count. */
  aggregateLength: number
  /** Number of skills whose descriptions were checked. */
  total: number
  status: 'pass' | 'warn' | 'fail'
}

/**
 * Checks per-entry and aggregate description length budgets.
 *
 * Budget rules (ANV-0036):
 *   - warn: any single description > 1,536 chars (CC per-entry selector cap).
 *   - fail: aggregate of all descriptions > 8,192 chars.
 *
 * Only skills with valid frontmatter (and non-empty descriptions) are checked.
 */
export function checkSkillDescriptionBudget(
  skills: SkillValidationInput[],
): DescriptionBudgetResult {
  const valid = skills.filter(
    (s) => s.frontmatterValid && s.description.length > 0,
  )

  const overPerEntry: Array<{ name: string; length: number }> = []
  let aggregateLength = 0

  for (const skill of valid) {
    const len = skill.description.length
    aggregateLength += len
    if (len > SKILL_DESC_PER_ENTRY_WARN) {
      overPerEntry.push({ name: skill.name, length: len })
    }
  }

  // Scale threshold with skill count so a large but healthy corpus doesn't
  // false-fail. Floor at SKILL_DESC_AGGREGATE_FAIL to preserve sensitivity for
  // small skill sets where the original 8 KB limit is appropriate.
  const aggregateThreshold = Math.max(
    SKILL_DESC_AGGREGATE_FAIL,
    valid.length * SKILL_DESC_AGGREGATE_PER_SKILL,
  )
  const aggregateOver = aggregateLength > aggregateThreshold

  let status: 'pass' | 'warn' | 'fail'
  if (aggregateOver) {
    status = 'fail'
  } else if (overPerEntry.length > 0) {
    status = 'warn'
  } else {
    status = 'pass'
  }

  return {
    overPerEntry,
    aggregateOver,
    aggregateLength,
    total: valid.length,
    status,
  }
}

// ─── 4. Description-shape lint ───────────────────────────────────────────────

export interface DescriptionShapeResult {
  /** Skills whose descriptions do not start with a CSO-accepted prefix. */
  violations: Array<{ name: string; description: string }>
  status: 'pass' | 'warn'
}

/**
 * Warns when a skill description does not start with a CSO-accepted
 * triggering-condition prefix ("Use when", "Run when", etc.).
 *
 * Note: the existing CSO-discipline check in doctor.ts enforces a similar rule
 * by reading files from disk. This function works on in-memory fixtures and
 * uses the same accepted-prefix regex — it is the testable inner logic that
 * `pushSkillBehaviorValidationChecks` delegates to.
 *
 * Only skills with valid frontmatter and non-empty descriptions are checked.
 */
export function checkSkillDescriptionShape(
  skills: SkillValidationInput[],
): DescriptionShapeResult {
  const valid = skills.filter(
    (s) => s.frontmatterValid && s.description.length > 0,
  )

  const violations = valid
    .filter((s) => !CSO_ACCEPTED_SHAPE_RE.test(s.description))
    .map((s) => ({ name: s.name, description: s.description }))

  return {
    violations,
    status: violations.length > 0 ? 'warn' : 'pass',
  }
}

// ─── 5. Asset-file existence (ANV-0086) ──────────────────────────────────────

export interface AssetFilesResult {
  /** Entries where a declared asset/script/reference path could not be resolved. */
  missing: Array<{
    skillName: string
    kind: 'scripts' | 'references' | 'assets'
    path: string
  }>
  status: 'pass' | 'warn'
}

/**
 * Checks that all paths declared in a skill's `scripts:`, `references:`, and
 * `assets:` frontmatter arrays exist on disk.
 *
 * Severity is `warn` (not `fail`) — a missing asset is noteworthy but should
 * not block normal operation. Authors may declare paths that are generated at
 * build time or live outside the repo (e.g. user-local scripts).
 *
 * `skillsRoot` is provided so future relative-path support can resolve against
 * the skills directory; currently only absolute paths are checked as-is.
 *
 * Body scanning for `${CLAUDE_SKILL_DIR}` style paths is a future enhancement
 * deferred alongside ANV-0045 live-eval work.
 */
export function checkSkillAssetFiles(
  skills: SkillValidationInput[],
  skillsRoot: string,
): AssetFilesResult {
  const missing: Array<{
    skillName: string
    kind: 'scripts' | 'references' | 'assets'
    path: string
  }> = []

  for (const skill of skills) {
    const skillDir = skill.sourcePath ? dirname(skill.sourcePath) : skillsRoot
    const check = (
      kind: 'scripts' | 'references' | 'assets',
      paths: string[] | undefined,
    ): void => {
      if (!paths || paths.length === 0) return
      for (const p of paths) {
        const resolved = isAbsolute(p) ? p : resolve(skillDir, p)
        if (!existsSync(resolved)) {
          missing.push({ skillName: skill.name, kind, path: p })
        }
      }
    }
    check('scripts', skill.scripts)
    check('references', skill.references)
    check('assets', skill.assets)
  }

  return {
    missing,
    status: missing.length > 0 ? 'warn' : 'pass',
  }
}

// ─── 6. Subdir-form SKILL.md line-count + references/ presence ───────────────

export interface SubdirSkillLinecountResult {
  /** Skills in subdir form that exceed the line-count threshold without a references/ dir. */
  violations: Array<{ name: string; sourcePath: string; lineCount: number }>
  status: 'pass' | 'warn'
}

/**
 * Warns when a skill in subdirectory form (sourcePath ends with `/SKILL.md`)
 * exceeds `SUBDIR_SKILL_LINE_WARN` lines and has no sibling `references/`
 * directory.  The progressive-disclosure pattern encourages extracting detailed
 * reference material into `references/` once the main body grows large.  (ANV-0061)
 *
 * Only skills whose `sourcePath` ends with `SKILL.md` are checked — flat-form
 * skills (`<slug>.md`) are excluded because they have no sibling directory to
 * hold a `references/` peer.
 */
export function checkSubdirSkillLinecounts(
  skills: SkillValidationInput[],
): SubdirSkillLinecountResult {
  const violations: Array<{
    name: string
    sourcePath: string
    lineCount: number
  }> = []

  for (const skill of skills) {
    if (!skill.frontmatterValid) continue
    if (!skill.sourcePath) continue
    if (!skill.sourcePath.endsWith('SKILL.md')) continue

    const body = skill.body ?? ''
    const lineCount = body.split('\n').length
    if (lineCount <= SUBDIR_SKILL_LINE_WARN) continue

    const skillDir = dirname(skill.sourcePath)
    const referencesDir = join(skillDir, 'references')
    if (!existsSync(referencesDir)) {
      violations.push({
        name: skill.name,
        sourcePath: skill.sourcePath,
        lineCount,
      })
    }
  }

  return {
    violations,
    status: violations.length > 0 ? 'warn' : 'pass',
  }
}

// ─── doctor push function ────────────────────────────────────────────────────

/**
 * Check interface compatible with the internal `Check` type in doctor.ts.
 * Redeclared here so this module stays importable without depending on doctor.ts
 * internals.
 */
interface CheckRow {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
}

/**
 * Aggregated input for the doctor push function. Callers pass pre-loaded data
 * so this function stays pure and testable without live filesystem access.
 */
export interface SkillBehaviorValidationInput {
  /** All loaded skills (both valid and invalid frontmatter). */
  skills: SkillValidationInput[]
  /** Slugs from the agents/ directory. */
  agentSlugs: string[]
  /** Slugs from the commands/cli/ directory (derived from file names). */
  commandSlugs: string[]
  /** Absolute path to the skills/ root, used for reference resolution. */
  skillsRoot: string
}

/**
 * ANV-0036 — Pushes skill-behaviour validation rows into the doctor check list.
 *
 * Emits up to 5 rows:
 *   - "Skill catalog"         — counts + invalid-frontmatter flag
 *   - "Skill slug duplicates" — cross-surface collision detection
 *   - "Skill description budget" — per-entry + aggregate length
 *   - "Skill description shape"  — CSO prefix lint
 *   - "Skill asset files"     — scripts/references/assets path existence (ANV-0086)
 *
 * This function is intentionally NOT async — all checks are pure/synchronous.
 * Callers that need to load from disk do so before calling this function.
 */
export function pushSkillBehaviorValidationRows(
  checks: CheckRow[],
  input: SkillBehaviorValidationInput,
): void {
  const { skills, agentSlugs, commandSlugs, skillsRoot } = input

  // Row 1: Catalog counts.
  const counts = checkSkillCatalogCounts(skills)
  checks.push({
    name: 'Skill catalog',
    status: counts.invalid === 0 ? 'pass' : 'fail',
    detail:
      counts.invalid === 0
        ? `${counts.total} skill(s) loaded, all with valid frontmatter`
        : `${counts.total} total — ${counts.valid} valid, ${counts.invalid} with invalid frontmatter`,
  })

  // Row 2: Duplicate slugs.
  const skillSlugs = skills.map((s) => s.name)
  const dupes = checkSkillDuplicateSlugs({
    skillSlugs,
    agentSlugs,
    commandSlugs,
  })
  if (dupes.status === 'pass') {
    checks.push({
      name: 'Skill slug duplicates',
      status: 'pass',
      detail: `${skillSlugs.length} skill(s), ${agentSlugs.length} agent(s), ${commandSlugs.length} command(s) — no slug collisions`,
    })
  } else {
    const preview = dupes.duplicates.slice(0, 5).join(', ')
    const more =
      dupes.duplicates.length > 5
        ? ` (+${dupes.duplicates.length - 5} more)`
        : ''
    checks.push({
      name: 'Skill slug duplicates',
      status: 'fail',
      detail: `${dupes.duplicates.length} slug collision(s) across surfaces: ${preview}${more}`,
    })
  }

  // Row 3: Description budget.
  const budget = checkSkillDescriptionBudget(skills)
  if (budget.status === 'pass') {
    checks.push({
      name: 'Skill description budget',
      status: 'pass',
      detail:
        budget.total === 0
          ? 'no skills to check'
          : `${budget.total} description(s) — aggregate ${budget.aggregateLength} chars (limit ${SKILL_DESC_AGGREGATE_FAIL})`,
    })
  } else if (budget.status === 'warn') {
    const preview = budget.overPerEntry
      .slice(0, 3)
      .map((o) => `${o.name} (${o.length}c)`)
      .join(', ')
    const more =
      budget.overPerEntry.length > 3
        ? ` (+${budget.overPerEntry.length - 3} more)`
        : ''
    checks.push({
      name: 'Skill description budget',
      status: 'warn',
      detail: `${budget.overPerEntry.length} description(s) exceed ${SKILL_DESC_PER_ENTRY_WARN}-char per-entry cap (CC selector): ${preview}${more}`,
    })
  } else {
    // fail — aggregate over limit.
    checks.push({
      name: 'Skill description budget',
      status: 'fail',
      detail: `Aggregate description length ${budget.aggregateLength} chars exceeds ${SKILL_DESC_AGGREGATE_FAIL}-char limit`,
    })
  }

  // Row 4: Description shape.
  const shape = checkSkillDescriptionShape(skills)
  if (shape.status === 'pass') {
    const checked = skills.filter(
      (s) => s.frontmatterValid && s.description.length > 0,
    ).length
    checks.push({
      name: 'Skill description shape',
      status: 'pass',
      detail: `${checked} description(s) start with a CSO triggering-condition prefix`,
    })
  } else {
    const preview = shape.violations
      .slice(0, 3)
      .map((v) => v.name)
      .join(', ')
    const more =
      shape.violations.length > 3
        ? ` (+${shape.violations.length - 3} more)`
        : ''
    checks.push({
      name: 'Skill description shape',
      status: 'warn',
      detail: `${shape.violations.length} description(s) do not start with "Use when …" or equivalent: ${preview}${more}`,
    })
  }

  // Row 5: Asset-file existence (ANV-0086) — covers scripts, references, and assets arrays.
  // Only emit the row when at least one skill declares any asset path.
  const hasAnyAssets = skills.some(
    (s) =>
      (s.scripts && s.scripts.length > 0) ||
      (s.references && s.references.length > 0) ||
      (s.assets && s.assets.length > 0),
  )
  if (hasAnyAssets) {
    const assetResult = checkSkillAssetFiles(skills, skillsRoot)
    const totalDeclared = skills.reduce(
      (n, s) =>
        n +
        (s.scripts?.length ?? 0) +
        (s.references?.length ?? 0) +
        (s.assets?.length ?? 0),
      0,
    )
    if (assetResult.status === 'pass') {
      checks.push({
        name: 'Skill asset files',
        status: 'pass',
        detail: `${totalDeclared} declared asset path(s) (scripts/references/assets) all resolve`,
      })
    } else {
      const preview = assetResult.missing
        .slice(0, 3)
        .map((m) => `${m.skillName}[${m.kind}]: ${m.path}`)
        .join('; ')
      const more =
        assetResult.missing.length > 3
          ? ` (+${assetResult.missing.length - 3} more)`
          : ''
      checks.push({
        name: 'Skill asset files',
        status: 'warn',
        detail: `${assetResult.missing.length} missing asset path(s): ${preview}${more}`,
      })
    }
  }

  // Row 6: Subdir-form SKILL.md line-count + references/ presence (ANV-0061).
  const subdirSkills = skills.filter(
    (s) => s.frontmatterValid && s.sourcePath?.endsWith('SKILL.md'),
  )
  if (subdirSkills.length > 0) {
    const linecounts = checkSubdirSkillLinecounts(skills)
    if (linecounts.status === 'pass') {
      checks.push({
        name: 'Skill subdir line-count',
        status: 'pass',
        detail: `${subdirSkills.length} subdir-form skill(s) — all within ${SUBDIR_SKILL_LINE_WARN}-line limit or have references/`,
      })
    } else {
      const preview = linecounts.violations
        .slice(0, 3)
        .map((v) => `${v.name} (${v.lineCount} lines)`)
        .join(', ')
      const more =
        linecounts.violations.length > 3
          ? ` (+${linecounts.violations.length - 3} more)`
          : ''
      checks.push({
        name: 'Skill subdir line-count',
        status: 'warn',
        detail: `${linecounts.violations.length} subdir-form SKILL.md(s) exceed ${SUBDIR_SKILL_LINE_WARN} lines without a sibling references/ dir: ${preview}${more}`,
      })
    }
  }
}
