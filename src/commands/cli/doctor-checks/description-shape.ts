/**
 * ANV-0066 — Skill description hygiene lints for `anvil doctor`.
 *
 * Five non-blocking lints that surface description-shape problems at install
 * time. All lints emit `warn` (not `fail`) in v0.13.x; severity promotion to
 * `fail` is deferred to v0.14 after a migration window.
 *
 * Lints:
 *   1. `desc-cso-prefix`    — description must start with a CSO trigger phrase
 *                             ("Use when …", "Run when …", etc.).
 *   2. `desc-no-step-list`  — description must not contain a numbered step list
 *                             (e.g. "1. Do X  2. Do Y").
 *   3. `desc-third-person`  — description must not use first/second person
 *                             ("you", "your", "I ", "I'm").
 *   4. `desc-length`        — description length must fall within the 60-280
 *                             character sweet spot.
 *   5. `desc-no-body-dupe`  — description must not duplicate the skill body's
 *                             first paragraph verbatim (or near-verbatim).
 *
 * All functions are exported for unit-test injection via synthetic in-memory
 * fixtures — no dependency on the live skills/ tree.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckRow,
} from '../doctor-registry.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal skill representation needed for description-shape checks. */
export interface DescriptionShapeInput {
  /** Skill name / slug. */
  name: string
  /** Raw description text (stripped of surrounding quotes). */
  description: string
  /** Raw body text (everything after the closing --- of the frontmatter). */
  body?: string
  /** Whether the frontmatter parsed successfully (invalid skills are skipped). */
  frontmatterValid: boolean
}

/** Result of a single per-lint check. */
export interface LintResult {
  /** Skills that violated this lint rule. */
  violations: Array<{ name: string; description: string; detail?: string }>
  /** Overall status — always 'pass' or 'warn' (never 'fail' in v0.13.x). */
  status: 'pass' | 'warn'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * CSO triggering-condition accepted prefixes.
 * Mirrors `CSO_ACCEPTED_SHAPE_RE` in `doctor-skills-validation.ts` and
 * `CSO_ACCEPTED_PREFIX` in `doctor.ts`.
 */
export const CSO_PREFIX_RE =
  /^(Use (?:when|before|after|to|for) |Run when |Invoked? (?:when|before) |Activate when |Triggered when |Triggers on |MUST consult|When |Applies when |For )/

/**
 * Matches a numbered step list anywhere inside the description.
 * Examples that trigger: "1. Do this 2. Do that", "1) First step 2) Second".
 */
export const STEP_LIST_RE = /\b[1-9]\d*[.)]\s+\S+.*?\b[2-9]\d*[.)]\s+\S/s

/**
 * Matches first/second person words that should not appear in descriptions.
 * Note: "I " with a trailing space to avoid matching "Interface", "Implementation", etc.
 */
export const FIRST_SECOND_PERSON_RE =
  /\byou\b|\byour\b|\bI\b(?=\s|\b)|\bI'm\b|\bI'll\b|\bI've\b|\bme\b(?=\s|$)/i

/**
 * Sweet-spot character range for skill descriptions.
 * Below 60: too terse for the selector to find relevant context.
 * Above 280: risks selector budget overflow (ANV-0042 warns at this threshold).
 */
export const DESC_MIN_LENGTH = 60
export const DESC_MAX_LENGTH = 280

/**
 * Minimum word overlap ratio to flag description-body duplication.
 * At 0.85, a description and body paragraph share 85%+ of their words.
 */
export const BODY_DUPE_OVERLAP_THRESHOLD = 0.85

// ---------------------------------------------------------------------------
// Lint 1: CSO prefix
// ---------------------------------------------------------------------------

/**
 * Warns when a skill description does not start with a CSO triggering-condition
 * prefix ("Use when …", "Run when …", etc.).
 *
 * Only skills with valid frontmatter and non-empty descriptions are checked.
 */
export function lintCsoPrefix(skills: DescriptionShapeInput[]): LintResult {
  const eligible = skills.filter(
    (s) => s.frontmatterValid && s.description.trim().length > 0,
  )
  const violations = eligible
    .filter((s) => !CSO_PREFIX_RE.test(s.description.trim()))
    .map((s) => ({ name: s.name, description: s.description }))
  return { violations, status: violations.length > 0 ? 'warn' : 'pass' }
}

