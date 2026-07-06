/**
 * Semantic parity lint for slash command Markdown files (ANV-0004).
 *
 * Extracts code-spans and known invocation phrases from slash `.md` files and
 * validates every referenced slug against the loaded skill, agent, and CLI
 * command registries.
 *
 * Layer 4 (commands). No I/O — pure function accepting pre-loaded registry
 * sets and raw file content. Callers are responsible for reading files and
 * populating registries.
 */

import matter from 'gray-matter'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single semantic parity violation found in a slash command file. */
export interface SemanticViolation {
  /** Absolute path of the slash command file. */
  file: string
  /** 1-based line number where the violation was detected. */
  line: number
  /** The slug that was referenced but not found in any registry. */
  slug: string
  /**
   * Short human-readable description of the violation, e.g.:
   *   "slug 'code-reviewer' not found in skill, agent, or CLI command registry"
   */
  detail: string
}

/**
 * Optional frontmatter fields recognised by the parity linter.
 *
 * - `parity_lint: skip` — opt-out: the linter emits zero violations for
 *   this file regardless of its prose content.
 * - `invoked_surface: skill | agent | command` — declares the intended
 *   surface for the primary invocation in this slash command (informational;
 *   not currently used for filtering, but validated in tests).
 */
export interface ParityLintFrontmatter {
  parity_lint?: 'skip'
  invoked_surface?: 'skill' | 'agent' | 'command'
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Patterns that, when found around a backtick-quoted slug, indicate the slug
 * is being used as a surface invocation (skill / agent / command reference)
 * rather than generic prose (e.g. flag names, tier names, file names).
 *
 * Each pattern is applied against the full line text.
 */
const INVOCATION_PATTERNS: RegExp[] = [
  // "Invoke the `<slug>` skill" / "Load the `<slug>` agent" (any verb + skill|agent suffix)
  /\b(invoke|load|dispatch)\s+(?:the\s+)?`[a-z][a-z0-9-]*`\s+(skill|agent)/i,
  // "`<slug>` skill" / "`<slug>` agent"  (standalone noun phrase — slug directly before label)
  /`[a-z][a-z0-9-]*`\s+(skill|agent)/i,
  // "Dispatch `<slug>`" / "Invoke `<slug>`" (strong verbs without the skill|agent suffix)
  // Deliberately excludes generic verbs (use, run, call) to avoid false positives.
  /\b(invoke|dispatch)\s+`[a-z][a-z0-9-]*`/i,
  // "the `<slug>` agent" / "the `<slug>` skill"
  /\bthe\s+`[a-z][a-z0-9-]*`\s+(skill|agent)/i,
]

/**
 * Slugs that appear in slash command prose but are not skill/agent/command
 * slugs — they are tier names, flag values, git concepts, etc.
 * These are globally excluded from validation.
 */
const EXCLUDED_TOKENS = new Set<string>([
  // Tier names used in --tier flag documentation
  'quick',
  'coding',
  'review',
  'planning',
  'ultra',
  'super',
  // Flag values
  'both',
  'spec-compliance',
  'code-quality',
  'staged',
  'main',
  'master',
  'parallel',
  'strict',
  'json',
  'no-color',
  'no-coverage-gate',
  'model',
  'effort',
  'tier',
  'type',
  // Model aliases
  'cheap',
  'balanced',
  'best',
  'haiku',
  'sonnet',
  'opus',
  // Notepad section names
  'learnings',
  'decisions',
  'issues',
  'verification',
  'problems',
  // Statusline tier names
  'minimal',
  'default',
  'maximal',
  // Statusline template names
  'rich',
  'simple',
  // git/workflow concepts
  'git',
  'diff',
  'cached',
  'true',
  'false',
  'user',
  // Argument hints / placeholders
  'task',
  'target',
  'prompt',
  'plan',
  'path',
])

/**
 * Extract all `code-span` tokens from a single line of Markdown along with
 * the 1-based line number.  Returns only tokens that look like slug candidates
 * (lowercase, hyphens, no dots or slashes).
 */
function extractCodeSpans(line: string): Array<{ slug: string; col: number }> {
  const re = /`([a-z][a-z0-9-]*)`/g
  const results: Array<{ slug: string; col: number }> = []
  let match: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex loop
  while ((match = re.exec(line)) !== null) {
    const slug = match[1]
    if (slug && !EXCLUDED_TOKENS.has(slug)) {
      results.push({ slug, col: match.index + 1 })
    }
  }
  return results
}

/**
 * Return true if the line contains any invocation-pattern match indicating
 * the code-span is being used as a surface reference.
 */
function lineHasInvocationPattern(line: string): boolean {
  return INVOCATION_PATTERNS.some((re) => re.test(line))
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Lint a set of slash command Markdown files for semantic parity violations.
 *
 * A violation is raised when:
 *   1. A code-span slug appears on a line that matches an invocation pattern
 *      (i.e. the slug is being presented as a skill, agent, or command), AND
 *   2. The slug is not present in `skillSlugs`, `agentSlugs`, or `cliCommands`.
 *
 * Files whose frontmatter contains `parity_lint: skip` are silently ignored.
 *
 * @param slashFiles   Array of `{ path, content }` for every slash `.md` file.
 * @param skillSlugs   Set of known skill slugs (e.g. from `SkillRegistry`).
 * @param agentSlugs   Set of known agent slugs (e.g. from `AgentRegistry`).
 * @param cliCommands  Set of known CLI command stems (e.g. `"review"`, `"plan"`).
 * @returns            Array of violations; empty array means parity is intact.
 */
export function lintSlashSemanticParity(
  slashFiles: ReadonlyArray<{ path: string; content: string }>,
  skillSlugs: ReadonlySet<string>,
  agentSlugs: ReadonlySet<string>,
  cliCommands: ReadonlySet<string>,
): SemanticViolation[] {
  const violations: SemanticViolation[] = []

  for (const { path: filePath, content } of slashFiles) {
    // Parse frontmatter to check for opt-out
    const parsed = matter(content)
    const fm = parsed.data as ParityLintFrontmatter
    if (fm.parity_lint === 'skip') continue

    const lines = content.split('\n')
    // Find where the body starts (after frontmatter). gray-matter strips the
    // frontmatter, so we calculate the line offset from the raw content.
    const fmMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)
    const bodyOffset = fmMatch ? fmMatch[0].split('\n').length - 1 : 0

    for (let i = bodyOffset; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      // Only process lines that have invocation patterns — avoids false
      // positives on generic prose and CLI example blocks.
      if (!lineHasInvocationPattern(line)) continue

      const spans = extractCodeSpans(line)
      for (const { slug } of spans) {
        // Skip the slug if it's the invocation keyword itself (e.g. "invoke")
        // or is a known registry entry.
        const known =
          skillSlugs.has(slug) || agentSlugs.has(slug) || cliCommands.has(slug)
        if (!known) {
          violations.push({
            file: filePath,
            line: i + 1, // 1-based
            slug,
            detail: `slug '${slug}' not found in skill, agent, or CLI command registry`,
          })
        }
      }
    }
  }

  return violations
}

/**
 * Derive the set of CLI command stems from a list of filenames in the CLI
 * commands directory (e.g. `["review.ts", "plan.ts"]` → `Set{"review", "plan"}`).
 *
 * Both `.ts` and `.js` extensions are stripped so the function works against
 * both source and compiled layouts.
 */
export function cliStemsFromFilenames(
  filenames: ReadonlyArray<string>,
): Set<string> {
  const stems = new Set<string>()
  for (const name of filenames) {
    if (name.endsWith('.ts') || name.endsWith('.js')) {
      stems.add(name.replace(/\.(ts|js)$/, ''))
    }
  }
  return stems
}
