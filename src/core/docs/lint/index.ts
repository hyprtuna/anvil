/**
 * ANV-0007 — Doc-drift lint engine.
 *
 * Validates Markdown files in README.md + docs/ for:
 *   1. Broken internal Markdown links (relative file paths).
 *   2. Nonexistent `anvil <subcommand>` references.
 *   3. Unknown skill/agent/hook slugs in backtick spans.
 *   4. Template file refs listed in templates/AGENTS.md that don't exist.
 *   5. Stale HookContext / HookResult field names in authoring docs.
 *   6. Missing skill/agent files referenced in docs.
 *
 * A file (or an individual link) is skipped when the line contains the
 * marker `<!-- doc-drift: skip -->`.
 *
 * Separate check: `@`-ref resolvability (per GSD §9).
 *
 * All checks are pure filesystem reads — no network I/O.
 *
 * Exported for unit testing and `anvil doctor` wiring.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DocDriftViolation {
  /** Relative path from project root (for display). */
  file: string
  /** 1-based line number where the violation was found. */
  line: number
  /** Short rule identifier. */
  rule: DocDriftRule
  /** Human-readable description. */
  detail: string
}

export type DocDriftRule =
  | 'broken-link'
  | 'unknown-command'
  | 'missing-skill-file'
  | 'missing-template-file'
  | 'stale-hook-field'
  | 'missing-at-ref'
  | 'prose-ai-tell'

export interface DocDriftResult {
  /** All violations found. */
  violations: DocDriftViolation[]
  /** Files actually scanned (skipped ones excluded). */
  filesScanned: number
  /** Summary counts per rule. */
  counts: Record<DocDriftRule, number>
}

// ---------------------------------------------------------------------------
// Skip marker
// ---------------------------------------------------------------------------

const SKIP_MARKER = '<!-- doc-drift: skip -->'

function lineHasSkip(line: string): boolean {
  return line.includes(SKIP_MARKER)
}

function fileHasSkip(text: string): boolean {
  // If the skip marker appears anywhere in the file, the whole file is opted out.
  return text.includes(SKIP_MARKER)
}

// ---------------------------------------------------------------------------
// Helper: collect Markdown files to lint
// ---------------------------------------------------------------------------

/**
 * Returns absolute paths of Markdown files to lint:
 *   - README.md (root)
 *   - docs/*.md (top-level only — not recursive into docs/anvil/ internal dirs)
 */
export function collectDocFiles(projectRoot: string): string[] {
  const files: string[] = []

  const readme = join(projectRoot, 'README.md')
  if (existsSync(readme)) files.push(readme)

  const docsDir = join(projectRoot, 'docs')
  if (existsSync(docsDir)) {
    try {
      for (const entry of readdirSync(docsDir)) {
        if (!entry.endsWith('.md')) continue
        const full = join(docsDir, entry)
        try {
          if (statSync(full).isFile()) files.push(full)
        } catch {
          // ignore unreadable entries
        }
      }
    } catch {
      // ignore unreadable dir
    }
  }

  return files
}

// ---------------------------------------------------------------------------
// Regex match helper — avoids noAssignInExpressions violation
// ---------------------------------------------------------------------------

function execAll(re: RegExp, text: string): RegExpExecArray[] {
  const results: RegExpExecArray[] = []
  let m = re.exec(text)
  while (m !== null) {
    results.push(m)
    m = re.exec(text)
  }
  return results
}

// ---------------------------------------------------------------------------
// Check 1 — Broken internal Markdown links
// ---------------------------------------------------------------------------

/**
 * Matches `[text](path)` where path does NOT start with http/https/# and
 * is not a mailto link. We only flag relative file links.
 */
const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g

