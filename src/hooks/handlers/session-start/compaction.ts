/**
 * ANV-0118 — Compactable startup-guidance sections.
 *
 * When the SessionStart context budget is tight, strip known structural
 * sections (e.g., `<anvil_skills>`, `<anvil_agents>`, `<routing_rules>`)
 * wholesale before falling back to char-count truncation. Each elided
 * section is replaced with `[<section> elided to fit budget]` so the
 * model knows context was removed.
 *
 * Design:
 *  - Pure function: no I/O, no global state.
 *  - Single-pass strip-by-priority. Lowest-priority section elided first.
 *  - Stops eliding as soon as the budget is satisfied (does not strip
 *    sections unnecessarily).
 *  - Tolerant of missing or malformed sections — never throws on user input.
 *  - Pairs with ANV-0056's fragment aggregation (which operates at the
 *    fragment level). This function operates within a single text body.
 *
 * Reference: `references/oh-my-claudecode/templates/hooks/session-start.mjs`
 * (`compactOmcStartupGuidance`) inspired this approach but is not copied —
 * Anvil's variant adds configurable priority and stops early on budget hit.
 */

/**
 * A structural section identified by tag name plus an ordering priority.
 * Lower `priority` = elided first. Two sections must not share a priority
 * if predictable ordering is required by callers.
 */
export interface SectionPriority {
  /** Tag name without angle brackets, e.g. `anvil_skills`. */
  section: string
  /** Lower number = elided first. */
  priority: number
}

/**
 * Default Anvil-known structural sections, ordered by elision priority
 * (lowest priority elided first). The ordering encodes the heuristic
 * "data catalogs are cheapest to lose; routing rules are most valuable":
 *
 *  - anvil_skills, anvil_agents, agent_catalog, team_compositions
 *    are large, regenerable enumerations.
 *  - routing_rules carries directive content; preserved longest.
 */
export const DEFAULT_STARTUP_SECTION_PRIORITIES: readonly SectionPriority[] = [
  { section: 'anvil_skills', priority: 0 },
  { section: 'anvil_agents', priority: 1 },
  { section: 'agent_catalog', priority: 2 },
  { section: 'team_compositions', priority: 3 },
  { section: 'routing_rules', priority: 4 },
]

/**
 * Build a notice string that replaces an elided section's body.
 */
function buildElisionNotice(section: string): string {
  return `[${section} elided to fit budget]`
}

/**
 * Escape a string for safe inclusion in a RegExp source.
 */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replace the first occurrence of a structural section with the elision
 * notice. Non-greedy match so adjacent sections are not merged. Tolerates
 * missing sections (returns the original text). The pattern matches the
 * opening tag, any body, and the closing tag.
 */
function elideSection(text: string, section: string): string {
  const tag = escapeRegExp(section)
  const pattern = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`)
  if (!pattern.test(text)) return text
  return text.replace(pattern, buildElisionNotice(section))
}

/**
 * Strip structural sections from `text` in priority order (lowest priority
 * first) until the total length fits within `budget`, or no more sections
 * are available to strip. Sections absent from the text are skipped.
 *
 * Pure function — no I/O, deterministic output for a given input.
 *
 * @param text       Raw guidance text potentially containing structural sections.
 * @param budget     Maximum allowed length in characters. Non-positive budgets
 *                   are treated as "no budget" and the text is returned as-is.
 * @param priorities Sections to consider, with their elision priority.
 *                   Lower priority = elided first.
 */
export function compactStructuralSections(
  text: string,
  budget: number,
  priorities: readonly SectionPriority[],
): string {
  if (typeof text !== 'string' || text.length === 0) return text
  if (!Number.isFinite(budget) || budget <= 0) return text
  if (text.length <= budget) return text

  // Sort ascending by priority — lowest priority elided first.
  const ordered = [...priorities].sort((a, b) => a.priority - b.priority)

  let current = text
  for (const { section } of ordered) {
    if (current.length <= budget) break
    const next = elideSection(current, section)
    // If elision had no effect (section absent), continue to next priority.
    if (next === current) continue
    current = next
  }

  return current
}