// ---------------------------------------------------------------------------
// Lint 2: No step list
// ---------------------------------------------------------------------------

/**
 * Warns when a description contains a numbered step list.
 * Descriptions are meant to be triggering conditions, not instruction sequences.
 */
export function lintNoStepList(skills: DescriptionShapeInput[]): LintResult {
  const eligible = skills.filter(
    (s) => s.frontmatterValid && s.description.trim().length > 0,
  )
  const violations = eligible
    .filter((s) => STEP_LIST_RE.test(s.description))
    .map((s) => ({ name: s.name, description: s.description }))
  return { violations, status: violations.length > 0 ? 'warn' : 'pass' }
}

// ---------------------------------------------------------------------------
// Lint 3: Third-person voice
// ---------------------------------------------------------------------------

/**
 * Warns when a description contains first- or second-person pronouns.
 * Descriptions should be written in third-person impersonal style
 * ("Use when the team needs…" not "Use when you need…").
 */
export function lintThirdPerson(skills: DescriptionShapeInput[]): LintResult {
  const eligible = skills.filter(
    (s) => s.frontmatterValid && s.description.trim().length > 0,
  )
  const violations = eligible
    .filter((s) => FIRST_SECOND_PERSON_RE.test(s.description))
    .map((s) => ({ name: s.name, description: s.description }))
  return { violations, status: violations.length > 0 ? 'warn' : 'pass' }
}

// ---------------------------------------------------------------------------
// Lint 4: Length sweet spot (60–280 chars)
// ---------------------------------------------------------------------------

/**
 * Warns when a description falls outside the 60–280 char sweet spot.
 * Below 60: too terse for the selector.
 * Above 280: risks selector budget overflow (see ANV-0042).
 */
export function lintDescriptionLength(
  skills: DescriptionShapeInput[],
): LintResult {
  const eligible = skills.filter(
    (s) => s.frontmatterValid && s.description.trim().length > 0,
  )
  const violations = eligible
    .filter((s) => {
      const len = s.description.trim().length
      return len < DESC_MIN_LENGTH || len > DESC_MAX_LENGTH
    })
    .map((s) => {
      const len = s.description.trim().length
      const hint =
        len < DESC_MIN_LENGTH
          ? `${len} chars — too short (min ${DESC_MIN_LENGTH})`
          : `${len} chars — too long (max ${DESC_MAX_LENGTH})`
      return { name: s.name, description: s.description, detail: hint }
    })
  return { violations, status: violations.length > 0 ? 'warn' : 'pass' }
}

// ---------------------------------------------------------------------------
// Lint 5: No body duplication
// ---------------------------------------------------------------------------

/**
 * Extracts the first non-empty paragraph from a skill body (the text after the
 * closing --- of the frontmatter block), normalized to lowercase word tokens.
 */
export function extractBodyFirstParagraph(body: string): string {
  // Drop leading blank lines.
  const trimmed = body.replace(/^\s*\n+/, '')
  // Take up to the first blank line.
  const firstBlock = trimmed.split(/\n\s*\n/)[0] ?? ''
  // Strip markdown heading markers.
  return firstBlock.replace(/^#+\s*/gm, '').trim()
}

/**
 * Computes Jaccard word-overlap between two strings (case-insensitive).
 * Returns a value in [0, 1].
 */
export function wordOverlap(a: string, b: string): number {
  const tokenize = (s: string): Set<string> =>
    new Set(
      s
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2),
    )
  const setA = tokenize(a)
  const setB = tokenize(b)
  if (setA.size === 0 || setB.size === 0) return 0
  const intersection = [...setA].filter((w) => setB.has(w)).length
  const union = new Set([...setA, ...setB]).size
  return intersection / union
}

/**
 * Warns when a description near-duplicates the skill body's first paragraph.
 * Uses Jaccard word overlap ≥ 0.85 as the similarity threshold.
 * Skills without a body (no `body` field) are silently skipped.
 */
