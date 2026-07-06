import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ANV-0083: `*-prompt.md` files inside a subdir-form skill directory are
// sibling Task(general-purpose) prompt bodies, not skills.  The skill loader
// ignores them when SKILL.md is present in the same directory; this walker
// mirrors that so the CSO discipline only checks real skill descriptions.
function walkSkills(root: string): string[] {
  const out: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()!
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        !['CLAUDE.md', 'AGENTS.md'].includes(entry.name) &&
        !entry.name.endsWith('-prompt.md') &&
        !entry.name.endsWith('-addendum.md')
      ) {
        out.push(full)
      }
    }
  }
  return out
}

/**
 * CSO discipline — full sweep across all skills (Plan 39 Phase B, D-05).
 *
 * Every skill description must signal *when to invoke* (triggering conditions),
 * not *what the skill does internally* (workflow summary).
 *
 * This test enforces the discipline post-merge so future skill additions can't
 * silently regress the corpus. Pre-existing tests/unit/skills/cso-description.test.ts
 * covers a hand-picked SDD subset; this file covers the full corpus.
 */

const SKILL_FILES = walkSkills('skills').sort()

/**
 * Accepted triggering-condition prefixes (case-sensitive on the leading verb;
 * the second token may vary). Matches:
 *   - "Use when ..."
 *   - "Use before ..."
 *   - "Use after ..."
 *   - "Use to ..."
 *   - "Use for ..."
 *   - "Run when ..."
 *   - "Invoked when ...", "Invoked before ..."
 *   - "Invoke when ..."
 *   - "Activate when ..."
 *   - "Triggered when ...", "Triggers on ..."
 *   - "MUST consult ..." (skill-orchestration)
 *   - "When <pattern>" (legacy, kept for skills that already pass)
 *   - "Applies when ..." / "For <noun>"
 */
const ACCEPTED_PREFIX =
  /^(Use (?:when|before|after|to|for) |Run when |Invoked? (?:when|before) |Activate when |Triggered when |Triggers on |MUST consult|When |Applies when |For )/

/**
 * Forbidden anti-pattern prefixes. Workflow summaries (what the skill does)
 * and noun-phrase descriptions ("Django development — ...") are rejected.
 *
 * The verb-summary list below is derived empirically from the v0.10.2
 * audit at .anvil/_archive/docs-anvil/research/2026-04-27-cso-audit-v0.10.2.md.
 */
const WORKFLOW_VERB_PREFIXES = [
  /^A skill that\b/i,
  /^This skill (?:is for|provides|helps|allows)\b/i,
  /^Provides\b/i,
  /^Helps\b/i,
  /^Allows\b/i,
  // workflow-summary verbs that describe internal action, not trigger:
  /^Reviews\b/,
  /^Writes\b/,
  /^Produces\b/,
  /^Drafts\b/,
  /^Identifies\b/,
  /^Maps\b/,
  /^Generates\b/,
  /^Removes\b/,
  /^Scaffolds\b/,
  /^Verifies\b/,
  /^Routes\b/,
  /^Traces\b/,
  /^Reads\b/,
  /^Scans\b/,
  /^Fans\b/,
  /^Summarizes\b/,
  /^Simplifies\b/,
  /^Audits\b/,
  /^Evaluates\b/,
  /^Captures\b/,
  /^Creates\b/,
  /^Analyzes\b/,
  /^Explores\b/,
  /^Breaks\b/,
  /^Completes\b/,
  /^Executes\b/,
  /^Orchestrates\b/,
  /^Prevents\b/,
  /^Picks\b/,
  /^Chooses\b/,
  /^Constructs\b/,
  /^Converts\b/,
]

function extractDescription(content: string): string | null {
  const match = content.match(/^description:\s*(.+)$/m)
  if (!match) return null
  return match[1].trim().replace(/^["']|["']$/g, '')
}

function describeFile(path: string): string {
  return path.replace(/^skills\//, '')
}

describe('skills — CSO discipline (Plan 39 Phase B, full sweep)', () => {
  it('every skill .md has a description field', () => {
    for (const path of SKILL_FILES) {
      const text = readFileSync(path, 'utf-8')
      const desc = extractDescription(text)
      expect(
        desc,
        `${describeFile(path)} must have a description: field`,
      ).not.toBeNull()
    }
  })

  for (const path of SKILL_FILES) {
    const text = readFileSync(path, 'utf-8')
    const desc = extractDescription(text)
    if (desc === null) continue

    describe(describeFile(path), () => {
      it('starts with an imperative triggering-condition prefix', () => {
        expect(
          ACCEPTED_PREFIX.test(desc),
          `description must start with one of "Use when/before/after/to/for | Run when | Invoked when/before | Activate when | Triggered when | Triggers on | MUST consult | When | Applies when | For"; got: ${JSON.stringify(desc.slice(0, 60))}…`,
        ).toBe(true)
      })

      it('does NOT start with a workflow-summary anti-pattern', () => {
        for (const pattern of WORKFLOW_VERB_PREFIXES) {
          expect(
            pattern.test(desc),
            `description must not start with workflow-summary verb (${pattern}); got: ${JSON.stringify(desc.slice(0, 60))}…`,
          ).toBe(false)
        }
      })
    })
  }
})

describe('skills — CSO inventory', () => {
  it('full corpus covers >=80 skills (regression guard)', () => {
    expect(SKILL_FILES.length).toBeGreaterThanOrEqual(80)
  })
})
