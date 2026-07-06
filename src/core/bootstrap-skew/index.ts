/**
 * ANV-0103 — Bootstrap content version-skew lint engine.
 *
 * Pure function that:
 *   1. Extracts `anvil:<slug>` references from bootstrap text (two patterns):
 *      - `Skill({skill: "anvil:<slug>"})`   — skill invocation syntax
 *      - `Agent({subagent_type: "anvil:<slug>"})` — agent invocation syntax
 *      - bare `anvil:<slug>` mentions in prose / trigger lines
 *   2. Verifies each slug resolves in the provided skill/agent name sets.
 *   3. Returns one `BootstrapSkewViolation` per dangling reference.
 *
 * Layer 0 — no I/O; takes bootstrap text and registry snapshots as arguments.
 * Exported for unit testing and `anvil doctor` wiring.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BootstrapSkewViolation {
  /** The full `anvil:<slug>` reference as it appears in the text. */
  ref: string
  /** Slug portion only (without `anvil:` prefix). */
  slug: string
  /** Which surface the reference targets. */
  surface: 'skill' | 'agent' | 'unknown'
  /** Human-readable remediation hint. */
  hint: string
}

export interface BootstrapSkewResult {
  violations: BootstrapSkewViolation[]
  /** Total number of unique `anvil:<slug>` references found in bootstrap. */
  refsFound: number
}

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/**
 * Matches `Skill({skill: "anvil:<slug>"})` — double or single quotes.
 * Capture group 1 = slug.
 */
const SKILL_INVOCATION_RE =
  /Skill\s*\(\s*\{\s*skill\s*:\s*["']anvil:([\w-]+)["']/g

/**
 * Matches `Agent({subagent_type: "anvil:<slug>"})` — double or single quotes.
 * Capture group 1 = slug.
 */
const AGENT_INVOCATION_RE =
  /Agent\s*\(\s*\{\s*subagent_type\s*:\s*["']anvil:([\w-]+)["']/g

/**
 * Matches bare `anvil:<slug>` prose references NOT already captured by the
 * above patterns (e.g. in trigger lines, tables, or prose).
 * We anchor on a word-boundary or quote so we don't match sub-strings.
 * Capture group 1 = slug.
 *
 * Note: must be tested AFTER de-duplicating results from the two patterns
 * above to avoid double-counting.
 */
const BARE_ANVIL_REF_RE = /(?:^|[\s"'`,(])anvil:([\w-]+)/g

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

interface ExtractedRef {
  slug: string
  surface: 'skill' | 'agent' | 'unknown'
}

/**
 * Extract all `anvil:<slug>` references from the bootstrap text.
 * Returns a deduplicated map of slug → surface hint.
 *
 * When a slug appears in both a Skill() call AND prose, the Skill() surface
 * wins. Similarly Agent() wins over bare references.
 */
function extractRefs(bootstrapText: string): Map<string, ExtractedRef> {
  const refs = new Map<string, ExtractedRef>()

  // 1. Skill invocations
  for (const match of bootstrapText.matchAll(SKILL_INVOCATION_RE)) {
    const slug = match[1]
    if (slug) refs.set(slug, { slug, surface: 'skill' })
  }

  // 2. Agent invocations
  for (const match of bootstrapText.matchAll(AGENT_INVOCATION_RE)) {
    const slug = match[1]
    if (slug) {
      // Agent wins over bare ref; skill invocation wins over agent if same slug
      if (!refs.has(slug) || refs.get(slug)?.surface === 'unknown') {
        refs.set(slug, { slug, surface: 'agent' })
      }
    }
  }

  // 3. Bare prose references (any that weren't already captured)
  for (const match of bootstrapText.matchAll(BARE_ANVIL_REF_RE)) {
    const slug = match[1]
    if (slug && !refs.has(slug)) {
      refs.set(slug, { slug, surface: 'unknown' })
    }
  }

  return refs
}

/**
 * Run the bootstrap version-skew lint.
 *
 * @param bootstrapText  Raw text of the bootstrap skill (skills/using-anvil/SKILL.md body).
 * @param skillNames     Set of all registered skill slugs (from SkillRegistry).
 * @param agentNames     Set of all registered agent slugs (from AgentRegistry).
 */
export function lintBootstrapSkew(
  bootstrapText: string,
  skillNames: ReadonlySet<string>,
  agentNames: ReadonlySet<string>,
): BootstrapSkewResult {
  const refs = extractRefs(bootstrapText)
  const violations: BootstrapSkewViolation[] = []

  for (const [slug, ref] of refs) {
    const inSkills = skillNames.has(slug)
    const inAgents = agentNames.has(slug)

    if (inSkills || inAgents) continue

    // Dangling reference — build a remediation hint.
    let hint: string
    if (ref.surface === 'skill') {
      hint = `bootstrap references skill "anvil:${slug}" but no matching skill exists in the registry. If the skill was renamed, update skills/using-anvil/SKILL.md to use the new slug, then re-run \`anvil init\` to restage the bootstrap file.`
    } else if (ref.surface === 'agent') {
      hint = `bootstrap references agent "anvil:${slug}" but no matching agent exists in the registry. If the agent was renamed, update skills/using-anvil/SKILL.md to use the new slug.`
    } else {
      hint = `bootstrap mentions "anvil:${slug}" but no skill or agent with that slug exists in the registry. Update skills/using-anvil/SKILL.md to fix or remove the reference.`
    }

    violations.push({ ref: `anvil:${slug}`, slug, surface: ref.surface, hint })
  }

  return { violations, refsFound: refs.size }
}