export function lintNoBodyDupe(skills: DescriptionShapeInput[]): LintResult {
  const eligible = skills.filter(
    (s) =>
      s.frontmatterValid &&
      s.description.trim().length > 0 &&
      typeof s.body === 'string' &&
      s.body.trim().length > 0,
  )
  const violations = eligible
    .filter((s) => {
      const bodyPara = extractBodyFirstParagraph(s.body ?? '')
      if (bodyPara.length === 0) return false
      return wordOverlap(s.description, bodyPara) >= BODY_DUPE_OVERLAP_THRESHOLD
    })
    .map((s) => ({
      name: s.name,
      description: s.description,
      detail: 'description near-duplicates body first paragraph',
    }))
  return { violations, status: violations.length > 0 ? 'warn' : 'pass' }
}

// ---------------------------------------------------------------------------
// Filesystem helpers (used by the registry runners)
// ---------------------------------------------------------------------------

/**
 * Walk all `.md` files under `root`, skipping CLAUDE.md and AGENTS.md.
 * Returns absolute paths.
 */
function walkSkillFiles(root: string): string[] {
  const out: string[] = []
  const stack: string[] = [root]
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
      const full = join(dir, name)
      try {
        const s = statSync(full)
        if (s.isDirectory()) {
          stack.push(full)
        } else if (s.isFile() && name.endsWith('.md')) {
          out.push(full)
        }
      } catch {}
    }
  }
  return out
}

/**
 * Parse a skill `.md` file into a `DescriptionShapeInput`.
 * Returns null when the file cannot be read.
 */
function parseSkillFile(filePath: string): DescriptionShapeInput | null {
  let text: string
  try {
    text = readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }

  // Extract frontmatter block.
  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---(.*)$/s)
  if (!fmMatch) {
    return {
      name: filePath,
      description: '',
      body: text,
      frontmatterValid: false,
    }
  }

  const fm = fmMatch[1] ?? ''
  const bodyRaw = fmMatch[2] ?? ''

  // Extract name.
  const nameMatch = fm.match(/^name:\s*(.+)$/m)
  const name = nameMatch ? nameMatch[1].trim() : filePath

  // Extract description (supports plain, quoted, block scalar).
  let description = ''
  const lines = fm.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^description:\s*(.*)$/)
    if (!m) continue
    const rest = m[1]
    if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
      const buf: string[] = []
      for (let j = i + 1; j < lines.length; j++) {
        const ln = lines[j]
        if (/^\S/.test(ln ?? '') && (ln ?? '').trim() !== '') break
        buf.push((ln ?? '').replace(/^\s+/, ''))
      }
      const sep = (rest ?? '').startsWith('>') ? ' ' : '\n'
      description = buf.join(sep).trim()
    } else {
      description = rest.trim().replace(/^["']|["']$/g, '')
    }
    break
  }

  return {
    name,
    description,
    body: bodyRaw.trim(),
    frontmatterValid: true,
  }
}

/**
 * Load all skill files from `skillsRoot` into `DescriptionShapeInput[]`.
 */