export function checkInternalLinks(
  filePath: string,
  projectRoot: string,
  lines: string[],
  violations: DocDriftViolation[],
): void {
  const relFile = filePath.replace(`${projectRoot}/`, '')
  const fileDir = dirname(filePath)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (lineHasSkip(line)) continue

    LINK_RE.lastIndex = 0
    for (const m of execAll(LINK_RE, line)) {
      const href = m[2].split('#')[0].trim() // strip fragment
      if (!href) continue // fragment-only link
      if (
        href.startsWith('http://') ||
        href.startsWith('https://') ||
        href.startsWith('mailto:')
      )
        continue

      const abs = resolve(fileDir, href)
      if (!existsSync(abs)) {
        violations.push({
          file: relFile,
          line: i + 1,
          rule: 'broken-link',
          detail: `link target not found: ${href}`,
        })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 2 — Nonexistent `anvil <subcommand>` references
// ---------------------------------------------------------------------------

/**
 * Known top-level `anvil` subcommands (extracted from src/index.ts).
 * We keep this as a static set rather than dynamic import so the lint engine
 * has zero runtime side-effects. Update when new commands are added.
 */
export const KNOWN_ANVIL_COMMANDS: ReadonlySet<string> = new Set([
  'init',
  'doctor',
  'upgrade',
  'uninstall',
  'statusline',
  'install',
  'subagent',
  'tier',
  'template',
  'models',
  'model',
  'settings',
  'hooks',
  'skill',
  'plan',
  'plan-audit',
  'plan-validate',
  'plan-validate-coverage',
  'plan-check-decisions',
  'plan-status',
  'plan-run',
  'review',
  'debug',
  'tdd',
  'ultra',
  'explore',
  'pr',
  'agents',
  'orchestrate',
  'verify',
  'start-research',
  'quick',
  'progress',
  'pause',
  'resume',
  'discuss',
  'finish',
  'pr-branch',
  'route',
  'recommend',
  'note',
  'revise-claude-md',
  'notepad',
  'release',
  'worktree',
  'agent',
  'hook',
  'projects',
  // ANV-0203 (P3) — extension subcommand group
  'extension',
  // ANV-0028 (P4) — catalog subcommand group
  'catalog',
])

/**
 * Matches `` `anvil <word>` `` inside backtick code spans only.
 * Bare prose mentions are intentionally NOT flagged — it's too noisy
 * (the word "anvil" appears constantly in narrative). The cost: typos
 * outside backticks slip through; the benefit: zero false-positive cap
 * on adoption (per ticket "false positives in docs lint kill adoption").
 */
const ANVIL_CMD_RE = /`anvil\s+([\w-]+)/g

export function checkAnvilCommandRefs(
  filePath: string,
  projectRoot: string,
  lines: string[],
  violations: DocDriftViolation[],
): void {
  const relFile = filePath.replace(`${projectRoot}/`, '')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (lineHasSkip(line)) continue

    ANVIL_CMD_RE.lastIndex = 0
    for (const m of execAll(ANVIL_CMD_RE, line)) {
      const cmd = m[1]
      // KNOWN LIMITATION: Only the top-level subcommand is validated.
      // Second-level positional args (e.g. `skill add`, `models which`)
      // are not checked — `anvil skill nonexistent` would pass. Tighten
      // by introducing a `Record<string, Set<string>>` if needed later.
      const top = cmd.split(/\s+/)[0]
      if (!KNOWN_ANVIL_COMMANDS.has(top)) {
        violations.push({
          file: relFile,
          line: i + 1,
          rule: 'unknown-command',
          detail: `unknown anvil subcommand: ${top}`,
        })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3 — Missing skill/agent files referenced in docs
// ---------------------------------------------------------------------------

/**
 * Matches explicit `skills/<path>.md` references in docs.
 */
const SKILL_FILE_RE = /skills\/([\w/-]+\.md)/g

export function checkSkillFileRefs(
  filePath: string,
  projectRoot: string,
  lines: string[],
  violations: DocDriftViolation[],
): void {
  const relFile = filePath.replace(`${projectRoot}/`, '')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (lineHasSkip(line)) continue

    SKILL_FILE_RE.lastIndex = 0
    for (const m of execAll(SKILL_FILE_RE, line)) {
      const skillPath = m[1]
      const abs = join(projectRoot, 'skills', skillPath)
      if (!existsSync(abs)) {
        violations.push({
          file: relFile,
          line: i + 1,
          rule: 'missing-skill-file',
          detail: `referenced skill file not found: skills/${skillPath}`,
        })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 4 — Template file refs in templates/AGENTS.md
// ---------------------------------------------------------------------------

const TEMPLATE_FILE_RE = /`([\w.-]+\.(?:md|json|template|sh)(?:\.template)?)`/g

/**
 * Scans templates/AGENTS.md for backtick-quoted filenames and checks that
 * each exists in the templates/ directory.
 */
export function checkTemplateFileRefs(
  projectRoot: string,
  violations: DocDriftViolation[],
): void {
  const agentsMd = join(projectRoot, 'templates', 'AGENTS.md')
  if (!existsSync(agentsMd)) return

  let text: string
  try {
    text = readFileSync(agentsMd, 'utf-8')
  } catch {
    return
  }

  if (fileHasSkip(text)) return

  const lines = text.split('\n')
  const templatesDir = join(projectRoot, 'templates')
  const relFile = 'templates/AGENTS.md'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (lineHasSkip(line)) continue

    TEMPLATE_FILE_RE.lastIndex = 0
    for (const m of execAll(TEMPLATE_FILE_RE, line)) {
      const fname = m[1]
      const abs = join(templatesDir, fname)
      if (!existsSync(abs)) {
        violations.push({
          file: relFile,
          line: i + 1,
          rule: 'missing-template-file',
          detail: `template file not found: templates/${fname}`,
        })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 5 — Stale HookContext / HookResult field names in authoring docs
// ---------------------------------------------------------------------------

/**
 * Fields that exist in the actual schema (types.ts).
 * HookContext: kind, cwd, config, env, payload
 * HookResult:  exitCode, message, systemInsert, context
 */
const REAL_HOOK_CONTEXT_FIELDS: ReadonlySet<string> = new Set([
  'kind',
  'cwd',
  'config',
  'env',
  'payload',
])

/**
 * Fields that have appeared in doc examples but no longer exist in the schema.
 */
const STALE_HOOK_CONTEXT_FIELDS: ReadonlySet<string> = new Set([
  'skillName',
  'prompt',
  'filePath',
])

// Matches `ctx.<field>` in code spans
const CTX_FIELD_RE = /ctx\.([\w]+)/g
// Matches `output:` in code block contexts
const RESULT_OUTPUT_RE = /\boutput\s*:/g

export function checkHookFieldStaleness(
  filePath: string,
  projectRoot: string,
  lines: string[],
  violations: DocDriftViolation[],
): void {
  const relFile = filePath.replace(`${projectRoot}/`, '')
  const fname = basename(filePath)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (lineHasSkip(line)) continue

    // Check ctx.<field> references
    CTX_FIELD_RE.lastIndex = 0
    for (const m of execAll(CTX_FIELD_RE, line)) {
      const field = m[1]
      if (STALE_HOOK_CONTEXT_FIELDS.has(field)) {
        violations.push({
          file: relFile,
          line: i + 1,
          rule: 'stale-hook-field',
          detail: `stale HookContext field: ctx.${field} (not in schema; real fields: ${[...REAL_HOOK_CONTEXT_FIELDS].join(', ')})`,
        })
      }
    }

    // Check HookResult `output:` usage in hook-authoring files
    // (conservative: only flag in files whose name contains 'hook')
    if (fname.includes('hook') && RESULT_OUTPUT_RE.test(line)) {
      RESULT_OUTPUT_RE.lastIndex = 0
      violations.push({
        file: relFile,
        line: i + 1,
        rule: 'stale-hook-field',
        detail: 'stale HookResult field: output (renamed to message in schema)',
      })
    }
    RESULT_OUTPUT_RE.lastIndex = 0
  }
}

// ---------------------------------------------------------------------------
// Check 6 — @-ref resolvability (GSD §9)
// ---------------------------------------------------------------------------
// (Check 7 — prose AI-tell denylist — is defined after Check 6 below.)
// ---------------------------------------------------------------------------

/**
 * Matches `@<path>` references in Markdown (e.g. `@docs/architecture.md`).
 * These are Claude Code `@`-mentions that should resolve to real files.
 */
const AT_REF_RE = /@([\w./\-]+\.\w+)/g

export function checkAtRefResolvability(
  filePath: string,
  projectRoot: string,
  lines: string[],
  violations: DocDriftViolation[],
): void {
  const relFile = filePath.replace(`${projectRoot}/`, '')
  const fileDir = dirname(filePath)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (lineHasSkip(line)) continue

    AT_REF_RE.lastIndex = 0
    for (const m of execAll(AT_REF_RE, line)) {
      const ref = m[1]
      // Try resolving relative to file dir, then project root
      const relToFile = resolve(fileDir, ref)
      const relToRoot = resolve(projectRoot, ref)
      if (!existsSync(relToFile) && !existsSync(relToRoot)) {
        violations.push({
          file: relFile,
          line: i + 1,
          rule: 'missing-at-ref',
          detail: `@-ref not resolvable: @${ref}`,
        })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 7 — Prose AI-tell denylist (ANV-0279)
// ---------------------------------------------------------------------------

/**
 * Conservative seed denylist of AI-generated filler terms.
 *
 * Design principles:
 *   - Small and reviewed: warn-fatigue is worse than a missed term.
 *   - Case-insensitive whole-word matching where the term is a single word;
 *     exact substring matching for multi-word phrases.
 *   - To extend: add an entry to this array and update the unit test.
 *
 * Each entry is matched as a case-insensitive substring after stripping
 * code fences and frontmatter from the scan.
 */
export const PROSE_AI_TELL_DENYLIST: readonly string[] = [
  // Single-word tells (matched as whole words, case-insensitive)
  'seamless',
  'seamlessly',
  'delve',
  'delves',
  'delved',
  'tapestry',
  'leverages', // "leverages" as AI-speak; "leverage" alone is borderline
  'synergies',
  'synergy',
  'transformative',
  'groundbreaking',
  'revolutionary',
  'cutting-edge',
  // Multi-word tells (matched as exact case-insensitive substrings)
  "it's worth noting",
  'it is worth noting',
  'in the realm of',
  'load-bearing', // used as metaphor ("load-bearing insight"), not structural
  'at the end of the day',
  'game changer',
  'game-changer',
]

/**
 * Per-line skip marker for deliberate uses of AI-tell terms.
 * Placed inline: `<!-- ai-tell: skip -->` on the same line as the term.
 */
export const AI_TELL_SKIP_MARKER = '<!-- ai-tell: skip -->'

function lineHasAiTellSkip(line: string): boolean {
  return line.includes(AI_TELL_SKIP_MARKER) || line.includes(SKIP_MARKER)
}

/**
 * Returns true when `term` appears in `lowerLine`.
 *
 * Matching policy (ANV-0279 follow-up — the JSDoc on the denylist promises
 * whole-word matching for single-word terms):
 *   - Single-word terms (no internal whitespace) match on whole-word
 *     boundaries, so "delve" does NOT fire inside "delvex" or "bedelve".
 *     Hyphens count as word characters here ("cutting-edge") so the term is
 *     matched as a unit, not split on the hyphen.
 *   - Multi-word phrases (containing whitespace) keep substring matching so
 *     punctuation/spacing variations ("it's worth noting,") still fire.
 *
 * `term` and `lowerLine` are both expected to be lower-cased by the caller.
 */
function aiTellTermMatches(lowerLine: string, term: string): boolean {
  const isSingleWord = !/\s/.test(term)
  if (!isSingleWord) {
    return lowerLine.includes(term)
  }
  // Whole-word match for single-word terms. A "word" here is a run of
  // [A-Za-z0-9_-]; the boundary is any character outside that set (or the
  // string ends). Hyphens are treated as in-word so "cutting-edge" matches
  // as a unit and is not falsely triggered inside "edge".
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`)
  return re.test(lowerLine)
}

/**
 * Returns true if the given line number is inside a fenced code block.
 * Tracks opening/closing ``` or ~~~ fences as it walks the lines.
 */
function buildCodeFenceMask(lines: string[]): boolean[] {
  const inFence: boolean[] = new Array(lines.length).fill(false)
  let fenceOpen = false
  let fenceChar = ''
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart()
    if (!fenceOpen) {
      if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
        fenceOpen = true
        fenceChar = trimmed.startsWith('```') ? '```' : '~~~'
        inFence[i] = true // fence-open line itself is excluded
      }
    } else {
      inFence[i] = true
      if (trimmed.startsWith(fenceChar)) {
        fenceOpen = false
      }
    }
  }
  return inFence
}

