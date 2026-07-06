/**
 * Memory-file structural invariants (ANV-0125).
 *
 * Layer 0 (core) — pure functions, no I/O.
 *
 * Validates structural invariants for `CLAUDE.md` and `AGENTS.md` memory files
 * across the Anvil-owned tree. The validator runs at PreToolUse time (see
 * `src/hooks/handlers/memory-validator.ts`) and denies edits that would corrupt
 * the file's structure.
 *
 * ## Invariants
 *
 * 1. **H1 presence.** Required H1 heading (`# Title`) must remain present
 *    after the edit. If the source had an H1 and the edit removes it, deny.
 * 2. **Stub parity (CLAUDE.md only).** Every `CLAUDE.md` in the Anvil-owned
 *    tree must match the canonical 2-line stub format — an optional HTML
 *    comment followed by an `@./AGENTS.md` import line. This is the same
 *    pattern enforced by `tests/unit/architecture/claude-md-is-stub.test.ts`.
 *    The validator REUSES that pattern here (single source of truth).
 * 3. **Table-heading preservation.** Markdown tables (lines starting with `|`
 *    immediately followed by a separator row `|---|...`) define headings. Any
 *    edit that drops a table heading present in the source content is denied.
 *
 * Each invariant is checked independently and contributes zero or more
 * `MemoryFileViolation` entries to the result. An empty array means "allowed".
 */

/**
 * Canonical stub matcher (mirrors `tests/unit/architecture/claude-md-is-stub.test.ts`).
 *
 * Accepts:
 *   <!-- ... HTML comment ... -->
 *   @./AGENTS.md
 *
 * Both elements may be surrounded by leading/trailing whitespace. The
 * HTML comment is optional. Anything else triggers a failure.
 */
export const CLAUDE_MD_STUB_PATTERN =
  /^(?:<!--[\s\S]*?-->\s*)?@\.\/AGENTS\.md\s*$/

export type MemoryFileViolationKind =
  | 'missing-h1'
  | 'h1-changed'
  | 'stub-broken'
  | 'table-heading-dropped'
  | 'trailing-whitespace-introduced'

export interface MemoryFileViolation {
  kind: MemoryFileViolationKind
  message: string
  detail?: string
}

/**
 * ANV-0128 — memory-validator profile names.
 *
 * `minimal`  — only H1 presence is enforced. Stub-parity, table-heading
 *              preservation, and h1-rename advisories are skipped. Useful
 *              for early-stage docs work where structure is in flux.
 * `balanced` — DEFAULT. All current invariants (H1, stub-parity, table
 *              headings, h1-rename). Matches pre-ANV-0128 behavior.
 * `strict`   — `balanced` plus rejects newly-introduced trailing whitespace
 *              on any line in the proposed content. Pre-existing trailing
 *              whitespace that survives the edit is NOT flagged (the
 *              invariant catches new sloppiness, not legacy debt).
 */
export type MemoryFileProfile = 'minimal' | 'balanced' | 'strict'

export interface InvariantInput {
  /** Absolute or repo-relative path of the file under edit. */
  path: string
  /** File contents BEFORE the edit. Empty string means file did not exist. */
  oldContent: string
  /** File contents AFTER the proposed edit. */
  newContent: string
  /**
   * Whether a sibling `AGENTS.md` exists next to a `CLAUDE.md`. Only
   * relevant for `CLAUDE.md` edits — when true, the stub-parity rule applies.
   * Defaults to true (canonical Anvil layout).
   */
  siblingAgentsMdExists?: boolean
  /**
   * ANV-0128 — active profile (minimal | balanced | strict).
   * Defaults to `balanced` so callers that omit the field get pre-ANV-0128
   * behavior (full invariant set). See `MemoryFileProfile` for semantics.
   */
  profile?: MemoryFileProfile
}

/**
 * Returns true when `content` matches the canonical 2-line stub format.
 * Whitespace at the boundaries is tolerated.
 */
export function isCanonicalStub(content: string): boolean {
  return CLAUDE_MD_STUB_PATTERN.test(content.trim())
}

/**
 * Extracts the first H1 heading from markdown content.
 *
 * Recognises `# Title` at the start of a line (not deeper headings like `##`).
 * Trims trailing whitespace and the leading `#` + space.
 */
export function extractH1(content: string): string | null {
  for (const line of content.split('\n')) {
    const match = /^# ([^\n]+?)\s*$/.exec(line)
    if (match) return match[1].trim()
  }
  return null
}

/**
 * Extracts every markdown table heading row from content.
 *
 * A table heading is a line starting with `|` that is IMMEDIATELY followed
 * by a separator row (also starting with `|` and containing only `-`, `:`,
 * `|`, and whitespace). Returned strings are the raw heading row lines,
 * trimmed.
 */
export function extractTableHeadings(content: string): string[] {
  const lines = content.split('\n')
  const headings: string[] = []
  for (let i = 0; i < lines.length - 1; i++) {
    const here = lines[i].trim()
    const next = lines[i + 1].trim()
    if (!here.startsWith('|') || !next.startsWith('|')) continue
    if (/^\|[\s\-:|]+\|$/.test(next)) {
      headings.push(here)
    }
  }
  return headings
}

/**
 * Returns true when `path` looks like a memory-file we should validate
 * (`CLAUDE.md` or `AGENTS.md` by basename).
 */
export function isMemoryFile(path: string): boolean {
  const base = path.split(/[\\/]/).pop() ?? ''
  return base === 'CLAUDE.md' || base === 'AGENTS.md'
}

