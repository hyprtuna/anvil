import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * CSO (Context-Signal-Outcome) description tests.
 *
 * Descriptions must signal *when to invoke* the skill (triggering conditions),
 * not *what the skill does step-by-step* (workflow summary).
 *
 * Anti-pattern (CSO violation): "Writes a spec file, reads the codebase, then produces…"
 * Correct:                       "Use when the user describes a feature without an approved spec…"
 *
 * Rules enforced here:
 * - Description word count ≤ 30 (CSO cap).
 * - Description starts with a triggering-condition phrase.
 * - Description does NOT contain workflow-verb tokens that describe internal steps.
 *
 * Only brainstorm-spec and plan-writing are checked here (SDD skills touched in v0.10.0).
 * Full sweep across all 80+ skills is deferred to v0.10.1.
 */

/** Extract the `description:` field from YAML frontmatter */
function extractDescription(content: string): string {
  const match = content.match(/^description:\s*(.+)$/m)
  if (!match) throw new Error('No description field found in frontmatter')
  return match[1].trim().replace(/^["']|["']$/g, '')
}

/**
 * Forbidden workflow-verb tokens (case-insensitive).
 * These describe internal steps, not triggering conditions.
 */
const WORKFLOW_VERB_PATTERNS = [
  /\bstep\s/i,
  /\bthen\s/i,
  /\bdraft\s/i,
  /\bproduce\s/i,
  /\bwrite a\s/i,
  /\bwrites\b/i,
  /\bproduces\b/i,
  /\bdrafts\b/i,
  // Legacy tokens retained from Phase D
  /\bCreates a plan\b/i,
  /\bReads codebase\b/i,
  /\breads the codebase\b/i,
]

/**
 * Accepted triggering-condition prefixes (case-insensitive).
 * Descriptions must begin with one of these to signal when (not what).
 */
const TRIGGERING_CONDITION_PATTERN =
  /^(Use when|Use to|Use for|When |Triggered when|For |Activates when|Invoke when|Applies when)/i

/** Word-count cap per Plan 36 §Phase I */
const WORD_COUNT_CAP = 30

/** SDD skills covered in v0.10.0. One-line add for future SDD skills. */
// ANV-0083: brainstorm-spec converted to subdir form to colocate the
// assumptions-surfacer Task(general-purpose) prompt body.
const SDD_SKILLS = [
  {
    name: 'brainstorm-spec',
    path: 'skills/universal/brainstorm-spec/SKILL.md',
  },
  {
    name: 'plan-writing',
    path: 'skills/universal/plan-writing/SKILL.md',
  },
]

describe.each(SDD_SKILLS)('CSO-clean description — $name', ({ path }) => {
  const content = readFileSync(path, 'utf-8')
  const description = extractDescription(content)

  it('description word count is ≤ 30 (CSO cap)', () => {
    const wordCount = description.split(/\s+/).filter(Boolean).length
    expect(
      wordCount,
      `description is ${wordCount} words; CSO cap is ${WORD_COUNT_CAP}`,
    ).toBeLessThanOrEqual(WORD_COUNT_CAP)
  })

  it('description starts with a triggering-condition phrase', () => {
    expect(description).toMatch(TRIGGERING_CONDITION_PATTERN)
  })

  it('description does not contain workflow-verb tokens', () => {
    for (const pattern of WORKFLOW_VERB_PATTERNS) {
      expect(
        description,
        `description matches forbidden pattern ${pattern}`,
      ).not.toMatch(pattern)
    }
  })
})