/**
 * Returns the index of the first non-frontmatter line.
 * If the file starts with `---`, everything up to (and including) the
 * closing `---` is frontmatter and skipped.
 */
function frontmatterEnd(lines: string[]): number {
  if (lines.length === 0 || lines[0].trimEnd() !== '---') return 0
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === '---') return i + 1
  }
  return 0 // no closing fence — treat whole file as content
}

/**
 * Scans prose lines in `lines` for AI-tell terms.
 *
 * Exclusions:
 *   - Frontmatter (YAML header between `---` delimiters)
 *   - Lines inside code fences (``` or ~~~)
 *   - Lines carrying `<!-- ai-tell: skip -->` or `<!-- doc-drift: skip -->`
 *
 * Severity: warn-only (never fail). This function only populates
 * `violations` — callers decide how to surface them.
 */
export function checkProseAiTell(
  filePath: string,
  projectRoot: string,
  lines: string[],
  violations: DocDriftViolation[],
): void {
  const relFile = filePath.replace(`${projectRoot}/`, '')
  const inFence = buildCodeFenceMask(lines)
  const bodyStart = frontmatterEnd(lines)

  for (let i = bodyStart; i < lines.length; i++) {
    if (inFence[i]) continue
    const line = lines[i]
    if (lineHasAiTellSkip(line)) continue

    const lower = line.toLowerCase()
    for (const term of PROSE_AI_TELL_DENYLIST) {
      if (aiTellTermMatches(lower, term.toLowerCase())) {
        violations.push({
          file: relFile,
          line: i + 1,
          rule: 'prose-ai-tell',
          detail: `AI-tell term found: "${term}" — rewrite or add <!-- ai-tell: skip --> to suppress`,
        })
        // One violation per line is enough; don't pile on for multiple terms.
        break
      }
    }
  }
}