function loadSkillsFromDir(skillsRoot: string): DescriptionShapeInput[] {
  const files = walkSkillFiles(skillsRoot)
  return files.flatMap((f) => {
    const parsed = parseSkillFile(f)
    return parsed ? [parsed] : []
  })
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

function pushLintRow(
  rows: DoctorCheckRow[],
  rowName: string,
  result: LintResult,
  passDetail: string,
  warnPrefix: string,
): void {
  if (result.status === 'pass') {
    rows.push({ name: rowName, status: 'pass', detail: passDetail })
    return
  }
  const preview = result.violations
    .slice(0, 3)
    .map((v) => (v.detail ? `${v.name} (${v.detail})` : v.name))
    .join(', ')
  const more =
    result.violations.length > 3
      ? ` (+${result.violations.length - 3} more)`
      : ''
  rows.push({
    name: rowName,
    status: 'warn',
    detail: `${warnPrefix}: ${preview}${more}`,
  })
}

// ---------------------------------------------------------------------------
// Individual check runners
// ---------------------------------------------------------------------------

function runDescCsoPrefixCheck(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): void {
  const skillsRoot = join(ctx.cwd, 'skills')
  if (!ctx.inProject || !existsSync(skillsRoot)) {
    rows.push({
      name: 'desc: CSO prefix',
      status: 'skip',
      detail: ctx.skipDetail,
    })
    return
  }
  const skills = loadSkillsFromDir(skillsRoot)
  const result = lintCsoPrefix(skills)
  pushLintRow(
    rows,
    'desc: CSO prefix',
    result,
    `${skills.filter((s) => s.frontmatterValid && s.description.trim().length > 0).length} description(s) start with a CSO trigger phrase`,
    `${result.violations.length} description(s) missing CSO trigger prefix`,
  )
}

function runDescNoStepListCheck(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): void {
  const skillsRoot = join(ctx.cwd, 'skills')
  if (!ctx.inProject || !existsSync(skillsRoot)) {
    rows.push({
      name: 'desc: no step list',
      status: 'skip',
      detail: ctx.skipDetail,
    })
    return
  }
  const skills = loadSkillsFromDir(skillsRoot)
  const result = lintNoStepList(skills)
  pushLintRow(
    rows,
    'desc: no step list',
    result,
    `${skills.filter((s) => s.frontmatterValid && s.description.trim().length > 0).length} description(s) contain no numbered step list`,
    `${result.violations.length} description(s) contain a numbered step list`,
  )
}

function runDescThirdPersonCheck(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): void {
  const skillsRoot = join(ctx.cwd, 'skills')
  if (!ctx.inProject || !existsSync(skillsRoot)) {
    rows.push({
      name: 'desc: third-person voice',
      status: 'skip',
      detail: ctx.skipDetail,
    })
    return
  }
  const skills = loadSkillsFromDir(skillsRoot)
  const result = lintThirdPerson(skills)
  pushLintRow(
    rows,
    'desc: third-person voice',
    result,
    `${skills.filter((s) => s.frontmatterValid && s.description.trim().length > 0).length} description(s) use third-person voice`,
    `${result.violations.length} description(s) use first/second person`,
  )
}

function runDescLengthCheck(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): void {
  const skillsRoot = join(ctx.cwd, 'skills')
  if (!ctx.inProject || !existsSync(skillsRoot)) {
    rows.push({
      name: 'desc: length sweet spot',
      status: 'skip',
      detail: ctx.skipDetail,
    })
    return
  }
  const skills = loadSkillsFromDir(skillsRoot)
  const result = lintDescriptionLength(skills)
  pushLintRow(
    rows,
    'desc: length sweet spot',
    result,
    `${skills.filter((s) => s.frontmatterValid && s.description.trim().length > 0).length} description(s) within ${DESC_MIN_LENGTH}–${DESC_MAX_LENGTH} char sweet spot`,
    `${result.violations.length} description(s) outside ${DESC_MIN_LENGTH}–${DESC_MAX_LENGTH} char sweet spot`,
  )
}

function runDescNoBodyDupeCheck(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): void {
  const skillsRoot = join(ctx.cwd, 'skills')
  if (!ctx.inProject || !existsSync(skillsRoot)) {
    rows.push({
      name: 'desc: no body dupe',
      status: 'skip',
      detail: ctx.skipDetail,
    })
    return
  }
  const skills = loadSkillsFromDir(skillsRoot)
  const result = lintNoBodyDupe(skills)
  const eligible = skills.filter(
    (s) =>
      s.frontmatterValid &&
      s.description.trim().length > 0 &&
      typeof s.body === 'string' &&
      s.body.trim().length > 0,
  ).length
  pushLintRow(
    rows,
    'desc: no body dupe',
    result,
    `${eligible} description(s) do not duplicate the body first paragraph`,
    `${result.violations.length} description(s) near-duplicate the body first paragraph`,
  )
}

// ---------------------------------------------------------------------------
// Exported registry entries
// ---------------------------------------------------------------------------

export const descCsoPrefixCheck: DoctorCheck = {
  id: 'content/desc-cso-prefix',
  label: 'Skill desc: CSO prefix',
  category: 'content',
  runner: runDescCsoPrefixCheck,
}

export const descNoStepListCheck: DoctorCheck = {
  id: 'content/desc-no-step-list',
  label: 'Skill desc: no step list',
  category: 'content',
  runner: runDescNoStepListCheck,
}

export const descThirdPersonCheck: DoctorCheck = {
  id: 'content/desc-third-person',
  label: 'Skill desc: third-person voice',
  category: 'content',
  runner: runDescThirdPersonCheck,
}

export const descLengthCheck: DoctorCheck = {
  id: 'content/desc-length',
  label: 'Skill desc: length sweet spot',
  category: 'content',
  runner: runDescLengthCheck,
}

export const descNoBodyDupeCheck: DoctorCheck = {
  id: 'content/desc-no-body-dupe',
  label: 'Skill desc: no body dupe',
  category: 'content',
  runner: runDescNoBodyDupeCheck,
}

/**
 * All description-shape checks in declaration order.
 */
export const DESCRIPTION_SHAPE_CHECKS: readonly DoctorCheck[] = [
  descCsoPrefixCheck,
  descNoStepListCheck,
  descThirdPersonCheck,
  descLengthCheck,
  descNoBodyDupeCheck,
]

/**
 * Convenience wrapper for the legacy dispatcher in `doctor.ts`.
 */
export function pushDescriptionShapeChecks(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): void {
  for (const check of DESCRIPTION_SHAPE_CHECKS) {
    check.runner(ctx, rows)
  }
}

/**
 * ANV-0184 — Lint-command variant: runs all 5 description-shape checks
 * directly against a `skillsRoot` path rather than deriving it from ctx.cwd.
 *
 * Skips gracefully when the directory does not exist.
 */
export function runDescriptionShapeChecksForRoot(skillsRoot: string): Array<{
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
}> {
  if (!existsSync(skillsRoot)) {
    return [
      'desc: CSO prefix',
      'desc: no step list',
      'desc: third-person voice',
      'desc: length sweet spot',
      'desc: no body dupe',
    ].map((name) => ({
      name,
      status: 'skip' as const,
      detail: `no skills directory found: ${skillsRoot}`,
    }))
  }
  const skills = loadSkillsFromDir(skillsRoot)
  const rows: DoctorCheckRow[] = []

  const eligibleDesc = skills.filter(
    (s) => s.frontmatterValid && s.description.trim().length > 0,
  ).length

  const descCsoResult = lintCsoPrefix(skills)
  pushLintRow(
    rows,
    'desc: CSO prefix',
    descCsoResult,
    `${eligibleDesc} description(s) start with a CSO trigger phrase`,
    `${descCsoResult.violations.length} description(s) missing CSO trigger prefix`,
  )

  const noStepResult = lintNoStepList(skills)
  pushLintRow(
    rows,
    'desc: no step list',
    noStepResult,
    `${eligibleDesc} description(s) contain no numbered step list`,
    `${noStepResult.violations.length} description(s) contain a numbered step list`,
  )

  const thirdPersonResult = lintThirdPerson(skills)
  pushLintRow(
    rows,
    'desc: third-person voice',
    thirdPersonResult,
    `${eligibleDesc} description(s) use third-person voice`,
    `${thirdPersonResult.violations.length} description(s) use first/second person`,
  )

  const lengthResult = lintDescriptionLength(skills)
  pushLintRow(
    rows,
    'desc: length sweet spot',
    lengthResult,
    `${eligibleDesc} description(s) within ${DESC_MIN_LENGTH}–${DESC_MAX_LENGTH} char sweet spot`,
    `${lengthResult.violations.length} description(s) outside ${DESC_MIN_LENGTH}–${DESC_MAX_LENGTH} char sweet spot`,
  )

  const noBodyDupeResult = lintNoBodyDupe(skills)
  const eligibleBody = skills.filter(
    (s) =>
      s.frontmatterValid &&
      s.description.trim().length > 0 &&
      typeof s.body === 'string' &&
      s.body.trim().length > 0,
  ).length
  pushLintRow(
    rows,
    'desc: no body dupe',
    noBodyDupeResult,
    `${eligibleBody} description(s) do not duplicate the body first paragraph`,
    `${noBodyDupeResult.violations.length} description(s) near-duplicate the body first paragraph`,
  )

  return rows.map((r) => ({ name: r.name, status: r.status, detail: r.detail }))
}