/**
 * Returns true when `path` is a `CLAUDE.md` file (by basename).
 */
export function isClaudeMd(path: string): boolean {
  const base = path.split(/[\\/]/).pop() ?? ''
  return base === 'CLAUDE.md'
}

/**
 * Core invariant check. Returns the list of violations the edit triggers;
 * an empty array means the edit is allowed.
 */
export function detectInvariantViolations(
  input: InvariantInput,
): MemoryFileViolation[] {
  const violations: MemoryFileViolation[] = []
  const { path, oldContent, newContent } = input
  const siblingAgentsMdExists = input.siblingAgentsMdExists ?? true
  // ANV-0128 — Profile gates which invariants run. Default 'balanced' keeps
  // pre-ANV-0128 behavior for any caller that doesn't pass a profile.
  const profile: MemoryFileProfile = input.profile ?? 'balanced'

  // ─── Invariant 2: stub parity (CLAUDE.md only) — balanced + strict ──
  // Apply only when this is a CLAUDE.md AND a sibling AGENTS.md is the
  // canonical source of truth. If there is no sibling AGENTS.md the
  // CLAUDE.md is unpaired and the stub rule does not apply (covers
  // edge cases where the file is being introduced ahead of its sibling).
  if (profile !== 'minimal' && isClaudeMd(path) && siblingAgentsMdExists) {
    if (!isCanonicalStub(newContent)) {
      violations.push({
        kind: 'stub-broken',
        message:
          'CLAUDE.md must remain a 2-line @-import stub pointing at its sibling AGENTS.md. Edit AGENTS.md instead — the content there is the source of truth.',
        detail: `Expected body to match: (optional HTML comment) + "@./AGENTS.md" and nothing else. Got:\n--- new content ---\n${newContent.trim()}\n--- end ---`,
      })
    }
    // Stub files are uniform — don't bother running H1/table checks on a
    // CLAUDE.md, the canonical stub has neither.
    return violations
  }

  // ─── Invariant 1: H1 presence — all profiles ───────────────────────
  const oldH1 = extractH1(oldContent)
  const newH1 = extractH1(newContent)
  if (oldH1 && !newH1) {
    violations.push({
      kind: 'missing-h1',
      message: `Required H1 heading "# ${oldH1}" was dropped by this edit. Memory files must keep their top-level H1.`,
      detail:
        'Add the H1 line back, or set ANVIL_ALLOW_RESTRUCTURE=1 if you really intend to remove it.',
    })
  } else if (profile !== 'minimal' && oldH1 && newH1 && oldH1 !== newH1) {
    // H1 rename advisory — balanced + strict only.
    violations.push({
      kind: 'h1-changed',
      message: `H1 heading changed from "# ${oldH1}" to "# ${newH1}". Confirm this rename is intentional.`,
      detail:
        'Set ANVIL_ALLOW_RESTRUCTURE=1 to allow renaming the top-level heading.',
    })
  }

  // ─── Invariant 3: table-heading preservation — balanced + strict ────
  if (profile !== 'minimal') {
    const oldHeadings = new Set(extractTableHeadings(oldContent))
    const newHeadings = new Set(extractTableHeadings(newContent))
    const dropped: string[] = []
    for (const h of oldHeadings) {
      if (!newHeadings.has(h)) dropped.push(h)
    }
    if (dropped.length > 0) {
      violations.push({
        kind: 'table-heading-dropped',
        message: `${dropped.length} table heading row(s) dropped by this edit. Memory-file tables are referenced elsewhere — dropping a heading row breaks downstream tooling.`,
        detail: `Dropped headings:\n${dropped.map((d) => `  ${d}`).join('\n')}`,
      })
    }
  }

  // ─── Invariant 4: trailing-whitespace introduced — strict only ──────
  // Fires when the edit *adds* a line whose trailing whitespace was absent
  // in `oldContent`. Pre-existing trailing whitespace that survives the
  // edit is intentionally NOT flagged — strict catches new sloppiness,
  // not legacy debt.
  if (profile === 'strict') {
    const oldLines = new Set(
      oldContent.split('\n').filter((l) => /[ \t]+$/.test(l)),
    )
    const introduced = newContent
      .split('\n')
      .filter((l) => /[ \t]+$/.test(l) && !oldLines.has(l))
    if (introduced.length > 0) {
      violations.push({
        kind: 'trailing-whitespace-introduced',
        message: `${introduced.length} line(s) introduced new trailing whitespace. The strict profile rejects this — trim trailing spaces/tabs before committing.`,
        detail: `Offending lines:\n${introduced
          .slice(0, 5)
          .map((l) => `  "${l}"`)
          .join(
            '\n',
          )}${introduced.length > 5 ? `\n  …and ${introduced.length - 5} more` : ''}`,
      })
    }
  }

  return violations
}

/**
 * Renders a list of violations into a single multi-line message suitable
 * for a hook deny response.
 */
export function formatViolations(
  path: string,
  violations: MemoryFileViolation[],
): string {
  if (violations.length === 0) return ''
  const lines: string[] = [
    `memory-validator: BLOCKED edit to ${path}`,
    '',
    'Structural invariant violations:',
  ]
  for (const v of violations) {
    lines.push('')
    lines.push(`  [${v.kind}] ${v.message}`)
    if (v.detail) {
      for (const dl of v.detail.split('\n')) {
        lines.push(`    ${dl}`)
      }
    }
  }
  lines.push('')
  lines.push(
    'Set ANVIL_ALLOW_RESTRUCTURE=1 to bypass for an intentional restructure.',
  )
  return lines.join('\n')
}