/**
 * Collects Markdown files in `skills/`, `agents/`, and `docs/` (recursive)
 * for the prose-ai-tell scan. The broader scope matches where AI-generated
 * prose most often appears.
 */
export function collectProseFiles(projectRoot: string): string[] {
  const files: string[] = []

  function walk(dir: string): void {
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      const full = join(dir, entry)
      try {
        const stat = statSync(full)
        if (stat.isDirectory()) {
          walk(full)
        } else if (entry.endsWith('.md')) {
          files.push(full)
        }
      } catch {
        // ignore unreadable entries
      }
    }
  }

  for (const subdir of ['skills', 'agents', 'docs']) {
    const target = join(projectRoot, subdir)
    if (existsSync(target)) walk(target)
  }

  return files
}

/**
 * Runs the prose-ai-tell check across skills/, agents/, and docs/.
 * Returns violations with severity 'warn' — callers must never escalate to 'fail'.
 */
export function runProseAiTellLint(
  projectRoot: string,
  files?: string[],
): { violations: DocDriftViolation[]; filesScanned: number } {
  const targetFiles = files ?? collectProseFiles(projectRoot)
  const violations: DocDriftViolation[] = []
  let filesScanned = 0

  for (const filePath of targetFiles) {
    let text: string
    try {
      text = readFileSync(filePath, 'utf-8')
    } catch {
      continue
    }
    // File-level skip: if the file contains the doc-drift or ai-tell marker
    // at the file level, skip entire file.
    if (
      text.includes(SKIP_MARKER) ||
      text.includes(`${AI_TELL_SKIP_MARKER}\n`)
    ) {
      // Only skip the whole file if the marker appears on its own line
      // (conventional file-level opt-out). Inline markers are handled per-line.
      const firstLine = text.split('\n')[0]
      if (
        firstLine.includes(SKIP_MARKER) ||
        firstLine.includes(AI_TELL_SKIP_MARKER)
      ) {
        continue
      }
    }

    filesScanned++
    checkProseAiTell(filePath, projectRoot, text.split('\n'), violations)
  }

  return { violations, filesScanned }
}

