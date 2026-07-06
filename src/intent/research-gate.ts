/**
 * Research gate helpers (Plan 36 Phase E).
 *
 * Pure functions: parse spec.md's ## Open Questions section and determine
 * whether the research gate is satisfied (all questions resolved).
 *
 * Layer 0-adjacent — no I/O, no higher-layer imports.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface OpenQuestionsResult {
  /** Whether the ## Open Questions section exists in the spec. */
  hasSection: boolean
  /** Non-empty, non-(none) bullet items. */
  items: string[]
}

export interface ResearchGateResult {
  passed: boolean
  /** Each unresolved question item (when passed=false). Also contains
   *  a "## Open Questions section missing" message when section is absent. */
  blockers: string[]
}

// ── extractOpenQuestions ────────────────────────────────────────────────────

const OPEN_QUESTIONS_SECTION_RE = /^##\s+Open Questions\s*$/im
const NEXT_H2_RE = /^##\s+/m

/**
 * Parse the `## Open Questions` section from spec.md content.
 *
 * Returns:
 *  - `hasSection: true` when the section header is present.
 *  - `items`: all non-empty, non-(none) bullet items in the section.
 *
 * The section ends at the next `##` header or end-of-file.
 */
export function extractOpenQuestions(specContent: string): OpenQuestionsResult {
  const match = OPEN_QUESTIONS_SECTION_RE.exec(specContent)
  if (!match) {
    return { hasSection: false, items: [] }
  }

  // Extract section body from after the header to the next ## or EOF
  const afterHeader = specContent.slice(match.index + match[0].length)
  const nextH2Match = NEXT_H2_RE.exec(afterHeader)
  const sectionBody = nextH2Match
    ? afterHeader.slice(0, nextH2Match.index)
    : afterHeader

  // Extract bullet items
  const items: string[] = []
  for (const line of sectionBody.split('\n')) {
    const stripped = line.trim()
    if (!stripped.startsWith('- ')) continue
    const item = stripped.slice(2).trim()
    if (!item) continue
    // Skip the "(none)" / "(None)" marker
    if (/^\(none\)$/i.test(item)) continue
    items.push(item)
  }

  return { hasSection: true, items }
}

// ── checkResearchGate ───────────────────────────────────────────────────────

/**
 * Check the research gate: spec.md must have a `## Open Questions` section
 * with no unresolved items.
 *
 * Per Phase D requirement: the section MUST be present even if empty.
 * An absent section is treated as a blocker.
 *
 * Returns:
 *  - `{ passed: true }` — section present and all questions resolved.
 *  - `{ passed: false, blockers: [...] }` — section missing or has items.
 */
export function checkResearchGate(specContent: string): ResearchGateResult {
  const { hasSection, items } = extractOpenQuestions(specContent)

  if (!hasSection) {
    return {
      passed: false,
      blockers: [
        '## Open Questions section is missing from spec.md — add the section (use "- (none)" if resolved)',
      ],
    }
  }

  if (items.length === 0) {
    return { passed: true, blockers: [] }
  }

  return { passed: false, blockers: items }
}