// ---------------------------------------------------------------------------
// Main lint runner
// ---------------------------------------------------------------------------

/**
 * Runs all doc-drift checks across the target files.
 *
 * @param projectRoot  Absolute path to the project root.
 * @param files        Absolute paths of Markdown files to lint. If omitted,
 *                     `collectDocFiles(projectRoot)` is used.
 */
export function runDocDriftLint(
  projectRoot: string,
  files?: string[],
): DocDriftResult {
  const targetFiles = files ?? collectDocFiles(projectRoot)
  const violations: DocDriftViolation[] = []
  let filesScanned = 0

  for (const filePath of targetFiles) {
    let text: string
    try {
      text = readFileSync(filePath, 'utf-8')
    } catch {
      continue
    }

    // File-level skip marker
    if (fileHasSkip(text)) continue

    filesScanned++
    const lines = text.split('\n')

    checkInternalLinks(filePath, projectRoot, lines, violations)
    checkAnvilCommandRefs(filePath, projectRoot, lines, violations)
    checkSkillFileRefs(filePath, projectRoot, lines, violations)
    checkHookFieldStaleness(filePath, projectRoot, lines, violations)
    checkAtRefResolvability(filePath, projectRoot, lines, violations)
  }

  // Template file check is separate (always runs against templates/AGENTS.md)
  checkTemplateFileRefs(projectRoot, violations)

  const counts: Record<DocDriftRule, number> = {
    'broken-link': 0,
    'unknown-command': 0,
    'missing-skill-file': 0,
    'missing-template-file': 0,
    'stale-hook-field': 0,
    'missing-at-ref': 0,
    'prose-ai-tell': 0,
  }
  for (const v of violations) {
    counts[v.rule]++
  }

  return { violations, filesScanned, counts }
}

// ---------------------------------------------------------------------------
// Summary helper (for doctor row + npm script output)
// ---------------------------------------------------------------------------

export function formatDocDriftSummary(result: DocDriftResult): string {
  const total = result.violations.length
  if (total === 0) {
    return `${result.filesScanned} file(s) scanned — no drift found`
  }
  const parts = (Object.entries(result.counts) as [DocDriftRule, number][])
    .filter(([, n]) => n > 0)
    .map(([rule, n]) => `${n} ${rule}`)
    .join(', ')
  return `${result.filesScanned} file(s) scanned — ${total} violation(s): ${parts}`
}
